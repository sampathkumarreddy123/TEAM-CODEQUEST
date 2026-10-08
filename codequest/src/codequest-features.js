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
    function executeJavaScript(code, logCallback) {
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
            // Safe evaluation via Async Function constructor
            const runner = new Function(`
                "use strict";
                try {
                    ${code}
                } catch(err) {
                    throw err;
                }
            `);
            result = runner();
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
            const lang = (langTag ? langTag.innerText || langTag.textContent : "code").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

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

            // Check if snippet is runnable
            const runnableLangs = ["javascript", "js", "html", "css", "dom", "web", "typescript", "ts", "json", "code"];
            const isRunnable = runnableLangs.includes(lang) || rawCode.includes("console.log") || rawCode.includes("function") || rawCode.includes("<");

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

            // Run Button Click
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

                    // If HTML/DOM snippet, default to preview
                    if (rawCode.trim().startsWith("<") && (rawCode.includes("</div>") || rawCode.includes("</button>") || rawCode.includes("<html>"))) {
                        const previewTab = drawer.querySelector(".runner-tab[data-tab='preview']");
                        if (previewTab) previewTab.click();
                        return;
                    }

                    // Run as JavaScript
                    runBtn.classList.add("is-running");
                    runBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;

                    setTimeout(() => {
                        const execution = executeJavaScript(rawCode, (log) => {
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

                        runBtn.classList.remove("is-running");
                        runBtn.innerHTML = `<i class="fa-solid fa-rotate-right me-1"></i>Run`;
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

                    const res = CodeVault.save({
                        code: rawCode,
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
        let htmlContent = "";
        if (code.trim().startsWith("<!DOCTYPE") || code.trim().startsWith("<html")) {
            htmlContent = code;
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
                    ${lang === "html" || code.includes("<") ? code : `<div id="app"></div><script>${code}<\/script>`}
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

    // Auto-initialize when DOM is ready
    document.addEventListener("DOMContentLoaded", () => {
        CodeVault.updateCountBadge();
        enhanceCodeSnippetBlocks();

        // Wire up any #codeVaultBtn in navbar
        document.querySelectorAll("#codeVaultBtn, .btn-open-vault").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                openVaultModal();
            });
        });

        // Watch for dynamic DOM additions (e.g. newly loaded questions/answers)
        const observer = new MutationObserver(() => {
            enhanceCodeSnippetBlocks();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // Expose Global API for pages
    window.CodeQuestPro = {
        CodeVault,
        openVaultModal,
        openDiffModal,
        renderQuestGamification,
        enhanceCodeSnippetBlocks,
        showAppToast
    };

})();
