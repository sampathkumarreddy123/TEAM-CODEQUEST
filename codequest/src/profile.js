document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("userId"); // ✅ Get userId from URL correctly

    if (userId) {
        // ✅ Fetch and display the clicked user's profile
        fetchUserProfile(userId);
    } else {
        // ✅ Fetch and display logged-in user's own profile
        fetchOwnProfile();
    }
});

// ✅ Fetch logged-in user's own profile
async function fetchOwnProfile() {
    try {
        const response = await fetch("/profile", { credentials: "include" });

        if (!response.ok) {
            console.error("❌ Failed to fetch profile");
            return;
        }

        const profile = await response.json();
        displayProfile(profile);
    } catch (error) {
        console.error("❌ Error fetching profile:", error);
    }
}

// ✅ Fetch another user's profile (from clicked avatar)
async function fetchUserProfile(userId) {
    try {
        const response = await fetch(`/users/${userId}`); // ✅ Now using correct userId

        if (!response.ok) {
            console.error("❌ Failed to fetch user profile");
            return;
        }

        const userProfile = await response.json();
        displayProfile(userProfile);
    } catch (error) {
        console.error("❌ Error fetching user profile:", error);
    }
}

// ✅ Display profile data
function displayProfile(profile) {
    console.log("📌 Profile Data:", profile);
    
    const profileAvatar = document.getElementById("profileAvatar");
    const profileUsername = document.getElementById("profileUsername");

    if (!profileAvatar || !profileUsername) {
        console.error("❌ Profile elements not found");
        return;
    }

    // ✅ Fallback avatar and username if data is missing
    profileAvatar.src = profile.avatarUrl || "https://via.placeholder.com/100";
    profileUsername.textContent = profile.username || "Unknown User";
}

// ✅ Back button redirects to home page
document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "/index.html";
});


