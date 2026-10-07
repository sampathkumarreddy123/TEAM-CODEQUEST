document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("userId");

    // Elements
    const profileAvatar = document.getElementById("profileAvatar");
    const profileUsername = document.getElementById("profileUsername");
    const profileJoinDate = document.getElementById("profileJoinDate");
    const profileRoleBadge = document.getElementById("profileRoleBadge");
    const statQuestionsCount = document.getElementById("statQuestionsCount");
    const statAnswersCount = document.getElementById("statAnswersCount");
    const activityTitle = document.getElementById("activityTitle");
    const activityCountBadge = document.getElementById("activityCountBadge");
    const userQuestionsContainer = document.getElementById("userQuestionsContainer");
    const backBtn = document.getElementById("backBtn");
    const logoutBtn = document.getElementById("logoutBtn");

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
        if (profileJoinDate) {
            const joined = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "Recently";
            profileJoinDate.textContent = `Member since ${joined}`;
        }
        if (statQuestionsCount) {
            statQuestionsCount.textContent = profile.questionsCount ?? (profile.questions ? profile.questions.length : 0);
        }
        if (statAnswersCount) {
            statAnswersCount.textContent = profile.answersCount ?? 0;
        }

        const usernameText = profile.username || "User";
        if (activityTitle) {
            activityTitle.textContent = isOwn ? "Your Questions" : `Questions by ${usernameText}`;
        }

        document.title = `${usernameText}'s Profile - CodeQuest`;

        // Render questions
        renderUserQuestions(profile.questions || []);
    }

    // 4. Render User's Questions List
    function renderUserQuestions(questions) {
        if (!userQuestionsContainer) return;

        if (activityCountBadge) {
            activityCountBadge.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
        }

        if (!questions.length) {
            userQuestionsContainer.innerHTML = `
                <div class="empty-activity">
                    <i class="fa-regular fa-folder-open"></i>
                    <h4>No questions posted yet</h4>
                    <p>This user hasn't asked any questions in the community yet.</p>
                </div>
            `;
            return;
        }

        userQuestionsContainer.innerHTML = "";

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

            userQuestionsContainer.appendChild(item);
        });
    }

    function showErrorState(msg) {
        if (userQuestionsContainer) {
            userQuestionsContainer.innerHTML = `
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

