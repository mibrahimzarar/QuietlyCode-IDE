# Quietly IDE

A calm, local, private AI pair-programmer. No cloud. No telemetry. No distractions.

**Offline-First Local AI IDE** powered by [BitNet.cpp](https://github.com/microsoft/BitNet) for local 1-bit LLM inference.

## Features

- ⚡ **Fully Offline** — All inference runs locally via BitNet.cpp, zero internet required after setup
- 🧠 **AI Chat Panel** — Streaming AI responses for code questions, explanations, and generation
- ✏️ **Monaco Editor** — Full-featured code editor with syntax highlighting for 30+ languages
- 🔍 **Explain Code** — Select code → right-click → AI explains it
- ♻️ **Refactor Selection** — AI-powered code refactoring with inline diff preview
- 🎨 **Dark & Light Themes** — Beautiful custom themes with smooth transitions
- ⌨️ **Keyboard-First** — Command palette (Ctrl+Shift+P), shortcuts for all actions
- 📁 **File Explorer** — Project tree with file open/save support
- ⚙️ **Configurable** — Model path, context size, temperature, max tokens, threads
- 📥 **Model Download** — Built-in interface to download BitNet models from Hugging Face

## Prerequisites

1. **Node.js** 18+ and npm
2. **BitNet.cpp** compiled with `llama-server` binary ([build guide](https://github.com/microsoft/BitNet#build-from-source))
3. A **GGUF model** file (download via the built-in setup screen or from [HuggingFace](https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-gguf))

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode
npm run dev

# 3. On first launch, the Setup Screen will guide you to:
#    - Download a BitNet model
#    - Configure the llama-server binary path
```

## Build for Production

```bash
npm run build
```

## Keyboard Shortcuts

| Shortcut         | Action                |
| ---------------- | --------------------- |
| Ctrl+Shift+P     | Command Palette       |
| Ctrl+S           | Save File             |
| Ctrl+B           | Toggle Sidebar        |
| Ctrl+J           | Toggle AI Panel       |
| Ctrl+,           | Settings              |
| Ctrl+Shift+E     | AI: Explain Selection |
| Ctrl+Shift+R     | AI: Refactor Selection|
| Ctrl+K           | AI: Edit Selection    |

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Window management & IPC handlers
│   ├── ai-service.ts        # llama-server subprocess manager
│   ├── file-service.ts      # File system operations
│   └── model-downloader.ts  # HuggingFace model downloader
├── preload/
│   └── index.ts             # IPC bridge (contextBridge)
└── renderer/                # React UI
    ├── App.tsx              # Root layout & keyboard shortcuts
    ├── index.css            # Design system & themes
    ├── store/appStore.ts    # State management (Context + useReducer)
    ├── prompts/index.ts     # AI prompt templates
    └── components/
        ├── SetupScreen.tsx  # First-run model download
        ├── TitleBar.tsx     # Frameless window controls
        ├── Sidebar.tsx      # File explorer tree
        ├── Editor.tsx       # Monaco Editor wrapper
        ├── TabBar.tsx       # Editor tabs
        ├── ChatPanel.tsx    # AI chat with streaming
        ├── StatusBar.tsx    # Bottom status bar
        ├── SettingsPanel.tsx    # Configuration modal
        ├── CommandPalette.tsx   # Ctrl+Shift+P commands
        ├── DiffPreview.tsx     # Inline diff viewer
        └── ContextMenu.tsx     # Right-click menu
```

## Design Philosophy

- **Privacy first** — All code stays on your machine
- **No telemetry** — Zero tracking, zero external calls
- **Minimal & calm** — Professional UI without distractions
- **CPU-friendly** — Target: 16GB RAM laptops (Min), CPU-only inference


