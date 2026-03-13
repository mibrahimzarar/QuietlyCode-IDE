import React, { useState, useEffect } from 'react'
import { useApp } from '../store/appStore'
import { Cpu, Download, FolderOpen, ChevronRight, Zap, HardDrive, Check, AlertCircle, ArrowLeft, Brain } from 'lucide-react'

interface ModelInfo {
    id: string
    name: string
    size: string
    description: string
    filename: string
}

export default function SetupScreen() {
    const { dispatch } = useApp()
    const [models, setModels] = useState<ModelInfo[]>([])
    const [selectedModel, setSelectedModel] = useState<string | null>(null)

    const [step, setStep] = useState<'intro' | 'paths' | 'models' | 'download'>('intro')

    // Backend choice
    const [backend, setBackend] = useState<'llama' | 'airllm'>('llama')

    // Path state
    const [setupDownloadDir, setSetupDownloadDir] = useState<string>('')
    const [serverBinaryPath, setServerBinaryPath] = useState('')
    const [localModels, setLocalModels] = useState<Array<{ name: string; filename?: string; path: string; size: string }>>([])

    // Download state
    const [downloading, setDownloading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [speed, setSpeed] = useState('')
    const [error, setError] = useState('')

    // Binary download state
    const [binaryProgress, setBinaryProgress] = useState(0)
    const [binaryStatus, setBinaryStatus] = useState('')
    const [downloadingBinary, setDownloadingBinary] = useState(false)

    // AirLLM state
    const [airllmModelId, setAirllmModelId] = useState('Qwen/Qwen2.5-7B-Instruct')
    const [airllmCompression, setAirllmCompression] = useState<'4bit' | '8bit'>('4bit')
    const [airllmModels, setAirllmModels] = useState<Array<{ id: string; name: string; size: string; params?: string; description: string; category: string }>>([])
    const [selectedAirllmModel, setSelectedAirllmModel] = useState<string | null>(null)
    const [airllmDownloading, setAirllmDownloading] = useState(false)
    const [airllmProgress, setAirllmProgress] = useState(0)
    const [airllmSpeed, setAirllmSpeed] = useState('')
    const [airllmDownloaded, setAirllmDownloaded] = useState('')
    const [airllmTotal, setAirllmTotal] = useState('')

    useEffect(() => {
        loadModels()
        loadAirllmModels()
    }, [])

    useEffect(() => {
        const unsubscribe = window.electronAPI.onDownloadProgress((data) => {
            setProgress(data.progress)
            setSpeed(data.speed)
        })
        const unsubscribeBinary = window.electronAPI.onBinaryDownloadProgress?.((data) => {
            setBinaryProgress(data.progress)
            setBinaryStatus(data.status)
        })
        const unsubscribeAirllm = window.electronAPI.onAirllmDownloadProgress?.((data) => {
            setAirllmProgress(data.progress)
            setAirllmSpeed(data.speed)
            setAirllmDownloaded(data.downloaded)
            setAirllmTotal(data.total)
        })
        return () => {
            unsubscribe()
            unsubscribeBinary?.()
            unsubscribeAirllm?.()
        }
    }, [])

    async function loadModels() {
        try {
            const available = await window.electronAPI.getAvailableModels()
            setModels(available)
        } catch {
            setModels([])
        }
    }

    async function loadAirllmModels() {
        try {
            const available = await window.electronAPI.getAirllmModels()
            setAirllmModels(available)
        } catch {
            setAirllmModels([])
        }
    }

    async function handleSelectModelsDir() {
        const dir = await window.electronAPI.selectDirectory()
        if (dir) {
            setSetupDownloadDir(dir)
            const found = await window.electronAPI.scanLocalModels(dir)
            setLocalModels(found)
        }
    }

    async function handleSelectServerBinary() {
        const file = await window.electronAPI.selectFile()
        if (file) setServerBinaryPath(file)
    }

    async function handleDownloadBinary() {
        setDownloadingBinary(true)
        setError('')
        setBinaryProgress(0)

        let dir = setupDownloadDir
        if (!dir) {
            const selected = await window.electronAPI.selectDirectory()
            if (!selected) { setDownloadingBinary(false); return }
            dir = selected
        }

        const result = await window.electronAPI.downloadBinary(dir)
        setDownloadingBinary(false)

        if (result.success && result.path) {
            setServerBinaryPath(result.path)
        } else {
            setError(result.error || 'Binary download failed')
        }
    }

    async function handleDownloadModel() {
        if (!selectedModel || !setupDownloadDir) return
        setDownloading(true)
        setError('')
        setProgress(0)
        setStep('download')

        const result = await window.electronAPI.downloadModel(selectedModel, setupDownloadDir)
        setDownloading(false)

        if (result.success && result.path) {
            finishSetup(result.path)
        } else {
            setError(result.error || 'Download failed')
            setStep('models')
        }
    }

    function handleUseExistingModel(modelPath: string) {
        finishSetup(modelPath)
    }

    async function finishSetup(modelPath?: string) {
        if (backend === 'airllm') {
            const settings = {
                aiBackend: 'airllm' as const,
                airllmModelId,
                airllmCompression,
                airllmMaxLength: 128,
                modelsDirectory: setupDownloadDir || '',
                setupComplete: true,
            }
            await window.electronAPI.saveSettings(settings)
            dispatch({ type: 'SET_SETTINGS', settings })
        } else {
            const settings = {
                aiBackend: 'llama' as const,
                modelPath: modelPath || '',
                serverBinaryPath,
                modelsDirectory: setupDownloadDir,
                setupComplete: true,
            }
            await window.electronAPI.saveSettings(settings)
            dispatch({ type: 'SET_SETTINGS', settings })
        }
        dispatch({ type: 'SET_SCREEN', screen: 'ide' })
    }

    /* --------------- Render --------------- */

    const StepDots = ({ active }: { active: number }) => (
        <div className="ws-steps">
            {[1, 2, 3].map((i) => (
                <React.Fragment key={i}>
                    <div className={`ws-dot ${i < active ? 'done' : ''} ${i === active ? 'current' : ''}`}>
                        {i < active ? <Check size={12} /> : i}
                    </div>
                    {i < 3 && <div className={`ws-line ${i < active ? 'done' : ''}`} />}
                </React.Fragment>
            ))}
        </div>
    )

    const canProceedFromPaths = backend === 'airllm'
        ? true
        : (setupDownloadDir && serverBinaryPath && !downloadingBinary)

    return (
        <div className="ws-root">
            <div className="ws-bg-glow" />

            <div className="ws-card">
                {/* ── Intro ── */}
                {step === 'intro' && (
                    <div className="ws-intro">
                        <div className="ws-intro-logo">
                            <img src="./assets/logo.jpg" alt="Quietly" className="ws-logo-img" />
                        </div>
                        <h1 className="ws-title">Quietly</h1>
                        <p className="ws-tagline">Private · Local · Intelligent</p>
                        <p className="ws-desc">
                            A calm, AI‑powered pair programmer running entirely on your machine.
                            No API keys. No data leaks. Just code.
                        </p>

                        {/* Backend choice */}
                        <div style={{ display: 'flex', gap: 10, margin: '20px 0 16px', width: '100%', maxWidth: 360 }}>
                            <button
                                className={`ws-btn ${backend === 'llama' ? 'ws-btn-primary' : 'ws-btn-ghost'}`}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                onClick={() => setBackend('llama')}
                            >
                                <Cpu size={16} /> llama.cpp
                            </button>
                            <button
                                className={`ws-btn ${backend === 'airllm' ? 'ws-btn-primary' : 'ws-btn-ghost'}`}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                onClick={() => setBackend('airllm')}
                            >
                                <Brain size={16} /> AirLLM
                            </button>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'center' }}>
                            {backend === 'llama'
                                ? 'CPU-friendly inference via llama.cpp (.gguf models)'
                                : 'GPU layer-wise inference via AirLLM (HuggingFace models, < 4GB VRAM)'}
                        </p>

                        <button className="ws-btn ws-btn-primary ws-btn-lg" onClick={() => setStep('paths')}>
                            Get Started <ChevronRight size={18} />
                        </button>
                    </div>
                )}

                {/* ── Paths ── */}
                {step === 'paths' && downloadingBinary ? (
                    /* ── Full-card Binary Download Takeover ── */
                    <div className="ws-binary-takeover">
                        <div className="ws-binary-takeover-glow" />

                        {/* Icon with dual pulse rings */}
                        <div className="ws-binary-icon-wrap">
                            <div className="ws-binary-pulse ws-binary-pulse-1" />
                            <div className="ws-binary-pulse ws-binary-pulse-2" />
                            <div className="ws-binary-icon-core">
                                <Cpu size={28} />
                            </div>
                        </div>

                        <div className="ws-binary-takeover-text">
                            <h2 className="ws-binary-takeover-title">Setting up llama.cpp</h2>
                            <p className="ws-binary-takeover-status">{binaryStatus || 'Connecting…'}</p>
                        </div>

                        {/* Big percentage */}
                        <div className="ws-binary-pct">{Math.round(binaryProgress)}<span>%</span></div>

                        {/* Progress bar */}
                        <div className="ws-binary-track">
                            <div className="ws-binary-fill" style={{ width: `${binaryProgress}%` }}>
                                <div className="ws-binary-shimmer" />
                            </div>
                        </div>

                        <p className="ws-binary-hint">This only happens once</p>

                        <button
                            className="ws-btn ws-btn-ghost"
                            style={{ marginTop: 4, color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}
                            onClick={() => {
                                window.electronAPI.cancelBinaryDownload?.()
                                setDownloadingBinary(false)
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                ) : step === 'paths' && (
                    <div className="ws-body">
                        <StepDots active={1} />
                        <h2>Environment Setup</h2>
                        <p className="ws-subtitle">
                            {backend === 'airllm'
                                ? 'AirLLM downloads models from HuggingFace automatically. Optionally set a storage directory.'
                                : 'Configure where Quietly stores models and binaries.'}
                        </p>

                        <div className="ws-field">
                            <label><FolderOpen size={14} /> Models Directory</label>
                            <div className="ws-input-row">
                                <input
                                    type="text"
                                    readOnly
                                    value={setupDownloadDir}
                                    placeholder={backend === 'airllm' ? 'Optional — HuggingFace cache used by default' : 'Select a folder to store AI models…'}
                                />
                                <button className="ws-btn ws-btn-secondary" onClick={handleSelectModelsDir}>
                                    Browse
                                </button>
                            </div>
                        </div>

                        {backend === 'llama' && (
                            <div className="ws-field">
                                <label><Cpu size={14} /> Server Binary</label>
                                <p className="ws-help">The engine that runs the models on your hardware.</p>

                                <div className="ws-binary-row">
                                    <button
                                        className={`ws-btn ws-binary-btn ${serverBinaryPath ? 'success' : ''}`}
                                        onClick={serverBinaryPath ? undefined : handleDownloadBinary}
                                        disabled={!!serverBinaryPath}
                                    >
                                        {serverBinaryPath ? (
                                            <><Check size={16} /> Binary Ready</>
                                        ) : (
                                            <><Download size={16} /> Auto‑Download (Recommended)</>
                                        )}
                                    </button>

                                    {!serverBinaryPath && !downloadingBinary && (
                                        <button className="ws-btn ws-btn-ghost" onClick={handleSelectServerBinary}>
                                            Browse Local
                                        </button>
                                    )}
                                </div>

                                {serverBinaryPath && (
                                    <div className="ws-path-chip">
                                        <Check size={12} /> {serverBinaryPath}
                                    </div>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="ws-error"><AlertCircle size={14} /> {error}</div>
                        )}

                        <div className="ws-actions">
                            <button className="ws-btn ws-btn-ghost" onClick={() => setStep('intro')}>
                                <ArrowLeft size={14} /> Back
                            </button>
                            <button
                                className="ws-btn ws-btn-primary"
                                disabled={!canProceedFromPaths}
                                onClick={() => setStep('models')}
                            >
                                Continue <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Models ── */}
                {step === 'models' && (
                    <div className="ws-body">
                        <StepDots active={2} />

                        {backend === 'airllm' ? (
                            <>
                                <h2>Download AirLLM Model</h2>
                                <p className="ws-subtitle">Select a HuggingFace model to download. AirLLM runs them with &lt; 4GB VRAM.</p>

                                {/* Download progress */}
                                {airllmDownloading && (
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
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{airllmModelId?.split('/').pop()}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Downloading AirLLM Model...</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(airllmProgress)}%</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{airllmSpeed || 'Initializing...'}</div>
                                            </div>
                                        </div>

                                        <div style={{ height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.2)', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ width: `${airllmProgress}%`, height: '100%', background: 'linear-gradient(90deg, #4f46e5, #0ea5e9)', borderRadius: 4, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                {airllmDownloaded && airllmTotal ? <>{airllmDownloaded} <span style={{ color: 'var(--text-muted)' }}>/ {airllmTotal}</span></> : <span className="shimmer-text">Connecting to Hugging Face...</span>}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    window.electronAPI.cancelAirllmDownload()
                                                    setAirllmDownloading(false)
                                                }}
                                                className="ws-btn ws-btn-ghost"
                                                style={{ border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, padding: '4px 12px', height: 'auto', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Model catalog */}
                                <div className="ws-models-scroll">
                                    <h3 className="ws-group-label">Available Models</h3>
                                    <div className="ws-model-list">
                                        {airllmModels.map((model) => (
                                            <button
                                                key={model.id}
                                                className={`ws-model-card ${selectedAirllmModel === model.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    setSelectedAirllmModel(model.id)
                                                    setAirllmModelId(model.id)
                                                }}
                                            >
                                                <Zap size={22} className="ws-model-icon" />
                                                <div className="ws-model-info">
                                                    <strong>{model.name}</strong>
                                                    <span>{model.description}</span>
                                                </div>
                                                <span className="ws-model-size">{model.size}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom model ID */}
                                <div className="ws-field" style={{ marginTop: 12 }}>
                                    <label><Brain size={14} /> Or enter a custom Model ID</label>
                                    <input
                                        type="text"
                                        value={airllmModelId}
                                        onChange={(e) => { setAirllmModelId(e.target.value); setSelectedAirllmModel(null) }}
                                        placeholder="org/model-name"
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: 14 }}
                                    />
                                </div>

                                {/* Compression */}
                                <div className="ws-field" style={{ marginTop: 8 }}>
                                    <label>Compression</label>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                        {(['4bit', '8bit'] as const).map((opt) => (
                                            <button
                                                key={opt}
                                                className={`ws-btn ${airllmCompression === opt ? 'ws-btn-primary' : 'ws-btn-ghost'}`}
                                                style={{ flex: 1 }}
                                                onClick={() => setAirllmCompression(opt)}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {error && (
                                    <div className="ws-error"><AlertCircle size={14} /> {error}</div>
                                )}

                                <div className="ws-actions">
                                    <button className="ws-btn ws-btn-ghost" onClick={() => setStep('paths')}>
                                        <ArrowLeft size={14} /> Back
                                    </button>
                                    <button
                                        className="ws-btn ws-btn-primary"
                                        disabled={!airllmModelId.trim() || airllmDownloading}
                                        onClick={async () => {
                                            if (!setupDownloadDir) {
                                                // No target dir — just save the model ID and let AirLLM auto-download
                                                finishSetup()
                                                return
                                            }
                                            setAirllmDownloading(true)
                                            setError('')
                                            setAirllmProgress(0)
                                            const result = await window.electronAPI.downloadAirllmModel(airllmModelId, setupDownloadDir)
                                            setAirllmDownloading(false)
                                            if (result.success) {
                                                finishSetup(result.path)
                                            } else {
                                                setError(result.error || 'Download failed')
                                            }
                                        }}
                                    >
                                        <Download size={16} /> {setupDownloadDir ? 'Download & Launch' : 'Launch with AirLLM'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2>Choose a Model</h2>
                                <p className="ws-subtitle">Pick an AI model to power your coding assistant.</p>

                                <div className="ws-models-scroll">
                                    {localModels.length > 0 && (
                                        <>
                                            <h3 className="ws-group-label">Installed</h3>
                                            <div className="ws-model-list">
                                                {localModels.map((m, i) => (
                                                    <button
                                                        key={i}
                                                        className="ws-model-card"
                                                        onClick={() => handleUseExistingModel(m.path)}
                                                    >
                                                        <HardDrive size={22} className="ws-model-icon installed" />
                                                        <div className="ws-model-info">
                                                            <strong>{m.name}</strong>
                                                            <span>Ready to use</span>
                                                        </div>
                                                        <span className="ws-model-size">{m.size}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    <h3 className="ws-group-label">Available for Download</h3>
                                    <div className="ws-model-list">
                                        {models
                                            .filter((m) => !localModels.some((l) => (l.filename || l.name) === m.filename))
                                            .map((model) => (
                                                <button
                                                    key={model.id}
                                                    className={`ws-model-card ${selectedModel === model.id ? 'active' : ''}`}
                                                    onClick={() => setSelectedModel(model.id)}
                                                >
                                                    <Zap size={22} className="ws-model-icon" />
                                                    <div className="ws-model-info">
                                                        <strong>{model.name}</strong>
                                                        <span>{model.description}</span>
                                                    </div>
                                                    <span className="ws-model-size">{model.size}</span>
                                                </button>
                                            ))}
                                    </div>
                                </div>

                                {error && (
                                    <div className="ws-error"><AlertCircle size={14} /> {error}</div>
                                )}

                                <div className="ws-actions">
                                    <button className="ws-btn ws-btn-ghost" onClick={() => setStep('paths')}>
                                        <ArrowLeft size={14} /> Back
                                    </button>
                                    <button
                                        className="ws-btn ws-btn-primary"
                                        disabled={!selectedModel}
                                        onClick={handleDownloadModel}
                                    >
                                        <Download size={16} /> Download & Launch
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── Downloading ── */}
                {step === 'download' && (
                    <div className="ws-body ws-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                            width: '100%', maxWidth: '400px',
                            background: 'linear-gradient(135deg, rgba(var(--accent-rgb, 124, 108, 240), 0.1), rgba(var(--accent-rgb, 124, 108, 240), 0.05))',
                            border: '1px solid rgba(var(--accent-rgb, 124, 108, 240), 0.2)',
                            borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(10px)', transition: 'all 0.3s ease', textAlign: 'left'
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-primary, #7c6cf0), transparent)', opacity: 0.5, animation: 'shimmer 2s infinite' }} />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(var(--accent-rgb, 124, 108, 240), 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--accent-rgb, 124, 108, 240), 0.3)' }}>
                                        <Cpu size={20} color="var(--accent-primary, #7c6cf0)" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                                            {models.find(m => m.id === selectedModel)?.name || 'Downloading...'}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>llama.cpp Model</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary, #7c6cf0)' }}>{Math.round(progress)}%</div>
                                </div>
                            </div>

                            <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #7c6cf0, #a8a0ff)', borderRadius: 4, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'monospace' }}>
                                    {speed || <span className="shimmer-text">Connecting to server...</span>}
                                </div>
                                <button
                                    onClick={() => {
                                        window.electronAPI.cancelDownload()
                                        setDownloading(false)
                                        setStep('models')
                                    }}
                                    className="ws-btn ws-btn-ghost"
                                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
