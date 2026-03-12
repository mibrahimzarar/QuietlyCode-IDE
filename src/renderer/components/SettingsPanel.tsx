import React, { useState, useEffect } from 'react'
import { useApp } from '../store/appStore'
import { X, FolderOpen, Download, Zap, Cpu, Loader, Trash2, Brain, Folder } from 'lucide-react'

interface ModelInfo {
    id: string
    name: string
    size: string
    params?: string
    description: string
    filename: string
    category?: 'bitnet' | 'general' | 'code' | 'small'
}

export default function SettingsPanel() {
    const { state, dispatch } = useApp()
    const [local, setLocal] = useState({ ...state.settings })

    // Model management state
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
    const [localModels, setLocalModels] = useState<Array<{ name: string; path: string; size: string }>>([])
    const [modelCategory, setModelCategory] = useState<'all' | 'bitnet' | 'small' | 'general' | 'code'>('all')

    // AirLLM catalog state (not download status)
    const [airllmCatalog, setAirllmCatalog] = useState<Array<{ id: string; name: string; size: string; params?: string; description: string; category: string }>>([])
    const [selectedAirllmId, setSelectedAirllmId] = useState<string | null>(null)

    // Global download state
    const { isDownloading, progress, speed, modelId: downloadingModelId, error: downloadError, downloaded, total } = state.downloadStatus

    // Binary download state
    const [binaryProgress, setBinaryProgress] = useState(0)
    const [binaryStatus, setBinaryStatus] = useState('')
    const [downloadingBinary, setDownloadingBinary] = useState(false)

    useEffect(() => {
        setLocal({ ...state.settings })
    }, [state.settings])

    useEffect(() => {
        loadAvailableModels()
        loadAirllmCatalog()
        if (state.settings.modelsDirectory) {
            scanModels(state.settings.modelsDirectory)
        }
    }, [state.settings.modelsDirectory])

    useEffect(() => {
        const unsubscribeBinary = window.electronAPI.onBinaryDownloadProgress?.((data) => {
            setBinaryProgress(data.progress)
            setBinaryStatus(data.status)
        })
        return () => {
            unsubscribeBinary?.()
        }
    }, [])

    // Listen for download completion to refresh local models
    useEffect(() => {
        if (!isDownloading && !downloadError) {
            if (state.settings.modelsDirectory) {
                scanModels(state.settings.modelsDirectory)
            }
        }
    }, [isDownloading, downloadError])

    async function loadAirllmCatalog() {
        try {
            const models = await window.electronAPI.getAirllmModels()
            setAirllmCatalog(models)
        } catch { setAirllmCatalog([]) }
    }

    async function loadAvailableModels() {
        try {
            const models = await window.electronAPI.getAvailableModels()
            setAvailableModels(models)
        } catch {
            setAvailableModels([])
        }
    }

    async function scanModels(dir: string) {
        try {
            const found = await window.electronAPI.scanLocalModels(dir)
            setLocalModels(found)
        } catch {
            setLocalModels([])
        }
    }

    function handleChange(key: string, value: any) {
        setLocal((prev: any) => ({ ...prev, [key]: value }))
    }

    async function handleBrowse(key: 'modelPath' | 'serverBinaryPath' | 'modelsDirectory') {
        if (key === 'serverBinaryPath' || key === 'modelPath') {
            const file = await window.electronAPI.selectFile()
            if (file) handleChange(key, file)
        } else {
            const dir = await window.electronAPI.selectDirectory()
            if (dir) {
                handleChange(key, dir)
                scanModels(dir)
            }
        }
    }

    async function handleDownloadBinary() {
        setDownloadingBinary(true)
        setBinaryProgress(0)

        let dir = local.modelsDirectory
        if (!dir) {
            const selected = await window.electronAPI.selectDirectory()
            if (!selected) { setDownloadingBinary(false); return }
            handleChange('modelsDirectory', selected)
            dir = selected
        }

        const result = await window.electronAPI.downloadBinary(dir)
        setDownloadingBinary(false)

        if (result.success && result.path) {
            handleChange('serverBinaryPath', result.path)
        } else {
            alert(result.error || 'Binary download failed')
        }
    }

    async function handleDownloadModel() {
        if (!selectedModelId || !local.modelsDirectory) return

        // Dispatch start action immediately to update UI
        dispatch({
            type: 'DOWNLOAD_PROGRESS',
            progress: 0,
            speed: 'Starting...',
            modelId: selectedModelId
        })

        // Trigger download in main process
        // Events will handle the rest (progress, complete, error)
        window.electronAPI.downloadModel(selectedModelId, local.modelsDirectory)

        // We don't await the result here because we want to allow the user to close the panel
        // The main process will emit 'models:downloadComplete' or 'models:downloadError'
        // which App.tsx listens to.
    }

    function handleSelectLocalModel(modelPath: string) {
        handleChange('modelPath', modelPath)
    }

    async function handleSave() {
        dispatch({ type: 'SET_SETTINGS', settings: local })
        await window.electronAPI.saveSettings(local)

        if (local.aiBackend === 'airllm') {
            dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
            try {
                await window.electronAPI.stopAIServer()
                const result = await window.electronAPI.startAIServer()
                dispatch({ type: 'SET_AI_STATUS', status: result.success ? 'connected' : 'disconnected' })
            } catch {
                dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
            }
        }

        dispatch({ type: 'TOGGLE_SETTINGS' })
    }

    function handleCancel() {
        dispatch({ type: 'TOGGLE_SETTINGS' })
    }

    async function handleDeleteModel(modelPath: string, e: React.MouseEvent) {
        e.stopPropagation()
        console.log('[SettingsPanel] Requesting deletion for:', modelPath)
        if (confirm('Are you sure you want to delete this model?')) {
            const result = await window.electronAPI.deleteModel(modelPath)
            if (result.success) {
                if (local.modelsDirectory) {
                    scanModels(local.modelsDirectory)
                }
                // If deleting active model, clear selection
                if (local.modelPath === modelPath) {
                    handleChange('modelPath', '')
                }
            } else {
                alert('Failed to delete model: ' + result.error)
            }
        }
    }

    const downloadableModels = availableModels
        .filter((m) => !localModels.some((l) => l.name === m.filename))
        .sort((a, b) => {
            // Prioritize downloading model (fallback if not filtered, but we are filtering now)
            if (a.id === downloadingModelId) return -1
            if (b.id === downloadingModelId) return 1
            return 0
        })

    const sliderRow = (label: string, value: string | number, children: React.ReactNode) => (
        <div className="setting-field" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</label>
                <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)', minWidth: 40, textAlign: 'right' }}>{value}</span>
            </div>
            {children}
        </div>
    )

    return (
        <div className="settings-overlay" onClick={handleCancel}>
            <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="btn btn-ghost btn-icon" onClick={handleCancel}>
                        <X size={16} />
                    </button>
                </div>

                <div className="settings-body">

                    {/* AI Engine */}
                    <div className="settings-group">
                        <div className="settings-group-title">AI Engine</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                className={`btn ${local.aiBackend !== 'airllm' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ flex: 1 }}
                                onClick={() => handleChange('aiBackend', 'llama')}
                            >
                                <Cpu size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />llama.cpp
                            </button>
                            <button
                                className={`btn ${local.aiBackend === 'airllm' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ flex: 1 }}
                                onClick={() => handleChange('aiBackend', 'airllm')}
                            >
                                <Zap size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />AirLLM
                            </button>
                        </div>
                    </div>

                    {/* Models Directory — shared */}
                    <div className="settings-group">
                        <div className="settings-group-title">Models Directory</div>
                        {local.modelsDirectory ? (
                            <div
                                onClick={() => handleBrowse('modelsDirectory')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 14px',
                                    background: 'var(--bg-primary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    transition: 'var(--transition-fast)',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-glow)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-primary)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-primary)' }}
                            >
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(124,108,240,0.12)', border: '1px solid rgba(124,108,240,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Folder size={16} color="var(--accent-primary)" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {local.modelsDirectory.split(/[\\/]/).pop() || local.modelsDirectory}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                                        {local.modelsDirectory}
                                    </div>
                                </div>
                                <FolderOpen size={13} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                            </div>
                        ) : (
                            <button
                                className="btn btn-secondary"
                                style={{ width: '100%', justifyContent: 'center', gap: 8, padding: '10px', borderStyle: 'dashed' }}
                                onClick={() => handleBrowse('modelsDirectory')}
                            >
                                <FolderOpen size={14} />
                                Select models folder...
                            </button>
                        )}
                    </div>

                    {/* llama.cpp Setup */}
                    {local.aiBackend !== 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">llama.cpp</div>

                            <div className="setting-field" style={{ marginBottom: 10 }}>
                                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 5, display: 'block' }}>Server Binary</label>
                                <div className="setting-row">
                                    <input
                                        type="text"
                                        value={local.serverBinaryPath}
                                        onChange={(e) => handleChange('serverBinaryPath', e.target.value)}
                                        placeholder="Path to llama-server..."
                                    />
                                    <button className="btn btn-secondary btn-icon" onClick={() => handleBrowse('serverBinaryPath')}>
                                        <FolderOpen size={14} />
                                    </button>
                                </div>
                                {!local.serverBinaryPath && (
                                    downloadingBinary ? (
                                        <div style={{
                                            background: 'var(--bg-elevated)',
                                            border: '1px solid var(--accent-primary)',
                                            borderRadius: 8, padding: 12, marginTop: 8,
                                            position: 'relative', overflow: 'hidden',
                                            boxShadow: '0 0 0 1px rgba(124,108,240,0.2), 0 4px 20px rgba(124,108,240,0.2)'
                                        }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)', animation: 'shimmer 2s infinite' }} />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                    <Loader size={13} color="var(--accent-primary)" className="spinner" />
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{binaryStatus || 'Downloading...'}</span>
                                                </div>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-secondary)', fontFamily: 'monospace' }}>{Math.round(binaryProgress)}%</span>
                                            </div>
                                            <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                                <div style={{ width: `${binaryProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))', borderRadius: 3, transition: 'width 0.4s ease', position: 'relative', overflow: 'hidden' }}>
                                                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: 7, width: '100%' }} onClick={handleDownloadBinary}>
                                            <Download size={12} style={{ marginRight: 5 }} />Auto-Download Binary
                                        </button>
                                    )
                                )}
                            </div>

                            <div className="setting-field">
                                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 5, display: 'block' }}>Active Model</label>
                                <div className="setting-row">
                                    <input
                                        type="text"
                                        value={local.modelPath}
                                        onChange={(e) => handleChange('modelPath', e.target.value)}
                                        placeholder="Path to .gguf model..."
                                    />
                                    <button className="btn btn-secondary btn-icon" onClick={() => handleBrowse('modelPath')}>
                                        <FolderOpen size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AirLLM Setup */}
                    {local.aiBackend === 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">AirLLM</div>

                            <div className="setting-field" style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, display: 'block' }}>Quantization</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {(['4bit', '8bit'] as const).map((opt) => (
                                        <button
                                            key={opt}
                                            className={`btn btn-sm ${local.airllmCompression === opt ? 'btn-primary' : 'btn-secondary'}`}
                                            style={{ flex: 1 }}
                                            onClick={() => handleChange('airllmCompression', opt)}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {sliderRow('Context Length', `${local.airllmMaxLength || 128} tok`,
                                <input type="range" value={local.airllmMaxLength || 128} onChange={(e) => handleChange('airllmMaxLength', parseInt(e.target.value))} min={64} max={512} step={64} />
                            )}
                        </div>
                    )}

                    {/* Model Management */}
                    <div className="settings-group">
                        <div className="settings-group-title">Model Management</div>

                        {local.aiBackend === 'airllm' ? (
                            <div className="airllm-manager-section">
                                {isDownloading && downloadingModelId === selectedAirllmId && (
                                    <div style={{
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--accent-primary)',
                                        borderRadius: 8, padding: 12, marginBottom: 10,
                                        position: 'relative', overflow: 'hidden',
                                        boxShadow: '0 0 0 1px rgba(124,108,240,0.15), 0 4px 16px rgba(124,108,240,0.2)'
                                    }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)', animation: 'shimmer 2s infinite' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Brain size={14} color="var(--accent-primary)" />
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{downloadingModelId?.split('/').pop()}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Downloading AirLLM model</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-secondary)', fontFamily: 'monospace' }}>{Math.round(progress)}%</span>
                                                <button onClick={() => window.electronAPI.cancelAirllmDownload()} className="btn btn-ghost btn-sm danger" style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 5, padding: '3px 10px', height: 'auto', fontSize: 11 }}>Cancel</button>
                                            </div>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))', borderRadius: 2, transition: 'width 0.4s ease' }} />
                                        </div>
                                        {downloaded && total && (
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5, fontFamily: 'monospace' }}>{downloaded} / {total}</div>
                                        )}
                                    </div>
                                )}

                                <div className="model-manager-list" style={{ maxHeight: 190, overflowY: 'auto' }}>
                                    {airllmCatalog.map((model) => (
                                        <div
                                            key={model.id}
                                            className={`model-manager-item downloadable ${selectedAirllmId === model.id ? 'active' : ''} ${isDownloading && downloadingModelId === model.id ? 'disabled' : ''}`}
                                            onClick={() => { if (isDownloading && downloadingModelId === model.id) return; setSelectedAirllmId(model.id); handleChange('airllmModelId', model.id) }}
                                        >
                                            <div className="model-manager-item-info">
                                                <span className="model-manager-item-name">{model.name}</span>
                                                <span className="model-manager-item-desc">{model.description}</span>
                                            </div>
                                            <span className="model-manager-item-size">{model.size}</span>
                                        </div>
                                    ))}
                                </div>

                                {selectedAirllmId && (!isDownloading || downloadingModelId !== selectedAirllmId) && local.modelsDirectory && (
                                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => {
                                        dispatch({ type: 'DOWNLOAD_PROGRESS', modelId: selectedAirllmId, progress: 0, speed: 'Starting...' })
                                        window.electronAPI.downloadAirllmModel(selectedAirllmId, local.modelsDirectory)
                                    }}>
                                        <Download size={13} style={{ marginRight: 5 }} />Download Selected
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="llama-manager-section">
                                {localModels.length > 0 && (
                                    <div className="model-manager-list" style={{ marginBottom: 10 }}>
                                        {localModels.map((m, i) => (
                                            <div key={i} className={`model-manager-item ${local.modelPath === m.path ? 'active' : ''}`} onClick={() => handleSelectLocalModel(m.path)}>
                                                <div className="model-manager-item-info">
                                                    <span className="model-manager-item-name">{m.name}</span>
                                                    <span className="model-manager-item-size">{m.size}</span>
                                                </div>
                                                <button className="btn btn-ghost btn-icon btn-sm danger" onClick={(e) => handleDeleteModel(m.path, e)}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {downloadableModels.length > 0 && (
                                    <>
                                        {(isDownloading || downloadError) && downloadingModelId !== selectedAirllmId && (
                                            <div style={{
                                                background: 'var(--bg-elevated)',
                                                border: '1px solid var(--accent-primary)',
                                                borderRadius: 8, padding: 12, marginBottom: 10,
                                                position: 'relative', overflow: 'hidden',
                                                boxShadow: '0 0 0 1px rgba(124,108,240,0.15), 0 4px 16px rgba(124,108,240,0.2)'
                                            }}>
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)', animation: 'shimmer 2s infinite' }} />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <Cpu size={14} color="var(--accent-primary)" />
                                                        <div>
                                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {availableModels.find(m => m.id === downloadingModelId)?.name || 'Downloading...'}
                                                            </div>
                                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>llama.cpp model</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-secondary)', fontFamily: 'monospace' }}>{Math.round(progress)}%</span>
                                                        <button onClick={() => window.electronAPI.cancelDownload()} className="btn btn-ghost btn-sm danger" style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 5, padding: '3px 10px', height: 'auto', fontSize: 11 }}>Cancel</button>
                                                    </div>
                                                </div>
                                                <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))', borderRadius: 2, transition: 'width 0.4s ease' }} />
                                                </div>
                                                {downloaded && total && (
                                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5, fontFamily: 'monospace' }}>{downloaded} / {total}</div>
                                                )}
                                            </div>
                                        )}

                                        <div className="model-category-tabs small" style={{ marginBottom: 8 }}>
                                            {['all', 'bitnet', 'small', 'general', 'code'].map(cat => (
                                                <button key={cat} className={`model-category-tab ${modelCategory === cat ? 'active' : ''}`} onClick={() => setModelCategory(cat as any)}>
                                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="model-manager-list" style={{ maxHeight: 190, overflowY: 'auto' }}>
                                            {downloadableModels.filter(m => modelCategory === 'all' || m.category === modelCategory).map(model => (
                                                <div key={model.id} className={`model-manager-item downloadable ${selectedModelId === model.id ? 'active' : ''}`} onClick={() => setSelectedModelId(model.id)}>
                                                    <div className="model-manager-item-info">
                                                        <span className="model-manager-item-name">{model.name}</span>
                                                        <span className="model-manager-item-desc">{model.description}</span>
                                                    </div>
                                                    <span className="model-manager-item-size">{model.size}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {selectedModelId && !isDownloading && local.modelsDirectory && (
                                            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleDownloadModel}>
                                                <Download size={13} style={{ marginRight: 5 }} />Download Selected
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Inference Parameters */}
                    <div className="settings-group">
                        <div className="settings-group-title">Inference</div>

                        {local.aiBackend !== 'airllm' && (
                            <div className="setting-field" style={{ marginBottom: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Context Size</label>
                                    <select
                                        value={local.contextSize}
                                        onChange={(e) => handleChange('contextSize', parseInt(e.target.value))}
                                        style={{ fontSize: 11, padding: '2px 6px', height: 24, borderRadius: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                    >
                                        <option value={2048}>2K</option>
                                        <option value={4096}>4K</option>
                                        <option value={8192}>8K</option>
                                        <option value={16384}>16K</option>
                                        <option value={32768}>32K</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {sliderRow('Max Output Tokens', local.maxTokens,
                            <input type="range" value={local.maxTokens} onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))} min={64} max={2048} step={64} />
                        )}

                        {sliderRow('Temperature', local.temperature.toFixed(2),
                            <input type="range" value={local.temperature} onChange={(e) => handleChange('temperature', parseFloat(e.target.value))} min={0} max={2} step={0.05} />
                        )}

                        {local.aiBackend !== 'airllm' && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>CPU Threads</label>
                                <input
                                    type="number"
                                    value={local.threads}
                                    onChange={(e) => handleChange('threads', parseInt(e.target.value) || 4)}
                                    min={1} max={32}
                                    style={{ width: 56, textAlign: 'center', fontSize: 12, padding: '2px 6px', height: 24, borderRadius: 5 }}
                                />
                            </div>
                        )}
                    </div>

                </div>

                <div className="settings-footer">
                    <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    )
}
