"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const child_process = require("child_process");
const util = require("util");
const http = require("http");
const https = require("https");
const axios = require("axios");
const AdmZip = require("adm-zip");
const os = require("os");
const pty = require("node-pty");
const promises = require("fs/promises");
const crypto = require("crypto");
const node = require("vscode-jsonrpc/node");
const events = require("events");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const pty__namespace = /* @__PURE__ */ _interopNamespaceDefault(pty);
const IGNORED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".idea",
  ".vscode",
  ".vs",
  ".cache",
  ".DS_Store"
]);
const IGNORED_FILES = /* @__PURE__ */ new Set([
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini"
]);
const VISIBLE_IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage"
]);
const execAsync$3 = util.promisify(child_process.exec);
class FileService {
  constructor() {
    this.gitStatusMap = /* @__PURE__ */ new Map();
  }
  async getGitStatus(projectPath) {
    try {
      const { stdout } = await execAsync$3("git status --porcelain=v1 --ignored", { cwd: projectPath });
      const map = /* @__PURE__ */ new Map();
      stdout.split("\n").forEach((line) => {
        if (!line || line.length < 3) return;
        const x = line[0];
        const y = line[1];
        const filePath = path.join(projectPath, line.substring(3).trim().replace(/"/g, ""));
        if (x === "?") {
          map.set(filePath, "untracked");
        } else if (x === "!") {
          map.set(filePath, "ignored");
        } else if (x !== " ") {
          map.set(filePath, "staged");
        } else if (y === "M") {
          map.set(filePath, "modified");
        } else if (y === "D") {
          map.set(filePath, "deleted");
        }
      });
      this.gitStatusMap = map;
    } catch (err) {
      this.gitStatusMap = /* @__PURE__ */ new Map();
    }
  }
  async getFileTree(dirPath, depth = 0, maxDepth = 20, isExpandingIgnored = false) {
    if (depth === 0) {
      await this.getGitStatus(dirPath);
    }
    if (depth >= maxDepth) return [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const nodes = [];
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      for (const entry of sorted) {
        if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;
        const fullPath = path.join(dirPath, entry.name);
        const isVisibleIgnored = VISIBLE_IGNORED_DIRS.has(entry.name);
        const node2 = {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          gitStatus: isVisibleIgnored ? "ignored" : this.gitStatusMap.get(fullPath)
        };
        if (entry.isDirectory()) {
          if (isVisibleIgnored && depth === 0 && !isExpandingIgnored) {
            node2.children = [];
          } else {
            node2.children = await this.getFileTree(fullPath, depth + 1, maxDepth, isExpandingIgnored);
          }
        }
        nodes.push(node2);
      }
      return nodes;
    } catch (err) {
      console.error("Error reading directory:", dirPath, err);
      return [];
    }
  }
  // Method to load contents of a specific directory (for expanding ignored dirs)
  async expandDirectory(dirPath) {
    return this.getFileTree(dirPath, 1, 20, true);
  }
  readFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  writeFile(filePath, content) {
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  patchFile(filePath, patches) {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      let content = fs.readFileSync(filePath, "utf-8");
      for (const patch of patches) {
        if (!content.includes(patch.search)) {
          return { success: false, error: `Search block not found in file: ${patch.search.substring(0, 50)}...` };
        }
        content = content.replace(patch.search, patch.replace);
      }
      fs.writeFileSync(filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  getLanguageFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".rs": "rust",
      ".go": "go",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
      ".h": "c",
      ".hpp": "cpp",
      ".css": "css",
      ".scss": "scss",
      ".html": "html",
      ".json": "json",
      ".md": "markdown",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".xml": "xml",
      ".sh": "shell",
      ".bash": "shell",
      ".sql": "sql",
      ".rb": "ruby",
      ".php": "php",
      ".swift": "swift",
      ".kt": "kotlin",
      ".dart": "dart",
      ".lua": "lua",
      ".r": "r",
      ".toml": "toml",
      ".ini": "ini",
      ".dockerfile": "dockerfile",
      ".vue": "html",
      ".svelte": "html"
    };
    return langMap[ext] || "plaintext";
  }
}
class AIService {
  constructor() {
    this.process = null;
    this.port = 8765;
    this.isRunning = false;
    this.currentStreamRequest = null;
    this.currentModelPath = null;
  }
  async start(config) {
    if (this.isRunning) {
      return { success: true };
    }
    this.port = config.port;
    try {
      const binaryDir = require("path").dirname(config.binaryPath);
      this.currentModelPath = config.modelPath;
      const args = [
        "--model",
        config.modelPath,
        "--ctx-size",
        String(config.contextSize),
        "--threads",
        String(config.threads),
        "--port",
        String(config.port),
        "--host",
        "127.0.0.1",
        "--log-disable",
        "--embedding"
        // Enable embedding endpoint
      ];
      this.process = child_process.spawn(config.binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: binaryDir
      });
      let stderrOutput = "";
      const MAX_STDERR = 5e3;
      this.process.stderr?.on("data", (data) => {
        stderrOutput = (stderrOutput + data.toString()).slice(-MAX_STDERR);
      });
      let earlyExit = false;
      let exitCode = null;
      this.process.on("error", () => {
        earlyExit = true;
        this.isRunning = false;
      });
      this.process.on("exit", (code) => {
        exitCode = code;
        earlyExit = true;
        this.isRunning = false;
      });
      const healthy = await this.waitForHealth(3e4);
      if (healthy) {
        this.isRunning = true;
        return { success: true };
      } else {
        this.stop();
        if (earlyExit) {
          const lastLines = stderrOutput.trim().split("\n").slice(-5).join("\n");
          return { success: false, error: `Server crashed (exit code: ${exitCode}). Output: ${lastLines || "No output"}` };
        }
        return { success: false, error: "Server failed to start within 30s timeout. Check that the binary and model are valid." };
      }
    } catch (err) {
      return { success: false, error: `Failed to spawn process: ${err.message}` };
    }
  }
  async stop() {
    if (this.process) {
      const proc = this.process;
      this.process = null;
      this.isRunning = false;
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
          }
          resolve();
        }, 2e3);
        proc.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        try {
          proc.kill("SIGTERM");
        } catch {
        }
      });
    }
  }
  getStatus() {
    return { running: this.isRunning, port: this.port };
  }
  waitForHealth(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            setTimeout(check, 200);
          }
        });
        req.on("error", () => {
          setTimeout(check, 200);
        });
        req.setTimeout(1e3, () => {
          req.destroy();
          setTimeout(check, 200);
        });
      };
      check();
    });
  }
  async getEmbedding(text) {
    if (!this.isRunning) return null;
    try {
      const body = JSON.stringify({
        content: text
      });
      return new Promise((resolve) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: this.port,
          path: "/embedding",
          // llama-server embedding endpoint
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        }, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const embedding = parsed.embedding || parsed.data?.[0]?.embedding;
              resolve(embedding || null);
            } catch {
              resolve(null);
            }
          });
        });
        req.on("error", () => resolve(null));
        req.write(body);
        req.end();
      });
    } catch {
      return null;
    }
  }
  async chat(messages, options) {
    try {
      const body = JSON.stringify({
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stream: false
      });
      return new Promise((resolve) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: this.port,
          path: "/v1/chat/completions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        }, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve({
                success: true,
                content: parsed.choices?.[0]?.message?.content || ""
              });
            } catch {
              resolve({ success: false, error: "Invalid response from server" });
            }
          });
        });
        req.on("error", (err) => {
          resolve({ success: false, error: err.message });
        });
        req.write(body);
        req.end();
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  async chatStream(messages, options, onChunk, onEnd) {
    try {
      const body = JSON.stringify({
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stream: true
      });
      return new Promise((resolve) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: this.port,
          path: "/v1/chat/completions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        }, (res) => {
          let buffer = "";
          res.on("data", (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                const data = trimmed.slice(6);
                if (data === "[DONE]") {
                  onEnd();
                  resolve({ success: true });
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    onChunk(content);
                  }
                } catch {
                }
              }
            }
          });
          res.on("end", () => {
            onEnd();
            resolve({ success: true });
          });
        });
        req.on("error", (err) => {
          this.currentStreamRequest = null;
          onEnd();
          resolve({ success: false, error: err.message });
        });
        this.currentStreamRequest = req;
        req.write(body);
        req.end();
      });
    } catch (err) {
      onEnd();
      return { success: false, error: err.message };
    }
  }
  abortStream() {
    if (this.currentStreamRequest) {
      this.currentStreamRequest.destroy();
      this.currentStreamRequest = null;
    }
  }
}
const AVAILABLE_MODELS = [
  // ===== BitNet (1-bit) Models =====
  {
    id: "bitnet-2b-4t",
    name: "BitNet b1.58 2B-4T",
    size: "~1.2 GB",
    params: "2B",
    description: "Official Microsoft 2B 1-bit model. Best for CPU inference.",
    downloadUrl: "https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-gguf/resolve/main/ggml-model-i2_s.gguf?download=true",
    filename: "ggml-model-i2_s.gguf",
    category: "bitnet"
  },
  {
    id: "bitnet-3b",
    name: "BitNet b1.58 3B",
    size: "~1.92 GB",
    params: "3B",
    description: "Community 3B 1-bit model (QuantFactory). Higher quality outputs.",
    downloadUrl: "https://huggingface.co/QuantFactory/bitnet_b1_58-3B-GGUF/resolve/main/bitnet_b1_58-3B.Q2_K.gguf?download=true",
    filename: "bitnet_b1_58-3B.Q2_K.gguf",
    category: "bitnet"
  },
  // ===== Small / Lightweight Models =====
  {
    id: "smollm2-135m",
    name: "SmolLM2 135M",
    size: "~100 MB",
    params: "135M",
    description: "Tiny model by HuggingFace. Ultra-fast, great for testing.",
    downloadUrl: "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf?download=true",
    filename: "SmolLM2-135M-Instruct-Q4_K_M.gguf",
    category: "small"
  },
  {
    id: "smollm2-360m",
    name: "SmolLM2 360M",
    size: "~250 MB",
    params: "360M",
    description: "Small model by HuggingFace. Fast with reasonable quality.",
    downloadUrl: "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf?download=true",
    filename: "SmolLM2-360M-Instruct-Q4_K_M.gguf",
    category: "small"
  },
  {
    id: "smollm2-1.7b",
    name: "SmolLM2 1.7B",
    size: "~1.0 GB",
    params: "1.7B",
    description: "Best SmolLM2 variant. Excellent quality for its size.",
    downloadUrl: "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf?download=true",
    filename: "SmolLM2-1.7B-Instruct-Q4_K_M.gguf",
    category: "small"
  },
  {
    id: "tinyllama-1.1b",
    name: "TinyLlama 1.1B Chat",
    size: "~670 MB",
    params: "1.1B",
    description: "Compact Llama architecture. Fast and efficient for simple tasks.",
    downloadUrl: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf?download=true",
    filename: "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
    category: "small"
  },
  {
    id: "stablelm-2-zephyr-1.6b",
    name: "StableLM 2 Zephyr 1.6B",
    size: "~1.0 GB",
    params: "1.6B",
    description: "Stability AI chat model. Good reasoning for its small size.",
    downloadUrl: "https://huggingface.co/TheBloke/stablelm-2-zephyr-1_6b-GGUF/resolve/main/stablelm-2-zephyr-1_6b.Q4_K_M.gguf?download=true",
    filename: "stablelm-2-zephyr-1_6b.Q4_K_M.gguf",
    category: "small"
  },
  {
    id: "qwen2.5-0.5b",
    name: "Qwen 2.5 0.5B Instruct",
    size: "~400 MB",
    params: "0.5B",
    description: "Alibaba's smallest Qwen 2.5. Ultra-fast with good quality.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    category: "small"
  },
  {
    id: "qwen2.5-1.5b",
    name: "Qwen 2.5 1.5B Instruct",
    size: "~1.0 GB",
    params: "1.5B",
    description: "Alibaba's small Qwen 2.5. Great speed and capability balance.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    category: "small"
  },
  // ===== General Purpose Models =====
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B Instruct",
    size: "~770 MB",
    params: "1B",
    description: "Meta's smallest Llama 3.2. Fast, lightweight, and capable.",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true",
    filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    category: "general"
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B Instruct",
    size: "~2.0 GB",
    params: "3B",
    description: "Meta's 3B Llama 3.2. Excellent quality for a small model.",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true",
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    category: "general"
  },
  {
    id: "gemma-2-2b",
    name: "Gemma 2 2B Instruct",
    size: "~1.6 GB",
    params: "2B",
    description: "Google's compact Gemma 2. Strong reasoning and instruction following.",
    downloadUrl: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf?download=true",
    filename: "gemma-2-2b-it-Q4_K_M.gguf",
    category: "general"
  },
  {
    id: "phi-3.5-mini",
    name: "Phi 3.5 Mini Instruct",
    size: "~2.4 GB",
    params: "3.8B",
    description: "Microsoft's Phi 3.5 Mini. Exceptional reasoning for its size.",
    downloadUrl: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true",
    filename: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    category: "general"
  },
  {
    id: "phi-4-mini",
    name: "Phi 4 Mini Instruct",
    size: "~2.4 GB",
    params: "3.8B",
    description: "Microsoft's latest Phi 4 Mini. State-of-the-art small model.",
    downloadUrl: "https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf?download=true",
    filename: "microsoft_Phi-4-mini-instruct-Q4_K_M.gguf",
    category: "general"
  },
  {
    id: "qwen2.5-3b",
    name: "Qwen 2.5 3B Instruct",
    size: "~2.0 GB",
    params: "3B",
    description: "Alibaba's Qwen 2.5 3B. Strong multilingual and reasoning.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-3b-instruct-q4_k_m.gguf",
    category: "general"
  },
  {
    id: "qwen2.5-7b",
    name: "Qwen 2.5 7B Instruct",
    size: "~4.7 GB",
    params: "7B",
    description: "Alibaba's best sub-8B model. Top-tier quality and reasoning.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-7b-instruct-q4_k_m.gguf",
    category: "general"
  },
  {
    id: "mistral-7b-instruct",
    name: "Mistral 7B Instruct v0.3",
    size: "~4.4 GB",
    params: "7B",
    description: "Mistral AI's flagship 7B. Excellent general-purpose performance.",
    downloadUrl: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf?download=true",
    filename: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    category: "general"
  },
  // ===== Code-Focused Models =====
  {
    id: "qwen2.5-coder-1.5b",
    name: "Qwen 2.5 Coder 1.5B",
    size: "~1.0 GB",
    params: "1.5B",
    description: "Alibaba's small code model. Fast code completion.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
    category: "code"
  },
  {
    id: "qwen2.5-coder-3b",
    name: "Qwen 2.5 Coder 3B",
    size: "~2.0 GB",
    params: "3B",
    description: "Alibaba's mid-size code model. Good quality with fast speed.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
    category: "code"
  },
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen 2.5 Coder 7B",
    size: "~4.7 GB",
    params: "7B",
    description: "Alibaba's best sub-8B code model. Excellent for coding.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf?download=true",
    filename: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    category: "code"
  },
  {
    id: "deepseek-coder-1.3b",
    name: "DeepSeek Coder 1.3B",
    size: "~820 MB",
    params: "1.3B",
    description: "DeepSeek's small code model. Fast code generation.",
    downloadUrl: "https://huggingface.co/TheBloke/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf?download=true",
    filename: "deepseek-coder-1.3b-instruct.Q4_K_M.gguf",
    category: "code"
  },
  {
    id: "deepseek-coder-6.7b",
    name: "DeepSeek Coder 6.7B",
    size: "~4.0 GB",
    params: "6.7B",
    description: "DeepSeek's best sub-8B code model. Strong coding capabilities.",
    downloadUrl: "https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf?download=true",
    filename: "deepseek-coder-6.7b-instruct.Q4_K_M.gguf",
    category: "code"
  },
  {
    id: "codegemma-2b",
    name: "CodeGemma 2B",
    size: "~1.6 GB",
    params: "2B",
    description: "Google's code-focused Gemma. Compact and fast.",
    downloadUrl: "https://huggingface.co/bartowski/codegemma-2b-GGUF/resolve/main/codegemma-2b-Q4_K_M.gguf?download=true",
    filename: "codegemma-2b-Q4_K_M.gguf",
    category: "code"
  },
  {
    id: "codegemma-7b-it",
    name: "CodeGemma 7B Instruct",
    size: "~5.0 GB",
    params: "7B",
    description: "Google's largest code Gemma. Best-in-class code generation.",
    downloadUrl: "https://huggingface.co/bartowski/codegemma-7b-it-GGUF/resolve/main/codegemma-7b-it-Q4_K_M.gguf?download=true",
    filename: "codegemma-7b-it-Q4_K_M.gguf",
    category: "code"
  }
];
class ModelDownloader {
  constructor() {
    this.abortController = null;
    this.isDownloading = false;
  }
  getAvailableModels() {
    return AVAILABLE_MODELS;
  }
  async downloadModel(modelId, targetDir, onProgress) {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return { success: false, error: "Model not found" };
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = path.join(targetDir, model.filename);
    this.isDownloading = true;
    try {
      await this.downloadFile(model.downloadUrl, filePath, onProgress);
      this.isDownloading = false;
      return { success: true, path: filePath };
    } catch (err) {
      this.isDownloading = false;
      if (err.message === "Download cancelled") {
        return { success: false, error: "Download cancelled" };
      }
      return { success: false, error: err.message };
    }
  }
  cancelDownload() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.isDownloading = false;
    }
  }
  scanLocalModels(directory) {
    const models = [];
    if (!fs.existsSync(directory)) return models;
    try {
      const files = fs.readdirSync(directory);
      for (const file of files) {
        if (file.endsWith(".gguf")) {
          const fullPath = path.join(directory, file);
          const stats = fs.statSync(fullPath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(0);
          models.push({
            name: file,
            path: fullPath,
            size: `${sizeMB} MB`
          });
        }
      }
    } catch {
    }
    return models;
  }
  async deleteModel(filePath) {
    console.log("[ModelDownloader] Deleting file:", filePath);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("[ModelDownloader] File deleted successfully");
        return { success: true };
      } else {
        console.error("[ModelDownloader] File not found:", filePath);
        return { success: false, error: "File not found" };
      }
    } catch (err) {
      console.error("[ModelDownloader] Delete error:", err);
      return { success: false, error: err.message };
    }
  }
  downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const partPath = destPath + ".part";
      let resumeBytes = 0;
      if (fs.existsSync(partPath)) {
        try {
          resumeBytes = fs.statSync(partPath).size;
        } catch {
          resumeBytes = 0;
        }
      }
      const makeRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }
        let parsedUrl;
        try {
          parsedUrl = new URL(requestUrl);
        } catch {
          reject(new Error(`Invalid URL: ${requestUrl}`));
          return;
        }
        const options = {
          headers: {}
        };
        if (resumeBytes > 0) {
          options.headers["Range"] = `bytes=${resumeBytes}-`;
        }
        const protocol = parsedUrl.protocol === "https:" ? https : http;
        const req = protocol.get(requestUrl, options, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl;
            try {
              redirectUrl = new URL(res.headers.location, requestUrl).href;
            } catch {
              reject(new Error(`Invalid redirect URL: ${res.headers.location}`));
              return;
            }
            makeRequest(redirectUrl, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            if (res.statusCode === 416 && resumeBytes > 0) {
              console.log("Resuming failed (416), restarting download...");
              resumeBytes = 0;
              try {
                fs.unlinkSync(partPath);
              } catch {
              }
              makeRequest(url, 0);
              return;
            }
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const totalBytes = parseInt(res.headers["content-length"] || "0", 10) + resumeBytes;
          let downloadedBytes = resumeBytes;
          let lastTime = Date.now();
          let lastBytes = resumeBytes;
          const file = fs.createWriteStream(partPath, { flags: resumeBytes > 0 && res.statusCode === 206 ? "a" : "w" });
          if (res.statusCode === 200 && resumeBytes > 0) {
            resumeBytes = 0;
            downloadedBytes = 0;
            lastBytes = 0;
          }
          res.on("data", (chunk) => {
            downloadedBytes += chunk.length;
            file.write(chunk);
            const now = Date.now();
            const elapsed = (now - lastTime) / 1e3;
            if (elapsed >= 0.5) {
              const bytesPerSec = (downloadedBytes - lastBytes) / elapsed;
              const speed = formatSpeed(bytesPerSec);
              const progress = totalBytes > 0 ? downloadedBytes / totalBytes * 100 : 0;
              onProgress(Math.round(progress), speed);
              lastTime = now;
              lastBytes = downloadedBytes;
            }
          });
          res.on("end", () => {
            file.end();
            onProgress(100, "0 B/s");
            try {
              if (fs.existsSync(destPath)) {
                try {
                  fs.unlinkSync(destPath);
                } catch {
                }
              }
              fs.renameSync(partPath, destPath);
              resolve();
            } catch (err) {
              reject(new Error(`Failed to rename part file: ${err.message}`));
            }
          });
          res.on("error", (err) => {
            file.end();
            reject(err);
          });
        });
        req.on("error", (err) => {
          reject(err);
        });
      };
      makeRequest(url);
    });
  }
}
function formatSpeed(bytesPerSec) {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  } else if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  }
  return `${bytesPerSec.toFixed(0)} B/s`;
}
class BinaryDownloader {
  constructor() {
    this.isDownloading = false;
    this.abortController = null;
  }
  static {
    this.RELEASE_API_URLS = [
      "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest",
      "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"
    ];
  }
  async downloadBinary(targetDir, onProgress) {
    if (this.isDownloading) {
      return { success: false, error: "Download already in progress" };
    }
    this.isDownloading = true;
    this.abortController = new AbortController();
    try {
      onProgress(5, "Fetching release info...");
      const downloadUrl = await this.getDownloadUrl();
      if (!downloadUrl) {
        throw new Error("Could not find compatible windows binary in latest release");
      }
      onProgress(10, "Downloading binary...");
      const zipPath = path.join(electron.app.getPath("temp"), "llama-server.zip");
      await this.downloadFile(downloadUrl, zipPath, (p) => {
        const overall = 10 + p * 0.7;
        onProgress(overall, `Downloading: ${Math.round(p)}%`);
      });
      const binDir = path.join(targetDir, "bin");
      onProgress(80, "Extracting...");
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(binDir, true);
      fs.unlinkSync(zipPath);
      const binaryName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
      const found = this.findFileRecursive(binDir, binaryName);
      if (found) {
        onProgress(100, "Done");
        this.isDownloading = false;
        return { success: true, path: found };
      } else {
        console.log("Extracted contents:", fs.readdirSync(targetDir));
        throw new Error(`${binaryName} not found in extracted files`);
      }
    } catch (error) {
      this.isDownloading = false;
      return { success: false, error: error.message };
    }
  }
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isDownloading = false;
  }
  findFileRecursive(dir, filename) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const found = this.findFileRecursive(fullPath, filename);
        if (found) return found;
      }
    }
    return null;
  }
  async getDownloadUrl() {
    const patterns = [
      "bin-win-avx2-x64.zip",
      "bin-win-avx-x64.zip",
      "bin-win-cpu-x64.zip",
      "bin-win-x64.zip",
      "win-x64.zip"
    ];
    for (const url of BinaryDownloader.RELEASE_API_URLS) {
      try {
        const response = await axios.get(url);
        const assets = response.data.assets;
        for (const pattern of patterns) {
          const asset = assets.find((a) => a.name.toLowerCase().includes(pattern));
          if (asset) {
            console.log("Found binary asset:", asset.name, "from", url);
            return asset.browser_download_url;
          }
        }
        console.log("No matching binary in", url, "— assets:", assets.map((a) => a.name));
      } catch (e) {
        console.warn("Failed to fetch from:", url, e);
      }
    }
    return null;
  }
  async downloadFile(url, destPath, onProgress) {
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      signal: this.abortController?.signal
    });
    const totalLength = parseInt(response.headers["content-length"], 10);
    let downloaded = 0;
    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      const progress = downloaded / totalLength * 100;
      onProgress(progress);
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      this.abortController?.signal.addEventListener("abort", () => {
        writer.destroy();
        reject(new Error("Cancelled"));
      });
    });
  }
}
class TerminalManager {
  constructor(window) {
    this.sessions = /* @__PURE__ */ new Map();
    this.window = null;
    this.window = window;
  }
  setWindow(window) {
    this.window = window;
  }
  createSession(id, shell, cwd) {
    try {
      const isWin = os.platform() === "win32";
      let shellCmd = shell || "powershell.exe";
      let shellArgs = [];
      if (isWin) {
        const shellLower = (shell || "").toLowerCase();
        if (shellLower.includes("powershell")) {
          shellArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass"];
        } else if (shellLower.includes("cmd")) {
          shellArgs = [];
        } else if (shellLower.includes("bash") || shellLower.includes("git")) {
          shellArgs = ["--login", "-i"];
        } else if (shellLower.includes("wsl")) {
          shellArgs = [];
        } else if (!shell) {
          shellArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass"];
        }
      } else {
        shellCmd = shell || "/bin/bash";
      }
      const ptyProcess = pty__namespace.spawn(shellCmd, shellArgs, {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: cwd || process.cwd(),
        env: process.env
      });
      ptyProcess.onData((data) => {
        this.window?.webContents.send("terminal:data", { id, data });
      });
      ptyProcess.onExit(({ exitCode }) => {
        this.window?.webContents.send("terminal:exit", { id, code: exitCode });
        this.sessions.delete(id);
      });
      this.sessions.set(id, {
        id,
        pty: ptyProcess
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  write(id, data) {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.write(data);
    }
  }
  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (session && cols > 0 && rows > 0) {
      try {
        session.pty.resize(cols, rows);
      } catch (e) {
      }
    }
  }
  kill(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.kill();
      this.sessions.delete(id);
    }
  }
  detectShells() {
    const shells = [];
    if (os.platform() === "win32") {
      shells.push("powershell.exe");
      shells.push("cmd.exe");
      const gitBashPaths = [
        "C:\\Git\\bin\\bash.exe",
        "C:\\Git\\usr\\bin\\bash.exe",
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
        process.env.LOCALAPPDATA + "\\Programs\\Git\\bin\\bash.exe",
        process.env.PROGRAMFILES + "\\Git\\bin\\bash.exe"
      ].filter(Boolean);
      for (const gitBash of gitBashPaths) {
        if (fs.existsSync(gitBash)) {
          shells.push(gitBash);
          break;
        }
      }
      if (fs.existsSync("C:\\Windows\\System32\\wsl.exe")) {
        shells.push("wsl.exe");
      }
    } else {
      shells.push("/bin/bash");
      shells.push("/bin/zsh");
    }
    return shells;
  }
}
const execAsync$2 = util.promisify(child_process.exec);
class DiagnosticService {
  async lintCodebase(projectPath) {
    if (!projectPath || !fs.existsSync(projectPath)) {
      return { success: false, error: "Project path not found" };
    }
    try {
      const { stdout, stderr } = await execAsync$2("npx tsc --noEmit --pretty false", {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024
        // 10MB buffer
      }).catch((err) => {
        return { stdout: err.stdout, stderr: err.stderr };
      });
      const problems = this.parseTscOutput(stdout, projectPath);
      return { success: true, problems };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  parseTscOutput(output, projectPath) {
    const problems = [];
    const lines = output.split("\n");
    const regex = /^(.+)\((\d+),(\d+)\): error TS\d+: (.*)$/;
    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const [_, relativePath, lineStr, charStr, message] = match;
        problems.push({
          path: path.join(projectPath, relativePath),
          line: parseInt(lineStr),
          character: parseInt(charStr),
          message: message.trim(),
          severity: 1
          // Error
        });
      }
    }
    return problems;
  }
}
class VectorStore {
  constructor() {
    this.documents = [];
    const userDataPath = electron.app.getPath("userData");
    this.storagePath = path.join(userDataPath, "rag-store.json");
    this.initPromise = this.load();
  }
  async add(doc) {
    await this.initPromise;
    this.documents = this.documents.filter((d) => d.id !== doc.id);
    this.documents.push(doc);
  }
  async search(queryEmbedding, limit = 5) {
    await this.initPromise;
    const results = this.documents.map((doc) => ({
      ...doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding)
    }));
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
  async save() {
    await this.initPromise;
    try {
      await promises.writeFile(this.storagePath, JSON.stringify(this.documents), "utf-8");
    } catch (err) {
      console.error("Failed to save Vector Store:", err);
    }
  }
  async load() {
    if (fs.existsSync(this.storagePath)) {
      try {
        const data = await promises.readFile(this.storagePath, "utf-8");
        this.documents = JSON.parse(data);
      } catch (err) {
        console.error("Failed to load Vector Store:", err);
        this.documents = [];
      }
    }
  }
  async clear() {
    await this.initPromise;
    this.documents = [];
    await this.save();
  }
  async getStats() {
    await this.initPromise;
    return {
      count: this.documents.length,
      path: this.storagePath
    };
  }
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
class CodebaseIndexer {
  constructor(store, aiService2) {
    this.isIndexing = false;
    this.stopRequested = false;
    this.vectorStore = store;
    this.aiService = aiService2;
  }
  async index(rootPath, onProgress) {
    if (this.isIndexing) return;
    this.isIndexing = true;
    this.stopRequested = false;
    try {
      const files = this.scanDir(rootPath);
      let processed = 0;
      for (const file of files) {
        if (this.stopRequested) break;
        if (onProgress) onProgress(processed, files.length, path.relative(rootPath, file));
        try {
          const content = fs.readFileSync(file, "utf-8");
          const hash = crypto.createHash("md5").update(content).digest("hex");
          const relativePath = path.relative(rootPath, file);
          const chunks = this.chunkText(content, 500, 100);
          for (let i = 0; i < chunks.length; i++) {
            if (this.stopRequested) break;
            const chunkId = `${relativePath}#chunk-${i}`;
            const embedding = await this.aiService.getEmbedding(chunks[i]);
            if (embedding && embedding.length > 0) {
              await this.vectorStore.add({
                id: chunkId,
                content: chunks[i],
                embedding,
                metadata: { path: relativePath, chunkIndex: i },
                hash
              });
            }
          }
        } catch (e) {
          console.error("Failed to index file:", file, e);
        }
        processed++;
        if (processed % 10 === 0) {
          await this.vectorStore.save();
        }
      }
      await this.vectorStore.save();
      if (onProgress) onProgress(processed, files.length, "Done");
    } finally {
      this.isIndexing = false;
    }
  }
  stop() {
    if (this.isIndexing) {
      this.stopRequested = true;
    }
  }
  scanDir(dir) {
    let results = [];
    try {
      const list = fs.readdirSync(dir);
      const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", "out", ".next", "coverage", ".gemini", ".vscode", ".idea", "__pycache__"];
      const ALLOWED_EXTS = [".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".md", ".py", ".rs", ".go", ".cpp", ".hpp", ".h", ".c", ".java", ".xml", ".yaml", ".yml", ".sh"];
      for (const file of list) {
        const path$1 = path.join(dir, file);
        const stat = fs.statSync(path$1);
        if (stat && stat.isDirectory()) {
          if (!IGNORE_DIRS.includes(file)) {
            results = results.concat(this.scanDir(path$1));
          }
        } else {
          const ext = path.extname(file).toLowerCase();
          if (ALLOWED_EXTS.includes(ext) && stat.size < 500 * 1024) {
            results.push(path$1);
          }
        }
      }
    } catch (e) {
      console.error("Scan error:", e);
    }
    return results;
  }
  chunkText(text, chunkSize, overlap) {
    const words = text.split(/\s+/);
    const chunks = [];
    let i = 0;
    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(" ");
      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
      i += chunkSize - overlap;
    }
    return chunks;
  }
}
class LSPService {
  constructor() {
    this.clients = /* @__PURE__ */ new Map();
    this.failedServers = /* @__PURE__ */ new Set();
    this.mainWindow = null;
  }
  setWindow(window) {
    this.mainWindow = window;
  }
  async startLanguageServer(language, rootPath) {
    const key = `${language}:${rootPath}`;
    if (this.clients.has(key)) {
      return true;
    }
    if (this.failedServers.has(key)) {
      return false;
    }
    const serverCommand = this.getLanguageServerCommand(language, rootPath);
    if (!serverCommand) {
      console.log(`[LSP] No language server available for ${language}`);
      this.failedServers.add(key);
      return false;
    }
    try {
      const { command, args, options } = serverCommand;
      console.log(`[LSP] Starting ${language} server: ${command} ${args.join(" ")}`);
      const process2 = child_process.spawn(command, args, {
        ...options,
        cwd: rootPath,
        stdio: ["pipe", "pipe", "pipe"]
      });
      const connection = node.createMessageConnection(
        new node.StreamMessageReader(process2.stdout),
        new node.StreamMessageWriter(process2.stdin)
      );
      connection.listen();
      process2.stderr?.on("data", (data) => {
        console.log(`[LSP ${language}]`, data.toString());
      });
      process2.on("exit", (code) => {
        console.log(`[LSP ${language}] Server exited with code ${code}`);
        this.clients.delete(key);
      });
      const initResult = await connection.sendRequest("initialize", {
        processId: process2.pid,
        rootUri: `file://${rootPath}`,
        capabilities: {
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: true,
              willSaveWaitUntil: true,
              didSave: true
            },
            completion: {
              dynamicRegistration: false,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ["markdown", "plaintext"],
                deprecatedSupport: true,
                preselectSupport: true
              }
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ["markdown", "plaintext"]
            },
            definition: {
              dynamicRegistration: false,
              linkSupport: true
            },
            documentSymbol: {
              dynamicRegistration: false,
              hierarchicalDocumentSymbolSupport: true
            },
            codeAction: {
              dynamicRegistration: false,
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: ["", "quickfix", "refactor", "source"]
                }
              }
            },
            formatting: {
              dynamicRegistration: false
            },
            rename: {
              dynamicRegistration: false,
              prepareSupport: true
            }
          },
          workspace: {
            applyEdit: true,
            workspaceEdit: {
              documentChanges: true
            }
          }
        },
        workspaceFolders: [{
          uri: `file://${rootPath}`,
          name: path__namespace.basename(rootPath)
        }]
      });
      await connection.sendNotification("initialized", {});
      const client = {
        process: process2,
        connection,
        rootPath,
        language,
        capabilities: initResult?.capabilities || {}
      };
      this.clients.set(key, client);
      console.log(`[LSP] ${language} server initialized successfully`);
      return true;
    } catch (error) {
      console.error(`[LSP] Failed to start ${language} server:`, error);
      this.failedServers.add(key);
      return false;
    }
  }
  getLanguageServerCommand(language, rootPath) {
    const isWin = process.platform === "win32";
    const nodeModulesPath = path__namespace.join(rootPath, "node_modules");
    switch (language) {
      case "typescript":
      case "javascript":
        const tlsPath = path__namespace.join(nodeModulesPath, ".bin", isWin ? "typescript-language-server.cmd" : "typescript-language-server");
        if (fs__namespace.existsSync(tlsPath)) {
          return {
            command: tlsPath,
            args: ["--stdio"],
            options: { shell: isWin }
          };
        }
        return {
          command: isWin ? "npx.cmd" : "npx",
          args: ["-y", "typescript-language-server", "--stdio"],
          options: { shell: isWin }
        };
      case "python":
        return {
          command: isWin ? "pylsp.cmd" : "pylsp",
          args: [],
          options: { shell: isWin }
        };
      case "rust":
        return {
          command: "rust-analyzer",
          args: [],
          options: {}
        };
      case "go":
        return {
          command: "gopls",
          args: [],
          options: {}
        };
      default:
        return null;
    }
  }
  async getDefinition(filePath, line, character) {
    const language = this.detectLanguage(filePath);
    const rootPath = this.findProjectRoot(filePath, language);
    if (!rootPath) return null;
    const key = `${language}:${rootPath}`;
    let client = this.clients.get(key);
    if (!client) {
      const started = await this.startLanguageServer(language, rootPath);
      if (!started) return null;
      client = this.clients.get(key);
    }
    if (!client) return null;
    try {
      const content = fs__namespace.readFileSync(filePath, "utf-8");
      await client.connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: `file://${filePath}`,
          languageId: language,
          version: 1,
          text: content
        }
      });
      const result = await client.connection.sendRequest("textDocument/definition", {
        textDocument: {
          uri: `file://${filePath}`
        },
        position: {
          line,
          character
        }
      });
      return result;
    } catch (error) {
      console.error("[LSP] Definition request failed:", error);
      return null;
    }
  }
  async getHover(filePath, line, character) {
    const language = this.detectLanguage(filePath);
    const rootPath = this.findProjectRoot(filePath, language);
    if (!rootPath) return null;
    const key = `${language}:${rootPath}`;
    let client = this.clients.get(key);
    if (!client) {
      const started = await this.startLanguageServer(language, rootPath);
      if (!started) return null;
      client = this.clients.get(key);
    }
    if (!client) return null;
    try {
      const content = fs__namespace.readFileSync(filePath, "utf-8");
      await client.connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: `file://${filePath}`,
          languageId: language,
          version: 1,
          text: content
        }
      });
      const result = await client.connection.sendRequest("textDocument/hover", {
        textDocument: {
          uri: `file://${filePath}`
        },
        position: {
          line,
          character
        }
      });
      return result;
    } catch (error) {
      console.error("[LSP] Hover request failed:", error);
      return null;
    }
  }
  async getDocumentSymbols(filePath) {
    const language = this.detectLanguage(filePath);
    const rootPath = this.findProjectRoot(filePath, language);
    if (!rootPath) return null;
    const key = `${language}:${rootPath}`;
    let client = this.clients.get(key);
    if (!client) {
      const started = await this.startLanguageServer(language, rootPath);
      if (!started) return null;
      client = this.clients.get(key);
    }
    if (!client) return null;
    try {
      const content = fs__namespace.readFileSync(filePath, "utf-8");
      await client.connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: `file://${filePath}`,
          languageId: language,
          version: 1,
          text: content
        }
      });
      const result = await client.connection.sendRequest("textDocument/documentSymbol", {
        textDocument: {
          uri: `file://${filePath}`
        }
      });
      return result;
    } catch (error) {
      console.error("[LSP] Document symbols request failed:", error);
      return null;
    }
  }
  detectLanguage(filePath) {
    const ext = path__namespace.extname(filePath).toLowerCase();
    switch (ext) {
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".js":
      case ".jsx":
        return "javascript";
      case ".py":
        return "python";
      case ".rs":
        return "rust";
      case ".go":
        return "go";
      default:
        return "plaintext";
    }
  }
  findProjectRoot(filePath, language) {
    let currentDir = path__namespace.dirname(filePath);
    while (currentDir !== path__namespace.dirname(currentDir)) {
      switch (language) {
        case "typescript":
        case "javascript":
          if (fs__namespace.existsSync(path__namespace.join(currentDir, "tsconfig.json")) || fs__namespace.existsSync(path__namespace.join(currentDir, "package.json"))) {
            return currentDir;
          }
          break;
        case "python":
          if (fs__namespace.existsSync(path__namespace.join(currentDir, "requirements.txt")) || fs__namespace.existsSync(path__namespace.join(currentDir, "setup.py")) || fs__namespace.existsSync(path__namespace.join(currentDir, "pyproject.toml"))) {
            return currentDir;
          }
          break;
        case "rust":
          if (fs__namespace.existsSync(path__namespace.join(currentDir, "Cargo.toml"))) {
            return currentDir;
          }
          break;
        case "go":
          if (fs__namespace.existsSync(path__namespace.join(currentDir, "go.mod"))) {
            return currentDir;
          }
          break;
      }
      if (fs__namespace.existsSync(path__namespace.join(currentDir, ".git"))) {
        return currentDir;
      }
      currentDir = path__namespace.dirname(currentDir);
    }
    return path__namespace.dirname(filePath);
  }
  stopAll() {
    for (const [key, client] of this.clients) {
      try {
        client.connection.sendNotification("exit");
        client.process.kill();
      } catch (error) {
        console.error(`[LSP] Error stopping ${key}:`, error);
      }
    }
    this.clients.clear();
  }
}
const execAsync$1 = util.promisify(child_process.exec);
class GitService {
  async execGit(args, cwd) {
    try {
      return await execAsync$1(`git ${args}`, { cwd });
    } catch (error) {
      return { stdout: error.stdout || "", stderr: error.stderr || "" };
    }
  }
  async isGitRepository(projectPath) {
    if (!projectPath || !fs.existsSync(projectPath)) return false;
    try {
      await execAsync$1("git rev-parse --git-dir", { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  async getStatus(projectPath) {
    if (!await this.isGitRepository(projectPath)) return [];
    const { stdout } = await this.execGit("status --porcelain -z", projectPath);
    const statuses = [];
    const entries = stdout.split("\0");
    let i = 0;
    while (i < entries.length) {
      const entry = entries[i];
      if (!entry || entry.length < 3) {
        i++;
        continue;
      }
      const x = entry[0];
      const y = entry[1];
      const filePath = entry.substring(3);
      let status;
      if (x === "?" && y === "?") {
        status = "untracked";
      } else if (x === "A" || x !== " " && y === "A") {
        status = "added";
      } else if (x === "D" || y === "D") {
        status = "deleted";
      } else if (x === "M" || x === "R" || x === "C") {
        status = "staged";
      } else if (y === "M") {
        status = "modified";
      } else if (x === "R" || y === "R") {
        status = "renamed";
        i++;
        const originalPath = entries[i];
        statuses.push({ path: filePath, status, originalPath });
        i++;
        continue;
      } else if (x === "U" || y === "U" || x === "A" && y === "A" || x === "D" && y === "D") {
        status = "conflict";
      } else {
        status = "modified";
      }
      statuses.push({ path: path.join(projectPath, filePath), status });
      i++;
    }
    return statuses;
  }
  async getBranches(projectPath) {
    if (!await this.isGitRepository(projectPath)) return [];
    const { stdout } = await this.execGit('branch -a --format="%(refname:short)|%(HEAD)"', projectPath);
    return stdout.split("\n").filter((line) => line.trim()).map((line) => {
      const [name, head] = line.split("|");
      return {
        name: name.trim(),
        current: head === "*",
        remote: name.startsWith("remotes/") ? name.replace("remotes/", "") : void 0
      };
    });
  }
  async getCurrentBranch(projectPath) {
    if (!await this.isGitRepository(projectPath)) return null;
    try {
      const { stdout } = await execAsync$1("git branch --show-current", { cwd: projectPath });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  async getCommits(projectPath, count = 20) {
    if (!await this.isGitRepository(projectPath)) return [];
    const format = "%H|%h|%s|%an|%ai|%ar";
    const { stdout } = await this.execGit(
      `log -${count} --format="${format}"`,
      projectPath
    );
    return stdout.split("\n").filter((line) => line.trim()).map((line) => {
      const [hash, shortHash, message, author, date, relativeDate] = line.split("|");
      return {
        hash,
        shortHash,
        message,
        author,
        date,
        relativeDate
      };
    });
  }
  async getDiff(projectPath, filePath) {
    if (!await this.isGitRepository(projectPath)) return "";
    const args = filePath ? `diff -- "${filePath}"` : "diff";
    const { stdout } = await this.execGit(args, projectPath);
    return stdout;
  }
  async getStagedDiff(projectPath, filePath) {
    if (!await this.isGitRepository(projectPath)) return "";
    const args = filePath ? `diff --staged -- "${filePath}"` : "diff --staged";
    const { stdout } = await this.execGit(args, projectPath);
    return stdout;
  }
  async stageFile(projectPath, filePath) {
    if (!await this.isGitRepository(projectPath)) return false;
    try {
      const relativePath = filePath.replace(projectPath, "").replace(/^[\\/]/, "");
      await execAsync$1(`git add "${relativePath}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  async unstageFile(projectPath, filePath) {
    if (!await this.isGitRepository(projectPath)) return false;
    try {
      const relativePath = filePath.replace(projectPath, "").replace(/^[\\/]/, "");
      await execAsync$1(`git reset HEAD "${relativePath}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  async discardChanges(projectPath, filePath) {
    if (!await this.isGitRepository(projectPath)) return false;
    try {
      const relativePath = filePath.replace(projectPath, "").replace(/^[\\/]/, "");
      await execAsync$1(`git checkout -- "${relativePath}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  async commit(projectPath, message) {
    if (!await this.isGitRepository(projectPath)) {
      return { success: false, error: "Not a git repository" };
    }
    try {
      const escapedMessage = message.replace(/"/g, '\\"');
      await execAsync$1(`git commit -m "${escapedMessage}"`, { cwd: projectPath });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  }
  async createBranch(projectPath, branchName, checkout = false) {
    if (!await this.isGitRepository(projectPath)) return false;
    try {
      const args = checkout ? `-b "${branchName}"` : `"${branchName}"`;
      await execAsync$1(`git branch ${args}`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  async checkoutBranch(projectPath, branchName) {
    if (!await this.isGitRepository(projectPath)) return false;
    try {
      await execAsync$1(`git checkout "${branchName}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  async pull(projectPath) {
    if (!await this.isGitRepository(projectPath)) {
      return { success: false, error: "Not a git repository" };
    }
    try {
      const { stdout, stderr } = await execAsync$1("git pull", { cwd: projectPath });
      return { success: true, output: stdout || stderr };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  }
  async push(projectPath) {
    if (!await this.isGitRepository(projectPath)) {
      return { success: false, error: "Not a git repository" };
    }
    try {
      const { stdout, stderr } = await execAsync$1("git push", { cwd: projectPath });
      return { success: true, output: stdout || stderr };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  }
  async getRemoteUrl(projectPath) {
    if (!await this.isGitRepository(projectPath)) return null;
    try {
      const { stdout } = await execAsync$1("git remote get-url origin", { cwd: projectPath });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
const execAsync = util.promisify(child_process.exec);
class FormatService {
  async hasPrettier(projectPath) {
    const prettierPath = path.join(projectPath, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier");
    return fs.existsSync(prettierPath);
  }
  async hasESLint(projectPath) {
    const eslintPath = path.join(projectPath, "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
    return fs.existsSync(eslintPath);
  }
  async formatDocument(filePath, projectPath) {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExts = [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss", ".less", ".html", ".yaml", ".yml"];
    if (!supportedExts.includes(ext)) {
      return { success: false, error: "File type not supported for formatting" };
    }
    if (await this.hasPrettier(projectPath)) {
      return this.formatWithPrettier(filePath, projectPath);
    }
    try {
      return this.formatWithNpxPrettier(filePath);
    } catch (error) {
      return { success: false, error: "Prettier not available. Install it with: npm install --save-dev prettier" };
    }
  }
  async formatWithPrettier(filePath, projectPath) {
    const isWin = process.platform === "win32";
    const prettierCmd = path.join(projectPath, "node_modules", ".bin", isWin ? "prettier.cmd" : "prettier");
    try {
      const { stdout, stderr } = await execAsync(
        `"${prettierCmd}" --write "${filePath}"`,
        { cwd: projectPath }
      );
      const fs2 = await import("fs");
      const content = fs2.readFileSync(filePath, "utf-8");
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: error.stderr || error.message || "Prettier formatting failed"
      };
    }
  }
  async formatWithNpxPrettier(filePath) {
    const isWin = process.platform === "win32";
    try {
      const { stdout, stderr } = await execAsync(
        `${isWin ? "npx.cmd" : "npx"} -y prettier --write "${filePath}"`,
        { cwd: process.cwd() }
      );
      const fs2 = await import("fs");
      const content = fs2.readFileSync(filePath, "utf-8");
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: error.stderr || error.message || "Prettier formatting failed"
      };
    }
  }
  async checkFormatting(filePath, projectPath) {
    if (!await this.hasPrettier(projectPath)) {
      return { formatted: true };
    }
    const isWin = process.platform === "win32";
    const prettierCmd = path.join(projectPath, "node_modules", ".bin", isWin ? "prettier.cmd" : "prettier");
    try {
      await execAsync(
        `"${prettierCmd}" --check "${filePath}"`,
        { cwd: projectPath }
      );
      return { formatted: true };
    } catch (error) {
      if (error.code === 1) {
        return { formatted: false };
      }
      return { formatted: true, error: error.stderr || error.message };
    }
  }
  async getPrettierConfig(projectPath) {
    const configFiles = [
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yml",
      ".prettierrc.yaml",
      ".prettierrc.js",
      "prettier.config.js",
      ".prettierrc.mjs",
      "prettier.config.mjs"
    ];
    const fs$1 = await import("fs");
    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      if (fs.existsSync(configPath)) {
        try {
          if (configFile.endsWith(".js") || configFile.endsWith(".mjs")) {
            return { exists: true, path: configPath };
          } else {
            const content = fs$1.readFileSync(configPath, "utf-8");
            if (configFile.endsWith(".json")) {
              return JSON.parse(content);
            } else if (configFile.endsWith(".yml") || configFile.endsWith(".yaml")) {
              const config = {};
              content.split("\n").forEach((line) => {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                  const value = match[2].trim();
                  config[match[1]] = value === "true" ? true : value === "false" ? false : !isNaN(Number(value)) ? Number(value) : value;
                }
              });
              return config;
            }
          }
        } catch (e) {
        }
      }
    }
    const packageJsonPath = path.join(projectPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = fs$1.readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.prettier) {
          return pkg.prettier;
        }
      } catch (e) {
      }
    }
    return null;
  }
}
class DebugService extends events.EventEmitter {
  constructor() {
    super(...arguments);
    this.sessions = /* @__PURE__ */ new Map();
    this.sessionIdCounter = 0;
  }
  async startNodeDebug(scriptPath, cwd, args = []) {
    const sessionId = `debug-${++this.sessionIdCounter}`;
    return new Promise((resolve) => {
      try {
        const proc = child_process.spawn("node", ["--inspect-brk=9229", scriptPath, ...args], {
          cwd,
          stdio: ["pipe", "pipe", "pipe"]
        });
        const session = {
          id: sessionId,
          process: proc,
          type: "node",
          breakpoints: /* @__PURE__ */ new Map(),
          isPaused: true
        };
        this.sessions.set(sessionId, session);
        proc.on("error", (error) => {
          console.error(`[Debug] Node process error:`, error);
          this.emit("output", { sessionId, output: `Error: ${error.message}
`, type: "stderr" });
          this.sessions.delete(sessionId);
          resolve({ sessionId: "", error: error.message });
        });
        proc.stdout?.on("data", (data) => {
          this.emit("output", { sessionId, output: data.toString(), type: "stdout" });
        });
        proc.stderr?.on("data", (data) => {
          this.emit("output", { sessionId, output: data.toString(), type: "stderr" });
        });
        proc.on("exit", (code) => {
          this.emit("terminated", { sessionId, code });
          this.sessions.delete(sessionId);
        });
        setTimeout(() => {
          if (this.sessions.has(sessionId)) {
            this.emit("started", { sessionId, type: "node" });
            resolve({ sessionId });
          }
        }, 100);
      } catch (error) {
        console.error(`[Debug] Failed to start Node debug:`, error);
        resolve({ sessionId: "", error: error.message });
      }
    });
  }
  async startPythonDebug(scriptPath, cwd, args = []) {
    const sessionId = `debug-${++this.sessionIdCounter}`;
    return new Promise((resolve) => {
      try {
        const proc = child_process.spawn("python", ["-m", "debugpy", "--listen", "5678", "--wait-for-client", scriptPath, ...args], {
          cwd,
          stdio: ["pipe", "pipe", "pipe"]
        });
        const session = {
          id: sessionId,
          process: proc,
          type: "python",
          breakpoints: /* @__PURE__ */ new Map(),
          isPaused: true
        };
        this.sessions.set(sessionId, session);
        proc.on("error", (error) => {
          console.error(`[Debug] Python process error:`, error);
          this.emit("output", { sessionId, output: `Error: ${error.message}
`, type: "stderr" });
          this.sessions.delete(sessionId);
          resolve({ sessionId: "", error: error.message });
        });
        process.stdout?.on("data", (data) => {
          this.emit("output", { sessionId, output: data.toString(), type: "stdout" });
        });
        process.stderr?.on("data", (data) => {
          this.emit("output", { sessionId, output: data.toString(), type: "stderr" });
        });
        process.on("exit", (code) => {
          this.emit("terminated", { sessionId, code });
          this.sessions.delete(sessionId);
        });
        setTimeout(() => {
          if (this.sessions.has(sessionId)) {
            this.emit("started", { sessionId, type: "python" });
            resolve({ sessionId });
          }
        }, 100);
      } catch (error) {
        console.error(`[Debug] Failed to start Python debug:`, error);
        resolve({ sessionId: "", error: error.message });
      }
    });
  }
  stopDebug(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.process.kill("SIGTERM");
    this.sessions.delete(sessionId);
    this.emit("stopped", { sessionId });
    return true;
  }
  pauseDebug(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.type === "node") {
      session.process.kill("SIGUSR1");
      session.isPaused = true;
      this.emit("paused", { sessionId });
      return true;
    }
    return false;
  }
  continueDebug(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.isPaused = false;
    this.emit("continued", { sessionId });
    return true;
  }
  stepOver(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isPaused) return false;
    this.emit("stepOver", { sessionId });
    return true;
  }
  stepInto(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isPaused) return false;
    this.emit("stepInto", { sessionId });
    return true;
  }
  stepOut(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isPaused) return false;
    this.emit("stepOut", { sessionId });
    return true;
  }
  setBreakpoint(sessionId, file, line, condition) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const breakpoints = session.breakpoints.get(file) || [];
    if (!breakpoints.includes(line)) {
      breakpoints.push(line);
      session.breakpoints.set(file, breakpoints);
    }
    this.emit("breakpointSet", { sessionId, file, line, condition });
    return true;
  }
  removeBreakpoint(sessionId, file, line) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const breakpoints = session.breakpoints.get(file) || [];
    const index = breakpoints.indexOf(line);
    if (index > -1) {
      breakpoints.splice(index, 1);
      session.breakpoints.set(file, breakpoints);
    }
    this.emit("breakpointRemoved", { sessionId, file, line });
    return true;
  }
  getBreakpoints(sessionId, file) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    const breakpoints = [];
    if (file) {
      const lines = session.breakpoints.get(file) || [];
      lines.forEach((line) => breakpoints.push({ file, line }));
    } else {
      session.breakpoints.forEach((lines, filePath) => {
        lines.forEach((line) => breakpoints.push({ file: filePath, line }));
      });
    }
    return breakpoints;
  }
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }
  isSessionActive(sessionId) {
    return this.sessions.has(sessionId);
  }
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return { type: session.type, isPaused: session.isPaused };
  }
}
let mainWindow = null;
let fileService;
let aiService;
let modelDownloader;
let diagnosticService;
let lspService;
let gitService;
let formatService;
let debugService;
const SETTINGS_PATH = path.join(electron.app.getPath("userData"), "settings.json");
function getDefaultSettings() {
  return {
    modelPath: "",
    serverBinaryPath: "",
    contextSize: 4096,
    maxTokens: 512,
    temperature: 0.7,
    threads: 4,
    theme: "dark",
    modelsDirectory: path.join(electron.app.getPath("userData"), "models"),
    setupComplete: false,
    lastProjectPath: null,
    lastOpenFiles: [],
    lastActiveFile: null,
    chatMessages: [],
    standaloneChatMessages: []
  };
}
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, "utf-8");
      return { ...getDefaultSettings(), ...JSON.parse(data) };
    }
  } catch (e) {
  }
  return getDefaultSettings();
}
function saveSettings(settings) {
  try {
    const dir = path.join(electron.app.getPath("userData"));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (e) {
  }
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0a0f",
    icon: electron.nativeImage.createFromPath(path.join(__dirname, "../../assets/images/1.png")),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  mainWindow.maximize();
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximizeChanged", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximizeChanged", false);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function setupIPC() {
  loadSettings();
  fileService = new FileService();
  aiService = new AIService();
  modelDownloader = new ModelDownloader();
  diagnosticService = new DiagnosticService();
  lspService = new LSPService();
  gitService = new GitService();
  formatService = new FormatService();
  debugService = new DebugService();
  electron.ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  electron.ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  electron.ipcMain.handle("window:close", () => mainWindow?.close());
  electron.ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);
  electron.ipcMain.handle("settings:get", () => loadSettings());
  electron.ipcMain.handle("settings:save", (_event, newSettings) => {
    const current = loadSettings();
    const merged = { ...current, ...newSettings };
    saveSettings(merged);
    return merged;
  });
  electron.ipcMain.handle("fs:selectFile", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Executables", extensions: ["exe", "bin", ""] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle("fs:openFolder", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folderPath = result.filePaths[0];
    const tree = await fileService.getFileTree(folderPath);
    return { path: folderPath, tree };
  });
  electron.ipcMain.handle("fs:readFile", async (_event, filePath) => {
    return fileService.readFile(filePath);
  });
  electron.ipcMain.handle("fs:writeFile", async (_event, filePath, content) => {
    return fileService.writeFile(filePath, content);
  });
  electron.ipcMain.handle("fs:patchFile", async (_event, filePath, patches) => {
    return fileService.patchFile(filePath, patches);
  });
  electron.ipcMain.handle("fs:lintCodebase", async (_event, projectPath) => {
    return diagnosticService.lintCodebase(projectPath);
  });
  electron.ipcMain.handle("fs:getFileTree", async (_event, folderPath) => {
    return fileService.getFileTree(folderPath);
  });
  electron.ipcMain.handle("fs:expandDirectory", async (_event, dirPath) => {
    return fileService.expandDirectory(dirPath);
  });
  electron.ipcMain.handle("fs:createFile", async (_event, filePath) => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, "", "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("fs:createFolder", async (_event, folderPath) => {
    try {
      fs.mkdirSync(folderPath, { recursive: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("fs:rename", async (_event, oldPath, newPath) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("fs:delete", async (_event, filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("fs:searchInFiles", async (_event, dir, query) => {
    const results = [];
    const MAX_RESULTS = 100;
    function searchDir(dirPath) {
      if (results.length >= MAX_RESULTS) return;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= MAX_RESULTS) return;
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const skip = ["node_modules", ".git", "dist", "build", "out", ".next", "__pycache__", ".cache"];
            if (!skip.includes(entry.name)) searchDir(fullPath);
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            const textExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".cpp", ".c", ".h", ".css", ".html", ".json", ".md", ".yaml", ".yml", ".xml", ".sh", ".toml", ".txt", ".sql", ".rb", ".php", ".swift", ".kt"];
            if (!textExts.includes(ext)) continue;
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= MAX_RESULTS) return;
                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                  results.push({ file: fullPath, line: i + 1, content: lines[i].trim().substring(0, 200) });
                }
              }
            } catch (err) {
            }
          }
        }
      } catch (err) {
      }
    }
    searchDir(dir);
    return results;
  });
  electron.ipcMain.handle("ai:startServer", async (_event) => {
    const s = loadSettings();
    if (!s.serverBinaryPath || !s.modelPath) {
      return { success: false, error: "Server binary or model path not configured" };
    }
    return aiService.start({
      binaryPath: s.serverBinaryPath,
      modelPath: s.modelPath,
      contextSize: s.contextSize,
      threads: s.threads,
      port: 8765
    });
  });
  electron.ipcMain.handle("ai:stopServer", async () => {
    return aiService.stop();
  });
  electron.ipcMain.handle("ai:getStatus", () => {
    return aiService.getStatus();
  });
  electron.ipcMain.handle("ai:chat", async (_event, messages, options) => {
    const s = loadSettings();
    return aiService.chat(messages, {
      maxTokens: options?.maxTokens || s.maxTokens,
      temperature: options?.temperature || s.temperature
    });
  });
  electron.ipcMain.handle("ai:chatStream", async (event, messages, options) => {
    const s = loadSettings();
    return aiService.chatStream(
      messages,
      {
        maxTokens: options?.maxTokens || s.maxTokens,
        temperature: options?.temperature || s.temperature
      },
      (chunk) => {
        mainWindow?.webContents.send("ai:streamChunk", chunk);
      },
      () => {
        mainWindow?.webContents.send("ai:streamEnd");
      }
    );
  });
  electron.ipcMain.handle("ai:stopStream", () => {
    aiService.abortStream();
  });
  electron.ipcMain.handle("ai:analyzeCodebase", async (_event, projectPath) => {
    try {
      let countFiles = function(dir, depth = 0) {
        if (depth > 4) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              if (!["node_modules", ".git", "dist", "build", "__pycache__"].includes(entry.name)) {
                countFiles(path.join(dir, entry.name), depth + 1);
              }
            } else {
              const ext = path.extname(entry.name).toLowerCase() || "(no ext)";
              extCounts[ext] = (extCounts[ext] || 0) + 1;
            }
          }
        } catch {
        }
      };
      const summary = [];
      summary.push(`Project: ${path.basename(projectPath)}`);
      const pkgPath = path.join(projectPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          summary.push(`
Package: ${pkg.name || "unknown"} v${pkg.version || "0.0.0"}`);
          if (pkg.description) summary.push(`Description: ${pkg.description}`);
          if (pkg.dependencies) summary.push(`Dependencies: ${Object.keys(pkg.dependencies).join(", ")}`);
          if (pkg.devDependencies) summary.push(`Dev Dependencies: ${Object.keys(pkg.devDependencies).join(", ")}`);
        } catch {
        }
      }
      for (const name of ["README.md", "readme.md", "README.txt", "README"]) {
        const readmePath = path.join(projectPath, name);
        if (fs.existsSync(readmePath)) {
          try {
            const readme = fs.readFileSync(readmePath, "utf-8").substring(0, 1e3);
            summary.push(`
README (first 1000 chars):
${readme}`);
          } catch {
          }
          break;
        }
      }
      try {
        const entries = fs.readdirSync(projectPath, { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules").map((e) => e.name);
        const files = entries.filter((e) => e.isFile()).map((e) => e.name);
        summary.push(`
Top-level directories: ${dirs.join(", ")}`);
        summary.push(`Top-level files: ${files.join(", ")}`);
      } catch {
      }
      const extCounts = {};
      countFiles(projectPath);
      const topExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      summary.push(`
File types: ${topExts.map(([ext, count]) => `${ext}: ${count}`).join(", ")}`);
      return { success: true, summary: summary.join("\n") };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("models:getAvailable", async () => {
    return modelDownloader.getAvailableModels();
  });
  electron.ipcMain.handle("models:selectDirectory", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select Model Download Directory"
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle("models:download", async (_event, modelId, targetDir) => {
    const result = await modelDownloader.downloadModel(
      modelId,
      targetDir,
      (progress, speed) => {
        mainWindow?.webContents.send("models:downloadProgress", { modelId, progress, speed });
      }
    );
    if (result.success) {
      mainWindow?.webContents.send("models:downloadComplete", { modelId, path: result.path });
    } else {
      mainWindow?.webContents.send("models:downloadError", { modelId, error: result.error });
    }
    return result;
  });
  electron.ipcMain.handle("models:cancelDownload", () => {
    modelDownloader.cancelDownload();
  });
  electron.ipcMain.handle("models:scanLocal", async (_event, directory) => {
    return modelDownloader.scanLocalModels(directory);
  });
  electron.ipcMain.handle("models:delete", async (_event, filePath) => {
    if (aiService.getStatus().running && aiService.currentModelPath === filePath) {
      await aiService.stop();
    }
    return modelDownloader.deleteModel(filePath);
  });
  const binaryDownloader = new BinaryDownloader();
  electron.ipcMain.handle("binary:download", async (_event, targetDir) => {
    return binaryDownloader.downloadBinary(
      targetDir,
      (progress, status) => {
        mainWindow?.webContents.send("binary:progress", { progress, status });
      }
    );
  });
  electron.ipcMain.handle("binary:cancel", () => {
    binaryDownloader.cancel();
  });
  electron.ipcMain.handle("shell:openExternal", (_event, url) => {
    electron.shell.openExternal(url);
  });
  const terminalManager = new TerminalManager(mainWindow);
  electron.ipcMain.handle("terminal:create", async (_event, id, shell2, cwd) => {
    terminalManager.setWindow(mainWindow);
    return terminalManager.createSession(id, shell2, cwd);
  });
  electron.ipcMain.handle("terminal:write", (_event, id, data) => {
    terminalManager.write(id, data);
  });
  electron.ipcMain.handle("terminal:resize", (_event, id, cols, rows) => {
    terminalManager.resize(id, cols, rows);
  });
  electron.ipcMain.handle("terminal:kill", (_event, id) => {
    terminalManager.kill(id);
  });
  electron.ipcMain.handle("terminal:getShells", async () => {
    return terminalManager.detectShells();
  });
  electron.ipcMain.handle("terminal:execute", async (_event, command, cwd) => {
    return new Promise((resolve) => {
      child_process.exec(command, { cwd: cwd || electron.app.getPath("home"), maxBuffer: 1024 * 1024 * 5, shell: "powershell.exe" }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || (error?.message || ""),
          code: error?.code || 0
        });
      });
    });
  });
  const vectorStore = new VectorStore();
  const indexer = new CodebaseIndexer(vectorStore, aiService);
  electron.ipcMain.handle("rag:index", async (_event, projectPath) => {
    indexer.index(projectPath, (current, total, file) => {
      mainWindow?.webContents.send("rag:progress", { current, total, file });
    });
    return { success: true };
  });
  electron.ipcMain.handle("rag:status", () => {
    return vectorStore.getStats();
  });
  electron.ipcMain.handle("rag:retrieve", async (_event, query) => {
    const embedding = await aiService.getEmbedding(query);
    if (!embedding) return [];
    const results = await vectorStore.search(embedding, 5);
    return results;
  });
  electron.ipcMain.handle("lsp:definition", async (_event, filePath, line, character) => {
    return lspService.getDefinition(filePath, line, character);
  });
  electron.ipcMain.handle("lsp:hover", async (_event, filePath, line, character) => {
    return lspService.getHover(filePath, line, character);
  });
  electron.ipcMain.handle("lsp:documentSymbols", async (_event, filePath) => {
    return lspService.getDocumentSymbols(filePath);
  });
  electron.ipcMain.handle("git:isRepo", async (_event, projectPath) => {
    return gitService.isGitRepository(projectPath);
  });
  electron.ipcMain.handle("git:status", async (_event, projectPath) => {
    return gitService.getStatus(projectPath);
  });
  electron.ipcMain.handle("git:branches", async (_event, projectPath) => {
    return gitService.getBranches(projectPath);
  });
  electron.ipcMain.handle("git:currentBranch", async (_event, projectPath) => {
    return gitService.getCurrentBranch(projectPath);
  });
  electron.ipcMain.handle("git:commits", async (_event, projectPath, count) => {
    return gitService.getCommits(projectPath, count);
  });
  electron.ipcMain.handle("git:diff", async (_event, projectPath, filePath) => {
    return gitService.getDiff(projectPath, filePath);
  });
  electron.ipcMain.handle("git:stage", async (_event, projectPath, filePath) => {
    return gitService.stageFile(projectPath, filePath);
  });
  electron.ipcMain.handle("git:unstage", async (_event, projectPath, filePath) => {
    return gitService.unstageFile(projectPath, filePath);
  });
  electron.ipcMain.handle("git:discard", async (_event, projectPath, filePath) => {
    return gitService.discardChanges(projectPath, filePath);
  });
  electron.ipcMain.handle("git:commit", async (_event, projectPath, message) => {
    return gitService.commit(projectPath, message);
  });
  electron.ipcMain.handle("git:createBranch", async (_event, projectPath, branchName, checkout) => {
    return gitService.createBranch(projectPath, branchName, checkout);
  });
  electron.ipcMain.handle("git:checkout", async (_event, projectPath, branchName) => {
    return gitService.checkoutBranch(projectPath, branchName);
  });
  electron.ipcMain.handle("git:pull", async (_event, projectPath) => {
    return gitService.pull(projectPath);
  });
  electron.ipcMain.handle("git:push", async (_event, projectPath) => {
    return gitService.push(projectPath);
  });
  electron.ipcMain.handle("format:document", async (_event, filePath, projectPath) => {
    return formatService.formatDocument(filePath, projectPath);
  });
  electron.ipcMain.handle("format:check", async (_event, filePath, projectPath) => {
    return formatService.checkFormatting(filePath, projectPath);
  });
  electron.ipcMain.handle("format:config", async (_event, projectPath) => {
    return formatService.getPrettierConfig(projectPath);
  });
  electron.ipcMain.handle("debug:startNode", async (_event, scriptPath, cwd, args) => {
    return debugService.startNodeDebug(scriptPath, cwd, args);
  });
  electron.ipcMain.handle("debug:startPython", async (_event, scriptPath, cwd, args) => {
    return debugService.startPythonDebug(scriptPath, cwd, args);
  });
  electron.ipcMain.handle("debug:stop", async (_event, sessionId) => {
    return debugService.stopDebug(sessionId);
  });
  electron.ipcMain.handle("debug:pause", async (_event, sessionId) => {
    return debugService.pauseDebug(sessionId);
  });
  electron.ipcMain.handle("debug:continue", async (_event, sessionId) => {
    return debugService.continueDebug(sessionId);
  });
  electron.ipcMain.handle("debug:stepOver", async (_event, sessionId) => {
    return debugService.stepOver(sessionId);
  });
  electron.ipcMain.handle("debug:stepInto", async (_event, sessionId) => {
    return debugService.stepInto(sessionId);
  });
  electron.ipcMain.handle("debug:stepOut", async (_event, sessionId) => {
    return debugService.stepOut(sessionId);
  });
  electron.ipcMain.handle("debug:setBreakpoint", async (_event, sessionId, file, line, condition) => {
    return debugService.setBreakpoint(sessionId, file, line, condition);
  });
  electron.ipcMain.handle("debug:removeBreakpoint", async (_event, sessionId, file, line) => {
    return debugService.removeBreakpoint(sessionId, file, line);
  });
  electron.ipcMain.handle("debug:getBreakpoints", async (_event, sessionId, file) => {
    return debugService.getBreakpoints(sessionId, file);
  });
  electron.ipcMain.handle("debug:getActiveSessions", async () => {
    return debugService.getActiveSessions();
  });
  electron.ipcMain.handle("debug:getSessionInfo", async (_event, sessionId) => {
    return debugService.getSessionInfo(sessionId);
  });
  debugService.on("output", (data) => {
    mainWindow?.webContents.send("debug:output", data);
  });
  debugService.on("started", (data) => {
    mainWindow?.webContents.send("debug:started", data);
  });
  debugService.on("stopped", (data) => {
    mainWindow?.webContents.send("debug:stopped", data);
  });
  debugService.on("terminated", (data) => {
    mainWindow?.webContents.send("debug:terminated", data);
  });
  debugService.on("paused", (data) => {
    mainWindow?.webContents.send("debug:paused", data);
  });
  debugService.on("continued", (data) => {
    mainWindow?.webContents.send("debug:continued", data);
  });
}
electron.app.whenReady().then(() => {
  electron.app.commandLine.appendSwitch("log-level", "3");
  electron.app.commandLine.appendSwitch("ignore-certificate-errors");
  setupIPC();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  aiService?.stop();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
