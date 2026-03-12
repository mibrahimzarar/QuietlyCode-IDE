import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../store/appStore'
import { Search, X, ChevronUp, ChevronDown, Replace, ReplaceAll, CaseSensitive, WholeWord, Regex } from 'lucide-react'

interface FindWidgetProps {
    editor: any
    monaco: any
}

export default function FindWidget({ editor, monaco }: FindWidgetProps) {
    const { state } = useApp()
    const [isVisible, setIsVisible] = useState(false)
    const [isReplaceMode, setIsReplaceMode] = useState(false)
    const [findText, setFindText] = useState('')
    const [replaceText, setReplaceText] = useState('')
    const [matchCase, setMatchCase] = useState(false)
    const [wholeWord, setWholeWord] = useState(false)
    const [useRegex, setUseRegex] = useState(false)
    const [currentMatch, setCurrentMatch] = useState(0)
    const [totalMatches, setTotalMatches] = useState(0)
    
    const findInputRef = useRef<HTMLInputElement>(null)
    const decorationsRef = useRef<string[]>([])
    
    // Show/hide widget based on keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+F: Find
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault()
                setIsVisible(true)
                setIsReplaceMode(false)
                // Pre-fill with selected text
                const selection = editor.getSelection()
                if (selection && !selection.isEmpty()) {
                    const selectedText = editor.getModel()?.getValueInRange(selection) || ''
                    setFindText(selectedText)
                }
                setTimeout(() => findInputRef.current?.focus(), 0)
                setTimeout(() => findInputRef.current?.select(), 10)
            }
            // Ctrl+H: Replace
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault()
                setIsVisible(true)
                setIsReplaceMode(true)
                setTimeout(() => findInputRef.current?.focus(), 0)
            }
            // Escape: Close
            if (e.key === 'Escape' && isVisible) {
                e.preventDefault()
                closeWidget()
            }
        }
        
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [editor, isVisible])
    
    // Update decorations when find parameters change
    useEffect(() => {
        if (!isVisible || !editor || !findText) {
            clearDecorations()
            setTotalMatches(0)
            setCurrentMatch(0)
            return
        }
        
        updateDecorations()
    }, [findText, matchCase, wholeWord, useRegex, isVisible])
    
    const clearDecorations = () => {
        if (editor && decorationsRef.current.length > 0) {
            editor.deltaDecorations(decorationsRef.current, [])
            decorationsRef.current = []
        }
    }
    
    const updateDecorations = () => {
        if (!editor || !findText) return
        
        const model = editor.getModel()
        if (!model) return
        
        // Clear previous decorations
        clearDecorations()
        
        const matches: any[] = []
        const decorations: any[] = []
        
        try {
            let searchPattern: RegExp
            
            if (useRegex) {
                const flags = matchCase ? 'g' : 'gi'
                searchPattern = new RegExp(findText, flags)
            } else {
                const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const flags = matchCase ? 'g' : 'gi'
                searchPattern = new RegExp(escaped, flags)
            }
            
            const text = model.getValue()
            let match
            
            while ((match = searchPattern.exec(text)) !== null) {
                const startPos = model.getPositionAt(match.index)
                const endPos = model.getPositionAt(match.index + match[0].length)
                
                matches.push({
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column
                })
            }
            
            // Create decorations for all matches
            decorations.push(...matches.map((match, index) => ({
                range: new monaco.Range(
                    match.startLineNumber,
                    match.startColumn,
                    match.endLineNumber,
                    match.endColumn
                ),
                options: {
                    className: index === 0 ? 'find-match-current' : 'find-match',
                    overviewRuler: {
                        color: index === 0 ? '#7c6cf0' : '#4a4a70',
                        position: monaco.editor.OverviewRulerLane.Center
                    }
                }
            })))
            
            decorationsRef.current = editor.deltaDecorations([], decorations)
            setTotalMatches(matches.length)
            setCurrentMatch(matches.length > 0 ? 1 : 0)
            
            // Jump to first match
            if (matches.length > 0) {
                editor.revealRangeInCenter(matches[0])
                editor.setPosition({
                    lineNumber: matches[0].startLineNumber,
                    column: matches[0].startColumn
                })
            }
        } catch (e) {
            // Invalid regex
            setTotalMatches(0)
            setCurrentMatch(0)
        }
    }
    
    const findNext = () => {
        if (!editor || totalMatches === 0) return
        
        const model = editor.getModel()
        if (!model) return
        
        const currentPosition = editor.getPosition()
        const text = model.getValue()
        
        try {
            let searchPattern: RegExp
            if (useRegex) {
                const flags = matchCase ? 'g' : 'gi'
                searchPattern = new RegExp(findText, flags)
            } else {
                const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const flags = matchCase ? 'g' : 'gi'
                searchPattern = new RegExp(escaped, flags)
            }
            
            const currentOffset = model.getOffsetAt(currentPosition)
            searchPattern.lastIndex = currentOffset + 1
            
            let match = searchPattern.exec(text)
            if (!match) {
                // Wrap around
                searchPattern.lastIndex = 0
                match = searchPattern.exec(text)
            }
            
            if (match) {
                const startPos = model.getPositionAt(match.index)
                const endPos = model.getPositionAt(match.index + match[0].length)
                
                editor.setSelection({
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column
                })
                editor.revealRangeInCenter({
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column
                })
                
                // Update current match indicator
                const allMatches: number[] = []
                let m
                const tempPattern = new RegExp(searchPattern.source, searchPattern.flags)
                while ((m = tempPattern.exec(text)) !== null) {
                    allMatches.push(m.index)
                    if (m.index === match!.index) break
                }
                setCurrentMatch(allMatches.length)
            }
        } catch (e) {
            // Invalid regex
        }
    }
    
    const findPrevious = () => {
        if (!editor || totalMatches === 0) return
        
        const model = editor.getModel()
        if (!model) return
        
        const currentPosition = editor.getPosition()
        const text = model.getValue()
        
        try {
            let searchPattern: RegExp
            if (useRegex) {
                const flags = matchCase ? 'g' : 'gi'
                searchPattern = new RegExp(findText, flags)
            } else {
                const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const flags = matchCase ? 'g' : 'gi'
                searchPattern = new RegExp(escaped, flags)
            }
            
            const currentOffset = model.getOffsetAt(currentPosition)
            const allMatches: { index: number; length: number }[] = []
            let m
            
            while ((m = searchPattern.exec(text)) !== null) {
                allMatches.push({ index: m.index, length: m[0].length })
            }
            
            // Find previous match
            const prevMatch = allMatches
                .filter(m => m.index < currentOffset - 1)
                .pop() || allMatches[allMatches.length - 1]
            
            if (prevMatch) {
                const startPos = model.getPositionAt(prevMatch.index)
                const endPos = model.getPositionAt(prevMatch.index + prevMatch.length)
                
                editor.setSelection({
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column
                })
                editor.revealRangeInCenter({
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column
                })
                
                // Update current match indicator
                const matchIndex = allMatches.findIndex(m => m.index === prevMatch.index)
                setCurrentMatch(matchIndex + 1)
            }
        } catch (e) {
            // Invalid regex
        }
    }
    
    const replaceCurrent = () => {
        if (!editor || !findText) return
        
        const selection = editor.getSelection()
        if (!selection) return
        
        const selectedText = editor.getModel()?.getValueInRange(selection)
        
        // Check if current selection matches
        let isMatch = false
        try {
            let searchPattern: RegExp
            if (useRegex) {
                const flags = matchCase ? '' : 'i'
                searchPattern = new RegExp(`^${findText}$`, flags)
            } else {
                const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const flags = matchCase ? '' : 'i'
                searchPattern = new RegExp(`^${escaped}$`, flags)
            }
            isMatch = searchPattern.test(selectedText || '')
        } catch (e) {
            return
        }
        
        if (isMatch) {
            editor.executeEdits('findWidget', [{
                range: selection,
                text: replaceText
            }])
            findNext()
        }
    }
    
    const replaceAll = () => {
        if (!editor || !findText) return
        
        const model = editor.getModel()
        if (!model) return
        
        try {
            let searchPattern: string
            if (useRegex) {
                searchPattern = findText
            } else {
                searchPattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            }
            
            const flags = matchCase ? 'g' : 'gi'
            const regex = new RegExp(searchPattern, flags)
            
            const fullRange = model.getFullModelRange()
            const text = model.getValue()
            const newText = text.replace(regex, replaceText)
            
            editor.executeEdits('findWidget', [{
                range: fullRange,
                text: newText
            }])
            
            updateDecorations()
        } catch (e) {
            // Invalid regex
        }
    }
    
    const closeWidget = () => {
        setIsVisible(false)
        setFindText('')
        setReplaceText('')
        clearDecorations()
        editor?.focus()
    }
    
    if (!isVisible) return null
    
    return (
        <div className="find-widget">
            <div className="find-widget-row">
                <div className="find-widget-input-group">
                    <Search size={14} className="find-widget-icon" />
                    <input
                        ref={findInputRef}
                        type="text"
                        className="find-widget-input"
                        placeholder="Find"
                        value={findText}
                        onChange={e => setFindText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                findNext()
                            }
                        }}
                    />
                    {totalMatches > 0 && (
                        <span className="find-widget-counter">
                            {currentMatch} of {totalMatches}
                        </span>
                    )}
                </div>
                
                <div className="find-widget-actions">
                    <button
                        className={`find-widget-btn ${matchCase ? 'active' : ''}`}
                        onClick={() => setMatchCase(!matchCase)}
                        title="Match Case"
                    >
                        <CaseSensitive size={14} />
                    </button>
                    <button
                        className={`find-widget-btn ${wholeWord ? 'active' : ''}`}
                        onClick={() => setWholeWord(!wholeWord)}
                        title="Match Whole Word"
                    >
                        <WholeWord size={14} />
                    </button>
                    <button
                        className={`find-widget-btn ${useRegex ? 'active' : ''}`}
                        onClick={() => setUseRegex(!useRegex)}
                        title="Use Regular Expression"
                    >
                        <Regex size={14} />
                    </button>
                    
                    <div className="find-widget-divider" />
                    
                    <button
                        className="find-widget-btn"
                        onClick={findPrevious}
                        disabled={totalMatches === 0}
                        title="Previous Match"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        className="find-widget-btn"
                        onClick={findNext}
                        disabled={totalMatches === 0}
                        title="Next Match"
                    >
                        <ChevronDown size={14} />
                    </button>
                    
                    <div className="find-widget-divider" />
                    
                    <button
                        className="find-widget-btn"
                        onClick={() => setIsReplaceMode(!isReplaceMode)}
                        title={isReplaceMode ? 'Hide Replace' : 'Show Replace'}
                    >
                        <Replace size={14} />
                    </button>
                    
                    <button className="find-widget-btn" onClick={closeWidget}>
                        <X size={14} />
                    </button>
                </div>
            </div>
            
            {isReplaceMode && (
                <div className="find-widget-row replace-row">
                    <div className="find-widget-input-group">
                        <Replace size={14} className="find-widget-icon" />
                        <input
                            type="text"
                            className="find-widget-input"
                            placeholder="Replace"
                            value={replaceText}
                            onChange={e => setReplaceText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    replaceCurrent()
                                }
                            }}
                        />
                    </div>
                    
                    <div className="find-widget-actions">
                        <button
                            className="find-widget-btn replace-btn"
                            onClick={replaceCurrent}
                            disabled={totalMatches === 0}
                        >
                            Replace
                        </button>
                        <button
                            className="find-widget-btn replace-all-btn"
                            onClick={replaceAll}
                            disabled={totalMatches === 0}
                        >
                            <ReplaceAll size={14} />
                            Replace All
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
