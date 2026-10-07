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
        let escaped = escapeHtml(text);
        
        // Multi-line code blocks ```code```
        escaped = escaped.replace(/```([\s\S]*?)```/g, function (match, code) {
            return `<div class="code-snippet-block">${code.trim()}</div>`;
        });

        // Inline code `code`
        escaped = escaped.replace(/`([^`]+)`/g, '<span class="code-inline">$1</span>');
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

    // 1. Check Authentication Status
    async function checkAuthStatus() {
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
                if (headerUsername) headerUsername.textContent = data.username;
                const avatar = data.avatarUrl || "default-avatar.png";
                if (headerUserAvatar) headerUserAvatar.src = avatar;
                if (quickAskAvatar) quickAskAvatar.src = avatar;
            } else {
                window.location.href = "/login.html";
            }
        } catch (error) {
            console.error("❌ Error checking auth status:", error);
            window.location.href = "/login.html";
        }
    }

    // 2. Fetch Questions
    async function fetchQuestions() {
        try {
            messagesContainer.innerHTML = `
                <div class="loading-state">
                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                    <p>Loading questions...</p>
                </div>
            `;

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

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Initial Execution
    checkAuthStatus();
    fetchQuestions();
});
