import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../store/appStore'
import { 
    GitBranch, GitCommit, GitPullRequest, Plus, Minus, RotateCcw, 
    Check, MessageSquare, ChevronDown, ChevronRight, MoreHorizontal,
    RefreshCw, Upload, Download, AlertCircle
} from 'lucide-react'

interface GitStatusItem {
    path: string
    status: 'modified' | 'staged' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'conflict'
    originalPath?: string
}

interface GitBranch {
    name: string
    current: boolean
    remote?: string
}

export default function SourceControlPanel() {
    const { state, dispatch } = useApp()
    const [isGitRepo, setIsGitRepo] = useState(false)
    const [currentBranch, setCurrentBranch] = useState<string>('')
    const [status, setStatus] = useState<GitStatusItem[]>([])
    const [branches, setBranches] = useState<GitBranch[]>([])
    const [commitMessage, setCommitMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [showBranchDropdown, setShowBranchDropdown] = useState(false)
    const [expandedSections, setExpandedSections] = useState({
        staged: true,
        changes: true
    })

    const refreshGitStatus = useCallback(async () => {
        if (!state.projectPath) return
        
        setIsLoading(true)
        try {
            const [repoCheck, branch, gitStatus, branchList] = await Promise.all([
                window.electronAPI.isGitRepo(state.projectPath),
                window.electronAPI.getCurrentBranch(state.projectPath),
                window.electronAPI.getGitStatus(state.projectPath),
                window.electronAPI.getGitBranches(state.projectPath)
            ])
            
            setIsGitRepo(repoCheck)
            setCurrentBranch(branch || '')
            setStatus(gitStatus)
            setBranches(branchList.filter(b => !b.remote))
        } catch (error) {
            console.error('Failed to refresh git status:', error)
        }
        setIsLoading(false)
    }, [state.projectPath])

    useEffect(() => {
        refreshGitStatus()
    }, [refreshGitStatus])

    const handleStage = async (filePath: string) => {
        if (!state.projectPath) return
        const success = await window.electronAPI.stageFile(state.projectPath, filePath)
        if (success) refreshGitStatus()
    }

    const handleUnstage = async (filePath: string) => {
        if (!state.projectPath) return
        const success = await window.electronAPI.unstageFile(state.projectPath, filePath)
        if (success) refreshGitStatus()
    }

    const handleDiscard = async (filePath: string) => {
        if (!state.projectPath) return
        if (confirm('Discard changes? This cannot be undone.')) {
            const success = await window.electronAPI.discardChanges(state.projectPath, filePath)
            if (success) refreshGitStatus()
        }
    }

    const handleCommit = async () => {
        if (!state.projectPath || !commitMessage.trim()) return
        
        const result = await window.electronAPI.commitChanges(state.projectPath, commitMessage)
        if (result.success) {
            setCommitMessage('')
            refreshGitStatus()
            // Refresh file tree to show updated git status
            const tree = await window.electronAPI.getFileTree(state.projectPath)
            dispatch({ type: 'SET_FILE_TREE', tree })
        } else {
            alert('Commit failed: ' + result.error)
        }
    }

    const handleCheckout = async (branchName: string) => {
        if (!state.projectPath) return
        setShowBranchDropdown(false)
        const success = await window.electronAPI.checkoutBranch(state.projectPath, branchName)
        if (success) {
            refreshGitStatus()
        }
    }

    const handlePull = async () => {
        if (!state.projectPath) return
        setIsLoading(true)
        const result = await window.electronAPI.pullChanges(state.projectPath)
        setIsLoading(false)
        if (result.success) {
            refreshGitStatus()
        } else {
            alert('Pull failed: ' + result.error)
        }
    }

    const handlePush = async () => {
        if (!state.projectPath) return
        setIsLoading(true)
        const result = await window.electronAPI.pushChanges(state.projectPath)
        setIsLoading(false)
        if (result.success) {
            alert('Push successful!')
        } else {
            alert('Push failed: ' + result.error)
        }
    }

    const stagedFiles = status.filter(s => s.status === 'staged' || s.status === 'added')
    const unstagedFiles = status.filter(s => s.status !== 'staged' && s.status !== 'added')

    const getStatusIcon = (status: GitStatusItem['status']) => {
        switch (status) {
            case 'modified': return <span className="git-status-modified">M</span>
            case 'added': return <span className="git-status-added">A</span>
            case 'deleted': return <span className="git-status-deleted">D</span>
            case 'untracked': return <span className="git-status-untracked">U</span>
            case 'renamed': return <span className="git-status-renamed">R</span>
            case 'conflict': return <span className="git-status-conflict">C</span>
            default: return <span className="git-status-modified">M</span>
        }
    }

    if (!state.projectPath) {
        return (
            <div className="source-control-empty">
                <GitBranch size={32} />
                <p>Open a folder to use source control</p>
            </div>
        )
    }

    if (!isGitRepo) {
        return (
            <div className="source-control-empty">
                <GitBranch size={32} />
                <p>Not a git repository</p>
                <p className="source-control-hint">
                    Initialize a repository with "git init"
                </p>
            </div>
        )
    }

    return (
        <div className="source-control-panel">
            {/* Header */}
            <div className="source-control-header">
                <div className="source-control-branch">
                    <button 
                        className="branch-selector"
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                    >
                        <GitBranch size={14} />
                        <span>{currentBranch || 'main'}</span>
                        <ChevronDown size={12} />
                    </button>
                    
                    {showBranchDropdown && (
                        <div className="branch-dropdown">
                            {branches.map(branch => (
                                <div
                                    key={branch.name}
                                    className={`branch-item ${branch.current ? 'current' : ''}`}
                                    onClick={() => handleCheckout(branch.name)}
                                >
                                    {branch.current && <Check size={12} />}
                                    <span>{branch.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="source-control-actions">
                    <button 
                        className="source-control-btn"
                        onClick={handlePull}
                        disabled={isLoading}
                        title="Pull"
                    >
                        <Download size={14} />
                    </button>
                    <button 
                        className="source-control-btn"
                        onClick={handlePush}
                        disabled={isLoading}
                        title="Push"
                    >
                        <Upload size={14} />
                    </button>
                    <button 
                        className="source-control-btn"
                        onClick={refreshGitStatus}
                        disabled={isLoading}
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
                    </button>
                </div>
            </div>

            {/* Commit message */}
            <div className="source-control-commit">
                <textarea
                    className="commit-message-input"
                    placeholder="Message (Ctrl+Enter to commit)"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    onKeyDown={e => {
                        if (e.ctrlKey && e.key === 'Enter') {
                            handleCommit()
                        }
                    }}
                    rows={3}
                />
                <button 
                    className="commit-btn"
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || stagedFiles.length === 0}
                >
                    <GitCommit size={14} />
                    Commit
                </button>
            </div>

            {/* Changes */}
            <div className="source-control-changes">
                {/* Staged */}
                {stagedFiles.length > 0 && (
                    <div className="changes-section">
                        <div 
                            className="changes-header"
                            onClick={() => setExpandedSections(s => ({ ...s, staged: !s.staged }))}
                        >
                            {expandedSections.staged ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>Staged Changes</span>
                            <span className="changes-count">({stagedFiles.length})</span>
                        </div>
                        
                        {expandedSections.staged && (
                            <div className="changes-list">
                                {stagedFiles.map(file => (
                                    <div key={file.path} className="change-item staged">
                                        {getStatusIcon(file.status)}
                                        <span className="change-path">
                                            {file.path.split(/[\\/]/).pop()}
                                        </span>
                                        <div className="change-actions">
                                            <button 
                                                className="change-action-btn"
                                                onClick={() => handleUnstage(file.path)}
                                                title="Unstage"
                                            >
                                                <Minus size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Unstaged */}
                {unstagedFiles.length > 0 && (
                    <div className="changes-section">
                        <div 
                            className="changes-header"
                            onClick={() => setExpandedSections(s => ({ ...s, changes: !s.changes }))}
                        >
                            {expandedSections.changes ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>Changes</span>
                            <span className="changes-count">({unstagedFiles.length})</span>
                        </div>
                        
                        {expandedSections.changes && (
                            <div className="changes-list">
                                {unstagedFiles.map(file => (
                                    <div key={file.path} className={`change-item ${file.status}`}>
                                        {getStatusIcon(file.status)}
                                        <span className="change-path">
                                            {file.path.split(/[\\/]/).pop()}
                                        </span>
                                        <div className="change-actions">
                                            <button 
                                                className="change-action-btn"
                                                onClick={() => handleStage(file.path)}
                                                title="Stage"
                                            >
                                                <Plus size={12} />
                                            </button>
                                            {file.status !== 'untracked' && (
                                                <button 
                                                    className="change-action-btn danger"
                                                    onClick={() => handleDiscard(file.path)}
                                                    title="Discard"
                                                >
                                                    <RotateCcw size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {status.length === 0 && (
                    <div className="source-control-empty-state">
                        <Check size={24} />
                        <p>No changes</p>
                        <p className="source-control-hint">
                            There are no changes to commit
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
