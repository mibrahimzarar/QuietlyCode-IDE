import React, { useState, useCallback } from 'react'
import { useApp, FileTreeNode } from '../store/appStore'
import {
    FolderOpen, FolderClosed, FileText, ChevronRight, ChevronDown,
    FilePlus, FolderPlus, Search, Pencil, Trash2, Files, MessageSquare,
    FileCode2, FileJson, FileType2, FileCog, FileImage, FileTerminal, FileSpreadsheet,
    GitBranch
} from 'lucide-react'
import SourceControlPanel from './SourceControlPanel'

type SidebarTab = 'explorer' | 'search' | 'git'

export default function Sidebar() {
    const { state, dispatch } = useApp()
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
    const [activeTab, setActiveTab] = useState<SidebarTab>('explorer')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<{ file: string; line: number; content: string }[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [newItemMode, setNewItemMode] = useState<'file' | 'folder' | null>(null)
    const [newItemParent, setNewItemParent] = useState<string | null>(null)
    const [newItemName, setNewItemName] = useState('')
    const [renamingPath, setRenamingPath] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null)

    async function handleOpenFolder() {
        const result = await window.electronAPI.openFolder()
        if (result) {
            dispatch({ type: 'SET_PROJECT', path: result.path, tree: result.tree })
            setExpandedDirs(new Set())
        }
    }

    function toggleDir(path: string) {
        setExpandedDirs(prev => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    async function handleOpenFile(node: FileTreeNode) {
        if (node.isDirectory) {
            toggleDir(node.path)
            return
        }
        const result = await window.electronAPI.readFile(node.path)
        if (result.success && result.content !== undefined) {
            const ext = node.name.split('.').pop()?.toLowerCase() || ''
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
                    path: node.path,
                    name: node.name,
                    content: result.content,
                    language: langMap[ext] || 'plaintext',
                    isDirty: false
                }
            })
        }
    }

    // File management
    function startNewItem(type: 'file' | 'folder', parentPath: string) {
        setNewItemMode(type)
        setNewItemParent(parentPath)
        setNewItemName('')
        setExpandedDirs(prev => new Set([...prev, parentPath]))
    }

    async function createNewItem() {
        if (!newItemName || !newItemParent || !newItemMode) return
        const path = `${newItemParent}\\${newItemName}`
        const result = newItemMode === 'file'
            ? await window.electronAPI.createFile(path)
            : await window.electronAPI.createFolder(path)
        if (result.success && state.projectPath) {
            const tree = await window.electronAPI.getFileTree(state.projectPath)
            dispatch({ type: 'SET_FILE_TREE', tree })
            if (newItemMode === 'file') {
                dispatch({
                    type: 'OPEN_FILE',
                    file: { path, name: newItemName, content: '', language: 'plaintext', isDirty: false }
                })
            }
        }
        setNewItemMode(null)
        setNewItemParent(null)
        setNewItemName('')
    }

    async function handleRename(oldPath: string) {
        if (!renameValue || !state.projectPath) return
        const dir = oldPath.substring(0, oldPath.lastIndexOf('\\'))
        const newPath = `${dir}\\${renameValue}`
        const result = await window.electronAPI.renameFile(oldPath, newPath)
        if (result.success) {
            const tree = await window.electronAPI.getFileTree(state.projectPath)
            dispatch({ type: 'SET_FILE_TREE', tree })
        }
        setRenamingPath(null)
        setRenameValue('')
    }

    async function handleDelete(path: string) {
        if (!state.projectPath) return
        const result = await window.electronAPI.deleteFile(path)
        if (result.success) {
            const tree = await window.electronAPI.getFileTree(state.projectPath)
            dispatch({ type: 'SET_FILE_TREE', tree })
            dispatch({ type: 'CLOSE_FILE', path })
        }
    }

    function handleContextMenu(e: React.MouseEvent, path: string, isDir: boolean) {
        e.preventDefault()
        e.stopPropagation()
        setContextMenuPos({ x: e.clientX, y: e.clientY, path, isDir })
    }

    // Search
    async function handleSearch() {
        if (!searchQuery.trim() || !state.projectPath) return
        setIsSearching(true)
        try {
            console.log('Searching for:', searchQuery.trim(), 'in', state.projectPath)
            const results = await window.electronAPI.searchInFiles(state.projectPath, searchQuery.trim())
            console.log('Search results:', results)
            setSearchResults(results)
        } catch (err) {
            console.error('Search failed:', err)
            setSearchResults([])
        }
        setIsSearching(false)
    }

    async function openSearchResult(file: string, line: number) {
        const result = await window.electronAPI.readFile(file)
        if (result.success && result.content !== undefined) {
            const name = file.split('\\').pop() || file
            const ext = name.split('.').pop()?.toLowerCase() || ''
            const langMap: Record<string, string> = {
                ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
                py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown'
            }
            dispatch({
                type: 'OPEN_FILE',
                file: { path: file, name, content: result.content, language: langMap[ext] || 'plaintext', isDirty: false }
            })
        }
    }

    function getFileIcon(name: string) {
        const ext = name.split('.').pop()?.toLowerCase() || ''
        const baseProps = { size: 14, className: 'file-icon' }

        if (['ts', 'tsx'].includes(ext)) return <FileType2 {...baseProps} className="file-icon icon-ts" />
        if (['js', 'jsx'].includes(ext)) return <FileCode2 {...baseProps} className="file-icon icon-js" />
        if (['json'].includes(ext)) return <FileJson {...baseProps} className="file-icon icon-json" />
        if (['css', 'scss', 'less'].includes(ext)) return <FileCode2 {...baseProps} className="file-icon icon-css" />
        if (['html', 'htm'].includes(ext)) return <FileCode2 {...baseProps} className="file-icon icon-html" />
        if (['md', 'mdx'].includes(ext)) return <FileText {...baseProps} className="file-icon icon-md" />
        if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'ico'].includes(ext)) return <FileImage {...baseProps} className="file-icon icon-img" />
        if (['py'].includes(ext)) return <FileCode2 {...baseProps} className="file-icon icon-py" />
        if (['sh', 'bash', 'zsh'].includes(ext)) return <FileTerminal {...baseProps} className="file-icon icon-sh" />
        if (['csv', 'xlsx'].includes(ext)) return <FileSpreadsheet {...baseProps} className="file-icon icon-csv" />
        if (['env', 'gitignore'].includes(ext) || name.startsWith('.')) return <FileCog {...baseProps} className="file-icon icon-config" />

        return <FileText {...baseProps} className="file-icon icon-default" />
    }

    function renderTree(nodes: FileTreeNode[], depth: number = 0) {
        return nodes.map(node => {
            const isExpanded = expandedDirs.has(node.path)
            const isActive = state.activeFilePath === node.path
            const gitClass = node.gitStatus ? `git-${node.gitStatus}` : ''

            if (renamingPath === node.path) {
                return (
                    <div key={node.path} className="file-tree-item" style={{ paddingLeft: `${14 + depth * 16}px` }}>
                        {[...Array(depth)].map((_, i) => (
                            <div key={i} className="file-tree-guide" style={{ left: `${14 + i * 16 + 6}px` }} />
                        ))}
                        {node.isDirectory ? <FolderOpen size={14} className="folder-icon" /> : getFileIcon(node.name)}
                        <input
                            className="inline-rename"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRename(node.path)
                                if (e.key === 'Escape') { setRenamingPath(null); setRenameValue('') }
                            }}
                            onBlur={() => handleRename(node.path)}
                            autoFocus
                        />
                    </div>
                )
            }

            return (
                <div key={node.path}>
                    <div
                        className={`file-tree-item ${isActive ? 'active' : ''} ${gitClass}`}
                        style={{ paddingLeft: `${14 + depth * 16}px` }}
                        onClick={() => handleOpenFile(node)}
                        onContextMenu={e => handleContextMenu(e, node.path, node.isDirectory)}
                    >
                        {[...Array(depth)].map((_, i) => (
                            <div key={i} className="file-tree-guide" style={{ left: `${14 + i * 16 + 6}px` }} />
                        ))}
                        {node.isDirectory && (
                            isExpanded ? <ChevronDown size={14} className="chevron-icon" /> : <ChevronRight size={14} className="chevron-icon" />
                        )}
                        {node.isDirectory
                            ? (isExpanded ? <FolderOpen size={14} className="folder-icon" /> : <FolderClosed size={14} className="folder-icon" />)
                            : getFileIcon(node.name)
                        }
                        <span>{node.name}</span>

                        {/* Error indicator */}
                        {!node.isDirectory && (
                            (() => {
                                const fileProblems = state.problems.filter(p => p.path === node.path)
                                if (fileProblems.length > 0) {
                                    return (
                                        <span className="file-error-badge">
                                            {fileProblems.length}
                                        </span>
                                    )
                                }
                                return null
                            })()
                        )}
                    </div>

                    {/* New item input inside expanded directory */}
                    {node.isDirectory && isExpanded && newItemParent === node.path && newItemMode && (
                        <div className="file-tree-item" style={{ paddingLeft: `${14 + (depth + 1) * 16}px` }}>
                            {[...Array(depth + 1)].map((_, i) => (
                                <div key={i} className="file-tree-guide" style={{ left: `${14 + i * 16 + 6}px` }} />
                            ))}
                            {newItemMode === 'folder' ? <FolderOpen size={14} className="folder-icon" /> : <FileText size={14} className="file-icon icon-default" />}
                            <input
                                className="inline-rename"
                                value={newItemName}
                                onChange={e => setNewItemName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') createNewItem()
                                    if (e.key === 'Escape') { setNewItemMode(null); setNewItemParent(null) }
                                }}
                                onBlur={() => { if (newItemName) createNewItem(); else { setNewItemMode(null); setNewItemParent(null) } }}
                                placeholder={newItemMode === 'file' ? 'filename...' : 'folder name...'}
                                autoFocus
                            />
                        </div>
                    )}

                    {node.isDirectory && isExpanded && node.children && renderTree(node.children, depth + 1)}
                </div>
            )
        })
    }

    return (
        <div className="sidebar" onClick={() => setContextMenuPos(null)}>
            {/* Sidebar tabs */}
            <div className="sidebar-tabs">
                <button
                    className={`sidebar-tab ${activeTab === 'explorer' ? 'active' : ''}`}
                    onClick={() => setActiveTab('explorer')}
                    title="Explorer"
                >
                    <Files size={14} /> <span>Explorer</span>
                </button>
                <button
                    className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                    title="Search"
                >
                    <Search size={14} /> <span>Search</span>
                </button>
                <button
                    className={`sidebar-tab ${activeTab === 'git' ? 'active' : ''}`}
                    onClick={() => setActiveTab('git')}
                    title="Source Control"
                >
                    <GitBranch size={14} /> <span>Source Control</span>
                </button>
            </div>

            {activeTab === 'git' ? (
                <SourceControlPanel />
            ) : activeTab === 'explorer' ? (
                <>
                    <div className="sidebar-header">
                        <h3>{state.projectPath ? state.projectPath.split('\\').pop() : 'Explorer'}</h3>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {state.projectPath && (
                                <>
                                    <button
                                        className="btn btn-ghost btn-icon"
                                        onClick={() => startNewItem('file', state.projectPath!)}
                                        title="New File"
                                        style={{ width: 24, height: 24 }}
                                    >
                                        <FilePlus size={14} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon"
                                        onClick={() => startNewItem('folder', state.projectPath!)}
                                        title="New Folder"
                                        style={{ width: 24, height: 24 }}
                                    >
                                        <FolderPlus size={14} />
                                    </button>
                                </>
                            )}
                            <button className="btn btn-ghost btn-icon" onClick={handleOpenFolder} title="Open Folder" style={{ width: 24, height: 24 }}>
                                <FolderOpen size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="sidebar-content">
                        {/* Root-level new item input */}
                        {state.projectPath && newItemParent === state.projectPath && newItemMode && (
                            <div className="file-tree-item" style={{ paddingLeft: '14px' }}>
                                {newItemMode === 'folder' ? <FolderOpen size={14} className="folder-icon" /> : <FileText size={14} className="file-icon icon-default" />}
                                <input
                                    className="inline-rename"
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') createNewItem()
                                        if (e.key === 'Escape') { setNewItemMode(null); setNewItemParent(null) }
                                    }}
                                    onBlur={() => { if (newItemName) createNewItem(); else { setNewItemMode(null); setNewItemParent(null) } }}
                                    placeholder={newItemMode === 'file' ? 'filename...' : 'folder name...'}
                                    autoFocus
                                />
                            </div>
                        )}
                        {state.fileTree.length > 0
                            ? renderTree(state.fileTree)
                            : (
                                <div className="sidebar-empty">
                                    <FolderOpen size={32} strokeWidth={1} style={{ color: 'var(--text-tertiary)' }} />
                                    <p>Open a folder to get started</p>
                                    <button className="btn btn-primary" onClick={handleOpenFolder}>
                                        Open Folder
                                    </button>
                                </div>
                            )
                        }
                    </div>
                </>
            ) : (
                <div className="search-panel">
                    <div className="search-input-wrapper">
                        <input
                            className="search-input"
                            placeholder="Search in files..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                        />
                    </div>
                    <div className="search-results">
                        {isSearching && (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                Searching...
                            </div>
                        )}
                        {!isSearching && searchResults.length === 0 && searchQuery && (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                Searching...
                            </div>
                        )}
                        {searchResults.map((r, i) => (
                            <div
                                key={i}
                                className="search-result-item"
                                onClick={() => openSearchResult(r.file, r.line)}
                            >
                                <FileText size={12} style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                        {r.file.split('\\').pop()}
                                        <span style={{ color: 'var(--text-tertiary)', marginLeft: '4px' }}>:{r.line}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Context menu */}
            {contextMenuPos && (
                <div
                    className="file-context-menu"
                    style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                    onClick={e => e.stopPropagation()}
                >
                    {contextMenuPos.isDir && (
                        <>
                            <button className="file-context-menu-item" onClick={() => { startNewItem('file', contextMenuPos.path); setContextMenuPos(null) }}>
                                <FilePlus size={12} /> New File
                            </button>
                            <button className="file-context-menu-item" onClick={() => { startNewItem('folder', contextMenuPos.path); setContextMenuPos(null) }}>
                                <FolderPlus size={12} /> New Folder
                            </button>
                            <div className="file-context-menu-separator" />
                        </>
                    )}

                    <button className="file-context-menu-item" onClick={() => {
                        dispatch({ type: 'MENTION_FILE', filename: contextMenuPos.path })
                        setContextMenuPos(null)
                    }}>
                        <MessageSquare size={12} /> Mention in Chat
                    </button>

                    <div className="file-context-menu-separator" />

                    <button className="file-context-menu-item" onClick={() => {
                        setRenamingPath(contextMenuPos.path)
                        setRenameValue(contextMenuPos.path.split('\\').pop() || '')
                        setContextMenuPos(null)
                    }}>
                        <Pencil size={12} /> Rename
                    </button>
                    <button className="file-context-menu-item danger" onClick={() => { handleDelete(contextMenuPos.path); setContextMenuPos(null) }}>
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            )}
        </div>
    )
}

