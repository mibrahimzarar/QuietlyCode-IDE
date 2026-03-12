import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useApp, FileTreeNode } from '../store/appStore'
import { FileText, Folder, Search, X } from 'lucide-react'

interface QuickOpenItem {
    path: string
    name: string
    isDirectory: boolean
    score: number
}

// Simple fuzzy matching algorithm
function fuzzyMatch(pattern: string, str: string): number {
    const patternLower = pattern.toLowerCase()
    const strLower = str.toLowerCase()
    
    let score = 0
    let patternIdx = 0
    let lastMatchIdx = -1
    
    for (let i = 0; i < strLower.length && patternIdx < patternLower.length; i++) {
        if (strLower[i] === patternLower[patternIdx]) {
            // Bonus for consecutive matches
            if (lastMatchIdx === i - 1) {
                score += 10
            }
            // Bonus for matching at word boundaries
            if (i === 0 || strLower[i - 1] === '/' || strLower[i - 1] === '\\' || strLower[i - 1] === '-') {
                score += 15
            }
            // Bonus for exact case match
            if (str[i] === pattern[patternIdx]) {
                score += 5
            }
            lastMatchIdx = i
            patternIdx++
        }
    }
    
    // Penalty for length difference
    if (patternIdx === patternLower.length) {
        score -= (str.length - pattern.length) * 0.5
        return score
    }
    
    return 0 // No match
}

function flattenFileTree(nodes: FileTreeNode[], prefix: string = ''): QuickOpenItem[] {
    const items: QuickOpenItem[] = []
    
    for (const node of nodes) {
        const fullPath = prefix ? `${prefix}/${node.name}` : node.name
        
        if (node.isDirectory && node.children) {
            items.push({
                path: node.path,
                name: fullPath,
                isDirectory: true,
                score: 0
            })
            items.push(...flattenFileTree(node.children, fullPath))
        } else {
            items.push({
                path: node.path,
                name: fullPath,
                isDirectory: false,
                score: 0
            })
        }
    }
    
    return items
}

export default function QuickOpen() {
    const { state, dispatch } = useApp()
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    
    // Flatten all files for searching
    const allItems = useMemo(() => {
        return flattenFileTree(state.fileTree)
    }, [state.fileTree])
    
    // Filter and score items based on query
    const filteredItems = useMemo(() => {
        if (!query.trim()) {
            // Show recently opened files when no query
            return state.openFiles.map(f => ({
                path: f.path,
                name: f.name,
                isDirectory: false,
                score: 100
            })).slice(0, 10)
        }
        
        const scored = allItems
            .map(item => ({
                ...item,
                score: fuzzyMatch(query, item.name)
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 15)
        
        return scored
    }, [query, allItems, state.openFiles])
    
    // Reset selection when query changes
    useEffect(() => {
        setSelectedIndex(0)
    }, [query])
    
    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])
    
    // Scroll selected item into view
    useEffect(() => {
        const container = containerRef.current
        const selectedElement = container?.querySelector(`[data-index="${selectedIndex}"]`)
        if (selectedElement) {
            selectedElement.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex])
    
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1))
                break
            case 'ArrowUp':
                e.preventDefault()
                setSelectedIndex(i => Math.max(i - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                if (filteredItems[selectedIndex]) {
                    openItem(filteredItems[selectedIndex])
                }
                break
            case 'Escape':
                e.preventDefault()
                closeQuickOpen()
                break
        }
    }, [filteredItems, selectedIndex])
    
    const openItem = async (item: QuickOpenItem) => {
        if (item.isDirectory) return
        
        const result = await window.electronAPI.readFile(item.path)
        if (result.success && result.content !== undefined) {
            const ext = item.name.split('.').pop()?.toLowerCase() || ''
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
                    path: item.path,
                    name: item.name.split('/').pop() || item.name,
                    content: result.content,
                    language: langMap[ext] || 'plaintext',
                    isDirty: false
                }
            })
        }
        closeQuickOpen()
    }
    
    const closeQuickOpen = () => {
        dispatch({ type: 'TOGGLE_QUICK_OPEN' })
    }
    
    // Highlight matching characters
    const highlightMatch = (name: string, query: string) => {
        if (!query) return <span>{name}</span>
        
        const queryLower = query.toLowerCase()
        const nameLower = name.toLowerCase()
        const elements: React.ReactNode[] = []
        let lastIdx = 0
        let queryIdx = 0
        
        for (let i = 0; i < name.length && queryIdx < query.length; i++) {
            if (nameLower[i] === queryLower[queryIdx]) {
                if (lastIdx < i) {
                    elements.push(<span key={`text-${i}`}>{name.slice(lastIdx, i)}</span>)
                }
                elements.push(
                    <mark key={`match-${i}`} className="quick-open-match">
                        {name[i]}
                    </mark>
                )
                lastIdx = i + 1
                queryIdx++
            }
        }
        
        if (lastIdx < name.length) {
            elements.push(<span key={`text-end`}>{name.slice(lastIdx)}</span>)
        }
        
        return <>{elements}</>
    }
    
    return (
        <div className="quick-open-overlay" onClick={closeQuickOpen}>
            <div className="quick-open-container" onClick={e => e.stopPropagation()}>
                <div className="quick-open-input-wrapper">
                    <Search size={16} className="quick-open-icon" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="quick-open-input"
                        placeholder={query ? 'Type to search files...' : 'Search files by name (e.g., "app" or "src/comp")'}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {query && (
                        <button className="quick-open-clear" onClick={() => setQuery('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                
                <div className="quick-open-results" ref={containerRef}>
                    {filteredItems.length === 0 ? (
                        <div className="quick-open-empty">
                            {query ? 'No matching files found' : 'Start typing to search files'}
                        </div>
                    ) : (
                        filteredItems.map((item, index) => (
                            <div
                                key={item.path}
                                data-index={index}
                                className={`quick-open-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => openItem(item)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                {item.isDirectory ? (
                                    <Folder size={16} className="quick-open-item-icon folder" />
                                ) : (
                                    <FileText size={16} className="quick-open-item-icon file" />
                                )}
                                <div className="quick-open-item-info">
                                    <div className="quick-open-item-name">
                                        {highlightMatch(item.name, query)}
                                    </div>
                                    <div className="quick-open-item-path">
                                        {item.path}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                
                <div className="quick-open-footer">
                    <span className="quick-open-hint">
                        <kbd>↑</kbd> <kbd>↓</kbd> to navigate
                    </span>
                    <span className="quick-open-hint">
                        <kbd>Enter</kbd> to open
                    </span>
                    <span className="quick-open-hint">
                        <kbd>Esc</kbd> to close
                    </span>
                </div>
            </div>
        </div>
    )
}
