document.addEventListener("DOMContentLoaded", async function () {
    let currentUser = null;
    let questionData = null;

    // Retrieve Question ID from URL query or sessionStorage
    const urlParams = new URLSearchParams(window.location.search);
    const questionId = urlParams.get("questionId") || sessionStorage.getItem("selectedQuestionId");

    // Header Elements
    const headerUserAvatar = document.getElementById("headerUserAvatar");
    const headerUsername = document.getElementById("headerUsername");
    const logoutBtn = document.getElementById("logoutBtn");

    // Question Hero Elements
    const questionTitle = document.getElementById("selected-message");
    const questionAuthorAvatar = document.getElementById("questionAuthorAvatar");
    const questionAuthorName = document.getElementById("questionAuthorName");
    const questionAuthorLink = document.getElementById("questionAuthorLink");
    const questionTime = document.getElementById("questionTime");
    const questionSolvedBadge = document.getElementById("questionSolvedBadge");
    const questionTagsRow = document.getElementById("questionTagsRow");
    const likeQuestionBtn = document.getElementById("likeQuestionBtn");
    const questionLikesCount = document.getElementById("questionLikesCount");
    const shareQuestionBtn = document.getElementById("shareQuestionBtn");
    const deleteQuestionBtn = document.getElementById("deleteQuestionBtn");

    // Answers Elements
    const answersContainer = document.getElementById("answersContainer");
    const answersCountBadge = document.getElementById("answersCountBadge");
    const replyInput = document.getElementById("reply");
    const submitAnswerBtn = document.getElementById("submitAnswerBtn");
    const replyComposerCard = document.getElementById("replyComposerCard");
    const unauthComposerCard = document.getElementById("unauthComposerCard");

    // Auth Prompt Modal Element
    const authPromptModalEl = document.getElementById("authPromptModal");
    let authPromptModalInstance = null;
    if (authPromptModalEl && window.bootstrap) {
        authPromptModalInstance = new bootstrap.Modal(authPromptModalEl);
    }

    if (!questionId) {
        if (questionTitle) questionTitle.textContent = "❌ Question Not Found";
        if (answersContainer) {
            answersContainer.innerHTML = `
                <div class="empty-answers">
                    <h4>Invalid or Missing Question</h4>
                    <p>No question ID was provided. Please return to the community feed.</p>
                    <a href="dashboard.html" class="btn btn-primary-cq mt-3">Back to Dashboard</a>
                </div>
            `;
        }
        return;
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

    // 1. Check Auth Status
    async function checkAuthStatus() {
        const cachedUser = localStorage.getItem("cq_user");
        if (cachedUser) {
            try {
                const parsed = JSON.parse(cachedUser);
                currentUser = parsed;
                if (headerUsername) headerUsername.textContent = parsed.username || "Developer";
                const avatar = parsed.avatarUrl || "default-avatar.png";
                if (headerUserAvatar) headerUserAvatar.src = avatar;
            } catch (e) {
                // Ignore parse error
            }
        }

        try {
            const response = await fetch("/auth/status", { credentials: "include" });
            if (!response.ok) throw new Error("Auth failed");
            const data = await response.json();

            if (data.loggedIn) {
                currentUser = data;
                localStorage.setItem("cq_user", JSON.stringify(data));
                if (headerUsername) headerUsername.textContent = data.username;
                const avatar = data.avatarUrl || "default-avatar.png";
                if (headerUserAvatar) headerUserAvatar.src = avatar;

                if (data.isAdmin) {
                    const adminBadge = document.getElementById("headerAdminBadge");
                    const dropdownAdmin = document.getElementById("dropdownAdminItem");
                    if (adminBadge) adminBadge.style.display = "inline-flex";
                    if (dropdownAdmin) dropdownAdmin.style.display = "block";
                }

                if (replyComposerCard) replyComposerCard.style.display = "block";
                if (unauthComposerCard) unauthComposerCard.style.display = "none";
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

                if (replyComposerCard) replyComposerCard.style.display = "none";
                if (unauthComposerCard) unauthComposerCard.style.display = "block";
            }
        } catch (error) {
            console.warn("⚠️ Auth status check note:", error.message);
            // Stand in same page!
        }
    }

    // 2. Fetch Question Details
    async function fetchQuestionDetails() {
        try {
            const res = await fetch(`/questions/${questionId}`, { credentials: "include" });
            if (!res.ok) throw new Error("Question not found");
            questionData = await res.json();

            if (questionTitle) questionTitle.innerHTML = formatContent(questionData.questionText);
            
            const author = questionData.userId;
            const authorName = author?.username || "Anonymous";
            const authorAvatar = author?.avatarUrl || "default-avatar.png";
            const authorId = author?._id || "";

            if (questionAuthorName) questionAuthorName.textContent = authorName;
            if (questionAuthorAvatar) questionAuthorAvatar.src = authorAvatar;
            if (questionAuthorLink) questionAuthorLink.href = `profile.html?userId=${authorId}`;
            if (questionTime) questionTime.textContent = `Asked ${formatTimeAgo(questionData.createdAt)}`;

            if (questionLikesCount) questionLikesCount.textContent = questionData.likes || 0;

            // Admin badge on author
            const authorAdminBadge = document.getElementById("questionAuthorAdminBadge");
            if (authorAdminBadge) {
                authorAdminBadge.style.display = questionData.authorIsAdmin ? "inline-flex" : "none";
            }

            // Pinned & Locked badges
            const pinBadge = document.getElementById("questionPinnedBadge");
            if (pinBadge) {
                pinBadge.style.display = questionData.isPinned ? "inline-flex" : "none";
            }

            const lockBadge = document.getElementById("questionLockedBadge");
            if (lockBadge) {
                lockBadge.style.display = questionData.isLocked ? "inline-flex" : "none";
            }

            // Solved badge
            if (questionSolvedBadge) {
                questionSolvedBadge.style.display = questionData.isSolved ? "inline-flex" : "none";
            }

            // Tags row
            if (questionTagsRow) {
                const tags = Array.isArray(questionData.tags) ? questionData.tags : [];
                if (tags.length > 0) {
                    questionTagsRow.innerHTML = tags.map(t => `<span class="q-tag-badge">#${escapeHtml(t)}</span>`).join("");
                    questionTagsRow.style.display = "flex";
                } else {
                    questionTagsRow.style.display = "none";
                }
            }

            // Like state
            if (likeQuestionBtn) {
                if (questionData.isLiked) {
                    likeQuestionBtn.classList.add("liked");
                    likeQuestionBtn.querySelector("i").className = "fa-solid fa-heart";
                } else {
                    likeQuestionBtn.classList.remove("liked");
                    likeQuestionBtn.querySelector("i").className = "fa-regular fa-heart";
                }
            }

            const isAdmin = currentUser && currentUser.isAdmin;
            const canManage = questionData.isOwner || isAdmin || questionData.canManage;

            // Locked composer state
            const lockedNotice = document.getElementById("lockedNotice");
            const activeComposerArea = document.getElementById("activeComposerArea");
            if (questionData.isLocked && !isAdmin) {
                if (lockedNotice) lockedNotice.style.display = "flex";
                if (activeComposerArea) activeComposerArea.style.display = "none";
            } else {
                if (lockedNotice) lockedNotice.style.display = questionData.isLocked ? "flex" : "none";
                if (activeComposerArea) activeComposerArea.style.display = "block";
            }

            // Admin / Author action buttons in Hero
            const pinBtn = document.getElementById("pinQuestionBtn");
            const lockBtn = document.getElementById("lockQuestionBtn");
            const editBtn = document.getElementById("editQuestionBtn");

            if (isAdmin) {
                if (pinBtn) {
                    pinBtn.style.display = "inline-flex";
                    pinBtn.className = `btn-hero-admin ${questionData.isPinned ? "is-active-pin" : ""}`;
                    pinBtn.title = questionData.isPinned ? "Admin: Unpin question" : "Admin: Pin question to top";
                }
                if (lockBtn) {
                    lockBtn.style.display = "inline-flex";
                    lockBtn.className = `btn-hero-admin ${questionData.isLocked ? "is-active-lock" : ""}`;
                    lockBtn.title = questionData.isLocked ? "Admin: Unlock discussion" : "Admin: Lock discussion";
                }
            }

            if (canManage) {
                if (editBtn) editBtn.style.display = "inline-flex";
                if (deleteQuestionBtn) deleteQuestionBtn.style.display = "inline-flex";
            }

            document.title = `${questionData.questionText.slice(0, 40)}... - CodeQuest`;
            return true;
        } catch (error) {
            console.error("Error fetching question details:", error);
            sessionStorage.removeItem("selectedQuestionId");
            sessionStorage.removeItem("selectedQuestionText");

            const contentWrapper = document.querySelector(".content-wrapper");
            if (contentWrapper) {
                contentWrapper.innerHTML = `
                    <div class="text-center py-5 bg-white border rounded-3 p-4 my-4" style="border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
                        <i class="fa-solid fa-circle-question text-primary mb-3" style="font-size: 3rem;"></i>
                        <h2 class="fw-bold mb-2" style="color: var(--text-main);">Question Not Found</h2>
                        <p class="text-muted mb-4" style="max-width: 440px; margin: 0 auto 24px;">This question is no longer available or was removed. Returning you to the community feed...</p>
                        <a href="dashboard.html" class="btn btn-primary-cq">
                            <i class="fa-solid fa-arrow-left me-1"></i> Return to Questions Feed
                        </a>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 2000);
            }
            return false;
        }
    }

    // 3. Fetch Answers
    async function fetchAnswers(highlightedAnswerId = null) {
        try {
            const response = await fetch(`/answers/${questionId}`, { credentials: "include" });
            if (!response.ok) throw new Error("Failed to load answers");

            const answers = await response.json();
            renderAnswers(answers, highlightedAnswerId);
        } catch (error) {
            console.error("Error fetching answers:", error);
            answersContainer.innerHTML = `
                <div class="empty-answers text-danger">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h4>Failed to load answers</h4>
                    <p>Could not retrieve discussion replies. Please refresh.</p>
                </div>
            `;
        }
    }

    // 4. Render Answers List
    function renderAnswers(answers, highlightedAnswerId = null) {
        answersContainer.innerHTML = "";

        if (answersCountBadge) {
            answersCountBadge.textContent = answers.length;
        }

        if (!answers.length) {
            answersContainer.innerHTML = `
                <div class="empty-answers">
                    <i class="fa-regular fa-comments"></i>
                    <h4>No answers yet</h4>
                    <p>Be the first to share your knowledge and help solve this question!</p>
                </div>
            `;
            return;
        }

        answers.forEach((answer) => {
            const card = document.createElement("div");
            card.classList.add("answer-card");
            card.dataset.answerId = answer._id;
            if (highlightedAnswerId && String(answer._id) === String(highlightedAnswerId)) {
                card.classList.add("just-posted");
            }

            const authorName = answer.userId?.username || "Anonymous";
            const authorAvatar = answer.userId?.avatarUrl || "default-avatar.png";
            const authorId = answer.userId?._id || "";
            const isQuestionAuthor = questionData && questionData.userId && (questionData.userId._id === authorId || questionData.userId === authorId);
            const isOwner = !!answer.isOwner;
            const authorIsAdmin = !!answer.authorIsAdmin;
            const isAcceptedSolution = !!answer.isAcceptedSolution;
            const ansLikes = answer.likes || 0;
            const isAnsLiked = !!answer.isLiked;
            const isAdmin = currentUser && currentUser.isAdmin;

            if (isAcceptedSolution) {
                card.classList.add("is-solution");
            } else if (isQuestionAuthor) {
                card.classList.add("is-author");
            }

            // Can current user accept solutions? (Question owner or Admin)
            const canAcceptSolution = (questionData && questionData.isOwner) || isAdmin;
            const canManageAnswer = isOwner || isAdmin || answer.canManage;

            card.innerHTML = `
                <div class="answer-top-row">
                    <div class="answer-author-wrap">
                        <a href="profile.html?userId=${authorId}">
                            <img src="${escapeHtml(authorAvatar)}" alt="${escapeHtml(authorName)}" class="answer-avatar" onerror="this.src='default-avatar.png'">
                        </a>
                        <div class="answer-meta">
                            <div class="d-flex align-items-center gap-1">
                                <a href="profile.html?userId=${authorId}" class="answer-author-name">${escapeHtml(authorName)}</a>
                                ${authorIsAdmin ? `<span class="badge-admin-tag" title="Verified Administrator"><i class="fa-solid fa-shield-halved"></i> Admin</span>` : ""}
                            </div>
                            ${isQuestionAuthor ? `<span class="author-badge">Author</span>` : ""}
                            ${isAcceptedSolution ? `<span class="badge-accepted-solution"><i class="fa-solid fa-check"></i> Accepted Solution</span>` : ""}
                            <span class="answer-time">• ${formatTimeAgo(answer.createdAt)}</span>
                        </div>
                    </div>
                    <div class="answer-card-actions">
                        <button class="btn-like-answer ${isAnsLiked ? "liked" : ""}" title="${isAnsLiked ? "Unlike answer" : "Upvote answer"}">
                            <i class="fa-${isAnsLiked ? "solid" : "regular"} fa-heart"></i>
                            <span class="ans-like-count">${ansLikes}</span>
                        </button>
                        ${canAcceptSolution ? `
                            <button class="btn-accept-solution ${isAcceptedSolution ? "is-active" : ""}" title="${isAcceptedSolution ? "Unmark solution" : "Mark as accepted solution"}">
                                <i class="fa-solid fa-check me-1"></i> ${isAcceptedSolution ? "Accepted" : "Accept Solution"}
                            </button>
                        ` : ""}
                        ${canManageAnswer ? `<button class="btn-edit-answer" title="Edit answer"><i class="fa-regular fa-pen-to-square"></i></button>` : ""}
                        ${canManageAnswer ? `<button class="btn-del-answer ${!isOwner ? 'btn-admin-del' : ''}" title="${!isOwner ? 'Admin: Delete answer' : 'Delete your answer'}"><i class="fa-regular fa-trash-can"></i></button>` : ""}
                    </div>
                </div>
                <div class="answer-content">${formatContent(answer.answerText)}</div>
            `;

            // Like Answer Button
            const likeAnsBtn = card.querySelector(".btn-like-answer");
            if (likeAnsBtn) {
                likeAnsBtn.addEventListener("click", async () => {
                    if (!currentUser) {
                        showAuthPrompt("Please sign in with GitHub to upvote answers.");
                        return;
                    }
                    await toggleAnswerLike(answer._id, likeAnsBtn);
                });
            }

            // Accept solution button (Author or Admin)
            const acceptBtn = card.querySelector(".btn-accept-solution");
            if (acceptBtn) {
                acceptBtn.addEventListener("click", async () => {
                    await toggleAcceptSolution(answer._id);
                });
            }

            // Edit answer button (Author or Admin)
            const editAnsBtn = card.querySelector(".btn-edit-answer");
            if (editAnsBtn) {
                editAnsBtn.addEventListener("click", () => {
                    openEditAnswerModal(answer._id, answer.answerText);
                });
            }

            // Delete answer button (Author or Admin)
            const delBtn = card.querySelector(".btn-del-answer");
            if (delBtn) {
                delBtn.addEventListener("click", async () => {
                    const confirmMsg = !isOwner ? "Admin: Delete this answer?" : "Are you sure you want to delete your answer?";
                    if (confirm(confirmMsg)) {
                        await deleteAnswer(answer._id, card);
                    }
                });
            }

            answersContainer.appendChild(card);
        });
    }

    // 5. Toggle Answer Like
    async function toggleAnswerLike(ansId, buttonEl) {
        try {
            const res = await fetch(`/answers/${ansId}/like`, {
                method: "POST",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Like failed");
            const data = await res.json();

            const icon = buttonEl.querySelector("i");
            const countSpan = buttonEl.querySelector(".ans-like-count");

            if (data.isLiked) {
                buttonEl.classList.add("liked");
                icon.className = "fa-solid fa-heart";
            } else {
                buttonEl.classList.remove("liked");
                icon.className = "fa-regular fa-heart";
            }
            if (countSpan) countSpan.textContent = data.likes;
        } catch (err) {
            console.error("Error liking answer:", err);
        }
    }

    // 6. Toggle Accept Solution
    async function toggleAcceptSolution(answerId) {
        try {
            const res = await fetch(`/questions/${questionId}/solve/${answerId}`, {
                method: "POST",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Failed to update solution");
            const data = await res.json();

            showToast(data.isSolved ? "Marked as accepted solution!" : "Solution unmarked.");
            await fetchQuestionDetails();
            await fetchAnswers();
        } catch (err) {
            console.error("Error setting solution:", err);
            alert("Could not update solution status.");
        }
    }

    // 7. Submit Answer
    async function submitAnswer() {
        if (!currentUser) {
            showAuthPrompt("Please sign in with GitHub to post an answer.");
            return;
        }

        const text = replyInput.value.trim();
        if (!text) {
            replyInput.focus();
            return;
        }

        submitAnswerBtn.disabled = true;
        submitAnswerBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> Posting...`;

        try {
            const response = await fetch(`/answers/${questionId}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answerText: text })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Failed to post answer");
            }

            replyInput.value = "";
            const resData = await response.json();
            const newAnswerId = resData.answer?._id;
            await fetchAnswers(newAnswerId);

            // Smoothly scroll to the top of answers (where the new answer was added in first!)
            const newCard = newAnswerId ? document.querySelector(`.answer-card[data-answer-id="${newAnswerId}"]`) : null;
            if (newCard) {
                newCard.scrollIntoView({ behavior: "smooth", block: "center" });
            } else {
                answersContainer.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            showToast("Your answer was posted!");
        } catch (error) {
            console.error("Error submitting answer:", error);
            alert(error.message || "Could not post answer. Please try again.");
        } finally {
            submitAnswerBtn.disabled = false;
            submitAnswerBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-1"></i> Post Answer`;
        }
    }

    if (submitAnswerBtn) {
        submitAnswerBtn.addEventListener("click", submitAnswer);
    }

    // Jump to composer button in header
    const jumpToComposerBtn = document.getElementById("jumpToComposerBtn");
    if (jumpToComposerBtn) {
        jumpToComposerBtn.addEventListener("click", () => {
            if (!currentUser) {
                showAuthPrompt("Please sign in with GitHub to post an answer.");
                return;
            }
            if (replyComposerCard) {
                replyComposerCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            if (replyInput) {
                setTimeout(() => replyInput.focus(), 300);
            }
        });
    }

    if (replyInput) {
        replyInput.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                submitAnswer();
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

    // 8. Delete Answer
    async function deleteAnswer(answerId, cardEl) {
        try {
            const res = await fetch(`/answers/${answerId}`, {
                method: "DELETE",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Failed to delete answer");

            cardEl.style.transition = "all 0.3s ease";
            cardEl.style.opacity = "0";
            setTimeout(() => {
                cardEl.remove();
                fetchAnswers();
            }, 300);
        } catch (err) {
            console.error("Error deleting answer:", err);
            alert("Could not delete answer.");
        }
    }

    // 9. Like Question Hero Button
    if (likeQuestionBtn) {
        likeQuestionBtn.addEventListener("click", async () => {
            if (!currentUser) {
                showAuthPrompt("Please sign in with GitHub to upvote questions.");
                return;
            }
            try {
                const res = await fetch(`/questions/${questionId}/like`, {
                    method: "POST",
                    credentials: "include"
                });
                if (!res.ok) throw new Error("Like failed");
                const data = await res.json();

                const icon = likeQuestionBtn.querySelector("i");
                if (data.isLiked) {
                    likeQuestionBtn.classList.add("liked");
                    icon.className = "fa-solid fa-heart";
                } else {
                    likeQuestionBtn.classList.remove("liked");
                    icon.className = "fa-regular fa-heart";
                }
                if (questionLikesCount) questionLikesCount.textContent = data.likes;
            } catch (err) {
                console.error("Error liking question:", err);
            }
        });
    }

    // 10. Share Question Link Button
    if (shareQuestionBtn) {
        shareQuestionBtn.addEventListener("click", () => {
            const shareUrl = window.location.href;
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast("Question link copied to clipboard!");
            }).catch(() => {
                prompt("Copy this link:", shareUrl);
            });
        });
    }

    // 11. Delete Question Hero Button
    if (deleteQuestionBtn) {
        deleteQuestionBtn.addEventListener("click", async () => {
            const isOwner = questionData && questionData.isOwner;
            const confirmMsg = !isOwner ? "Admin Action: Permanently delete this question and all replies?" : "Are you sure you want to delete this question? This cannot be undone.";
            if (confirm(confirmMsg)) {
                try {
                    const res = await fetch(`/questions/${questionId}`, {
                        method: "DELETE",
                        credentials: "include"
                    });
                    if (!res.ok) throw new Error("Failed to delete question");
                    alert("Question deleted.");
                    window.location.href = "dashboard.html";
                } catch (err) {
                    console.error("Error deleting question:", err);
                    alert("Failed to delete question.");
                }
            }
        });
    }

    // Admin Pin Hero Button
    const pinQuestionBtn = document.getElementById("pinQuestionBtn");
    if (pinQuestionBtn) {
        pinQuestionBtn.addEventListener("click", async () => {
            try {
                const res = await fetch(`/api/admin/questions/${questionId}/pin`, {
                    method: "POST",
                    credentials: "include"
                });
                if (!res.ok) throw new Error("Failed to toggle pin");
                const data = await res.json();
                showToast(data.message || "Pin updated");
                await fetchQuestionDetails();
            } catch (err) {
                alert(err.message || "Error toggling pin");
            }
        });
    }

    // Admin Lock Hero Button
    const lockQuestionBtn = document.getElementById("lockQuestionBtn");
    if (lockQuestionBtn) {
        lockQuestionBtn.addEventListener("click", async () => {
            try {
                const res = await fetch(`/api/admin/questions/${questionId}/lock`, {
                    method: "POST",
                    credentials: "include"
                });
                if (!res.ok) throw new Error("Failed to toggle lock");
                const data = await res.json();
                showToast(data.message || "Lock updated");
                await fetchQuestionDetails();
            } catch (err) {
                alert(err.message || "Error toggling lock");
            }
        });
    }

    // Edit Question Modal
    const editQuestionModalEl = document.getElementById("editQuestionModal");
    let editQuestionModalInstance = null;
    if (editQuestionModalEl && window.bootstrap) {
        editQuestionModalInstance = new bootstrap.Modal(editQuestionModalEl);
    }

    const editQuestionBtn = document.getElementById("editQuestionBtn");
    if (editQuestionBtn) {
        editQuestionBtn.addEventListener("click", () => {
            const idInput = document.getElementById("editQuestionId");
            const textInput = document.getElementById("editQuestionText");
            const tagsInput = document.getElementById("editQuestionTags");
            if (idInput) idInput.value = questionId;
            if (textInput && questionData) textInput.value = questionData.questionText || "";
            if (tagsInput && questionData) tagsInput.value = (questionData.tags || []).join(", ");
            if (editQuestionModalInstance) editQuestionModalInstance.show();
        });
    }

    const saveEditQuestionBtn = document.getElementById("saveEditQuestionBtn");
    if (saveEditQuestionBtn) {
        saveEditQuestionBtn.addEventListener("click", async () => {
            const textInput = document.getElementById("editQuestionText");
            const tagsInput = document.getElementById("editQuestionTags");
            if (!textInput || !textInput.value.trim()) {
                alert("Question text is required.");
                return;
            }
            try {
                saveEditQuestionBtn.disabled = true;
                const res = await fetch(`/questions/${questionId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        questionText: textInput.value.trim(),
                        tags: tagsInput ? tagsInput.value.trim() : ""
                    })
                });
                if (!res.ok) throw new Error("Failed to update question");
                if (editQuestionModalInstance) editQuestionModalInstance.hide();
                showToast("Question updated successfully!");
                await fetchQuestionDetails();
            } catch (e) {
                alert(e.message || "Error updating question");
            } finally {
                saveEditQuestionBtn.disabled = false;
            }
        });
    }

    // Edit Answer Modal
    const editAnswerModalEl = document.getElementById("editAnswerModal");
    let editAnswerModalInstance = null;
    if (editAnswerModalEl && window.bootstrap) {
        editAnswerModalInstance = new bootstrap.Modal(editAnswerModalEl);
    }

    function openEditAnswerModal(ansId, ansText) {
        const idInput = document.getElementById("editAnswerId");
        const textInput = document.getElementById("editAnswerText");
        if (idInput) idInput.value = ansId;
        if (textInput) textInput.value = ansText || "";
        if (editAnswerModalInstance) editAnswerModalInstance.show();
    }

    const saveEditAnswerBtn = document.getElementById("saveEditAnswerBtn");
    if (saveEditAnswerBtn) {
        saveEditAnswerBtn.addEventListener("click", async () => {
            const idInput = document.getElementById("editAnswerId");
            const textInput = document.getElementById("editAnswerText");
            if (!textInput || !textInput.value.trim()) {
                alert("Answer text is required.");
                return;
            }
            try {
                saveEditAnswerBtn.disabled = true;
                const res = await fetch(`/answers/${idInput.value}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ answerText: textInput.value.trim() })
                });
                if (!res.ok) throw new Error("Failed to update answer");
                if (editAnswerModalInstance) editAnswerModalInstance.hide();
                showToast("Answer updated successfully!");
                await fetchAnswers();
            } catch (e) {
                alert(e.message || "Error updating answer");
            } finally {
                saveEditAnswerBtn.disabled = false;
            }
        });
    }

    // 12. Logout Button in Dropdown
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to sign out?")) return;
            try {
                const res = await fetch("/logout", { method: "POST", credentials: "include" });
                const data = await res.json();
                window.location.href = data.redirectUrl || "/login.html";
            } catch (err) {
                console.error("Logout error:", err);
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
        const hint = document.getElementById("avatarLightboxHint");
        if (!lightbox || !img) return;

        img.src = imgSrc;
        img.classList.remove("is-zoomed");
        if (hint) {
            hint.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus me-1"></i>Click picture to zoom in';
        }
        if (caption) {
            if (username && username.trim() !== "" && username !== "Avatar") {
                caption.textContent = username.startsWith("@") ? username : `@${username}`;
                caption.style.display = "block";
            } else {
                caption.style.display = "none";
            }
        }
        lightbox.style.display = "flex";
        document.body.classList.add("lightbox-open");
    }

    function closeAvatarLightbox() {
        const lightbox = document.getElementById("avatarLightbox");
        const img = document.getElementById("avatarLightboxImg");
        if (img) img.classList.remove("is-zoomed");
        if (lightbox) {
            lightbox.style.display = "none";
            document.body.classList.remove("lightbox-open");
        }
    }

    function setupAvatarLightbox() {
        const lightbox = document.getElementById("avatarLightbox");
        const closeBtn = document.getElementById("avatarLightboxClose");

        if (lightbox) {
            lightbox.addEventListener("click", (e) => {
                const img = document.getElementById("avatarLightboxImg");
                const hint = document.getElementById("avatarLightboxHint");
                const caption = document.getElementById("avatarLightboxCaption");

                // Toggle zoom only on the picture itself
                if (e.target === img) {
                    img.classList.toggle("is-zoomed");
                    if (hint) {
                        const isZoomed = img.classList.contains("is-zoomed");
                        hint.innerHTML = isZoomed
                            ? '<i class="fa-solid fa-magnifying-glass-minus me-1"></i>Click picture to zoom out'
                            : '<i class="fa-solid fa-magnifying-glass-plus me-1"></i>Click picture to zoom in';
                    }
                    return;
                }

                // If clicked outside caption or hint, close lightbox
                if (e.target !== caption && e.target !== hint) {
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

        // Delegate clicks on any avatar image in question details & answers
        document.addEventListener("click", (e) => {
            const avatar = e.target.closest("img.author-avatar, img#headerUserAvatar, img.answer-avatar, img.user-avatar-sm");
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

                if (data.type === "new_answer" && String(data.payload.questionId) === String(questionId)) {
                    // Another user posted an answer to this question!
                    fetchAnswers();
                    showToast("A new answer was just posted!");
                } else if (data.type === "answer_deleted" && String(data.payload.questionId) === String(questionId)) {
                    // An answer was deleted
                    fetchAnswers();
                } else if (data.type === "answer_liked" && String(data.payload.questionId) === String(questionId)) {
                    // Update like counter on the specific answer card
                    const btn = document.querySelector(`.btn-like-answer[data-answer-id="${data.payload.answerId}"]`);
                    if (btn) {
                        const countSpan = btn.querySelector(".ans-like-count");
                        if (countSpan) countSpan.textContent = data.payload.likes;
                    }
                } else if (data.type === "question_liked" && String(data.payload.questionId) === String(questionId)) {
                    if (questionLikesCount) questionLikesCount.textContent = data.payload.likes;
                } else if (data.type === "question_solved" && String(data.payload.questionId) === String(questionId)) {
                    if (questionSolvedBadge) {
                        questionSolvedBadge.style.display = data.payload.isSolved ? "inline-flex" : "none";
                    }
                } else if (data.type === "question_deleted" && String(data.payload.questionId) === String(questionId)) {
                    alert("This question was deleted.");
                    window.location.href = "dashboard.html";
                } else if ((data.type === "question_pinned" || data.type === "question_locked" || data.type === "question_updated") && String(data.payload.questionId || data.payload.question?._id) === String(questionId)) {
                    fetchQuestionDetails();
                } else if (data.type === "answer_updated" && String(data.payload.questionId) === String(questionId)) {
                    fetchAnswers();
                }
            } catch (e) {
                // Ignore ping or malformed event
            }
        };

        // Fallback sync: check every 25 seconds if tab is active
        setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchAnswers();
            }
        }, 25000);
    }

    // Initial Execution
    setupAvatarLightbox();
    await checkAuthStatus();
    const loaded = await fetchQuestionDetails();
    if (loaded) {
        await fetchAnswers();
    }
    setupRealtimeSync();
});
