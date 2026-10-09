document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("userId");

    // Elements
    const profileAvatar = document.getElementById("profileAvatar");
    const profileUsername = document.getElementById("profileUsername");
    const profileJoinDate = document.getElementById("profileJoinDate");
    const profileRoleBadge = document.getElementById("profileRoleBadge");
    const profileAdminBadge = document.getElementById("profileAdminBadge");
    const statQuestionsCount = document.getElementById("statQuestionsCount");
    const statAnswersCount = document.getElementById("statAnswersCount");
    const tabQuestionsBtn = document.getElementById("tabQuestionsBtn");
    const tabAnswersBtn = document.getElementById("tabAnswersBtn");
    const tabQuestionsCount = document.getElementById("tabQuestionsCount");
    const tabAnswersCount = document.getElementById("tabAnswersCount");
    const userActivityContainer = document.getElementById("userActivityContainer") || document.getElementById("userQuestionsContainer");
    const backBtn = document.getElementById("backBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    let currentProfile = null;
    let activeTab = "questions";

    // Back button
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });
    }

    // Working Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to sign out?")) return;
            try {
                const res = await fetch("/logout", {
                    method: "POST",
                    credentials: "include"
                });
                const data = await res.json();
                window.location.href = data.redirectUrl || "/login.html";
            } catch (err) {
                console.error("Logout error:", err);
                window.location.href = "/login.html";
            }
        });
    }

    // Tab buttons
    if (tabQuestionsBtn) {
        tabQuestionsBtn.addEventListener("click", () => {
            activeTab = "questions";
            tabQuestionsBtn.classList.add("active");
            if (tabAnswersBtn) tabAnswersBtn.classList.remove("active");
            renderCurrentActivity();
        });
    }

    if (tabAnswersBtn) {
        tabAnswersBtn.addEventListener("click", () => {
            activeTab = "answers";
            tabAnswersBtn.classList.add("active");
            if (tabQuestionsBtn) tabQuestionsBtn.classList.remove("active");
            renderCurrentActivity();
        });
    }

    if (userId) {
        // Fetch another user's profile
        await fetchUserProfile(userId);
    } else {
        // Fetch own profile
        await fetchOwnProfile();
    }

    // 1. Fetch Logged-in User's Profile
    async function fetchOwnProfile() {
        try {
            const response = await fetch("/profile", { credentials: "include" });

            if (response.status === 401) {
                // Not authenticated
                window.location.href = "/login.html";
                return;
            }

            if (!response.ok) throw new Error("Failed to load profile");

            const profile = await response.json();
            currentProfile = profile;
            displayProfile(profile, true);
        } catch (error) {
            console.error("Error fetching own profile:", error);
            showErrorState("Could not load your profile. Please check if you are logged in.");
        }
    }

    // 2. Fetch Another User's Profile
    async function fetchUserProfile(id) {
        try {
            const response = await fetch(`/users/${id}`, { credentials: "include" });

            if (!response.ok) throw new Error("Failed to load user profile");

            const profile = await response.json();
            currentProfile = profile;
            displayProfile(profile, false);
        } catch (error) {
            console.error("Error fetching user profile:", error);
            showErrorState("User not found or database is unreachable.");
        }
    }

    // 3. Display Profile Data
    function displayProfile(profile, isOwn) {
        if (profileAvatar) {
            profileAvatar.src = profile.avatarUrl || "default-avatar.png";
        }
        if (profileUsername) {
            profileUsername.textContent = profile.username || "Anonymous";
        }
        if (profileRoleBadge) {
            profileRoleBadge.textContent = isOwn ? "You (Owner)" : "Community Member";
        }
        if (profileAdminBadge) {
            profileAdminBadge.style.display = profile.isAdmin ? "inline-flex" : "none";
        }
        if (profileJoinDate) {
            const joined = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "Recently";
            profileJoinDate.textContent = `Member since ${joined}`;
        }
        
        const qCount = profile.questionsCount ?? (profile.questions ? profile.questions.length : 0);
        const aCount = profile.answersCount ?? (profile.answers ? profile.answers.length : 0);

        if (statQuestionsCount) statQuestionsCount.textContent = qCount;
        if (statAnswersCount) statAnswersCount.textContent = aCount;
        if (tabQuestionsCount) tabQuestionsCount.textContent = qCount;
        if (tabAnswersCount) tabAnswersCount.textContent = aCount;

        const profileInHuddleBadge = document.getElementById("profileInHuddleBadge");
        if (profileInHuddleBadge) {
            profileInHuddleBadge.style.display = profile.inCall ? "inline-flex" : "none";
        }

        // 1-on-1 Call Action Button (only visible when viewing another user's profile)
        const callWrap = document.getElementById("profileCallActionWrap");
        const callBtn = document.getElementById("btnCallProfileUser");
        if (callWrap && callBtn) {
            if (!isOwn) {
                callWrap.style.display = "inline-flex";
                if (profile.inCall) {
                    callBtn.classList.add("btn-in-call");
                    callBtn.innerHTML = `<i class="fa-solid fa-headset me-2"></i><span>In Huddle (Call)</span>`;
                    callBtn.title = `${profile.username} is currently in a live 1-on-1 Huddle. Click to call.`;
                } else {
                    callBtn.classList.remove("btn-in-call");
                    callBtn.innerHTML = `<i class="fa-solid fa-phone me-2"></i><span>Live 1-on-1 Call</span>`;
                    callBtn.title = `Start Live 1-on-1 Call with this developer`;
                }
                callBtn.onclick = (e) => {
                    e.preventDefault();
                    if (window.CodeQuestPro && typeof window.CodeQuestPro.startCallWithUser === "function") {
                        window.CodeQuestPro.startCallWithUser({
                            targetUserId: profile._id,
                            targetUsername: profile.username,
                            targetAvatarUrl: profile.avatarUrl
                        });
                    } else {
                        window.location.href = `/collab.html?targetUser=${encodeURIComponent(profile.username || "")}`;
                    }
                };
            } else {
                callWrap.style.display = "none";
            }
        }

        const usernameText = profile.username || "User";
        document.title = `${usernameText}'s Profile - CodeQuest`;

        // Render Quest Gamification (Level, XP, & Achievements Showcase)
        if (profile.gamification && window.CodeQuestPro && window.CodeQuestPro.renderQuestGamification) {
            const gamificationContainer = document.getElementById("questGamificationContainer");
            window.CodeQuestPro.renderQuestGamification(profile.gamification, gamificationContainer);
        }

        // Render initial activity
        renderCurrentActivity();
    }

    // 4. Render Current Activity (Questions or Answers)
    function renderCurrentActivity() {
        if (!currentProfile || !userActivityContainer) return;

        if (activeTab === "questions") {
            const questions = currentProfile.questions || [];
            if (!questions.length) {
                userActivityContainer.innerHTML = `
                    <div class="empty-activity">
                        <i class="fa-regular fa-folder-open"></i>
                        <h4>No questions posted yet</h4>
                        <p>This user hasn't asked any questions in the community yet.</p>
                    </div>
                `;
                return;
            }

            userActivityContainer.innerHTML = "";
            questions.forEach((q) => {
                const dateObj = new Date(q.createdAt);
                const dateStr = dateObj.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }) + " at " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const item = document.createElement("a");
                item.className = "activity-item";
                item.href = `messageDetails.html?questionId=${q._id}`;
                item.innerHTML = `
                    <div class="activity-item-content">
                        <div class="activity-item-text">${escapeHtml(q.questionText)}</div>
                        <div class="activity-item-date"><i class="fa-regular fa-calendar-days me-1"></i> Asked on ${dateStr}</div>
                    </div>
                    <div class="activity-item-arrow">
                        <i class="fa-solid fa-chevron-right"></i>
                    </div>
                `;

                item.addEventListener("click", () => {
                    sessionStorage.setItem("selectedQuestionId", q._id);
                    sessionStorage.setItem("selectedQuestionText", q.questionText);
                });

                userActivityContainer.appendChild(item);
            });
        } else {
            // Answers tab
            const answers = currentProfile.answers || [];
            if (!answers.length) {
                userActivityContainer.innerHTML = `
                    <div class="empty-activity">
                        <i class="fa-regular fa-comments"></i>
                        <h4>No answers provided yet</h4>
                        <p>This user hasn't answered any questions in the community yet.</p>
                    </div>
                `;
                return;
            }

            userActivityContainer.innerHTML = "";
            answers.forEach((ans) => {
                const dateObj = new Date(ans.createdAt);
                const dateStr = dateObj.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }) + " at " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const qId = ans.questionId?._id || ans.questionId;
                const qText = ans.questionId?.questionText || "Question thread";
                const ansLikes = ans.likes || 0;

                const item = document.createElement("a");
                item.className = "activity-item";
                item.href = `messageDetails.html?questionId=${qId}`;
                item.innerHTML = `
                    <div class="activity-item-content">
                        <div class="activity-item-badge">
                            <i class="fa-solid fa-reply me-1 text-primary"></i> Answered: "${escapeHtml(qText.slice(0, 75))}${qText.length > 75 ? "..." : ""}"
                        </div>
                        <div class="activity-item-text">${escapeHtml(ans.answerText.slice(0, 160))}${ans.answerText.length > 160 ? "..." : ""}</div>
                        <div class="activity-item-date">
                            <i class="fa-regular fa-clock me-1"></i> ${dateStr}
                            ${ansLikes > 0 ? `<span class="ms-2 text-danger"><i class="fa-solid fa-heart me-1"></i>${ansLikes} upvotes</span>` : ""}
                        </div>
                    </div>
                    <div class="activity-item-arrow">
                        <i class="fa-solid fa-chevron-right"></i>
                    </div>
                `;

                item.addEventListener("click", () => {
                    sessionStorage.setItem("selectedQuestionId", qId);
                });

                userActivityContainer.appendChild(item);
            });
        }
    }

    function showErrorState(msg) {
        if (userActivityContainer) {
            userActivityContainer.innerHTML = `
                <div class="empty-activity text-danger">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <h4>Error</h4>
                    <p>${escapeHtml(msg)}</p>
                    <a href="dashboard.html" class="btn btn-primary-cq mt-3">Back to Dashboard</a>
                </div>
            `;
        }
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

        // Delegate clicks on any avatar image in profile page
        document.addEventListener("click", (e) => {
            const avatar = e.target.closest("img.profile-avatar, img#profileAvatar, img#headerUserAvatar, img.user-avatar-sm");
            if (avatar && avatar.id !== "avatarLightboxImg") {
                e.preventDefault();
                e.stopPropagation();
                const username = avatar.dataset.username || avatar.alt || "";
                openAvatarLightbox(avatar.src, username);
            }
        });
    }

    // Initialize lightbox
    setupAvatarLightbox();
});
