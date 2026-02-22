import React, { useState, useEffect } from 'react'
import { useApp } from '../store/appStore'
import { Cpu, Download, FolderOpen, ChevronRight, Zap, HardDrive, Check, AlertCircle, ArrowLeft } from 'lucide-react'

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

    // Path state
    const [setupDownloadDir, setSetupDownloadDir] = useState<string>('')
    const [serverBinaryPath, setServerBinaryPath] = useState('')
    const [localModels, setLocalModels] = useState<Array<{ name: string; path: string; size: string }>>([])

    // Download state
    const [downloading, setDownloading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [speed, setSpeed] = useState('')
    const [error, setError] = useState('')

    // Binary download state
    const [binaryProgress, setBinaryProgress] = useState(0)
    const [binaryStatus, setBinaryStatus] = useState('')
    const [downloadingBinary, setDownloadingBinary] = useState(false)

    useEffect(() => {
        loadModels()
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
        return () => {
            unsubscribe()
            unsubscribeBinary?.()
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

    async function finishSetup(modelPath: string) {
        const settings = {
            modelPath,
            serverBinaryPath,
            modelsDirectory: setupDownloadDir,
            setupComplete: true,
        }
        await window.electronAPI.saveSettings(settings)
        dispatch({ type: 'SET_SETTINGS', settings })
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

    return (
        <div className="ws-root">
            {/* Decorative background */}
            <div className="ws-bg-glow" />

            <div className="ws-card">
                {/* ── Intro ── */}
                {step === 'intro' && (
                    <div className="ws-intro">
                        <div className="ws-intro-icon">
                            <Cpu size={56} strokeWidth={1} />
                        </div>
                        <h1 className="ws-title">BitNet IDE</h1>
                        <p className="ws-tagline">Private · Local · Intelligent</p>
                        <p className="ws-desc">
                            A calm, AI‑powered pair programmer running entirely on your machine.
                            No API keys. No data leaks. Just code.
                        </p>
                        <button className="ws-btn ws-btn-primary ws-btn-lg" onClick={() => setStep('paths')}>
                            Get Started <ChevronRight size={18} />
                        </button>
                    </div>
                )}

                {/* ── Paths ── */}
                {step === 'paths' && (
                    <div className="ws-body">
                        <StepDots active={1} />
                        <h2>Environment Setup</h2>
                        <p className="ws-subtitle">Configure where BitNet stores models and binaries.</p>

                        {/* Models dir */}
                        <div className="ws-field">
                            <label><FolderOpen size={14} /> Models Directory</label>
                            <div className="ws-input-row">
                                <input
                                    type="text"
                                    readOnly
                                    value={setupDownloadDir}
                                    placeholder="Select a folder to store AI models…"
                                />
                                <button className="ws-btn ws-btn-secondary" onClick={handleSelectModelsDir}>
                                    Browse
                                </button>
                            </div>
                        </div>

                        {/* Server binary */}
                        <div className="ws-field">
                            <label><Cpu size={14} /> Server Binary</label>
                            <p className="ws-help">The engine that runs the models on your hardware.</p>

                            <div className="ws-binary-row">
                                <button
                                    className={`ws-btn ws-binary-btn ${serverBinaryPath ? 'success' : ''}`}
                                    onClick={serverBinaryPath ? undefined : handleDownloadBinary}
                                    disabled={downloadingBinary || !!serverBinaryPath}
                                >
                                    {downloadingBinary ? (
                                        <>
                                            <span className="ws-spinner" />
                                            {binaryStatus || 'Downloading…'} {Math.round(binaryProgress)}%
                                        </>
                                    ) : serverBinaryPath ? (
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

                        {error && (
                            <div className="ws-error"><AlertCircle size={14} /> {error}</div>
                        )}

                        <div className="ws-actions">
                            <button className="ws-btn ws-btn-ghost" onClick={() => setStep('intro')}>
                                <ArrowLeft size={14} /> Back
                            </button>
                            <button
                                className="ws-btn ws-btn-primary"
                                disabled={!setupDownloadDir || !serverBinaryPath || downloadingBinary}
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
                        <h2>Choose a Model</h2>
                        <p className="ws-subtitle">Pick an AI model to power your coding assistant.</p>

                        <div className="ws-models-scroll">
                            {/* Installed */}
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

                            {/* Available */}
                            <h3 className="ws-group-label">Available for Download</h3>
                            <div className="ws-model-list">
                                {models
                                    .filter((m) => !localModels.some((l) => l.name === m.filename))
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
                    </div>
                )}

                {/* ── Downloading ── */}
                {step === 'download' && (
                    <div className="ws-body ws-center">
                        <div className="ws-download-visual">
                            <span className="ws-pulse-ring" />
                            <Download size={36} />
                        </div>
                        <h2>Downloading Model…</h2>
                        <div className="ws-progress-wrap">
                            <div className="ws-progress-bar">
                                <div className="ws-progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="ws-progress-stats">
                                <span>{progress}%</span>
                                <span>{speed}</span>
                            </div>
                        </div>
                        <button
                            className="ws-btn ws-btn-ghost"
                            onClick={() => {
                                window.electronAPI.cancelDownload()
                                setDownloading(false)
                                setStep('models')
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
