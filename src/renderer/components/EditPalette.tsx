import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../store/appStore'
import { PROMPTS } from '../prompts'
import { Wand2, Loader, X, Check, XSquare } from 'lucide-react'

interface EditPaletteProps {
    x: number
    y: number
    onClose: () => void
    onSubmit: (instruction: string) => void
    isGenerating: boolean
}

export default function EditPalette({ x, y, onClose, onSubmit, isGenerating }: EditPaletteProps) {
    const [instruction, setInstruction] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const paletteRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        function handleGlobalClick(e: MouseEvent) {
            if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        function handleGlobalKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }

        // Timeout prevents immediate trigger from the shortcut that spawned it
        setTimeout(() => {
            document.addEventListener('mousedown', handleGlobalClick)
            document.addEventListener('keydown', handleGlobalKey)
        }, 10)

        return () => {
            document.removeEventListener('mousedown', handleGlobalClick)
            document.removeEventListener('keydown', handleGlobalKey)
        }
    }, [onClose])

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (instruction.trim() && !isGenerating) {
                onSubmit(instruction)
            }
        }
    }

    // Keep it on screen
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    const adjustedX = Math.min(Math.max(20, x), windowWidth - 400)
    const adjustedY = Math.min(Math.max(20, y), windowHeight - 100)

    return (
        <div
            ref={paletteRef}
            className="edit-palette"
            style={{
                left: adjustedX,
                top: adjustedY,
                position: 'fixed',
                width: 380,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-accent)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg), var(--shadow-glow)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'slideDown 0.15s ease-out'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '10px' }}>
                <div style={{ color: 'var(--accent-primary)' }}>
                    {isGenerating ? <Loader size={16} className="spinner" /> : <Wand2 size={16} />}
                </div>
                <input
                    ref={inputRef}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isGenerating}
                    placeholder="Generate or Refactor code..."
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                    }}
                />
            </div>

            {/* Keyboard shortcut hint */}
            <div style={{
                padding: '4px 14px 8px',
                fontSize: '10px',
                color: 'var(--text-tertiary)',
                display: 'flex',
                justifyContent: 'space-between'
            }}>
                <span><kbd style={{ padding: '1px 4px', background: 'var(--bg-hover)', borderRadius: 3 }}>Enter</kbd> to submit</span>
                <span><kbd style={{ padding: '1px 4px', background: 'var(--bg-hover)', borderRadius: 3 }}>Esc</kbd> to cancel</span>
            </div>
        </div>
    )
}
