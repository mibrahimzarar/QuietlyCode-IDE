import React, { useRef, useCallback, useState } from 'react'
import MonacoEditor, { OnMount } from '@monaco-editor/react'
import { useApp } from '../store/appStore'
import { PROMPTS } from '../prompts'
import { Code2 } from 'lucide-react'
import EditPalette from './EditPalette'
import FindWidget from './FindWidget'
import HoverTooltip from './HoverTooltip'

// Track inline completion provider to prevent leak on remount
let inlineProviderDisposable: any = null

interface EditorProps {
    isSecondary?: boolean
}

export default function Editor({ isSecondary = false }: EditorProps) {
    const { state, dispatch } = useApp()
    const editorRef = useRef<any>(null)
    const monacoRef = useRef<any>(null)
    const [editPalettePos, setEditPalettePos] = useState<{
        x: number,
        y: number,
        selection: string,
        range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
    } | null>(null)
    const [isGeneratingEdit, setIsGeneratingEdit] = useState(false)

    const activeFile = isSecondary
        ? state.openFiles.find(f => f.path === state.splitEditor.secondaryFilePath)
        : state.openFiles.find(f => f.path === state.activeFilePath)

    const handleMount: OnMount = (editor, monaco) => {
        editorRef.current = editor
        monacoRef.current = monaco

        // Track selection changes
        editor.onDidChangeCursorSelection((e) => {
            const selection = editor.getModel()?.getValueInRange(e.selection) || ''
            dispatch({ type: 'SET_SELECTED_CODE', code: selection })
        })

        // Context menu
        editor.addAction({
            id: 'ai-explain',
            label: '🤖 AI: Explain Selection',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
            contextMenuGroupId: 'ai',
            contextMenuOrder: 1,
            run: () => {
                const sel = editor.getModel()?.getValueInRange(editor.getSelection()!) || ''
                if (sel) {
                    dispatch({
                        type: 'ADD_CHAT_MESSAGE',
                        message: {
                            id: Date.now().toString(),
                            role: 'user',
                            content: PROMPTS.explain(sel),
                            timestamp: Date.now()
                        }
                    })
                    if (!state.chatPanelVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' })
                }
            }
        })

        editor.addAction({
            id: 'ai-refactor',
            label: '🤖 AI: Refactor Selection',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR],
            contextMenuGroupId: 'ai',
            contextMenuOrder: 2,
            run: () => {
                const sel = editor.getModel()?.getValueInRange(editor.getSelection()!) || ''
                if (sel) {
                    dispatch({
                        type: 'ADD_CHAT_MESSAGE',
                        message: {
                            id: Date.now().toString(),
                            role: 'user',
                            content: PROMPTS.refactor(sel),
                            timestamp: Date.now()
                        }
                    })
                    if (!state.chatPanelVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' })
                }
            }
        })

        editor.addAction({
            id: 'ai-edit',
            label: '🤖 AI: Edit Selection',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
            contextMenuGroupId: 'ai',
            contextMenuOrder: 3,
            run: () => {
                const monacoSelection = editor.getSelection()!
                const selection = editor.getModel()?.getValueInRange(monacoSelection) || ''
                if (selection) {
                    // Get cursor screen position to render palette
                    const position = editor.getPosition()
                    if (position) {
                        const currentScrolledTop = editor.getScrollTop()
                        const offsetTop = editor.getTopForLineNumber(position.lineNumber) - currentScrolledTop
                        const containerRect = editor.getContainerDomNode().getBoundingClientRect()
                        setEditPalettePos({
                            x: containerRect.left + 50,
                            y: containerRect.top + offsetTop + 30, // Show slightly below cursor
                            selection,
                            range: {
                                startLineNumber: monacoSelection.startLineNumber,
                                startColumn: monacoSelection.startColumn,
                                endLineNumber: monacoSelection.endLineNumber,
                                endColumn: monacoSelection.endColumn
                            }
                        })
                    }
                }
            }
        })

        // Go to Line
        editor.addAction({
            id: 'go-to-line',
            label: 'Go to Line',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG],
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 2,
            run: () => {
                const lineNumber = prompt('Go to line:')
                if (lineNumber) {
                    const line = parseInt(lineNumber, 10)
                    if (!isNaN(line) && line > 0) {
                        editor.setPosition({ lineNumber: line, column: 1 })
                        editor.revealLineInCenter(line)
                    }
                }
            }
        })

        // Format Document
        editor.addAction({
            id: 'format-document',
            label: 'Format Document',
            keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
            contextMenuGroupId: '1_modification',
            contextMenuOrder: 1.5,
            run: async () => {
                if (!activeFile || !state.projectPath) return

                const result = await window.electronAPI.formatDocument(activeFile.path, state.projectPath)
                if (result.success && result.content !== undefined) {
                    // Update editor content
                    const model = editor.getModel()
                    if (model) {
                        model.setValue(result.content)
                        dispatch({ type: 'UPDATE_FILE_CONTENT', path: activeFile.path, content: result.content })
                    }
                } else if (result.error) {
                    // Format failed silently
                }
            }
        })

        // Go to Definition
        editor.addAction({
            id: 'go-to-definition',
            label: 'Go to Definition',
            keybindings: [monaco.KeyCode.F12],
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1,
            run: async () => {
                const position = editor.getPosition()
                if (!position || !activeFile) return

                try {
                    const result = await window.electronAPI.getDefinition(
                        activeFile.path,
                        position.lineNumber - 1,
                        position.column - 1
                    )

                    if (result) {
                        const locations = Array.isArray(result) ? result : [result]
                        if (locations.length > 0) {
                            const loc = locations[0]
                            const filePath = loc.uri.replace('file://', '')

                            // Open the file if different
                            if (filePath !== activeFile.path) {
                                const fileResult = await window.electronAPI.readFile(filePath)
                                if (fileResult.success && fileResult.content !== undefined) {
                                    const name = filePath.split('\\').pop() || filePath
                                    const ext = name.split('.').pop()?.toLowerCase() || ''
                                    const langMap: Record<string, string> = {
                                        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
                                        py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
                                        h: 'c', hpp: 'cpp', css: 'css', html: 'html', json: 'json', md: 'markdown',
                                        yaml: 'yaml', yml: 'yaml', xml: 'xml', sh: 'shell', sql: 'sql',
                                        rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', toml: 'toml'
                                    }
                                    dispatch({
                                        type: 'OPEN_FILE',
                                        file: {
                                            path: filePath,
                                            name,
                                            content: fileResult.content,
                                            language: langMap[ext] || 'plaintext',
                                            isDirty: false
                                        }
                                    })
                                }
                            }

                            // Navigate to position
                            setTimeout(() => {
                                editor.setPosition({
                                    lineNumber: loc.range.start.line + 1,
                                    column: loc.range.start.character + 1
                                })
                                editor.revealPositionInCenter({
                                    lineNumber: loc.range.start.line + 1,
                                    column: loc.range.start.character + 1
                                })
                            }, 100)
                        }
                    }
                } catch (error) {
                    // Definition not available
                }
            }
        })

        editor.addAction({
            id: 'save',
            label: 'Save File',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
            run: async () => {
                const model = editor.getModel()
                if (model && activeFile) {
                    const content = model.getValue()
                    const result = await window.electronAPI.writeFile(activeFile.path, content)
                    if (result.success) {
                        dispatch({ type: 'MARK_FILE_SAVED', path: activeFile.path })
                    }
                }
            }
        })

        // Define themes
        monaco.editor.defineTheme('bitnet-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '7878a0', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'c792ea' },
                { token: 'string', foreground: 'c3e88d' },
                { token: 'number', foreground: 'f78c6c' },
                { token: 'type', foreground: 'ffcb6b' },
                { token: 'function', foreground: '82aaff' },
                { token: 'variable', foreground: 'eaeaf2' },
                { token: 'operator', foreground: '89ddff' },
            ],
            colors: {
                'editor.background': '#1a1b2e',
                'editor.foreground': '#eaeaf2',
                'editor.lineHighlightBackground': '#252640',
                'editor.selectionBackground': '#3a3a6840',
                'editor.inactiveSelectionBackground': '#2d2e5020',
                'editorLineNumber.foreground': '#4a4a70',
                'editorLineNumber.activeForeground': '#9898b8',
                'editorCursor.foreground': '#7c6cf0',
                'editor.selectionHighlightBackground': '#3a3a6830',
                'editorWidget.background': '#1f2037',
                'editorSuggestWidget.background': '#1f2037',
                'editorSuggestWidget.border': '#363860',
                'editorSuggestWidget.selectedBackground': '#2f3050',
            }
        })

        monaco.editor.defineTheme('bitnet-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '8a8ab0', fontStyle: 'italic' },
                { token: 'keyword', foreground: '7c3aed' },
                { token: 'string', foreground: '059669' },
                { token: 'number', foreground: 'ea580c' },
                { token: 'type', foreground: 'b45309' },
                { token: 'function', foreground: '2563eb' },
            ],
            colors: {
                'editor.background': '#fafafa',
                'editor.foreground': '#1a1a2e',
                'editor.lineHighlightBackground': '#f0f0f5',
                'editor.selectionBackground': '#c7d2fe60',
                'editorLineNumber.foreground': '#b0b0cc',
                'editorLineNumber.activeForeground': '#5a5a80',
                'editorCursor.foreground': '#6c5ce7',
            }
        })

        const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'bitnet-light' : 'bitnet-dark'
        monaco.editor.setTheme(theme)

        // Setup Inline Autocomplete (Ghost text)
        let debounceTimer: NodeJS.Timeout
        // Dispose previous provider to prevent leak on remount
        if (inlineProviderDisposable) inlineProviderDisposable.dispose()
        inlineProviderDisposable = monaco.languages.registerInlineCompletionsProvider('*', {
            provideInlineCompletions: async (model, position, context, token) => {
                // Only trigger occasionally if user stopped typing to avoid spamming the local LLM
                return new Promise((resolve) => {
                    clearTimeout(debounceTimer)
                    debounceTimer = setTimeout(async () => {
                        if (token.isCancellationRequested) {
                            resolve({ items: [] })
                            return
                        }

                        const lineContent = model.getLineContent(position.lineNumber)
                        const prefix = lineContent.substring(0, position.column - 1)
                        // If line is empty or just whitespace, don't trigger aggressively unless they wait longer?
                        // Let's just always trigger for now if there's context.

                        const fullText = model.getValue()
                        const offset = model.getOffsetAt(position)
                        const textBefore = fullText.substring(Math.max(0, offset - 1000), offset)

                        // We use a FIM (Fill-in-middle) prompt if supported, or just predictive prompt
                        const prompt = `Complete the following code. Return ONLY the code that should come immediately after the cursor, nothing else whatsoever.\n\nCode before cursor:\n\`\`\`\n${textBefore}\n\`\`\`\n\nCompletion:`

                        try {
                            const result = await window.electronAPI.chat([
                                { role: 'user', content: prompt }
                            ], { maxTokens: 50, temperature: 0.1 })

                            if (token.isCancellationRequested) {
                                resolve({ items: [] })
                                return
                            }

                            if (result.success && result.content) {
                                let completion = result.content.trim()
                                // Strip markdown backticks
                                if (completion.startsWith('```')) {
                                    const lines = completion.split('\n')
                                    lines.shift()
                                    if (lines[lines.length - 1]?.startsWith('```')) lines.pop()
                                    completion = lines.join('\n')
                                }

                                if (completion) {
                                    resolve({
                                        items: [{
                                            insertText: completion,
                                            // The range determines what is replaced, in this case we just append at cursor
                                            range: new monaco.Range(
                                                position.lineNumber,
                                                position.column,
                                                position.lineNumber,
                                                position.column
                                            )
                                        }]
                                    })
                                    return
                                }
                            }
                        } catch (err) {
                            // Autocomplete failed silently
                        }

                        resolve({ items: [] })
                    }, 500) // 500ms debounce
                })
            },
            freeInlineCompletions(completions) {
                // Nothing to free
            }
        })

        // Cleanup when component unmounts (but we don't have unmount hook easily accessible here, it's fine for simple use cases)
    }

    const handleChange = useCallback((value: string | undefined) => {
        if (value !== undefined && activeFile) {
            dispatch({ type: 'UPDATE_FILE_CONTENT', path: activeFile.path, content: value })
        }
    }, [activeFile?.path])

    async function handleEditSubmit(instruction: string) {
        if (!editPalettePos || !activeFile) return

        setIsGeneratingEdit(true)
        const messages = [
            { role: 'system', content: 'You are an elite developer. Perform the edit requested on the provided code block. Only return the final modified code snippet without markdown formatting blocks, tags, explanations or surrounding text. RETURN EXACTLY THE NEW CODE AND NOTHING ELSE.' },
            { role: 'user', content: PROMPTS.edit(editPalettePos.selection, instruction) }
        ]

        try {
            const result = await window.electronAPI.chat(messages, { maxTokens: 2048, temperature: 0.2 })
            if (result.success && result.content) {
                // Strip markdown backticks if AI accidentally included them
                let cleaned = result.content
                if (cleaned.startsWith('```')) {
                    const lines = cleaned.split('\n')
                    if (lines.length > 1) {
                        lines.shift() // Remove start
                        if (lines[lines.length - 1].startsWith('```')) lines.pop() // Remove end
                        cleaned = lines.join('\n')
                    }
                }

                dispatch({
                    type: 'SET_DIFF_PREVIEW',
                    diff: {
                        original: editPalettePos.selection,
                        modified: cleaned,
                        filePath: activeFile.path,
                        selection: editPalettePos.range
                    }
                })
            } else {
                alert('Failed to generate edit: ' + (result.error || 'Unknown error'))
            }
        } catch (err: any) {
            alert('Edit error: ' + err.message)
        } finally {
            setIsGeneratingEdit(false)
            setEditPalettePos(null)
        }
    }

    if (!activeFile) {
        return (
            <div className="editor-container">
                <div className="editor-placeholder">
                    <Code2 size={48} strokeWidth={1} />
                    <p>Open a file to start editing</p>
                    <p style={{ fontSize: '12px' }}>
                        <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to open Command Palette
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="editor-container">
            {editorRef.current && monacoRef.current && (
                <>
                    <FindWidget editor={editorRef.current} monaco={monacoRef.current} />
                    {activeFile && (
                        <HoverTooltip
                            editor={editorRef.current}
                            monaco={monacoRef.current}
                            filePath={activeFile.path}
                        />
                    )}
                </>
            )}
            <MonacoEditor
                key={activeFile.path}
                language={activeFile.language}
                value={activeFile.content}
                onChange={handleChange}
                onMount={handleMount}
                theme={state.settings.theme === 'dark' ? 'bitnet-dark' : 'bitnet-light'}
                options={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: 13,
                    lineHeight: 22,
                    fontLigatures: true,
                    minimap: { enabled: true, maxColumn: 80 },
                    padding: { top: 12 },
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    renderWhitespace: 'selection',
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true },
                    scrollBeyondLastLine: false,
                    wordWrap: 'off',
                    automaticLayout: true,
                    tabSize: 2,
                    insertSpaces: true,
                    formatOnPaste: true,
                    suggest: {
                        showWords: true,
                        showSnippets: true
                    }
                }}
            />

            {editPalettePos && (
                <EditPalette
                    x={editPalettePos.x}
                    y={editPalettePos.y}
                    onClose={() => setEditPalettePos(null)}
                    onSubmit={handleEditSubmit}
                    isGenerating={isGeneratingEdit}
                />
            )}
        </div>
    )
}
