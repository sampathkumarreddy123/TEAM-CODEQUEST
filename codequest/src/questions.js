document.addEventListener("DOMContentLoaded", function () {
    let currentUser = null;
    let searchDebounceTimer = null;
    let currentSearchTerm = "";
    let currentTag = "";
    let currentTab = "latest";

    // DOM Elements
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const searchFilterPill = document.getElementById("searchFilterPill");
    const activeSearchQuery = document.getElementById("activeSearchQuery");
    const removeFilterBtn = document.getElementById("removeFilterBtn");
    const messagesContainer = document.getElementById("messagesContainer");
    const questionCountBadge = document.getElementById("questionCountBadge");
    const tabButtons = document.querySelectorAll(".tab-btn");

    const quickAskInput = document.getElementById("quickAskInput");
    const quickAskBtn = document.getElementById("quickAskBtn");
    const quickAskAvatar = document.getElementById("quickAskAvatar");

    const headerUserAvatar = document.getElementById("headerUserAvatar");
    const headerUsername = document.getElementById("headerUsername");
    const logoutBtn = document.getElementById("logoutBtn");

    const openAskModalBtn = document.getElementById("openAskModalBtn");
    const modalQuestionText = document.getElementById("modalQuestionText");
    const modalQuestionTags = document.getElementById("modalQuestionTags");
    const modalSubmitBtn = document.getElementById("modalSubmitBtn");
    const modalErrorMsg = document.getElementById("modalErrorMsg");
    const askModalElement = document.getElementById("askQuestionModal");
    let askModalInstance = null;
    if (askModalElement && window.bootstrap) {
        askModalInstance = new bootstrap.Modal(askModalElement);
    }

    const authPromptModalEl = document.getElementById("authPromptModal");
    let authPromptModalInstance = null;
    if (authPromptModalEl && window.bootstrap) {
        authPromptModalInstance = new bootstrap.Modal(authPromptModalEl);
    }

    // Helper: format real-time accurate timestamp
    function formatTimeAgo(dateString) {
        if (!dateString) return "Recently";
        const now = new Date();
        const past = new Date(dateString);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        const timeStr = past.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (diffMins < 1) return `Just now (${timeStr})`;
        if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago (${timeStr})`;
        if (diffHours < 24 && past.getDate() === now.getDate()) {
            return `Today at ${timeStr}`;
        }
        if (diffHours < 48 && (now.getDate() - past.getDate() === 1 || diffHours < 24)) {
            return `Yesterday at ${timeStr}`;
        }

        return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ` at ${timeStr}`;
    }

    // Helper: format markdown code blocks & inline code
    function formatContent(text) {
        if (!text) return "";
        let escaped = escapeHtml(text);
        
        // Multi-line code blocks ```lang\ncode\n``` or ```code```
        escaped = escaped.replace(/```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g, function (match, lang, code) {
            const displayLang = (lang && lang.trim()) ? lang.trim() : "code";
            const cleanCode = (code !== undefined ? code : "").trim();
            return `
                <div class="code-snippet-wrapper">
                    <div class="code-snippet-header">
                        <span class="code-lang-tag"><i class="fa-solid fa-code me-1"></i>${escapeHtml(displayLang)}</span>
                        <button class="btn-copy-code" type="button" title="Copy code snippet">
                            <i class="fa-regular fa-copy me-1"></i><span>Copy</span>
                        </button>
                    </div>
                    <pre class="code-snippet-block"><code>${cleanCode}</code></pre>
                </div>
            `;
        });

        // Inline code `code`
        escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="code-inline">$1</code>');

        // Bold **text**
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        return escaped;
    }

    // Toast notification
    function showToast(msg) {
        const toastEl = document.getElementById("appToast");
        const toastMsg = document.getElementById("toastMessage");
        if (toastEl && toastMsg && window.bootstrap) {
            toastMsg.textContent = msg;
            const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
            toast.show();
        } else {
            alert(msg);
        }
    }

    // Auth Prompt Modal
    function showAuthPrompt(message = "Please sign in with GitHub to perform this action.") {
        const msgEl = document.getElementById("authPromptMsg");
        if (msgEl) msgEl.textContent = message;
        if (authPromptModalInstance) {
            authPromptModalInstance.show();
        } else {
            if (confirm(`${message}\n\nGo to login page now?`)) {
                window.location.href = "login.html";
            }
        }
    }

    // 1. Check Authentication Status (Stands on same page on refresh)
    async function checkAuthStatus() {
        // Optimistic local restore to prevent UI flicker on refresh
        const cachedUser = localStorage.getItem("cq_user");
        if (cachedUser) {
            try {
                const parsed = JSON.parse(cachedUser);
                currentUser = parsed;
                if (headerUsername) headerUsername.textContent = parsed.username || "Developer";
                const avatar = parsed.avatarUrl || "default-avatar.png";
                if (headerUserAvatar) headerUserAvatar.src = avatar;
                if (quickAskAvatar) quickAskAvatar.src = avatar;
            } catch (e) {
                // Ignore parse error
            }
        }

        try {
            const response = await fetch("/auth/status", {
                method: "GET",
                credentials: "include",
                cache: "no-cache"
            });

            if (!response.ok) throw new Error("Auth check failed");
            const data = await response.json();

            if (data.loggedIn) {
                currentUser = data;
                localStorage.setItem("cq_user", JSON.stringify(data));
                if (headerUsername) headerUsername.textContent = data.username;
                const avatar = data.avatarUrl || "default-avatar.png";
                if (headerUserAvatar) headerUserAvatar.src = avatar;
                if (quickAskAvatar) quickAskAvatar.src = avatar;
            } else {
                currentUser = null;
                localStorage.removeItem("cq_user");
                if (headerUsername) headerUsername.textContent = "Sign In";
                const userMenu = document.querySelector(".cq-dropdown");
                if (userMenu) {
                    userMenu.innerHTML = `
                        <li><a class="dropdown-item" href="login.html"><i class="fa-brands fa-github me-2 text-primary"></i> Sign In with GitHub</a></li>
                    `;
                }
            }
        } catch (error) {
            console.warn("⚠️ Auth status check note:", error.message);
            // Stay in same page! Never kick user to login page on refresh.
        }
    }

    // 2. Fetch Questions
    async function fetchQuestions(showSpinner = true) {
        try {
            if (showSpinner && messagesContainer) {
                messagesContainer.innerHTML = `
                    <div class="loading-state">
                        <i class="fa-solid fa-circle-notch fa-spin"></i>
                        <p>Loading questions...</p>
                    </div>
                `;
            }

            const params = new URLSearchParams();
            if (currentSearchTerm) params.append("search", currentSearchTerm);
            if (currentTag) params.append("tag", currentTag);
            if (currentTab) params.append("tab", currentTab);

            const url = `/questions?${params.toString()}`;
            const response = await fetch(url, { credentials: "include" });

            if (!response.ok) throw new Error("Failed to load questions");

            const questions = await response.json();
            displayQuestions(questions);

            if (questionCountBadge) {
                questionCountBadge.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
            }
        } catch (error) {
            console.error("❌ Error fetching questions:", error);
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation text-danger"></i>
                    <h3>Failed to load questions</h3>
                    <p>Could not connect to the database. Please try refreshing.</p>
                    <button class="btn btn-primary-cq" onclick="location.reload()">Retry</button>
                </div>
            `;
        }
    }

    // 3. Display Questions List
    function displayQuestions(questions) {
        messagesContainer.innerHTML = "";

        if (!questions.length) {
            const hasFilter = !!(currentSearchTerm || currentTag || currentTab !== "latest");
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-comment-dots"></i>
                    <h3>${hasFilter ? "No questions match your filter" : "No questions yet!"}</h3>
                    <p>${hasFilter ? "Try clearing your search query or selecting a different topic." : "Be the first to ask a question and start a discussion in the community!"}</p>
                    ${hasFilter 
                        ? `<button class="btn btn-primary-cq" id="emptyResetFilterBtn">Reset Filters</button>` 
                        : `<button class="btn btn-primary-cq" id="emptyAskBtn"><i class="fa-solid fa-plus me-1"></i>Ask a Question</button>`
                    }
                </div>
            `;

            const emptyReset = document.getElementById("emptyResetFilterBtn");
            if (emptyReset) emptyReset.addEventListener("click", resetAllFilters);

            const emptyAsk = document.getElementById("emptyAskBtn");
            if (emptyAsk) {
                emptyAsk.addEventListener("click", () => {
                    if (!currentUser) {
                        showAuthPrompt("Please sign in with GitHub to ask a question.");
                        return;
                    }
                    if (askModalInstance) askModalInstance.show();
                    else if (quickAskInput) quickAskInput.focus();
                });
            }
            return;
        }

        questions.forEach((question) => {
            const card = document.createElement("div");
            card.classList.add("question-card");
            card.dataset.questionId = question._id;

            const authorName = question.userId?.username || "Anonymous";
            const authorAvatar = question.userId?.avatarUrl || "default-avatar.png";
            const authorId = question.userId?._id || "";
            const timeAgo = formatTimeAgo(question.createdAt);
            const answerCount = question.answerCount || 0;
            const likesCount = question.likes || 0;
            const isLiked = !!question.isLiked;
            const isOwner = !!question.isOwner;
            const isSolved = !!question.isSolved;
            const tags = Array.isArray(question.tags) ? question.tags : [];

            // Render tags HTML
            let tagsHtml = "";
            if (tags.length > 0) {
                tagsHtml = `<div class="question-tags-row">` + 
                    tags.map(t => `<span class="q-tag-badge" data-filter-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join("") + 
                    `</div>`;
            }

            card.innerHTML = `
                <div class="card-top-row">
                    <a href="profile.html?userId=${authorId}" class="author-chip" title="View ${escapeHtml(authorName)}'s profile">
                        <img src="${escapeHtml(authorAvatar)}" alt="${escapeHtml(authorName)}" class="author-avatar" onerror="this.src='default-avatar.png'" />
                        <div class="author-info">
                            <span class="author-name">${escapeHtml(authorName)}</span>
                            <span class="post-time">${timeAgo}</span>
                        </div>
                    </a>
                    <div class="card-top-badges">
                        ${isSolved ? `<span class="badge-solved"><i class="fa-solid fa-check"></i> Solved</span>` : ""}
                        ${isOwner ? `<button class="btn-card-del" title="Delete question"><i class="fa-regular fa-trash-can"></i></button>` : ""}
                    </div>
                </div>

                <div class="question-body">${formatContent(question.questionText)}</div>

                ${tagsHtml}

                <div class="card-bottom-row">
                    <div class="card-meta-left">
                        <span class="meta-pill answers-pill">
                            <i class="fa-regular fa-message"></i> ${answerCount} ${answerCount === 1 ? "answer" : "answers"}
                        </span>
                        <button class="btn-like ${isLiked ? "liked" : ""}" title="${isLiked ? "Unlike" : "Upvote"}">
                            <i class="fa-${isLiked ? "solid" : "regular"} fa-heart"></i>
                            <span class="like-count">${likesCount}</span>
                        </button>
                        <button class="btn-share" title="Share question link">
                            <i class="fa-solid fa-share-nodes"></i> Share
                        </button>
                    </div>
                    <div class="read-answers-hint">
                        <span>View thread</span> <i class="fa-solid fa-arrow-right"></i>
                    </div>
                </div>
            `;

            // Author chip click
            const authorLink = card.querySelector(".author-chip");
            if (authorLink) {
                authorLink.addEventListener("click", (e) => e.stopPropagation());
            }

            // Tag badge click -> filter by this tag
            card.querySelectorAll(".q-tag-badge").forEach(pill => {
                pill.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const tag = pill.dataset.filterTag;
                    applyTagFilter(tag);
                });
            });

            // Upvote / Like Button
            const likeBtn = card.querySelector(".btn-like");
            if (likeBtn) {
                likeBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (!currentUser) {
                        showAuthPrompt("Please sign in with GitHub to upvote questions.");
                        return;
                    }
                    await toggleLike(question._id, likeBtn);
                });
            }

            // Share Button
            const shareBtn = card.querySelector(".btn-share");
            if (shareBtn) {
                shareBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const shareUrl = `${window.location.origin}/messageDetails.html?questionId=${question._id}`;
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        showToast("Question link copied to clipboard!");
                    }).catch(() => {
                        prompt("Copy this link:", shareUrl);
                    });
                });
            }

            // Delete Button (Author only)
            const delBtn = card.querySelector(".btn-card-del");
            if (delBtn) {
                delBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (confirm("Are you sure you want to delete this question?")) {
                        await deleteQuestion(question._id, card);
                    }
                });
            }

            // Navigate to Question Details
            card.addEventListener("click", () => {
                sessionStorage.setItem("selectedQuestionId", question._id);
                sessionStorage.setItem("selectedQuestionText", question.questionText);
                window.location.href = `messageDetails.html?questionId=${question._id}`;
            });

            messagesContainer.appendChild(card);
        });
    }

    // 4. Toggle Like / Upvote
    async function toggleLike(questionId, buttonEl) {
        try {
            const res = await fetch(`/questions/${questionId}/like`, {
                method: "POST",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Failed to toggle like");
            const data = await res.json();

            const heartIcon = buttonEl.querySelector("i");
            const countSpan = buttonEl.querySelector(".like-count");

            if (data.isLiked) {
                buttonEl.classList.add("liked");
                heartIcon.className = "fa-solid fa-heart";
            } else {
                buttonEl.classList.remove("liked");
                heartIcon.className = "fa-regular fa-heart";
            }
            if (countSpan) countSpan.textContent = data.likes;
        } catch (err) {
            console.error("Error liking question:", err);
        }
    }

    // 5. Delete Question
    async function deleteQuestion(questionId, cardEl) {
        try {
            const res = await fetch(`/questions/${questionId}`, {
                method: "DELETE",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Failed to delete");

            cardEl.style.transition = "all 0.3s ease";
            cardEl.style.opacity = "0";
            setTimeout(() => {
                cardEl.remove();
                fetchQuestions();
            }, 300);
        } catch (err) {
            console.error("Error deleting question:", err);
            alert("Could not delete question.");
        }
    }

    // 6. Post New Question
    async function submitQuestion(text, tagsInput = "") {
        const cleanText = text.trim();
        if (!cleanText) return false;

        try {
            const response = await fetch("/questions", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ questionText: cleanText, tags: tagsInput })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Failed to post question");
            }

            resetAllFilters();
            return true;
        } catch (error) {
            console.error("Error posting question:", error);
            alert(error.message || "Failed to post question");
            return false;
        }
    }

    // Quick Ask Handler
    if (quickAskBtn && quickAskInput) {
        quickAskBtn.addEventListener("click", async () => {
            if (!currentUser) {
                showAuthPrompt("Please sign in with GitHub to post a question.");
                return;
            }
            const text = quickAskInput.value;
            if (!text.trim()) {
                quickAskInput.focus();
                return;
            }
            quickAskBtn.disabled = true;
            quickAskBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
            const ok = await submitQuestion(text);
            quickAskBtn.disabled = false;
            quickAskBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Post`;
            if (ok) quickAskInput.value = "";
        });

        quickAskInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                quickAskBtn.click();
            }
        });
    }

    // Modal Ask Handler
    if (openAskModalBtn) {
        openAskModalBtn.addEventListener("click", () => {
            if (!currentUser) {
                showAuthPrompt("Please sign in with GitHub to post a question.");
                return;
            }
            if (modalQuestionText) modalQuestionText.value = "";
            if (modalQuestionTags) modalQuestionTags.value = "";
            if (modalErrorMsg) modalErrorMsg.style.display = "none";
            if (askModalInstance) askModalInstance.show();
        });
    }

    if (modalSubmitBtn && modalQuestionText) {
        modalSubmitBtn.addEventListener("click", async () => {
            const text = modalQuestionText.value.trim();
            const tags = modalQuestionTags ? modalQuestionTags.value.trim() : "";

            if (!text) {
                if (modalErrorMsg) {
                    modalErrorMsg.textContent = "Please write a question before submitting.";
                    modalErrorMsg.style.display = "block";
                }
                modalQuestionText.focus();
                return;
            }

            modalSubmitBtn.disabled = true;
            modalSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> Posting...`;

            const ok = await submitQuestion(text, tags);
            modalSubmitBtn.disabled = false;
            modalSubmitBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Post Question`;

            if (ok && askModalInstance) {
                askModalInstance.hide();
            }
        });
    }

    // Formatting Toolbar Handlers
    function insertMarkdown(textarea, prefix, suffix, defaultText) {
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
    }

    document.querySelectorAll(".btn-fmt").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const textarea = document.getElementById(targetId);
            const fmt = btn.dataset.fmt;
            if (!textarea) return;

            if (fmt === "code-block") {
                insertMarkdown(textarea, "\n```javascript\n", "\n```\n", "// Write your code here");
            } else if (fmt === "code-inline") {
                insertMarkdown(textarea, "`", "`", "code");
            } else if (fmt === "bold") {
                insertMarkdown(textarea, "**", "**", "bold text");
            }
        });
    });

    // 7. Search Input Handler
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.trim();
            currentSearchTerm = query;

            if (clearSearchBtn) {
                clearSearchBtn.style.display = query ? "block" : "none";
            }

            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                updateFilterPill();
                fetchQuestions();
            }, 300);
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            currentSearchTerm = "";
            clearSearchBtn.style.display = "none";
            updateFilterPill();
            fetchQuestions();
        });
    }

    if (removeFilterBtn) {
        removeFilterBtn.addEventListener("click", resetAllFilters);
    }

    // Keyboard shortcut: Press "/" to focus search
    document.addEventListener("keydown", (e) => {
        if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
            if (searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        }
    });

    // 8. Tags Filter Handling
    function applyTagFilter(tag) {
        currentTag = tag || "";
        document.querySelectorAll(".tag-pill").forEach(p => {
            p.classList.toggle("active", p.dataset.tag === currentTag);
        });
        updateFilterPill();
        fetchQuestions();
    }

    // 9. Sort Tabs Handling
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentTab = btn.dataset.tab;
            fetchQuestions();
        });
    });

    function updateFilterPill() {
        const parts = [];
        if (currentSearchTerm) parts.push(`"${currentSearchTerm}"`);
        if (currentTag) parts.push(`#${currentTag}`);

        if (parts.length > 0) {
            if (searchFilterPill) searchFilterPill.style.display = "flex";
            if (activeSearchQuery) activeSearchQuery.textContent = parts.join(" and ");
        } else {
            if (searchFilterPill) searchFilterPill.style.display = "none";
        }
    }

    function resetAllFilters() {
        currentSearchTerm = "";
        currentTag = "";
        currentTab = "latest";
        if (searchInput) searchInput.value = "";
        if (clearSearchBtn) clearSearchBtn.style.display = "none";
        if (searchFilterPill) searchFilterPill.style.display = "none";

        document.querySelectorAll(".tag-pill").forEach(p => {
            p.classList.toggle("active", p.dataset.tag === "");
        });

        tabButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.tab === "latest");
        });

        fetchQuestions();
    }

    // 10. Logout Button
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to sign out?")) return;
            try {
                const response = await fetch("/logout", { method: "POST", credentials: "include" });
                const data = await response.json();
                window.location.href = data.redirectUrl || "/login.html";
            } catch (error) {
                console.error("Logout error:", error);
                window.location.href = "/login.html";
            }
        });
    }

    // Code Snippet Copy Handler
    document.addEventListener("click", (e) => {
        const copyBtn = e.target.closest(".btn-copy-code");
        if (copyBtn) {
            e.stopPropagation();
            const wrapper = copyBtn.closest(".code-snippet-wrapper");
            const codeEl = wrapper ? wrapper.querySelector("code, .code-snippet-block") : null;
            if (codeEl) {
                const textToCopy = codeEl.innerText || codeEl.textContent || "";
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const span = copyBtn.querySelector("span");
                    const icon = copyBtn.querySelector("i");
                    if (span) span.textContent = "Copied!";
                    if (icon) icon.className = "fa-solid fa-check text-success me-1";
                    copyBtn.classList.add("copied");

                    setTimeout(() => {
                        if (span) span.textContent = "Copy";
                        if (icon) icon.className = "fa-regular fa-copy me-1";
                        copyBtn.classList.remove("copied");
                    }, 2000);
                }).catch(() => {
                    showToast("Code copied to clipboard!");
                });
            }
        }
    });

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ----------------- Profile Picture Lightbox -----------------
    function openAvatarLightbox(imgSrc, username) {
        if (!imgSrc) return;
        const lightbox = document.getElementById("avatarLightbox");
        const img = document.getElementById("avatarLightboxImg");
        const caption = document.getElementById("avatarLightboxCaption");
        if (!lightbox || !img) return;

        img.src = imgSrc;
        if (caption) {
            if (username && username.trim() !== "" && username !== "Avatar") {
                caption.textContent = username.startsWith("@") ? username : `@${username}`;
                caption.style.display = "block";
            } else {
                caption.style.display = "none";
            }
        }
        lightbox.style.display = "flex";
        document.body.style.overflow = "hidden";
    }

    function closeAvatarLightbox() {
        const lightbox = document.getElementById("avatarLightbox");
        if (lightbox) {
            lightbox.style.display = "none";
            document.body.style.overflow = "";
        }
    }

    function setupAvatarLightbox() {
        const lightbox = document.getElementById("avatarLightbox");
        const closeBtn = document.getElementById("avatarLightboxClose");

        if (lightbox) {
            lightbox.addEventListener("click", (e) => {
                const img = document.getElementById("avatarLightboxImg");
                const caption = document.getElementById("avatarLightboxCaption");
                if (e.target !== img && e.target !== caption) {
                    closeAvatarLightbox();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAvatarLightbox();
            });
        }

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeAvatarLightbox();
        });

        // Delegate clicks on any avatar image across the dashboard
        document.addEventListener("click", (e) => {
            const avatar = e.target.closest("img.author-avatar, img#headerUserAvatar, img#quickAskAvatar, img.user-avatar-sm");
            if (avatar && avatar.id !== "avatarLightboxImg") {
                e.preventDefault();
                e.stopPropagation();
                const username = avatar.dataset.username || avatar.alt || "";
                openAvatarLightbox(avatar.src, username);
            }
        });
    }

    // ----------------- Real-Time Live Sync (SSE) -----------------
    function setupRealtimeSync() {
        if (!window.EventSource) return;

        const eventSource = new EventSource("/api/events");

        eventSource.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                if (!data || !data.type) return;

                if (data.type === "new_question") {
                    // Another user posted a question!
                    // If viewing latest or unanswered, refresh feed silently without interrupting user
                    if (!currentSearchTerm && !currentTag && (currentTab === "latest" || currentTab === "unanswered")) {
                        fetchQuestions(false);
                    } else if (questionCountBadge) {
                        const currentCount = parseInt(questionCountBadge.textContent) || 0;
                        questionCountBadge.textContent = `${currentCount + 1} questions`;
                    }
                } else if (data.type === "question_deleted") {
                    const card = document.querySelector(`.question-card[data-question-id="${data.payload.questionId}"]`);
                    if (card) {
                        card.style.transition = "all 0.3s ease";
                        card.style.opacity = "0";
                        setTimeout(() => {
                            card.remove();
                            if (questionCountBadge) {
                                const currentCount = document.querySelectorAll(".question-card").length;
                                questionCountBadge.textContent = `${currentCount} question${currentCount === 1 ? "" : "s"}`;
                            }
                        }, 300);
                    }
                } else if (data.type === "question_liked") {
                    const card = document.querySelector(`.question-card[data-question-id="${data.payload.questionId}"]`);
                    if (card) {
                        const countSpan = card.querySelector(".like-count");
                        if (countSpan) countSpan.textContent = data.payload.likes;
                    }
                } else if (data.type === "new_answer" || data.type === "answer_deleted") {
                    const card = document.querySelector(`.question-card[data-question-id="${data.payload.questionId}"]`);
                    if (card) {
                        const pill = card.querySelector(".answers-pill");
                        if (pill && data.payload.answerCount !== undefined) {
                            pill.innerHTML = `<i class="fa-regular fa-message"></i> ${data.payload.answerCount} ${data.payload.answerCount === 1 ? "answer" : "answers"}`;
                        }
                    }
                } else if (data.type === "question_solved") {
                    const card = document.querySelector(`.question-card[data-question-id="${data.payload.questionId}"]`);
                    if (card) {
                        const badgesWrap = card.querySelector(".card-top-badges");
                        if (badgesWrap) {
                            const existing = badgesWrap.querySelector(".badge-solved");
                            if (data.payload.isSolved) {
                                if (!existing) {
                                    const solvedSpan = document.createElement("span");
                                    solvedSpan.className = "badge-solved";
                                    solvedSpan.innerHTML = `<i class="fa-solid fa-check"></i> Solved`;
                                    badgesWrap.prepend(solvedSpan);
                                }
                            } else if (existing) {
                                existing.remove();
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore ping or malformed event
            }
        };

        // Fallback sync: check every 25 seconds if tab is active
        setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchQuestions(false);
            }
        }, 25000);
    }

    // Initial Execution
    setupAvatarLightbox();
    checkAuthStatus();
    fetchQuestions();
    setupRealtimeSync();
});
