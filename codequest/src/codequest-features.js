/**
 * CODEQUEST INNOVATIVE FEATURES SUITE
 * -------------------------------------------------------------
 * 1. Live Interactive Code Runner & Sandbox (JS Console + HTML/Web Preview)
 * 2. Personal Developer Code Vault & 1-Click Markdown Cheatsheet Exporter
 * 3. Solution Diff Comparator (Before-After Visual Code Diff)
 * 4. Quest Gamification & Achievement Badges
 * -------------------------------------------------------------
 */

(function () {
    "use strict";

    // -------------------------------------------------------------
    // 1. PERSONAL CODE VAULT MANAGER
    // -------------------------------------------------------------
    const CodeVault = {
        STORAGE_KEY: "cq_code_vault_items",

        getAll() {
            try {
                const data = localStorage.getItem(this.STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                console.error("Vault read error:", e);
                return [];
            }
        },

        save(item) {
            try {
                const items = this.getAll();
                // Check if already saved (same code and question)
                const exists = items.some(x => x.code.trim() === item.code.trim() && x.questionId === item.questionId);
                if (exists) {
                    return { success: false, alreadySaved: true };
                }
                const newItem = {
                    id: "vault_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
                    code: item.code,
                    lang: item.lang || "javascript",
                    title: item.title || "Code Snippet",
                    questionId: item.questionId || "",
                    savedAt: new Date().toISOString()
                };
                items.unshift(newItem);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
                this.updateCountBadge();
                return { success: true, item: newItem };
            } catch (e) {
                console.error("Vault save error:", e);
                return { success: false, error: e.message };
            }
        },

        remove(id) {
            try {
                let items = this.getAll();
                items = items.filter(x => x.id !== id);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
                this.updateCountBadge();
                return true;
            } catch (e) {
                return false;
            }
        },

        clear() {
            localStorage.removeItem(this.STORAGE_KEY);
            this.updateCountBadge();
        },

        count() {
            return this.getAll().length;
        },

        updateCountBadge() {
            const count = this.count();
            document.querySelectorAll(".vault-badge-count, #vaultCountBadge").forEach(el => {
                el.textContent = count;
                el.style.display = count > 0 ? "inline-flex" : "none";
            });
        },

        exportMarkdown() {
            const items = this.getAll();
            if (!items.length) {
                alert("Your Code Vault is empty. Save snippets from questions or answers first!");
                return;
            }

            const now = new Date();
            let md = `# 📚 CodeQuest Personal Developer Cheatsheet & Code Vault\n`;
            md += `> Exported from CodeQuest on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}\n`;
            md += `> Total Saved Solutions: ${items.length}\n\n`;
            md += `---\n\n`;

            items.forEach((item, index) => {
                const dateStr = new Date(item.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                md += `### ${index + 1}. ${item.title || "Code Snippet"}\n`;
                md += `- **Language:** \`${item.lang}\`\n`;
                md += `- **Saved on:** ${dateStr}\n`;
                if (item.questionId) {
                    md += `- **Source Question:** [View on CodeQuest](messageDetails.html?questionId=${item.questionId})\n`;
                }
                md += `\n\`\`\`${item.lang}\n${item.code}\n\`\`\`\n\n`;
                md += `---\n\n`;
            });

            // Trigger file download
            const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `codequest-vault-cheatsheet-${now.toISOString().slice(0, 10)}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    // -------------------------------------------------------------
    // 2. LIVE INTERACTIVE CODE SANDBOX RUNNER
    // -------------------------------------------------------------
    // 2. LIVE INTERACTIVE CODE SANDBOX RUNNER (ESM & NODE.JS SHIMS)
    // -------------------------------------------------------------
    function transformModuleCode(sourceCode) {
        let code = sourceCode;

        // 0. Transform import.meta (Node.js & Vite ESM)
        code = code.replace(/\bimport\.meta\.url\b/g, '"file:///app/server.js"');
        code = code.replace(/\bimport\.meta\.env\b/g, '({ DEV: true, PROD: false, MODE: "development" })');
        code = code.replace(/\bimport\.meta\b/g, '({ url: "file:///app/server.js", env: { DEV: true } })');

        // 1. Strip TypeScript type imports: import type { ... } from '...';
        code = code.replace(/^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?/gm, '/* type import */');

        // 2. Transform bare import: import "something" or import 'something';
        code = code.replace(/^\s*import\s+['"]([^'"]+)['"]\s*;?/gm, (match, spec) => {
            return `await __importModule(${JSON.stringify(spec)});`;
        });

        // 3. Transform namespace import: import * as name from "spec";
        code = code.replace(/^\s*import\s+\*\s+as\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm, (match, name, spec) => {
            return `const ${name} = await __importModule(${JSON.stringify(spec)});`;
        });

        // 4. Transform combined import: import defaultName, { a, b } from "spec";
        code = code.replace(/^\s*import\s+([a-zA-Z0-9_$]+)\s*,\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]\s*;?/gm, (match, defName, named, spec) => {
            return `const __mod_${defName} = await __importModule(${JSON.stringify(spec)});\nconst ${defName} = __mod_${defName}?.default ?? __mod_${defName};\nconst { ${named} } = __mod_${defName};`;
        });

        // 5. Transform named destructuring: import { a, b as c } from "spec";
        code = code.replace(/^\s*import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]\s*;?/gm, (match, named, spec) => {
            return `const { ${named} } = await __importModule(${JSON.stringify(spec)});`;
        });

        // 6. Transform default import: import defaultName from "spec";
        code = code.replace(/^\s*import\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm, (match, defName, spec) => {
            return `const __mod_${defName} = await __importModule(${JSON.stringify(spec)});\nconst ${defName} = __mod_${defName}?.default ?? __mod_${defName};`;
        });

        // 7. Transform export default
        code = code.replace(/^\s*export\s+default\s+function\s+([a-zA-Z0-9_$]+)/gm, 'function $1');
        code = code.replace(/^\s*export\s+default\s+class\s+([a-zA-Z0-9_$]+)/gm, 'class $1');
        code = code.replace(/^\s*export\s+default\s+/gm, 'const __defaultExport = ');

        // 8. Transform named exports: export const/let/var/function/class
        code = code.replace(/^\s*export\s+(const|let|var|function|class)\s+/gm, '$1 ');
        code = code.replace(/^\s*export\s*\{[^}]*\}\s*;?/gm, '/* export statement */');

        // 9. Safety fallback: If ANY static import remains (e.g. multi-line or non-standard syntax), convert to dynamic comment
        code = code.replace(/^\s*import\s+[\s\S]*?['"][^'"]+['"]\s*;?/gm, (match) => {
            return `/* ${match.trim()} */`;
        });

        return code;
    }

    function __getNodeMock(specifier) {
        const clean = String(specifier || "").trim().toLowerCase();

        if (clean === "express") {
            const exp = function () {
                const app = {
                    use: (...args) => app,
                    set: (k, v) => app,
                    get: (r, h) => app,
                    post: (r, h) => app,
                    put: (r, h) => app,
                    delete: (r, h) => app,
                    listen: (port, cb) => {
                        console.log(`🚀 [Server] Express running on http://localhost:${port || 3000}`);
                        if (typeof cb === "function") cb();
                        return app;
                    }
                };
                return app;
            };
            exp.json = () => (req, res, next) => next && next();
            exp.urlencoded = () => (req, res, next) => next && next();
            exp.static = () => (req, res, next) => next && next();
            exp.Router = () => exp();
            return { default: exp, ...exp };
        }

        if (clean === "path") {
            const p = {
                join: (...parts) => parts.join("/").replace(/\/+/g, "/"),
                resolve: (...parts) => parts.join("/").replace(/\/+/g, "/"),
                dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
                basename: (p) => p.split("/").pop() || ""
            };
            return { default: p, ...p };
        }

        if (clean === "fs") {
            const fs = {
                readFileSync: (p) => `// [Mock content for ${p}]`,
                writeFileSync: (p, d) => console.log(`📝 [fs Mock] Saved file ${p}`),
                existsSync: () => true,
                promises: {
                    readFile: async () => "",
                    writeFile: async () => {}
                }
            };
            return { default: fs, ...fs };
        }

        if (clean === "dotenv") {
            const d = { config: () => ({ parsed: { PORT: 3000, NODE_ENV: "development" } }) };
            return { default: d, ...d };
        }

        if (clean === "cors") {
            const c = () => (req, res, next) => next && next();
            return { default: c };
        }

        if (clean === "url") {
            const u = {
                fileURLToPath: (url) => typeof url === "string" ? url.replace(/^file:\/\//, "") : "/index.js"
            };
            return { default: u, ...u };
        }

        if (clean === "mongoose") {
            const m = {
                connect: async (uri) => {
                    console.log(`✅ [MongoDB Mock] Connected successfully to ${uri || "mongodb://127.0.0.1:27017"}`);
                    return m;
                },
                Schema: class { constructor(def) { this.def = def; } },
                model: (name) => class {
                    constructor(d) { Object.assign(this, d); }
                    async save() { console.log(`💾 [MongoDB Mock] Saved ${name} document`); return this; }
                    static async find() { return []; }
                    static async findOne() { return null; }
                    static async findById() { return null; }
                    static async countDocuments() { return 0; }
                }
            };
            return { default: m, ...m };
        }

        if (clean === "axios" && window.axios) {
            return { default: window.axios, ...window.axios };
        }

        return { default: {} };
    }

    async function __importModule(specifier) {
        const cleanSpec = String(specifier || "").trim();

        // 1. Built-in Node.js mocks
        const nodeModules = ["express", "path", "fs", "dotenv", "cors", "mongoose", "url", "http", "https", "crypto"];
        if (nodeModules.includes(cleanSpec.toLowerCase())) {
            return __getNodeMock(cleanSpec);
        }

        // 2. Relative or local project files (e.g., "./codequest/src/server.js")
        if (cleanSpec.startsWith(".") || cleanSpec.startsWith("/")) {
            console.log(`📦 [Module Loaded] ${cleanSpec}`);
            return { default: {}, __esModule: true };
        }

        // 3. External NPM package via ESM CDN
        try {
            const mod = await import(`https://esm.sh/${cleanSpec}`);
            return mod;
        } catch (e) {
            console.warn(`⚠️ [Module Note] Could not fetch "${cleanSpec}" (${e.message}). Using fallback mock.`);
            return { default: {}, ...window };
        }
    }

    function __requireShim(specifier) {
        const clean = String(specifier || "").trim().toLowerCase();
        const mock = __getNodeMock(clean);
        return mock.default || mock;
    }

    function decodeHtmlEntities(str) {
        if (!str) return "";
        let prev = "";
        let curr = String(str);
        let maxPasses = 3;
        while (curr !== prev && maxPasses-- > 0) {
            prev = curr;
            curr = curr
                .replace(/&gt;/g, ">")
                .replace(/&lt;/g, "<")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/&nbsp;/g, " ")
                .replace(/\u00a0/g, " ");
        }
        return curr;
    }

    async function executeJavaScript(code, logCallback) {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const originalInfo = console.info;

        const captured = [];

        function formatArg(arg) {
            if (arg === null) return "null";
            if (arg === undefined) return "undefined";
            if (typeof arg === "object") {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }

        function intercept(type, args) {
            const text = Array.from(args).map(formatArg).join(" ");
            captured.push({ type, text, time: new Date().toLocaleTimeString() });
            logCallback({ type, text, time: new Date().toLocaleTimeString() });
        }

        console.log = function (...args) { intercept("log", args); originalLog.apply(console, args); };
        console.warn = function (...args) { intercept("warn", args); originalWarn.apply(console, args); };
        console.error = function (...args) { intercept("error", args); originalError.apply(console, args); };
        console.info = function (...args) { intercept("info", args); originalInfo.apply(console, args); };

        const startTime = performance.now();
        let result = undefined;
        let executionError = null;

        try {
            // First decode HTML entities (e.g. &gt; => >, &amp; => &, preventing SyntaxError on arrow functions () => {})
            const cleanCode = decodeHtmlEntities(code);

            // Transform modern ES Module imports/exports into runnable async statements
            const transformed = transformModuleCode(cleanCode);

            // Safe async evaluation supporting top-level await, modules, and arrow functions
            const runner = new Function("__importModule", "__requireShim", `
                return (async () => {
                    "use strict";
                    const require = __requireShim;
                    const process = { env: { PORT: 3000, NODE_ENV: "development" }, cwd: () => "/" };
                    const __dirname = "/";
                    const __filename = "/index.js";
                    const module = { exports: {} };
                    const exports = module.exports;

                    try {
                        ${transformed}
                    } catch(err) {
                        throw err;
                    }
                })();
            `);

            result = await runner(__importModule, __requireShim);
            if (result !== undefined) {
                intercept("return", ["Return value =>", result]);
            }
        } catch (err) {
            executionError = err;
            intercept("error", [err.name + ": " + err.message]);
        } finally {
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
            console.info = originalInfo;
        }

        const duration = (performance.now() - startTime).toFixed(2);
        return {
            logs: captured,
            duration,
            error: executionError,
            result
        };
    }

    // -------------------------------------------------------------
    // 3. CODE SNIPPET ENHANCER (Run, Vault, Copy & Drawer UI)
    // -------------------------------------------------------------
    function enhanceCodeSnippetBlocks() {
        const wrappers = document.querySelectorAll(".code-snippet-wrapper:not([data-enhanced='true'])");
        wrappers.forEach(wrapper => {
            wrapper.setAttribute("data-enhanced", "true");

            const pre = wrapper.querySelector("pre");
            const codeEl = wrapper.querySelector("code, .code-snippet-block");
            const rawCode = (codeEl ? codeEl.innerText || codeEl.textContent : "").trim();
            const langTag = wrapper.querySelector(".code-lang-tag");
            let lang = (langTag ? langTag.innerText || langTag.textContent : "code").trim().toLowerCase().replace(/[^a-z0-9_+#-]/g, "");

            // Auto-detect or correct language if generic, missing, or mislabeled as javascript
            if (!lang || lang === "code" || lang === "javascript") {
                const detected = detectCodeSnippet(rawCode);
                if (detected && detected.lang && (detected.lang !== "javascript" || !lang || lang === "code")) {
                    lang = detected.lang;
                    if (langTag) {
                        langTag.innerHTML = `<i class="fa-solid fa-code me-1"></i>${escapeHtml(lang)}`;
                    }
                }
            }

            // Header actions
            let actionsWrap = wrapper.querySelector(".code-snippet-actions");
            if (!actionsWrap) {
                actionsWrap = document.createElement("div");
                actionsWrap.className = "code-snippet-actions";
                const header = wrapper.querySelector(".code-snippet-header");
                if (header) {
                    const existingCopy = header.querySelector(".btn-copy-code");
                    if (existingCopy) existingCopy.remove();
                    header.appendChild(actionsWrap);
                }
            }

            // Snippet is runnable in any programming language (Python, C, C++, Java, JS, Go, Rust, PHP, etc.)
            const nonRunnableLangs = ["markdown", "md", "text", "txt", "diff", "plaintext"];
            const isRunnable = rawCode.length > 0 && !nonRunnableLangs.includes(lang);

            actionsWrap.innerHTML = `
                ${isRunnable ? `
                    <button class="btn-snippet-action btn-run-code" type="button" title="Execute this code in live interactive sandbox">
                        <i class="fa-solid fa-play me-1"></i><span>Run</span>
                    </button>
                ` : ""}
                <button class="btn-snippet-action btn-vault-code" type="button" title="Save snippet to My Code Vault">
                    <i class="fa-regular fa-bookmark me-1"></i><span>Save</span>
                </button>
                <button class="btn-snippet-action btn-copy-code" type="button" title="Copy code snippet">
                    <i class="fa-regular fa-copy me-1"></i><span>Copy</span>
                </button>
            `;

            // Append live interactive sandbox runner drawer
            const drawer = document.createElement("div");
            drawer.className = "code-runner-drawer";
            drawer.style.display = "none";
            drawer.innerHTML = `
                <div class="runner-header">
                    <div class="runner-tabs">
                        <button type="button" class="runner-tab active" data-tab="console">
                            <i class="fa-solid fa-terminal me-1"></i>Console (<span class="log-count">0</span>)
                        </button>
                        <button type="button" class="runner-tab" data-tab="preview">
                            <i class="fa-solid fa-window-maximize me-1"></i>Live Preview
                        </button>
                    </div>
                    <div class="runner-actions">
                        <span class="runner-exec-time me-2" style="font-size: 0.75rem; color: #94a3b8; display: none;"></span>
                        <button type="button" class="btn-runner-action btn-runner-clear" title="Clear console"><i class="fa-solid fa-eraser me-1"></i>Clear</button>
                        <button type="button" class="btn-runner-action btn-runner-close" title="Close runner"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="runner-body">
                    <div class="runner-pane runner-pane-console">
                        <div class="runner-logs-list">
                            <div class="runner-empty-hint"><i class="fa-solid fa-play me-1 text-success"></i>Click <b>Run</b> to execute and view stdout/errors.</div>
                        </div>
                    </div>
                    <div class="runner-pane runner-pane-preview" style="display: none;">
                        <iframe class="runner-preview-frame" sandbox="allow-scripts" title="Interactive Preview"></iframe>
                    </div>
                </div>
            `;
            wrapper.appendChild(drawer);

            // Tab switching
            const tabs = drawer.querySelectorAll(".runner-tab");
            const consolePane = drawer.querySelector(".runner-pane-console");
            const previewPane = drawer.querySelector(".runner-pane-preview");

            tabs.forEach(tab => {
                tab.addEventListener("click", () => {
                    tabs.forEach(t => t.classList.remove("active"));
                    tab.classList.add("active");
                    const target = tab.dataset.tab;
                    if (target === "console") {
                        consolePane.style.display = "block";
                        previewPane.style.display = "none";
                    } else {
                        consolePane.style.display = "none";
                        previewPane.style.display = "block";
                        renderLivePreview(rawCode, previewPane.querySelector("iframe"), lang);
                    }
                });
            });

            // Clear logs
            const clearBtn = drawer.querySelector(".btn-runner-clear");
            if (clearBtn) {
                clearBtn.addEventListener("click", () => {
                    const logsList = drawer.querySelector(".runner-logs-list");
                    logsList.innerHTML = `<div class="runner-empty-hint"><i class="fa-solid fa-circle-check me-1 text-muted"></i>Console cleared.</div>`;
                    drawer.querySelector(".log-count").textContent = "0";
                });
            }

            // Close drawer
            const closeBtn = drawer.querySelector(".btn-runner-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", () => {
                    drawer.style.display = "none";
                });
            }

            // Run Button Click (Universal multi-language runner: Python, C, C++, Java, JS, Rust, Go, PHP, etc.)
            const runBtn = wrapper.querySelector(".btn-run-code");
            if (runBtn) {
                runBtn.addEventListener("click", () => {
                    drawer.style.display = "block";
                    drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });

                    const logsList = drawer.querySelector(".runner-logs-list");
                    const logCountEl = drawer.querySelector(".log-count");
                    const execTimeEl = drawer.querySelector(".runner-exec-time");

                    logsList.innerHTML = "";
                    let count = 0;

                    const codeTarget = wrapper.querySelector("pre code, pre.code-snippet-block, code");
                    const activeCode = decodeHtmlEntities(codeTarget ? (codeTarget.textContent || codeTarget.innerText || "") : rawCode).trim();

                    // If HTML/DOM snippet, default to preview
                    if (lang === "html" || (activeCode.trim().startsWith("<") && (activeCode.includes("</div>") || activeCode.includes("</button>") || activeCode.includes("<html>")))) {
                        const previewTab = drawer.querySelector(".runner-tab[data-tab='preview']");
                        if (previewTab) previewTab.click();
                        return;
                    }

                    // Ensure Console tab is selected
                    const consoleTab = drawer.querySelector(".runner-tab[data-tab='console']");
                    if (consoleTab) consoleTab.click();

                    // Dynamically detect language if unmarked or mislabeled
                    let runLang = lang;
                    const dynamicCheck = detectCodeSnippet(activeCode);
                    if (dynamicCheck && dynamicCheck.lang && (!runLang || runLang === "code" || runLang === "javascript")) {
                        runLang = dynamicCheck.lang;
                    }

                    runBtn.classList.add("is-running");
                    runBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;
                    const displayLangName = (runLang && runLang !== "code") ? runLang.toUpperCase() : "PROGRAM";
                    logsList.innerHTML = `<div class="runner-empty-hint"><i class="fa-solid fa-spinner fa-spin me-1 text-primary"></i>Executing ${escapeHtml(displayLangName)} code...</div>`;

                    setTimeout(async () => {
                        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        try {
                            const response = await fetch("/api/execute-code", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ code: activeCode, lang: runLang })
                            });

                            if (!response.ok) {
                                throw new Error(`Server returned HTTP ${response.status}`);
                            }

                            const result = await response.json();
                            logsList.innerHTML = "";

                            if (result.output && result.output.trim()) {
                                const outLines = result.output.trim().split("\n");
                                outLines.forEach(line => {
                                    count++;
                                    const item = document.createElement("div");
                                    item.className = "log-line log-log";
                                    item.innerHTML = `
                                        <span class="log-time">${timeStr}</span>
                                        <span class="log-badge log-badge-info">STDOUT</span>
                                        <span class="log-text">${escapeHtml(line)}</span>
                                    `;
                                    logsList.appendChild(item);
                                });
                            }

                            if (result.error && result.error.trim()) {
                                const errLines = result.error.trim().split("\n");
                                errLines.forEach(line => {
                                    count++;
                                    const item = document.createElement("div");
                                    item.className = "log-line log-error";
                                    item.innerHTML = `
                                        <span class="log-time">${timeStr}</span>
                                        <span class="log-badge log-badge-error">STDERR</span>
                                        <span class="log-text">${escapeHtml(line)}</span>
                                    `;
                                    logsList.appendChild(item);
                                });
                            }

                            if ((!result.output || !result.output.trim()) && (!result.error || !result.error.trim())) {
                                count++;
                                const item = document.createElement("div");
                                item.className = "log-line log-success";
                                item.innerHTML = `
                                    <span class="log-time">${timeStr}</span>
                                    <span class="log-badge log-badge-success">DONE</span>
                                    <span class="log-text">Program executed cleanly (${result.duration || "0.02"}s).</span>
                                `;
                                logsList.appendChild(item);
                            }

                            logCountEl.textContent = count;
                            if (execTimeEl) {
                                execTimeEl.textContent = `⏱️ ${result.duration ? result.duration + 's' : 'done'}`;
                                execTimeEl.style.display = "inline";
                            }
                        } catch (fetchErr) {
                            // If backend execute endpoint fails and snippet is JS/web, fallback to browser executeJavaScript
                            if (["javascript", "js", "web", "code"].includes(lang) || !lang) {
                                logsList.innerHTML = "";
                                count = 0;
                                const execution = await executeJavaScript(activeCode, (log) => {
                                    count++;
                                    const item = document.createElement("div");
                                    item.className = `log-line log-${log.type}`;
                                    item.innerHTML = `
                                        <span class="log-time">${log.time}</span>
                                        <span class="log-badge log-badge-${log.type}">${log.type.toUpperCase()}</span>
                                        <span class="log-text">${escapeHtml(log.text)}</span>
                                    `;
                                    logsList.appendChild(item);
                                });

                                if (execution.logs.length === 0) {
                                    logsList.innerHTML = `
                                        <div class="log-line log-success">
                                            <span class="log-badge log-badge-success">DONE</span>
                                            <span class="log-text">Code executed cleanly without console logs (${execution.duration}ms).</span>
                                        </div>
                                    `;
                                }

                                logCountEl.textContent = count;
                                if (execTimeEl) {
                                    execTimeEl.textContent = `⏱️ ${execution.duration}ms`;
                                    execTimeEl.style.display = "inline";
                                }
                            } else {
                                logsList.innerHTML = `
                                    <div class="log-line log-error">
                                        <span class="log-badge log-badge-error">ERROR</span>
                                        <span class="log-text">Execution failed: ${escapeHtml(fetchErr.message)}</span>
                                    </div>
                                `;
                                logCountEl.textContent = "1";
                            }
                        } finally {
                            runBtn.classList.remove("is-running");
                            runBtn.innerHTML = `<i class="fa-solid fa-rotate-right me-1"></i>Run`;
                        }
                    }, 50);
                });
            }


            // Save to Vault Click
            const vaultBtn = wrapper.querySelector(".btn-vault-code");
            if (vaultBtn) {
                vaultBtn.addEventListener("click", () => {
                    const questionTitleEl = document.getElementById("selected-message");
                    const title = questionTitleEl ? questionTitleEl.innerText.slice(0, 70) : document.title;
                    const urlParams = new URLSearchParams(window.location.search);
                    const qId = urlParams.get("questionId") || "";

                    const codeTarget = wrapper.querySelector("pre code, pre.code-snippet-block, code");
                    const activeCode = decodeHtmlEntities(codeTarget ? (codeTarget.textContent || codeTarget.innerText || "") : rawCode).trim();

                    const res = CodeVault.save({
                        code: activeCode,
                        lang: lang || "javascript",
                        title: title || "Code Snippet",
                        questionId: qId
                    });

                    const icon = vaultBtn.querySelector("i");
                    const text = vaultBtn.querySelector("span");

                    if (res.alreadySaved) {
                        if (text) text.textContent = "Saved";
                        if (icon) icon.className = "fa-solid fa-bookmark me-1 text-warning";
                        showAppToast("This snippet is already in your Code Vault! 🔖");
                    } else if (res.success) {
                        if (text) text.textContent = "Saved!";
                        if (icon) icon.className = "fa-solid fa-bookmark me-1 text-success";
                        showAppToast("Saved to your Code Vault! Check the Vault menu anytime. 🔖");
                        setTimeout(() => {
                            if (text) text.textContent = "Save";
                            if (icon) icon.className = "fa-regular fa-bookmark me-1";
                        }, 2500);
                    }
                });
            }
        });
    }

    function renderLivePreview(code, iframe, lang) {
        if (!iframe) return;
        const cleanCode = decodeHtmlEntities(code);
        let htmlContent = "";
        if (cleanCode.trim().startsWith("<!DOCTYPE") || cleanCode.trim().startsWith("<html")) {
            htmlContent = cleanCode;
        } else {
            htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; margin: 0; color: #1e293b; }
                        button { padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #0284c7; color: white; cursor: pointer; font-weight: 600; }
                        button:hover { background: #0369a1; }
                    </style>
                </head>
                <body>
                    ${lang === "html" || cleanCode.includes("<") ? cleanCode : `<div id="app"></div><script>${cleanCode}<\/script>`}
                </body>
                </html>
            `;
        }
        iframe.srcdoc = htmlContent;
    }

    // -------------------------------------------------------------
    // 4. SOLUTION DIFF COMPARATOR MODAL
    // -------------------------------------------------------------
    function computeSimpleDiff(originalText, modifiedText) {
        const origLines = (originalText || "").trim().split("\n");
        const modLines = (modifiedText || "").trim().split("\n");
        const diff = [];

        const max = Math.max(origLines.length, modLines.length);
        for (let i = 0; i < max; i++) {
            const o = origLines[i];
            const m = modLines[i];

            if (o === m) {
                diff.push({ type: "same", line: o, origNum: i + 1, modNum: i + 1 });
            } else {
                if (o !== undefined) {
                    diff.push({ type: "removed", line: o, origNum: i + 1, modNum: null });
                }
                if (m !== undefined) {
                    diff.push({ type: "added", line: m, origNum: null, modNum: i + 1 });
                }
            }
        }
        return diff;
    }

    function setupDiffComparatorModal() {
        if (document.getElementById("codeDiffModal")) return;

        const modalEl = document.createElement("div");
        modalEl.id = "codeDiffModal";
        modalEl.className = "modal fade";
        modalEl.tabIndex = -1;
        modalEl.setAttribute("aria-hidden", "true");
        modalEl.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content cq-modal">
                    <div class="modal-header border-0 pb-0">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary-subtle text-primary fw-bold px-2 py-1"><i class="fa-solid fa-code-compare me-1"></i> Solution Comparator</span>
                            <h5 class="modal-title fw-bold mb-0">Code Fix Diff</h5>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body pt-3">
                        <div class="diff-legend mb-3 d-flex align-items-center gap-3">
                            <span class="diff-legend-item"><span class="legend-color legend-red"></span> Red = Original Question Code</span>
                            <span class="diff-legend-item"><span class="legend-color legend-green"></span> Green = Answer Solution (Fixed)</span>
                        </div>
                        <div class="diff-container" id="diffViewerContainer">
                            <div class="text-center py-4 text-muted">Loading diff comparison...</div>
                        </div>
                    </div>
                    <div class="modal-footer border-0 pt-0">
                        <button type="button" class="btn btn-secondary rounded-pill px-4" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary rounded-pill px-4" id="btnCopyFixedCode">
                            <i class="fa-regular fa-copy me-1"></i> Copy Fixed Code
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
    }

    function openDiffModal(questionCode, answerCode) {
        setupDiffComparatorModal();
        const modalEl = document.getElementById("codeDiffModal");
        if (!modalEl || !window.bootstrap) return;

        const container = document.getElementById("diffViewerContainer");
        const diff = computeSimpleDiff(questionCode, answerCode);

        let html = `<div class="diff-table-wrapper"><table class="diff-table"><tbody>`;
        diff.forEach(item => {
            const rowClass = item.type === "added" ? "diff-row-added" : item.type === "removed" ? "diff-row-removed" : "diff-row-same";
            const prefix = item.type === "added" ? "+" : item.type === "removed" ? "-" : " ";
            html += `
                <tr class="${rowClass}">
                    <td class="diff-num">${item.origNum !== null ? item.origNum : ""}</td>
                    <td class="diff-num">${item.modNum !== null ? item.modNum : ""}</td>
                    <td class="diff-sign">${prefix}</td>
                    <td class="diff-code"><code>${escapeHtml(item.line || "")}</code></td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;

        const copyBtn = document.getElementById("btnCopyFixedCode");
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(answerCode).then(() => {
                    showAppToast("Fixed solution copied to clipboard! 📋");
                });
            };
        }

        const modalInstance = new bootstrap.Modal(modalEl);
        modalInstance.show();
    }

    // -------------------------------------------------------------
    // 5. CODE VAULT MODAL (Search, Filter, Export Cheatsheet)
    // -------------------------------------------------------------
    function setupVaultModal() {
        if (document.getElementById("codeVaultModal")) return;

        const modalEl = document.createElement("div");
        modalEl.id = "codeVaultModal";
        modalEl.className = "modal fade";
        modalEl.tabIndex = -1;
        modalEl.setAttribute("aria-hidden", "true");
        modalEl.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content cq-modal">
                    <div class="modal-header border-0 pb-0">
                        <div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-warning-subtle text-warning-emphasis fw-bold px-2 py-1"><i class="fa-solid fa-box-archive me-1"></i> Dev Vault</span>
                                <h5 class="modal-title fw-bold mb-0">My Saved Code Solutions</h5>
                            </div>
                            <p class="text-muted small mb-0 mt-1">Bookmark key snippets to build your personal offline cheatsheet.</p>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body pt-3">
                        <div class="vault-toolbar d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
                            <div class="search-box-sm flex-grow-1" style="max-width: 320px;">
                                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                                <input type="text" id="vaultSearchInput" class="search-input" placeholder="Filter saved snippets...">
                            </div>
                            <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3" id="btnExportVaultMd">
                                <i class="fa-solid fa-file-arrow-down me-1"></i> Export Cheatsheet (.md)
                            </button>
                        </div>
                        <div id="vaultSnippetsList" class="vault-items-container">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);

        // Export button handler
        const exportBtn = modalEl.querySelector("#btnExportVaultMd");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => CodeVault.exportMarkdown());
        }

        // Live search filter
        const searchInput = modalEl.querySelector("#vaultSearchInput");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                renderVaultItems(e.target.value);
            });
        }
    }

    function renderVaultItems(query = "") {
        const listEl = document.getElementById("vaultSnippetsList");
        if (!listEl) return;

        let items = CodeVault.getAll();
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            items = items.filter(x => (x.title && x.title.toLowerCase().includes(q)) || (x.code && x.code.toLowerCase().includes(q)) || (x.lang && x.lang.toLowerCase().includes(q)));
        }

        if (!items.length) {
            listEl.innerHTML = `
                <div class="text-center py-5">
                    <i class="fa-solid fa-box-open text-muted mb-2" style="font-size: 2.5rem;"></i>
                    <h6 class="fw-bold text-secondary mb-1">${query.trim() ? "No matching snippets found" : "Your Vault is Empty"}</h6>
                    <p class="text-muted small">Save useful snippets from questions or answers using the <b>Save</b> button on any code block.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = "";
        items.forEach(item => {
            const card = document.createElement("div");
            card.className = "vault-card mb-3";
            card.dataset.id = item.id;
            const dateStr = new Date(item.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

            card.innerHTML = `
                <div class="vault-card-header d-flex align-items-center justify-content-between p-2 px-3 bg-light border-bottom">
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-secondary-subtle text-secondary fw-semibold">${escapeHtml(item.lang || "code")}</span>
                        <a href="messageDetails.html?questionId=${item.questionId}" class="vault-source-link text-truncate fw-semibold text-dark" style="max-width: 320px;" title="${escapeHtml(item.title)}">
                            ${escapeHtml(item.title || "Snippet")}
                        </a>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <span class="text-muted small me-2">${dateStr}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary btn-copy-vault" title="Copy code">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger btn-del-vault" title="Remove from vault">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <pre class="vault-code-block m-0 p-3"><code>${escapeHtml(item.code)}</code></pre>
            `;

            // Copy
            const copyBtn = card.querySelector(".btn-copy-vault");
            if (copyBtn) {
                copyBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(item.code).then(() => {
                        copyBtn.innerHTML = `<i class="fa-solid fa-check text-success"></i>`;
                        setTimeout(() => { copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`; }, 1500);
                        showAppToast("Snippet copied!");
                    });
                });
            }

            // Delete
            const delBtn = card.querySelector(".btn-del-vault");
            if (delBtn) {
                delBtn.addEventListener("click", () => {
                    if (confirm("Remove this snippet from your vault?")) {
                        CodeVault.remove(item.id);
                        renderVaultItems(query);
                    }
                });
            }

            listEl.appendChild(card);
        });
    }

    function openVaultModal() {
        setupVaultModal();
        renderVaultItems();
        const modalEl = document.getElementById("codeVaultModal");
        if (modalEl && window.bootstrap) {
            const modalInstance = new bootstrap.Modal(modalEl);
            modalInstance.show();
        }
    }

    // -------------------------------------------------------------
    // 6. QUEST GAMIFICATION PROFILE RENDERING
    // -------------------------------------------------------------
    function renderQuestGamification(gamification, container) {
        if (!container || !gamification) return;

        const { xp, level, rankTitle, nextLevelXp, xpProgressPercent, totalLikes, solutionsCount, badges } = gamification;

        container.innerHTML = `
            <!-- Quest Level & XP Progress Banner -->
            <div class="quest-level-card mb-4">
                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="quest-level-badge"><i class="fa-solid fa-crown me-1 text-warning"></i> Level ${level}</span>
                        <h4 class="quest-rank-title mb-0">${escapeHtml(rankTitle)}</h4>
                    </div>
                    <div class="quest-xp-stats">
                        <span class="fw-bold text-primary">${xp} XP</span> <span class="text-muted small">/ ${nextLevelXp} XP to Next Level</span>
                    </div>
                </div>
                <div class="progress quest-progress-bar mb-2" style="height: 12px; border-radius: 999px; background: #e2e8f0;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" role="progressbar" style="width: ${xpProgressPercent}%;" aria-valuenow="${xpProgressPercent}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <div class="d-flex justify-content-between text-muted small">
                    <span>${xpProgressPercent}% Completed</span>
                    <span>Earn XP by asking (+15), answering (+25), and getting solutions accepted (+60)!</span>
                </div>
            </div>

            <!-- Quest Achievements Showcase -->
            <div class="quest-achievements-section mb-4">
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <h5 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-medal me-2 text-warning"></i>Quest Achievements Showcase</h5>
                    <span class="badge bg-light text-secondary border fw-bold">${badges.filter(b => b.unlocked).length} / ${badges.length} Unlocked</span>
                </div>
                <div class="row g-3">
                    ${badges.map(b => `
                        <div class="col-md-4 col-sm-6">
                            <div class="achievement-card ${b.unlocked ? 'is-unlocked' : 'is-locked'}">
                                <div class="achievement-icon-wrap">
                                    <i class="${b.icon}"></i>
                                </div>
                                <div class="achievement-info">
                                    <h6 class="achievement-title">${escapeHtml(b.title)}</h6>
                                    <p class="achievement-desc">${escapeHtml(b.description)}</p>
                                    <span class="achievement-status">
                                        ${b.unlocked ? `<i class="fa-solid fa-check text-success me-1"></i> Unlocked` : `<i class="fa-solid fa-lock me-1"></i> In Progress`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------
    // UTILITY HELPERS
    // -------------------------------------------------------------
    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showAppToast(msg) {
        const toastEl = document.getElementById("appToast");
        const toastMsg = document.getElementById("toastMessage");
        if (toastEl && toastMsg && window.bootstrap) {
            toastMsg.textContent = msg;
            const toast = new bootstrap.Toast(toastEl, { delay: 2800 });
            toast.show();
        } else {
            alert(msg);
        }
    }

    // -------------------------------------------------------------
    // 7. INBUILT SMART CODEBLOCK DETECTION & PARAGRAPH FORMATTER
    // -------------------------------------------------------------
    function detectCodeSnippet(text) {
        if (!text || typeof text !== "string") return null;
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 8) return null;

        // If already enclosed in codeblock backticks, don't double wrap
        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
            return null;
        }

        const lines = trimmed.split("\n");
        let codeScore = 0;
        let detectedLang = "javascript";

        // Heuristics for language detection (Java and C++ must precede generic JS keywords)
        const hasJava = /\b(import\s+java\.|package\s+[a-z0-9_.]+|public\s+class|public\s+static\s+void|System\.(out|err)|Scanner\s+\w+|String\[\]\s*args|new\s+Scanner|throws\s+Exception)\b/.test(trimmed);
        const hasCpp = /\b(#include\s*<|std::|int\s+main\s*\(|cout\s*<<|cin\s*>>|printf\s*\(|scanf\s*\()\b/.test(trimmed);
        const hasPython = (/\b(def\s+\w+\(|elif\s+|print\(|import\s+math|import\s+sys|from\s+\w+\s+import|lambda\s+|__init__|self\.|range\(\d+\))\b/.test(trimmed) || (trimmed.includes("print(") && trimmed.includes(":"))) && !trimmed.includes("console.log");
        const hasGo = /\b(package\s+main|func\s+main\(\)|fmt\.Print)/.test(trimmed);
        const hasRust = /\b(fn\s+main\(\)|println!|let\s+mut\s+)/.test(trimmed);
        const hasPhp = /<\?php|\$[a-zA-Z_]\w*\s*=|\becho\s+["']/.test(trimmed);
        const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(trimmed) && (trimmed.includes("</div>") || trimmed.includes("</button>") || trimmed.includes("<html>") || trimmed.includes("</p>"));
        const hasCssSyntax = /\{[\s\S]*?[a-z-]+:\s*[^;]+;[\s\S]*?\}/i.test(trimmed) && !trimmed.includes("function") && !trimmed.includes("class ");
        const hasSqlKeywords = /\b(SELECT\s+[\s\S]+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(trimmed);
        const hasJsKeywords = /\b(const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|function\s+\w+\(|console\.log|async\s+function|export\s+default|document\.getElementById|addEventListener|=>)\b/.test(trimmed);

        if (hasJava) {
            codeScore += 5;
            detectedLang = "java";
        } else if (hasCpp) {
            codeScore += 5;
            detectedLang = "cpp";
        } else if (hasPython) {
            codeScore += 5;
            detectedLang = "python";
        } else if (hasGo) {
            codeScore += 5;
            detectedLang = "go";
        } else if (hasRust) {
            codeScore += 5;
            detectedLang = "rust";
        } else if (hasPhp) {
            codeScore += 5;
            detectedLang = "php";
        } else if (hasHtmlTags) {
            codeScore += 5;
            detectedLang = "html";
        } else if (hasCssSyntax) {
            codeScore += 5;
            detectedLang = "css";
        } else if (hasSqlKeywords) {
            codeScore += 5;
            detectedLang = "sql";
        } else if (hasJsKeywords) {
            codeScore += 5;
            detectedLang = "javascript";
        }

        // Structural symbols check
        const codeSymbols = (trimmed.match(/[{}\[\]();=><+\-*\/&|!]/g) || []).length;
        if (codeSymbols >= 6) codeScore += 2;

        // Multi-line indentation
        if (lines.length >= 2) {
            const indented = lines.filter(l => l.startsWith("  ") || l.startsWith("\t") || l.startsWith("    ")).length;
            if (indented >= 1) codeScore += 2;
            if (lines.length >= 3) codeScore += 1;
        }

        if (codeScore >= 4) {
            return { isCode: true, lang: detectedLang };
        }
        return null;
    }

    function insertMarkdownToTextarea(textarea, prefix, suffix, defaultText) {
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const current = textarea.value;
        const selected = current.substring(start, end) || defaultText;
        const replacement = prefix + selected + suffix;
        textarea.value = current.substring(0, start) + replacement + current.substring(end);
        textarea.focus();
        textarea.selectionStart = start + prefix.length;
        textarea.selectionEnd = start + prefix.length + selected.length;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function formatAsParagraph(textarea) {
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const selected = val.substring(start, end);

        if (selected) {
            // Strip any codeblock backticks or inline code backticks from selection
            let clean = selected
                .replace(/^```[a-zA-Z0-9_-]*\n?/gm, "")
                .replace(/```$/gm, "")
                .replace(/`([^`]+)`/g, "$1")
                .trim();

            const formatted = `\n\n${clean}\n\n`;
            textarea.value = val.substring(0, start) + formatted + val.substring(end);
            textarea.focus();
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = start + 2 + clean.length;
        } else {
            const insertText = "\n\nParagraph text here...\n\n";
            textarea.value = val.substring(0, start) + insertText + val.substring(end);
            textarea.focus();
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = start + insertText.length - 2;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function formatAsCodeBlock(textarea) {
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const selected = val.substring(start, end).trim();

        let lang = "";
        if (selected) {
            const detected = detectCodeSnippet(selected);
            if (detected && detected.lang) {
                lang = detected.lang;
            }
        }

        const langTag = lang || "";
        const code = selected || "// Paste or write your code here";
        const formatted = "\n```" + langTag + "\n" + code + "\n```\n";

        textarea.value = val.substring(0, start) + formatted + val.substring(end);
        textarea.focus();
        const codeStart = start + langTag.length + 5;
        textarea.selectionStart = codeStart;
        textarea.selectionEnd = codeStart + code.length;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function attachSmartCodeDetection(textarea) {
        if (!textarea || textarea.getAttribute("data-smart-code-attached")) return;
        textarea.setAttribute("data-smart-code-attached", "true");

        let helperBanner = null;

        function showHelperBanner(pastedOriginal, formattedCode, lang, rangeStart, rangeLength) {
            removeHelperBanner();

            helperBanner = document.createElement("div");
            helperBanner.className = "code-paste-helper-banner";
            helperBanner.innerHTML = `
                <div class="helper-info">
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold me-1">
                        <i class="fa-solid fa-wand-magic-sparkles me-1"></i>Auto CodeBlock
                    </span>
                    <span>Program code detected (${lang}).</span>
                </div>
                <div class="helper-actions">
                    <button type="button" class="btn-paste-opt btn-opt-paragraph" title="Revert to normal text paragraph">
                        <i class="fa-solid fa-paragraph me-1"></i> As Paragraph
                    </button>
                    <button type="button" class="btn-paste-opt btn-opt-code active" title="Keep formatted as Code Block">
                        <i class="fa-solid fa-code me-1"></i> As Code Block
                    </button>
                    <button type="button" class="btn-close-paste-helper" title="Dismiss">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;

            // Insert above textarea
            const parent = textarea.parentElement;
            if (parent) {
                parent.insertBefore(helperBanner, textarea);
            }

            // Paragraph button clicked
            const pBtn = helperBanner.querySelector(".btn-opt-paragraph");
            if (pBtn) {
                pBtn.addEventListener("click", () => {
                    const currentVal = textarea.value;
                    const before = currentVal.substring(0, rangeStart);
                    const after = currentVal.substring(rangeStart + rangeLength);
                    textarea.value = before + pastedOriginal + after;
                    textarea.focus();
                    textarea.selectionStart = rangeStart;
                    textarea.selectionEnd = rangeStart + pastedOriginal.length;
                    rangeLength = pastedOriginal.length;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));

                    pBtn.classList.add("active");
                    helperBanner.querySelector(".btn-opt-code").classList.remove("active");
                    helperBanner.querySelector(".helper-info span:last-child").textContent = "Switched to Paragraph text.";
                    setTimeout(removeHelperBanner, 1600);
                });
            }

            // Code block button clicked
            const cBtn = helperBanner.querySelector(".btn-opt-code");
            if (cBtn) {
                cBtn.addEventListener("click", () => {
                    const currentVal = textarea.value;
                    const before = currentVal.substring(0, rangeStart);
                    const after = currentVal.substring(rangeStart + rangeLength);
                    textarea.value = before + formattedCode + after;
                    textarea.focus();
                    textarea.selectionStart = rangeStart;
                    textarea.selectionEnd = rangeStart + formattedCode.length;
                    rangeLength = formattedCode.length;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));

                    cBtn.classList.add("active");
                    pBtn.classList.remove("active");
                    helperBanner.querySelector(".helper-info span:last-child").textContent = "Kept as Code Block.";
                    setTimeout(removeHelperBanner, 1600);
                });
            }

            // Close button
            const closeBtn = helperBanner.querySelector(".btn-close-paste-helper");
            if (closeBtn) {
                closeBtn.addEventListener("click", removeHelperBanner);
            }

            // Auto dismiss after 10s
            setTimeout(() => {
                if (helperBanner) removeHelperBanner();
            }, 10000);
        }

        function removeHelperBanner() {
            if (helperBanner && helperBanner.parentElement) {
                helperBanner.parentElement.removeChild(helperBanner);
            }
            helperBanner = null;
        }

        // On Paste event
        textarea.addEventListener("paste", (e) => {
            const pastedText = (e.clipboardData || window.clipboardData)?.getData("text");
            if (!pastedText) return;

            const detection = detectCodeSnippet(pastedText);
            if (detection && detection.isCode) {
                e.preventDefault();

                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const currentVal = textarea.value;

                // Ensure clean newlines around code block
                const preBreak = (start > 0 && currentVal[start - 1] !== "\n") ? "\n" : "";
                const postBreak = (end < currentVal.length && currentVal[end] !== "\n") ? "\n" : "";

                const formatted = preBreak + "```" + detection.lang + "\n" + pastedText.trim() + "\n```" + postBreak;

                textarea.value = currentVal.substring(0, start) + formatted + currentVal.substring(end);
                textarea.selectionStart = start + formatted.length;
                textarea.selectionEnd = start + formatted.length;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));

                showHelperBanner(pastedText, formatted, detection.lang, start, formatted.length);
            }
        });

        // Smart typing shortcut: typing ``` and pressing Enter or Space
        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                const start = textarea.selectionStart;
                const currentVal = textarea.value;
                const lineBefore = currentVal.substring(0, start).split("\n").pop();

                const match = lineBefore.match(/^```([a-zA-Z0-9_-]*)$/);
                if (match) {
                    e.preventDefault();
                    const lang = match[1] || "";
                    const lineStartPos = start - lineBefore.length;
                    const codeBlockTemplate = "```" + lang + "\n\n```\n";

                    textarea.value = currentVal.substring(0, lineStartPos) + codeBlockTemplate + currentVal.substring(start);
                    const cursorPosition = lineStartPos + lang.length + 4;
                    textarea.selectionStart = cursorPosition;
                    textarea.selectionEnd = cursorPosition;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));
                }
            }
        });
    }

    function initAllTextareaFormatters() {
        document.querySelectorAll("textarea#reply, textarea#modalQuestionText, textarea#editQuestionText, textarea#editAnswerText, textarea.cq-textarea, textarea.composer-textarea").forEach(textarea => {
            attachSmartCodeDetection(textarea);
        });

        // Delegate all .btn-fmt clicks across the entire page
        document.querySelectorAll(".btn-fmt:not([data-bound='true'])").forEach(btn => {
            btn.setAttribute("data-bound", "true");
            btn.addEventListener("click", () => {
                const targetId = btn.dataset.target;
                const textarea = document.getElementById(targetId);
                const fmt = btn.dataset.fmt;
                if (!textarea) return;

                if (fmt === "paragraph") {
                    formatAsParagraph(textarea);
                } else if (fmt === "code-block") {
                    formatAsCodeBlock(textarea);
                } else if (fmt === "code-inline") {
                    insertMarkdownToTextarea(textarea, "`", "`", "code");
                } else if (fmt === "bold") {
                    insertMarkdownToTextarea(textarea, "**", "**", "bold text");
                } else if (fmt === "quote") {
                    insertMarkdownToTextarea(textarea, "\n> ", "\n", "Quoted note or citation");
                } else if (fmt === "list") {
                    insertMarkdownToTextarea(textarea, "\n- ", "\n- Item 2\n", "Item 1");
                }
            });
        });
    }

    // -------------------------------------------------------------
    // 6. AUDIO CODE WALKTHROUGH & VOICE NOTES ENGINE
    // -------------------------------------------------------------
    const AudioWalkthrough = {
        activeAudio: null,
        activePlayBtn: null,
        activeTtsBtn: null,
        isTtsPlaying: false,
        
        mediaRecorder: null,
        audioChunks: [],
        recordStream: null,
        recordTimer: null,
        recordedDuration: 0,
        recordedDataUrl: null,
        recordedMimeType: "audio/webm",

        formatTime(seconds) {
            const s = Math.max(0, Math.floor(seconds || 0));
            const mins = Math.floor(s / 60);
            const secs = s % 60;
            return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
        },

        stopAllAudio() {
            // Stop any active HTML5 audio element
            if (this.activeAudio) {
                try {
                    this.activeAudio.pause();
                    this.activeAudio.currentTime = 0;
                } catch (e) {}
                this.activeAudio = null;
            }
            if (this.activePlayBtn) {
                this.activePlayBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
                this.activePlayBtn = null;
            }

            // Stop any active SpeechSynthesis (TTS)
            if (window.speechSynthesis) {
                try {
                    window.speechSynthesis.cancel();
                } catch (e) {}
            }
            if (this.activeTtsBtn) {
                this.activeTtsBtn.classList.remove("is-playing");
                this.activeTtsBtn.innerHTML = `<i class="fa-solid fa-volume-high me-1"></i> Listen`;
                this.activeTtsBtn = null;
            }
            this.isTtsPlaying = false;
        },

        getRecordedVoiceData() {
            if (!this.recordedDataUrl) return null;
            return {
                audioData: this.recordedDataUrl,
                duration: this.recordedDuration || 0,
                mimeType: this.recordedMimeType || "audio/webm"
            };
        },

        resetVoiceStudio() {
            // Stop recording stream if running
            if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
                try { this.mediaRecorder.stop(); } catch (e) {}
            }
            if (this.recordStream) {
                this.recordStream.getTracks().forEach(t => t.stop());
                this.recordStream = null;
            }
            if (this.recordTimer) {
                clearInterval(this.recordTimer);
                this.recordTimer = null;
            }

            this.audioChunks = [];
            this.recordedDuration = 0;
            this.recordedDataUrl = null;

            const studio = document.getElementById("voiceRecorderStudio");
            const toggleBtn = document.getElementById("toggleVoiceRecorderBtn");
            const idleBox = document.getElementById("vrecIdleState");
            const recBox = document.getElementById("vrecRecordingState");
            const prevBox = document.getElementById("vrecPreviewState");
            const previewAudio = document.getElementById("vrecPreviewAudio");
            const badge = document.getElementById("composerVoiceBadge");

            if (studio) studio.style.display = "none";
            if (toggleBtn) {
                toggleBtn.classList.remove("is-recording");
                toggleBtn.innerHTML = `<i class="fa-solid fa-microphone-lines me-1 text-danger"></i>Voice Note`;
            }
            if (idleBox) idleBox.style.display = "block";
            if (recBox) recBox.style.display = "none";
            if (prevBox) prevBox.style.display = "none";
            if (previewAudio) {
                previewAudio.pause();
                previewAudio.removeAttribute("src");
            }
            if (badge) badge.style.display = "none";
        },

        initVoiceRecorderStudio() {
            const studio = document.getElementById("voiceRecorderStudio");
            const toggleBtn = document.getElementById("toggleVoiceRecorderBtn");
            const closeBtn = document.getElementById("closeVoiceRecorderBtn");
            const startBtn = document.getElementById("startRecordingBtn");
            const stopBtn = document.getElementById("stopRecordingBtn");
            const cancelBtn = document.getElementById("cancelRecordingBtn");
            const discardBtn = document.getElementById("discardRecordingBtn");
            const reRecordBtn = document.getElementById("reRecordBtn");
            const timerEl = document.getElementById("vrecTimer");
            const playPreviewBtn = document.getElementById("vrecPlayPreviewBtn");
            const previewAudio = document.getElementById("vrecPreviewAudio");
            const scrubber = document.getElementById("vrecScrubber");
            const curTimeEl = document.getElementById("vrecCurrentTime");
            const totTimeEl = document.getElementById("vrecTotalTime");
            const durationBadge = document.getElementById("vrecDurationBadge");
            const composerBadge = document.getElementById("composerVoiceBadge");
            const composerVoiceTime = document.getElementById("composerVoiceTime");
            const removeAttachedAudioBtn = document.getElementById("removeAttachedAudioBtn");

            const idleBox = document.getElementById("vrecIdleState");
            const recBox = document.getElementById("vrecRecordingState");
            const prevBox = document.getElementById("vrecPreviewState");

            if (!toggleBtn || !studio) return;

            // 1. Toggle Studio Drawer
            toggleBtn.addEventListener("click", () => {
                const isOpen = studio.style.display === "block";
                studio.style.display = isOpen ? "none" : "block";
                if (!isOpen) {
                    studio.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
            });

            if (closeBtn) {
                closeBtn.addEventListener("click", () => {
                    studio.style.display = "none";
                });
            }

            // 2. Start Recording
            if (startBtn) {
                startBtn.addEventListener("click", async () => {
                    AudioWalkthrough.stopAllAudio();

                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        alert("Microphone access is not supported by your browser or current connection. Please ensure you are on HTTPS or localhost.");
                        return;
                    }

                    try {
                        AudioWalkthrough.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    } catch (err) {
                        console.error("Microphone permission error:", err);
                        alert("Microphone permission was denied. Please allow microphone permissions in your browser to record a voice walkthrough.");
                        return;
                    }

                    // Determine supported MIME type
                    let mimeType = "audio/webm;codecs=opus";
                    if (typeof MediaRecorder.isTypeSupported === "function") {
                        if (!MediaRecorder.isTypeSupported(mimeType)) {
                            mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
                        }
                    }
                    AudioWalkthrough.recordedMimeType = mimeType || "audio/webm";

                    AudioWalkthrough.audioChunks = [];
                    try {
                        AudioWalkthrough.mediaRecorder = mimeType
                            ? new MediaRecorder(AudioWalkthrough.recordStream, { mimeType })
                            : new MediaRecorder(AudioWalkthrough.recordStream);
                    } catch (e) {
                        AudioWalkthrough.mediaRecorder = new MediaRecorder(AudioWalkthrough.recordStream);
                    }

                    AudioWalkthrough.mediaRecorder.ondataavailable = (e) => {
                        if (e.data && e.data.size > 0) {
                            AudioWalkthrough.audioChunks.push(e.data);
                        }
                    };

                    AudioWalkthrough.mediaRecorder.onstop = () => {
                        const blob = new Blob(AudioWalkthrough.audioChunks, { type: AudioWalkthrough.recordedMimeType });
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            AudioWalkthrough.recordedDataUrl = reader.result;
                            if (previewAudio) {
                                previewAudio.src = URL.createObjectURL(blob);
                            }
                        };
                        reader.readAsDataURL(blob);

                        // Stop hardware tracks
                        if (AudioWalkthrough.recordStream) {
                            AudioWalkthrough.recordStream.getTracks().forEach(t => t.stop());
                            AudioWalkthrough.recordStream = null;
                        }

                        // Switch to Preview State
                        if (recBox) recBox.style.display = "none";
                        if (prevBox) prevBox.style.display = "block";
                        if (toggleBtn) {
                            toggleBtn.classList.remove("is-recording");
                            toggleBtn.innerHTML = `<i class="fa-solid fa-microphone-lines me-1 text-danger"></i>Voice Note (1)`;
                        }

                        const durationStr = AudioWalkthrough.formatTime(AudioWalkthrough.recordedDuration);
                        if (durationBadge) durationBadge.textContent = durationStr;
                        if (totTimeEl) totTimeEl.textContent = durationStr;
                        if (composerBadge) composerBadge.style.display = "inline-flex";
                        if (composerVoiceTime) composerVoiceTime.textContent = durationStr;
                        showAppToast("🎙️ Voice walkthrough attached!");
                    };

                    // Switch UI to Recording state
                    if (idleBox) idleBox.style.display = "none";
                    if (recBox) recBox.style.display = "block";
                    if (toggleBtn) {
                        toggleBtn.classList.add("is-recording");
                        toggleBtn.innerHTML = `<i class="fa-solid fa-circle text-danger me-1"></i> Recording...`;
                    }

                    AudioWalkthrough.recordedDuration = 0;
                    if (timerEl) timerEl.textContent = "00:00 / 01:30";

                    AudioWalkthrough.mediaRecorder.start(250); // collect in 250ms chunks

                    AudioWalkthrough.recordTimer = setInterval(() => {
                        AudioWalkthrough.recordedDuration++;
                        const cur = AudioWalkthrough.formatTime(AudioWalkthrough.recordedDuration);
                        if (timerEl) timerEl.textContent = `${cur} / 01:30`;

                        // Cap at 90 seconds
                        if (AudioWalkthrough.recordedDuration >= 90) {
                            clearInterval(AudioWalkthrough.recordTimer);
                            if (AudioWalkthrough.mediaRecorder && AudioWalkthrough.mediaRecorder.state === "recording") {
                                AudioWalkthrough.mediaRecorder.stop();
                            }
                        }
                    }, 1000);
                });
            }

            // 3. Stop Recording
            if (stopBtn) {
                stopBtn.addEventListener("click", () => {
                    if (AudioWalkthrough.recordTimer) {
                        clearInterval(AudioWalkthrough.recordTimer);
                        AudioWalkthrough.recordTimer = null;
                    }
                    if (AudioWalkthrough.mediaRecorder && AudioWalkthrough.mediaRecorder.state === "recording") {
                        AudioWalkthrough.mediaRecorder.stop();
                    }
                });
            }

            // 4. Cancel during recording
            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => {
                    AudioWalkthrough.resetVoiceStudio();
                    studio.style.display = "block"; // Keep drawer open but idle
                });
            }

            // 5. Discard / Re-record
            if (discardBtn) {
                discardBtn.addEventListener("click", () => {
                    AudioWalkthrough.resetVoiceStudio();
                    studio.style.display = "block";
                    showAppToast("Voice walkthrough removed.");
                });
            }

            if (reRecordBtn) {
                reRecordBtn.addEventListener("click", () => {
                    AudioWalkthrough.resetVoiceStudio();
                    studio.style.display = "block";
                    if (startBtn) startBtn.click();
                });
            }

            // Remove from composer footer badge
            if (removeAttachedAudioBtn) {
                removeAttachedAudioBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    AudioWalkthrough.resetVoiceStudio();
                    showAppToast("Voice walkthrough removed.");
                });
            }

            // 6. Preview Player Controls
            if (playPreviewBtn && previewAudio) {
                playPreviewBtn.addEventListener("click", () => {
                    if (previewAudio.paused) {
                        AudioWalkthrough.stopAllAudio();
                        previewAudio.play().then(() => {
                            playPreviewBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
                            AudioWalkthrough.activeAudio = previewAudio;
                            AudioWalkthrough.activePlayBtn = playPreviewBtn;
                        }).catch(e => console.error("Preview play failed:", e));
                    } else {
                        previewAudio.pause();
                        playPreviewBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
                        AudioWalkthrough.activeAudio = null;
                        AudioWalkthrough.activePlayBtn = null;
                    }
                });

                previewAudio.addEventListener("timeupdate", () => {
                    if (previewAudio.duration && scrubber) {
                        scrubber.value = (previewAudio.currentTime / previewAudio.duration) * 100;
                    }
                    if (curTimeEl) {
                        curTimeEl.textContent = AudioWalkthrough.formatTime(previewAudio.currentTime);
                    }
                });

                previewAudio.addEventListener("ended", () => {
                    playPreviewBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
                    if (scrubber) scrubber.value = 0;
                    if (curTimeEl) curTimeEl.textContent = "00:00";
                    AudioWalkthrough.activeAudio = null;
                    AudioWalkthrough.activePlayBtn = null;
                });

                if (scrubber) {
                    scrubber.addEventListener("input", () => {
                        if (previewAudio.duration) {
                            previewAudio.currentTime = (scrubber.value / 100) * previewAudio.duration;
                        }
                    });
                }
            }
        },

        createAudioPlayerElement(audioNote, authorName = "Author") {
            const container = document.createElement("div");
            container.className = "audio-walkthrough-player";

            const durationSec = Number(audioNote.duration) || 0;
            const durationFormatted = this.formatTime(durationSec);

            container.innerHTML = `
                <div class="awp-header">
                    <div class="awp-badge">
                        <i class="fa-solid fa-microphone-lines"></i>
                        <span>${escapeHtml(authorName)}'s Voice Walkthrough</span>
                    </div>
                    <div class="awp-duration-pill">${durationFormatted}</div>
                </div>
                <div class="awp-controls">
                    <button class="awp-btn-play" title="Play Voice Walkthrough">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <div class="awp-track-container">
                        <input type="range" class="awp-scrubber" min="0" max="100" value="0" aria-label="Audio scrubber">
                        <div class="awp-time-row">
                            <span class="awp-current-time">00:00</span>
                            <span class="awp-total-time">${durationFormatted}</span>
                        </div>
                    </div>
                    <button class="awp-speed-toggle" title="Change playback speed">1x</button>
                </div>
            `;

            const audio = new Audio(audioNote.audioData);
            audio.preload = "metadata";

            const playBtn = container.querySelector(".awp-btn-play");
            const scrubber = container.querySelector(".awp-scrubber");
            const curTimeEl = container.querySelector(".awp-current-time");
            const totTimeEl = container.querySelector(".awp-total-time");
            const speedBtn = container.querySelector(".awp-speed-toggle");

            const speeds = [1.0, 1.25, 1.5, 2.0];
            let currentSpeedIndex = 0;

            audio.addEventListener("loadedmetadata", () => {
                if (audio.duration && !isNaN(audio.duration)) {
                    totTimeEl.textContent = AudioWalkthrough.formatTime(audio.duration);
                }
            });

            playBtn.addEventListener("click", () => {
                if (audio.paused) {
                    AudioWalkthrough.stopAllAudio();
                    audio.play().then(() => {
                        playBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
                        AudioWalkthrough.activeAudio = audio;
                        AudioWalkthrough.activePlayBtn = playBtn;
                    }).catch(e => console.error("Audio playback error:", e));
                } else {
                    audio.pause();
                    playBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
                    AudioWalkthrough.activeAudio = null;
                    AudioWalkthrough.activePlayBtn = null;
                }
            });

            audio.addEventListener("timeupdate", () => {
                if (audio.duration) {
                    scrubber.value = (audio.currentTime / audio.duration) * 100;
                    curTimeEl.textContent = AudioWalkthrough.formatTime(audio.currentTime);
                }
            });

            audio.addEventListener("ended", () => {
                playBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
                scrubber.value = 0;
                curTimeEl.textContent = "00:00";
                AudioWalkthrough.activeAudio = null;
                AudioWalkthrough.activePlayBtn = null;
            });

            scrubber.addEventListener("input", () => {
                if (audio.duration) {
                    audio.currentTime = (scrubber.value / 100) * audio.duration;
                }
            });

            speedBtn.addEventListener("click", () => {
                currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
                const newSpeed = speeds[currentSpeedIndex];
                audio.playbackRate = newSpeed;
                speedBtn.textContent = `${newSpeed}x`;
            });

            return container;
        },

        cleanTextForSpeech(text) {
            if (!text) return "";
            let cleaned = text;

            // Replace multiline code blocks with clear verbal transition
            cleaned = cleaned.replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, (match, code) => {
                const lines = code.trim().split("\n").filter(l => l.trim().length > 0);
                if (lines.length <= 3) {
                    return ` In the code snippet: ${lines.join(". ")}. `;
                }
                return ` Here is the key code implementation: ${lines.slice(0, 3).join(". ")}. And remaining lines complete the logic. `;
            });

            // Replace inline code
            cleaned = cleaned.replace(/`([^`]+)`/g, " $1 ");

            // Replace markdown links [label](url) with just label
            cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, " $1 ");

            // Clean markdown syntax headers, bullets, bold, blockquotes
            cleaned = cleaned.replace(/#{1,6}\s+/g, "");
            cleaned = cleaned.replace(/[*_~]{1,3}/g, "");
            cleaned = cleaned.replace(/^>\s+/gm, " Note: ");
            cleaned = cleaned.replace(/^[-*+]\s+/gm, "");

            return cleaned.trim();
        },

        toggleTts(rawText, buttonEl) {
            if (!("speechSynthesis" in window)) {
                alert("Text-to-speech is not supported by your browser.");
                return;
            }

            // If this button is already active
            if (this.activeTtsBtn === buttonEl && this.isTtsPlaying) {
                if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                    window.speechSynthesis.pause();
                    buttonEl.innerHTML = `<i class="fa-solid fa-play me-1"></i> Resume`;
                    return;
                } else if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                    buttonEl.innerHTML = `<i class="fa-solid fa-pause me-1"></i> Pause`;
                    return;
                }
            }

            // Stop other running audio
            this.stopAllAudio();

            const textToSpeak = this.cleanTextForSpeech(rawText);
            if (!textToSpeak) {
                showAppToast("No readable text found in this answer.");
                return;
            }

            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            // Pick highest quality English voice if available
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Enhanced")) && v.lang.startsWith("en"))
                || voices.find(v => v.lang.startsWith("en"));
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            this.activeTtsBtn = buttonEl;
            this.isTtsPlaying = true;
            buttonEl.classList.add("is-playing");
            buttonEl.innerHTML = `<i class="fa-solid fa-pause me-1"></i> Pause`;

            utterance.onend = () => {
                buttonEl.classList.remove("is-playing");
                buttonEl.innerHTML = `<i class="fa-solid fa-volume-high me-1"></i> Listen`;
                this.activeTtsBtn = null;
                this.isTtsPlaying = false;
            };

            utterance.onerror = (e) => {
                console.warn("TTS playback note:", e);
                buttonEl.classList.remove("is-playing");
                buttonEl.innerHTML = `<i class="fa-solid fa-volume-high me-1"></i> Listen`;
                this.activeTtsBtn = null;
                this.isTtsPlaying = false;
            };

            window.speechSynthesis.speak(utterance);
            showAppToast("🔊 Audio walkthrough started");
        }
    };

    // -------------------------------------------------------------
    // 7. REAL-TIME 1-ON-1 COLLAB CALL & NOTIFICATION MANAGER
    // -------------------------------------------------------------
    const LiveCallManager = {
        currentUser: null,
        activeWs: null,
        activeIncomingCall: null,
        activeOutgoingCall: null,
        chimeInterval: null,
        pollTimer: null,
        outgoingCountdown: null,

        async init() {
            try {
                const res = await fetch("/auth/status", { credentials: "include" });
                if (!res.ok) return;
                const data = await res.json();
                if (data && data.loggedIn) {
                    this.currentUser = data;
                    this.connectSocket();
                    this.startPoll();
                }
            } catch (err) {
                // Ignore auth check error
            }
        },

        connectSocket() {
            if (!this.currentUser) return;
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${protocol}//${window.location.host}/ws/collab`;

            try {
                this.activeWs = new WebSocket(wsUrl);

                this.activeWs.onopen = () => {
                    if (this.activeWs.readyState === WebSocket.OPEN) {
                        this.activeWs.send(JSON.stringify({
                            type: "register-user",
                            userId: this.currentUser.userId
                        }));
                    }
                };

                this.activeWs.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === "incoming-call") {
                            this.handleIncomingCall(data.call);
                        } else if (data.type === "call-accepted") {
                            this.handleOutgoingAccepted(data);
                        } else if (data.type === "call-declined") {
                            this.handleOutgoingDeclined(data);
                        } else if (data.type === "call-cancelled") {
                            this.handleIncomingCancelled(data);
                        }
                    } catch (e) {}
                };

                this.activeWs.onclose = () => {
                    setTimeout(() => {
                        if (this.currentUser) this.connectSocket();
                    }, 6000);
                };
            } catch (e) {
                console.warn("Call WS note:", e);
            }
        },

        startPoll() {
            if (this.pollTimer) clearInterval(this.pollTimer);
            this.pollTimer = setInterval(async () => {
                if (!this.currentUser) return;
                try {
                    const res = await fetch("/api/calls/active", { credentials: "include" });
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data.incoming && (!this.activeIncomingCall || this.activeIncomingCall.callId !== data.incoming.callId)) {
                        this.handleIncomingCall(data.incoming);
                    }
                    if (this.activeOutgoingCall && data.outgoing) {
                        if (data.outgoing.status === "accepted") {
                            this.handleOutgoingAccepted(data.outgoing);
                        } else if (data.outgoing.status === "declined") {
                            this.handleOutgoingDeclined(data.outgoing);
                        }
                    }
                } catch (e) {}
            }, 3000);
        },

        playMelodicChime() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const playTone = (freq, start, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
                    gain.gain.setValueAtTime(0.07, ctx.currentTime + start);
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(ctx.currentTime + start);
                    osc.stop(ctx.currentTime + start + duration);
                };
                playTone(659.25, 0.0, 0.35); // E5
                playTone(880.00, 0.18, 0.55); // A5
            } catch (e) {}
        },

        startChimeLoop() {
            this.stopChimeLoop();
            this.playMelodicChime();
            this.chimeInterval = setInterval(() => {
                this.playMelodicChime();
            }, 3000);
        },

        stopChimeLoop() {
            if (this.chimeInterval) {
                clearInterval(this.chimeInterval);
                this.chimeInterval = null;
            }
        },

        handleIncomingCall(call) {
            if (!call) return;
            if (this.activeIncomingCall && this.activeIncomingCall.callId === call.callId) return;
            this.activeIncomingCall = call;

            this.startChimeLoop();
            this.renderIncomingCallModal(call);
        },

        renderIncomingCallModal(call) {
            let modal = document.getElementById("codequestIncomingCallModal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "codequestIncomingCallModal";
                modal.className = "cq-call-modal cq-call-incoming-modal";
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="cq-call-backdrop"></div>
                <div class="cq-call-card">
                    <div class="cq-call-header">
                        <span class="cq-call-badge"><i class="fa-solid fa-phone me-1"></i> Incoming Live 1-on-1 Call</span>
                    </div>
                    <div class="cq-call-body">
                        <div class="cq-call-avatar-ring">
                            <div class="cq-call-pulse-wave"></div>
                            <img src="${escapeHtml(call.caller.avatarUrl || 'default-avatar.png')}" alt="${escapeHtml(call.caller.username)}" class="cq-call-avatar" onerror="this.src='default-avatar.png'">
                        </div>
                        <h3 class="cq-call-username">${escapeHtml(call.caller.username)}</h3>
                        <p class="cq-call-desc">wants to connect face-to-face for live pair-programming & collaborative debugging.</p>
                    </div>
                    <div class="cq-call-footer">
                        <button type="button" class="btn-cq-call-decline" id="btnDeclineIncomingCall">
                            <i class="fa-solid fa-phone-slash me-2"></i>Decline
                        </button>
                        <button type="button" class="btn-cq-call-accept" id="btnAcceptIncomingCall">
                            <i class="fa-solid fa-phone me-2"></i>Accept & Join
                        </button>
                    </div>
                </div>
            `;
            modal.style.display = "flex";

            // Accept button
            document.getElementById("btnAcceptIncomingCall")?.addEventListener("click", async () => {
                this.stopChimeLoop();
                modal.style.display = "none";
                try {
                    const res = await fetch("/api/calls/respond", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ callId: call.callId, action: "accept" })
                    });
                    const data = await res.json();
                    if (data && data.roomUrl) {
                        window.location.href = data.roomUrl;
                    } else if (call.roomId) {
                        window.location.href = `/collab.html?room=${call.roomId}`;
                    }
                } catch (err) {
                    if (call.roomId) window.location.href = `/collab.html?room=${call.roomId}`;
                }
            });

            // Decline button
            document.getElementById("btnDeclineIncomingCall")?.addEventListener("click", async () => {
                this.stopChimeLoop();
                modal.style.display = "none";
                this.activeIncomingCall = null;
                try {
                    await fetch("/api/calls/respond", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ callId: call.callId, action: "decline" })
                    });
                } catch (e) {}
            });
        },

        handleIncomingCancelled() {
            this.stopChimeLoop();
            const modal = document.getElementById("codequestIncomingCallModal");
            if (modal) modal.style.display = "none";
            this.activeIncomingCall = null;
            showAppToast("Call cancelled by caller.");
        },

        // Initiate call to a user
        async startCallWithUser({ targetUserId, targetUsername, targetAvatarUrl }) {
            if (!this.currentUser) {
                try {
                    const res = await fetch("/auth/status", { credentials: "include" });
                    const data = await res.json();
                    if (data && data.loggedIn) {
                        this.currentUser = data;
                    } else {
                        showAppToast("⚠️ Please log in to start live calls with developers.");
                        return;
                    }
                } catch (e) {
                    showAppToast("⚠️ Please log in to start live calls.");
                    return;
                }
            }

            if (String(this.currentUser.userId) === String(targetUserId)) {
                showAppToast("ℹ️ You cannot call yourself.");
                return;
            }

            this.renderOutgoingCallModal({ targetUsername, targetAvatarUrl });

            try {
                const res = await fetch("/api/calls/initiate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ targetUserId, targetUsername })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || "Could not initiate call");
                }

                const data = await res.json();
                this.activeOutgoingCall = data.call;

                // Watch for acceptance or timeout
                let remainingSeconds = 45;
                const timerEl = document.getElementById("cqOutgoingTimer");
                if (this.outgoingCountdown) clearInterval(this.outgoingCountdown);
                this.outgoingCountdown = setInterval(() => {
                    remainingSeconds--;
                    if (timerEl) timerEl.textContent = `Ringing (${remainingSeconds}s)...`;
                    if (remainingSeconds <= 0 || !this.activeOutgoingCall) {
                        clearInterval(this.outgoingCountdown);
                        if (this.activeOutgoingCall) {
                            this.cancelOutgoingCall();
                            showAppToast(`ℹ️ ${targetUsername} is not available right now.`);
                        }
                    }
                }, 1000);

            } catch (err) {
                this.closeOutgoingModal();
                showAppToast("❌ " + err.message);
            }
        },

        renderOutgoingCallModal({ targetUsername, targetAvatarUrl }) {
            let modal = document.getElementById("codequestOutgoingCallModal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "codequestOutgoingCallModal";
                modal.className = "cq-call-modal cq-call-outgoing-modal";
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="cq-call-backdrop"></div>
                <div class="cq-call-card">
                    <div class="cq-call-header">
                        <span class="cq-call-badge"><i class="fa-solid fa-satellite-dish me-1"></i> Calling Developer...</span>
                    </div>
                    <div class="cq-call-body">
                        <div class="cq-call-avatar-ring">
                            <div class="cq-call-pulse-wave"></div>
                            <img src="${escapeHtml(targetAvatarUrl || 'default-avatar.png')}" alt="${escapeHtml(targetUsername)}" class="cq-call-avatar" onerror="this.src='default-avatar.png'">
                        </div>
                        <h3 class="cq-call-username">${escapeHtml(targetUsername)}</h3>
                        <p class="cq-call-desc" id="cqOutgoingStatus">Live notification sent. Waiting for them to answer...</p>
                        <span class="cq-call-timer" id="cqOutgoingTimer">Ringing (45s)...</span>
                    </div>
                    <div class="cq-call-footer">
                        <button type="button" class="btn-cq-call-cancel" id="btnCancelOutgoingCall">
                            <i class="fa-solid fa-phone-slash me-2"></i>Cancel Call
                        </button>
                    </div>
                </div>
            `;
            modal.style.display = "flex";

            document.getElementById("btnCancelOutgoingCall")?.addEventListener("click", () => {
                this.cancelOutgoingCall();
            });
        },

        async cancelOutgoingCall() {
            if (this.outgoingCountdown) clearInterval(this.outgoingCountdown);
            const call = this.activeOutgoingCall;
            this.activeOutgoingCall = null;
            this.closeOutgoingModal();

            if (call) {
                try {
                    await fetch("/api/calls/respond", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ callId: call.callId, action: "cancel" })
                    });
                } catch (e) {}
            }
        },

        closeOutgoingModal() {
            const modal = document.getElementById("codequestOutgoingCallModal");
            if (modal) modal.style.display = "none";
        },

        handleOutgoingAccepted(data) {
            if (this.outgoingCountdown) clearInterval(this.outgoingCountdown);
            const statusEl = document.getElementById("cqOutgoingStatus");
            if (statusEl) statusEl.innerHTML = `<span class="text-success fw-bold"><i class="fa-solid fa-circle-check me-1"></i> Call Accepted! Connecting to Live Collab Room...</span>`;

            setTimeout(() => {
                this.closeOutgoingModal();
                const rId = data.roomId || (this.activeOutgoingCall ? this.activeOutgoingCall.roomId : null);
                this.activeOutgoingCall = null;
                if (rId) {
                    window.location.href = `/collab.html?room=${rId}`;
                }
            }, 800);
        },

        handleOutgoingDeclined() {
            if (this.outgoingCountdown) clearInterval(this.outgoingCountdown);
            const statusEl = document.getElementById("cqOutgoingStatus");
            if (statusEl) statusEl.innerHTML = `<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i> Call was declined. Developer is unavailable.</span>`;

            setTimeout(() => {
                this.closeOutgoingModal();
                this.activeOutgoingCall = null;
            }, 2500);
        }
    };

    // Auto-initialize when DOM is ready
    document.addEventListener("DOMContentLoaded", () => {
        CodeVault.updateCountBadge();
        enhanceCodeSnippetBlocks();
        initAllTextareaFormatters();
        AudioWalkthrough.initVoiceRecorderStudio();
        LiveCallManager.init();

        // Wire up any #codeVaultBtn in navbar
        document.querySelectorAll("#codeVaultBtn, .btn-open-vault").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                openVaultModal();
            });
        });

        // Delegate direct 1-on-1 call buttons across feeds and cards
        document.addEventListener("click", (e) => {
            const callBtn = e.target.closest(".btn-direct-call-user");
            if (callBtn) {
                e.preventDefault();
                e.stopPropagation();
                const targetUserId = callBtn.dataset.userId;
                const targetUsername = callBtn.dataset.username;
                const targetAvatarUrl = callBtn.dataset.avatar;
                LiveCallManager.startCallWithUser({ targetUserId, targetUsername, targetAvatarUrl });
            }
        });

        // Watch for dynamic DOM additions (e.g. newly loaded questions/answers)
        const observer = new MutationObserver(() => {
            enhanceCodeSnippetBlocks();
            initAllTextareaFormatters();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // Expose Global API for pages
    window.CodeQuestPro = {
        CodeVault,
        AudioWalkthrough,
        LiveCallManager,
        startCallWithUser: (opts) => LiveCallManager.startCallWithUser(opts),
        openVaultModal,
        openDiffModal,
        renderQuestGamification,
        enhanceCodeSnippetBlocks,
        attachSmartCodeDetection,
        formatAsParagraph,
        formatAsCodeBlock,
        showAppToast,
        executeJavaScript,
        decodeHtmlEntities
    };

})();

