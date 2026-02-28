import React, { useState, useEffect } from 'react'
import { useApp } from '../store/appStore'
import { X, FolderOpen, Download, HardDrive, Zap, Check, AlertCircle, Code, Cpu, Bot, Layers, Loader, Trash2 } from 'lucide-react'

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
        .filter((m) => !localModels.some((l) => l.name === m.filename) && m.id !== downloadingModelId)
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
                    {/* AI Backend Selector */}
                    <div className="settings-group">
                        <div className="settings-group-title">AI Backend</div>
                        <div className="setting-field">
                            <label>Engine</label>
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
                            <div className="hint" style={{ marginTop: 6 }}>
                                {local.aiBackend === 'airllm'
                                    ? 'GPU layer-wise inference — runs 70B+ models in < 4GB VRAM'
                                    : 'CPU-friendly inference using .gguf quantized models'}
                            </div>
                        </div>
                    </div>

                    {/* AirLLM Configuration — only when AirLLM backend selected */}
                    {local.aiBackend === 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">AirLLM Configuration</div>



                            <div className="setting-field">
                                <label>Compression</label>
                                <div className="hint">Lower precision uses less VRAM but may reduce quality</div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                    {(['4bit', '8bit', 'none'] as const).map((opt) => (
                                        <button
                                            key={opt}
                                            className={`btn ${local.airllmCompression === opt ? 'btn-primary' : 'btn-secondary'}`}
                                            style={{ flex: 1 }}
                                            onClick={() => handleChange('airllmCompression', opt)}
                                        >
                                            {opt === 'none' ? 'None (FP16)' : opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-field">
                                <label>Max Length: {local.airllmMaxLength || 128}</label>
                                <div className="hint">Maximum context length in tokens</div>
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
                                Apply & Restart AirLLM
                            </button>
                        </div>
                    )}

                    {/* AirLLM Model Downloads — only when AirLLM backend selected */}
                    {local.aiBackend === 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">Download AirLLM Models</div>

                            {/* Download progress */}
                            {isDownloading && downloadingModelId === selectedAirllmId && (
                                <div className="active-download-card">
                                    <div className="active-download-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Loader size={14} className="spinner" />
                                            <span className="active-download-name">{downloadingModelId}</span>
                                        </div>
                                        <div className="active-download-stats">
                                            <span>{downloaded} / {total}</span>
                                            <span>{speed}</span>
                                        </div>
                                    </div>
                                    <div className="ws-progress-bar" style={{ height: 6, borderRadius: 3, background: 'var(--bg-primary)', marginTop: 8 }}>
                                        <div className="ws-progress-fill" style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: 'var(--accent-gradient)', transition: 'width 0.3s ease' }} />
                                    </div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { window.electronAPI.cancelAirllmDownload() }} style={{ marginTop: 8, width: '100%' }}>
                                        Cancel
                                    </button>
                                </div>
                            )}

                            {downloadError && downloadingModelId === selectedAirllmId && (
                                <div className="hint" style={{ color: 'var(--error)', marginTop: 4, marginBottom: 8 }}>
                                    <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    {downloadError}
                                </div>
                            )}

                            <div className="model-manager-list">
                                {airllmCatalog.map((model) => (
                                    <div
                                        key={model.id}
                                        className={`model-manager-item downloadable ${selectedAirllmId === model.id ? 'active' : ''}`}
                                        onClick={() => { setSelectedAirllmId(model.id); handleChange('airllmModelId', model.id) }}
                                    >
                                        <div className="model-manager-item-info">
                                            <span className="model-manager-item-name">
                                                <Zap size={12} style={{ marginRight: 4, verticalAlign: 'middle', color: 'var(--accent-primary)' }} />
                                                {model.name}
                                                {model.params && <span className="model-params-badge">{model.params}</span>}
                                            </span>
                                            <span className="model-manager-item-desc">{model.description}</span>
                                        </div>
                                        <span className="model-manager-item-size">{model.size}</span>
                                    </div>
                                ))}
                            </div>

                            {selectedAirllmId && (!isDownloading || downloadingModelId !== selectedAirllmId) && local.modelsDirectory && (
                                <button
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        dispatch({ type: 'DOWNLOAD_PROGRESS', modelId: selectedAirllmId, progress: 0, speed: 'Starting...' })
                                        window.electronAPI.downloadAirllmModel(selectedAirllmId, local.modelsDirectory)
                                    }}
                                    style={{ marginTop: 8, width: '100%' }}
                                    disabled={isDownloading}
                                >
                                    <Download size={14} /> Download Selected Model
                                </button>
                            )}

                            {selectedAirllmId && !local.modelsDirectory && (
                                <div className="hint" style={{ color: 'var(--warning)', marginTop: 8 }}>
                                    <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    Set a Models Directory in Model Configuration to download models.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Model Configuration — only for llama.cpp */}
                    {local.aiBackend !== 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">Model Configuration</div>

                            <div className="setting-field">
                                <label>Model Path (.gguf)</label>
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

                            <div className="setting-field">
                                <label>Server Binary Path (llama-server)</label>
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
                            </div>

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
                            </div>
                        </div>
                    )}

                    {/* Model Manager — only for llama.cpp */}
                    {local.aiBackend !== 'airllm' && (
                        <div className="settings-group">
                            <div className="settings-group-title">Model Manager</div>

                            {/* Installed models */}
                            {localModels.length > 0 && (
                                <div className="setting-field">
                                    <label><HardDrive size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Installed Models</label>
                                    <div className="model-manager-list">
                                        {localModels.map((m, i) => (
                                            <div
                                                key={i}
                                                className={`model-manager-item ${local.modelPath === m.path ? 'active' : ''}`}
                                                onClick={() => handleSelectLocalModel(m.path)}
                                            >
                                                <div className="model-manager-item-info">
                                                    <span className="model-manager-item-name">{m.name}</span>
                                                    <span className="model-manager-item-size">{m.size}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {local.modelPath === m.path && (
                                                        <Check size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                    )}
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm danger"
                                                        onClick={(e) => handleDeleteModel(m.path, e)}
                                                        title="Delete Model"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Download new models */}
                            {downloadableModels.length > 0 && (
                                <div className="setting-field">
                                    <label><Download size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Download Models</label>

                                    {/* Active Download Progress - NOW AT TOP */}
                                    {(isDownloading || downloadError) && (
                                        <div className="active-download-card">
                                            <div className="active-download-info">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Loader size={14} className="spinner" />
                                                    <span className="active-download-name">
                                                        {availableModels.find(m => m.id === downloadingModelId)?.name || 'Downloading Model...'}
                                                    </span>
                                                </div>
                                                <div className="active-download-stats">
                                                    <span>{Math.round(progress)}%</span>
                                                    <span>{speed}</span>
                                                </div>
                                            </div>

                                            <div className="ws-progress-bar" style={{ height: 6, borderRadius: 3, background: 'var(--bg-primary)', marginTop: 8 }}>
                                                <div className="ws-progress-fill" style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: 'var(--accent-gradient)', transition: 'width 0.3s ease' }} />
                                            </div>

                                            {downloadError ? (
                                                <div className="hint" style={{ color: 'var(--error)', marginTop: 8 }}>
                                                    <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                                    {downloadError}
                                                    <button className="btn btn-ghost btn-sm" onClick={() => handleDownloadModel()} style={{ marginLeft: 8 }}>Retry</button>
                                                </div>
                                            ) : (
                                                <button className="btn btn-ghost btn-sm" onClick={() => { window.electronAPI.cancelDownload(); dispatch({ type: 'DOWNLOAD_ERROR', modelId: downloadingModelId!, error: 'Cancelled' }) }} style={{ marginTop: 8, width: '100%' }}>
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Category tabs */}
                                    <div className="model-category-tabs">
                                        {[
                                            { key: 'all', label: 'All', icon: <Layers size={11} /> },
                                            { key: 'bitnet', label: 'BitNet', icon: <Zap size={11} /> },
                                            { key: 'small', label: 'Small', icon: <Cpu size={11} /> },
                                            { key: 'general', label: 'General', icon: <Bot size={11} /> },
                                            { key: 'code', label: 'Code', icon: <Code size={11} /> }
                                        ].map((tab) => (
                                            <button
                                                key={tab.key}
                                                className={`model-category-tab ${modelCategory === tab.key ? 'active' : ''}`}
                                                onClick={() => setModelCategory(tab.key as any)}
                                            >
                                                {tab.icon} {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="model-manager-list">
                                        {downloadableModels
                                            .filter(m => modelCategory === 'all' || m.category === modelCategory)
                                            .map((model) => (
                                                <div
                                                    key={model.id}
                                                    className={`model-manager-item downloadable ${selectedModelId === model.id ? 'active' : ''}`}
                                                    onClick={() => !isDownloading && setSelectedModelId(model.id)}
                                                >
                                                    <div className="model-manager-item-info">
                                                        <span className="model-manager-item-name">
                                                            <Zap size={12} style={{ marginRight: 4, verticalAlign: 'middle', color: 'var(--accent-primary)' }} />
                                                            {model.name}
                                                            {model.params && (
                                                                <span className="model-params-badge">{model.params}</span>
                                                            )}
                                                        </span>
                                                        <span className="model-manager-item-desc">{model.description}</span>
                                                    </div>
                                                    <span className="model-manager-item-size">{model.size}</span>
                                                </div>
                                            ))}
                                    </div>

                                    {/* Download button */}
                                    {selectedModelId && !isDownloading && local.modelsDirectory && (
                                        <button className="btn btn-primary" onClick={handleDownloadModel} style={{ marginTop: 8, width: '100%' }}>
                                            <Download size={14} /> Download Selected Model
                                        </button>
                                    )}

                                    {/* No models directory warning */}
                                    {selectedModelId && !local.modelsDirectory && (
                                        <div className="hint" style={{ color: 'var(--warning)', marginTop: 8 }}>
                                            <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                            Set a Models Directory above to download models.
                                        </div>
                                    )}
                                </div>
                            )}

                            {localModels.length === 0 && downloadableModels.length === 0 && (
                                <div className="hint">Set Models Directory to manage models.</div>
                            )}
                        </div>
                    )}

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
