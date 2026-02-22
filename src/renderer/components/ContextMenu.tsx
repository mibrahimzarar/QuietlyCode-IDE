import React from 'react'
import { useApp } from '../store/appStore'

export default function ContextMenu() {
    const { state, dispatch } = useApp()

    if (!state.contextMenu) return null

    return (
        <div
            className="context-menu"
            style={{
                left: state.contextMenu.x,
                top: state.contextMenu.y
            }}
        >
            {state.contextMenu.items.map((item, i) => (
                <div
                    key={i}
                    className="context-menu-item"
                    onClick={() => {
                        item.action()
                        dispatch({ type: 'SET_CONTEXT_MENU', menu: null })
                    }}
                >
                    <span>{item.label}</span>
                </div>
            ))}
        </div>
    )
}
