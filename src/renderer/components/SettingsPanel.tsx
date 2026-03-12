import React, { useState, useEffect } from 'react'
import { useApp } from '../store/appStore'
import { X, FolderOpen, Download, HardDrive, Zap, Check, AlertCircle, Code, Cpu, Bot, Layers, Loader, Trash2, Brain } from 'lucide-react'

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
                    {/* Engine Selection */}
                    <div className="settings-group">
                        <div className="settings-group-title">Active AI Engine</div>
                        <div className="setting-field">
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                <button
                                    className={`btn ${local.aiBackend !== 'airllm' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ flex: 1 }}
                                    onClick={() => handleChange('aiBackend', 'llama')}
                                >
                                    <Cpu size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> llama.cpp
                                </button>
                                <button
                                    className={`btn ${local.aiBackend === 'airllm' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ flex: 1 }}
                                    onClick={() => handleChange('aiBackend', 'airllm')}
                                >
                                    <Zap size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> AirLLM
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Shared Path Settings */}
                    <div className="settings-group">
                        <div className="settings-group-title">Global Paths</div>
                        <div className="setting-field">
                            <label>Models Directory</label>
                            <div className="setting-row">
                                <input
                                    type="text"
                                    value={local.modelsDirectory}
                                    onChange={(e) => handleChange('modelsDirectory', e.target.value)}
                                    placeholder="/path/to/models"
                                    readOnly
                                />
                                <button className="btn btn-secondary btn-icon" onClick={() => handleBrowse('modelsDirectory')}>
                                    <FolderOpen size={14} />
                                </button>
                            </div>
                            <div className="hint">Shared folder for both llama.cpp and AirLLM models</div>
                        </div>
                    </div>

                    {/* llama.cpp Setup */}
                    {local.aiBackend !== 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">llama.cpp Setup</div>
                            <div className="setting-field">
                                <label>Server Binary Path</label>
                                <div className="setting-row">
                                    <input
                                        type="text"
                                        value={local.serverBinaryPath}
                                        onChange={(e) => handleChange('serverBinaryPath', e.target.value)}
                                        placeholder="/path/to/llama-server"
                                    />
                                    <button className="btn btn-secondary btn-icon" onClick={() => handleBrowse('serverBinaryPath')}>
                                        <FolderOpen size={14} />
                                    </button>
                                </div>

                                {!local.serverBinaryPath && (
                                    <button
                                        className={`btn btn-secondary btn-sm ${downloadingBinary ? 'disabled' : ''}`}
                                        style={{ marginTop: 8, width: '100%' }}
                                        onClick={handleDownloadBinary}
                                        disabled={downloadingBinary}
                                    >
                                        {downloadingBinary ? (
                                            <><Loader size={12} className="spinner" style={{ marginRight: 6 }} /> Downloading {Math.round(binaryProgress)}%</>
                                        ) : (
                                            <><Download size={12} style={{ marginRight: 6 }} /> Auto-Download Binary</>
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="setting-field">
                                <label>Active Model (.gguf)</label>
                                <div className="setting-row">
                                    <input
                                        type="text"
                                        value={local.modelPath}
                                        onChange={(e) => handleChange('modelPath', e.target.value)}
                                        placeholder="/path/to/model.gguf"
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
                            <div className="settings-group-title">AirLLM Setup</div>
                            <div className="setting-field">
                                <label>Compression</label>
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                    {(['4bit', '8bit'] as const).map((opt) => (
                                        <button
                                            key={opt}
                                            className={`btn ${local.airllmCompression === opt ? 'btn-primary' : 'btn-secondary'}`}
                                            style={{ flex: 1 }}
                                            onClick={() => handleChange('airllmCompression', opt)}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-field">
                                <label>Max Context Length: {local.airllmMaxLength || 128}</label>
                                <input
                                    type="range"
                                    value={local.airllmMaxLength || 128}
                                    onChange={(e) => handleChange('airllmMaxLength', parseInt(e.target.value))}
                                    min={64}
                                    max={512}
                                    step={64}
                                />
                            </div>

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', marginTop: 8 }}
                                onClick={async () => {
                                    dispatch({ type: 'SET_SETTINGS', settings: local })
                                    await window.electronAPI.saveSettings(local)
                                    dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
                                    try {
                                        await window.electronAPI.stopAIServer()
                                        const result = await window.electronAPI.startAIServer()
                                        dispatch({ type: 'SET_AI_STATUS', status: result.success ? 'connected' : 'disconnected' })
                                    } catch {
                                        dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                                    }
                                }}
                            >
                                <Zap size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                Apply & Restart Engine
                            </button>
                        </div>
                    )}

                    {/* Model Management Tabs */}
                    <div className="settings-group">
                        <div className="settings-group-title">Model Management</div>

                        {local.aiBackend === 'airllm' ? (
                            <div className="airllm-manager-section">
                                {/* AirLLM Model Downloads Content */}
                                {isDownloading && downloadingModelId === selectedAirllmId && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(var(--accent-rgb, 99, 102, 241), 0.1), rgba(var(--accent-rgb, 99, 102, 241), 0.05))',
                                        border: '1px solid rgba(var(--accent-rgb, 99, 102, 241), 0.2)',
                                        borderRadius: 12, padding: 16, marginBottom: 16, position: 'relative', overflow: 'hidden',
                                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                        backdropFilter: 'blur(10px)', transition: 'all 0.3s ease'
                                    }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.5, animation: 'shimmer 2s infinite' }} />

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(var(--accent-rgb, 99, 102, 241), 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--accent-rgb, 99, 102, 241), 0.3)' }}>
                                                    <Brain size={16} color="var(--accent)" />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{downloadingModelId?.split('/').pop()}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Downloading AirLLM Model...</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(progress)}%</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{speed || 'Initializing...'}</div>
                                            </div>
                                        </div>

                                        <div style={{ height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.2)', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4f46e5, #0ea5e9)', borderRadius: 4, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                {downloaded && total ? <>{downloaded} <span style={{ color: 'var(--text-muted)' }}>/ {total}</span></> : <span className="shimmer-text">Connecting to Hugging Face...</span>}
                                            </div>
                                            <button
                                                onClick={() => { window.electronAPI.cancelAirllmDownload() }}
                                                className="btn btn-ghost btn-sm danger"
                                                style={{ border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, padding: '4px 12px', height: 'auto' }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="model-manager-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    {airllmCatalog.map((model) => (
                                        <div
                                            key={model.id}
                                            className={`model-manager-item downloadable ${selectedAirllmId === model.id ? 'active' : ''} ${isDownloading && downloadingModelId === model.id ? 'disabled' : ''}`}
                                            onClick={() => {
                                                if (isDownloading && downloadingModelId === model.id) return;
                                                setSelectedAirllmId(model.id);
                                                handleChange('airllmModelId', model.id)
                                            }}
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
                                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={async () => {
                                        dispatch({ type: 'DOWNLOAD_PROGRESS', modelId: selectedAirllmId, progress: 0, speed: 'Starting...' })
                                        window.electronAPI.downloadAirllmModel(selectedAirllmId, local.modelsDirectory)
                                    }}>
                                        <Download size={14} /> Download Selected
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="llama-manager-section">
                                {/* llama.cpp Model Manager Content */}
                                {localModels.length > 0 && (
                                    <div className="model-manager-list" style={{ marginBottom: 12 }}>
                                        {localModels.map((m, i) => (
                                            <div key={i} className={`model-manager-item ${local.modelPath === m.path ? 'active' : ''}`} onClick={() => handleSelectLocalModel(m.path)}>
                                                <div className="model-manager-item-info">
                                                    <span className="model-manager-item-name">{m.name}</span>
                                                    <span className="model-manager-item-size">{m.size}</span>
                                                </div>
                                                <button className="btn btn-ghost btn-icon btn-sm danger" onClick={(e) => handleDeleteModel(m.path, e)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {downloadableModels.length > 0 && (
                                    <>
                                        {/* Activity indicators */}
                                        {(isDownloading || downloadError) && downloadingModelId !== selectedAirllmId && (
                                            <div style={{
                                                background: 'linear-gradient(135deg, rgba(var(--accent-rgb, 124, 108, 240), 0.1), rgba(var(--accent-rgb, 124, 108, 240), 0.05))',
                                                border: '1px solid rgba(var(--accent-rgb, 124, 108, 240), 0.2)',
                                                borderRadius: 12, padding: 16, marginBottom: 16, position: 'relative', overflow: 'hidden',
                                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                backdropFilter: 'blur(10px)', transition: 'all 0.3s ease'
                                            }}>
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-primary, #7c6cf0), transparent)', opacity: 0.5, animation: 'shimmer 2s infinite' }} />

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(var(--accent-rgb, 124, 108, 240), 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--accent-rgb, 124, 108, 240), 0.3)' }}>
                                                            <Cpu size={16} color="var(--accent-primary, #7c6cf0)" />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                                                                {availableModels.find(m => m.id === downloadingModelId)?.name || 'Downloading...'}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>llama.cpp Model</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary, #7c6cf0)' }}>{Math.round(progress)}%</div>
                                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{speed || 'Initializing...'}</div>
                                                    </div>
                                                </div>

                                                <div style={{ height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.2)', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #7c6cf0, #a8a0ff)', borderRadius: 4, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden' }}>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                        {downloaded && total ? <>{downloaded} <span style={{ color: 'var(--text-muted)' }}>/ {total}</span></> : <span className="shimmer-text">Connecting to server...</span>}
                                                    </div>
                                                    <button
                                                        onClick={() => { window.electronAPI.cancelDownload() }}
                                                        className="btn btn-ghost btn-sm danger"
                                                        style={{ border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, padding: '4px 12px', height: 'auto' }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="model-category-tabs small" style={{ marginBottom: 8 }}>
                                            {['all', 'bitnet', 'small', 'general', 'code'].map(cat => (
                                                <button key={cat} className={`model-category-tab ${modelCategory === cat ? 'active' : ''}`} onClick={() => setModelCategory(cat as any)}>
                                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="model-manager-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
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
                                                <Download size={14} /> Download Selected
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Inference */}
                    <div className="settings-group">
                        <div className="settings-group-title">Inference</div>

                        <div className="setting-field">
                            <label>Context Size</label>
                            <div className="hint">Max prompt context in tokens (default: 4096)</div>
                            <input
                                type="number"
                                value={local.contextSize}
                                onChange={(e) => handleChange('contextSize', parseInt(e.target.value) || 4096)}
                                min={512}
                                max={32768}
                                step={512}
                            />
                        </div>

                        <div className="setting-field">
                            <label>Max Output Tokens: {local.maxTokens}</label>
                            <input
                                type="range"
                                value={local.maxTokens}
                                onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                                min={64}
                                max={2048}
                                step={64}
                            />
                        </div>

                        <div className="setting-field">
                            <label>Temperature: {local.temperature.toFixed(2)}</label>
                            <input
                                type="range"
                                value={local.temperature}
                                onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                                min={0}
                                max={2}
                                step={0.05}
                            />
                        </div>

                        <div className="setting-field">
                            <label>Threads</label>
                            <div className="hint">Number of CPU threads (default: 4)</div>
                            <input
                                type="number"
                                value={local.threads}
                                onChange={(e) => handleChange('threads', parseInt(e.target.value) || 4)}
                                min={1}
                                max={32}
                            />
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className="settings-group">
                        <div className="settings-group-title">Appearance</div>

                        <div className="setting-field">
                            <label>Theme</label>
                            <select
                                value={local.theme}
                                onChange={(e) => handleChange('theme', e.target.value)}
                            >
                                <option value="dark">Dark</option>
                                <option value="light">Light</option>
                            </select>
                        </div>
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
