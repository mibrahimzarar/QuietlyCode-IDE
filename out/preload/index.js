"use strict";
const electron = require("electron");
const electronAPI = {
  // Window controls
  minimize: () => electron.ipcRenderer.invoke("window:minimize"),
  maximize: () => electron.ipcRenderer.invoke("window:maximize"),
  close: () => electron.ipcRenderer.invoke("window:close"),
  isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
  onMaximizeChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    electron.ipcRenderer.on("window:maximizeChanged", listener);
    return () => electron.ipcRenderer.removeListener("window:maximizeChanged", listener);
  },
  // Settings
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => electron.ipcRenderer.invoke("settings:save", settings),
  // File system
  selectFile: () => electron.ipcRenderer.invoke("fs:selectFile"),
  openFolder: () => electron.ipcRenderer.invoke("fs:openFolder"),
  readFile: (path) => electron.ipcRenderer.invoke("fs:readFile", path),
  writeFile: (path, content) => electron.ipcRenderer.invoke("fs:writeFile", path, content),
  patchFile: (path, patches) => electron.ipcRenderer.invoke("fs:patchFile", path, patches),
  lintCodebase: (path) => electron.ipcRenderer.invoke("fs:lintCodebase", path),
  getFileTree: (path) => electron.ipcRenderer.invoke("fs:getFileTree", path),
  createFile: (path) => electron.ipcRenderer.invoke("fs:createFile", path),
  createFolder: (path) => electron.ipcRenderer.invoke("fs:createFolder", path),
  renameFile: (oldPath, newPath) => electron.ipcRenderer.invoke("fs:rename", oldPath, newPath),
  deleteFile: (path) => electron.ipcRenderer.invoke("fs:delete", path),
  searchInFiles: (dir, query) => electron.ipcRenderer.invoke("fs:searchInFiles", dir, query),
  // AI Service
  startAIServer: () => electron.ipcRenderer.invoke("ai:startServer"),
  stopAIServer: () => electron.ipcRenderer.invoke("ai:stopServer"),
  getAIStatus: () => electron.ipcRenderer.invoke("ai:getStatus"),
  chat: (messages, options) => electron.ipcRenderer.invoke("ai:chat", messages, options),
  chatStream: (messages, options) => electron.ipcRenderer.invoke("ai:chatStream", messages, options),
  stopStream: () => electron.ipcRenderer.invoke("ai:stopStream"),
  analyzeCodebase: (projectPath) => electron.ipcRenderer.invoke("ai:analyzeCodebase", projectPath),
  onStreamChunk: (callback) => {
    const listener = (_event, chunk) => callback(chunk);
    electron.ipcRenderer.on("ai:streamChunk", listener);
    return () => electron.ipcRenderer.removeListener("ai:streamChunk", listener);
  },
  onStreamEnd: (callback) => {
    const listener = () => callback();
    electron.ipcRenderer.on("ai:streamEnd", listener);
    return () => electron.ipcRenderer.removeListener("ai:streamEnd", listener);
  },
  // Model downloader
  getAvailableModels: () => electron.ipcRenderer.invoke("models:getAvailable"),
  selectDirectory: () => electron.ipcRenderer.invoke("models:selectDirectory"),
  downloadModel: (modelId, targetDir) => electron.ipcRenderer.invoke("models:download", modelId, targetDir),
  cancelDownload: () => electron.ipcRenderer.invoke("models:cancelDownload"),
  scanLocalModels: (directory) => electron.ipcRenderer.invoke("models:scanLocal", directory),
  deleteModel: (path) => electron.ipcRenderer.invoke("models:delete", path),
  onDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("models:downloadProgress", listener);
    return () => electron.ipcRenderer.removeListener("models:downloadProgress", listener);
  },
  onDownloadComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("models:downloadComplete", listener);
    return () => electron.ipcRenderer.removeListener("models:downloadComplete", listener);
  },
  onDownloadError: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("models:downloadError", listener);
    return () => electron.ipcRenderer.removeListener("models:downloadError", listener);
  },
  // Binary downloader
  downloadBinary: (targetDir) => electron.ipcRenderer.invoke("binary:download", targetDir),
  cancelBinaryDownload: () => electron.ipcRenderer.invoke("binary:cancel"),
  onBinaryDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("binary:progress", listener);
    return () => electron.ipcRenderer.removeListener("binary:progress", listener);
  },
  // Shell / Terminal
  executeCommand: (command, cwd) => electron.ipcRenderer.invoke("terminal:execute", command, cwd),
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url),
  // Persistent Terminal
  createTerminal: (id, shell, cwd) => electron.ipcRenderer.invoke("terminal:create", id, shell, cwd),
  writeTerminal: (id, data) => electron.ipcRenderer.invoke("terminal:write", id, data),
  resizeTerminal: (id, cols, rows) => electron.ipcRenderer.invoke("terminal:resize", id, cols, rows),
  killTerminal: (id) => electron.ipcRenderer.invoke("terminal:kill", id),
  getShells: () => electron.ipcRenderer.invoke("terminal:getShells"),
  onTerminalData: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("terminal:data", listener);
    return () => electron.ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("terminal:exit", listener);
    return () => electron.ipcRenderer.removeListener("terminal:exit", listener);
  },
  // RAG
  indexCodebase: (projectPath) => electron.ipcRenderer.invoke("rag:index", projectPath),
  getRagStatus: () => electron.ipcRenderer.invoke("rag:status"),
  ragRetrieve: (query) => electron.ipcRenderer.invoke("rag:retrieve", query),
  onRagProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on("rag:progress", listener);
    return () => electron.ipcRenderer.removeListener("rag:progress", listener);
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
