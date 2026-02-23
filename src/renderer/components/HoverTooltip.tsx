import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

interface HoverTooltipProps {
    editor: any
    monaco: any
    filePath: string
}

interface HoverData {
    content: string
    x: number
    y: number
    visible: boolean
}

export default function HoverTooltip({ editor, monaco, filePath }: HoverTooltipProps) {
    const [hover, setHover] = useState<HoverData>({ content: '', x: 0, y: 0, visible: false })
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastRequestRef = useRef<number>(0)

    useEffect(() => {
        if (!editor || !monaco || !filePath) return

        const disposable = editor.onMouseMove(async (e: any) => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }

            // Only show hover on content, not margin
            if (e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) {
                hideTimeoutRef.current = setTimeout(() => {
                    setHover(prev => ({ ...prev, visible: false }))
                }, 100)
                return
            }

            const position = e.target.position
            if (!position) return

            const requestId = Date.now()
            lastRequestRef.current = requestId

            try {
                // Convert to 0-based for LSP
                const result = await window.electronAPI.getHover(
                    filePath,
                    position.lineNumber - 1,
                    position.column - 1
                )

                // Ignore if a newer request was made
                if (lastRequestRef.current !== requestId) return

                if (result && result.contents) {
                    let content = ''
                    
                    if (typeof result.contents === 'string') {
                        content = result.contents
                    } else if (Array.isArray(result.contents)) {
                        content = result.contents.map((c: string | { value: string }) => 
                            typeof c === 'string' ? c : c.value
                        ).join('\n\n')
                    } else if (typeof result.contents === 'object' && 'value' in result.contents) {
                        content = (result.contents as { value: string }).value
                    }

                    if (content) {
                        // Get mouse coordinates
                        const editorDom = editor.getDomNode()
                        if (editorDom) {
                            const rect = editorDom.getBoundingClientRect()
                            setHover({
                                content,
                                x: e.event.posx + rect.left,
                                y: e.event.posy + rect.top - 10,
                                visible: true
                            })
                        }
                    }
                }
            } catch (error) {
                // LSP might not be available
            }
        })

        const leaveDisposable = editor.onMouseLeave(() => {
            hideTimeoutRef.current = setTimeout(() => {
                setHover(prev => ({ ...prev, visible: false }))
            }, 300)
        })

        return () => {
            disposable.dispose()
            leaveDisposable.dispose()
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
    }, [editor, monaco, filePath])

    if (!hover.visible || !hover.content) return null

    return ReactDOM.createPortal(
        <div 
            className="hover-tooltip"
            style={{
                left: hover.x,
                top: hover.y,
            }}
            onMouseEnter={() => {
                if (hideTimeoutRef.current) {
                    clearTimeout(hideTimeoutRef.current)
                }
            }}
            onMouseLeave={() => {
                setHover(prev => ({ ...prev, visible: false }))
            }}
        >
            <div className="hover-tooltip-content">
                {hover.content.split('\n').map((line, i) => (
                    <div key={i} className="hover-tooltip-line">
                        {line || <br />}
                    </div>
                ))}
            </div>
        </div>,
        document.body
    )
}
