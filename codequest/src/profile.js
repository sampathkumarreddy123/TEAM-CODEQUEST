
document.addEventListener("DOMContentLoaded", async () => {
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
});

function displayProfile(profile) {
    console.log(profile)
    const profileAvatar = document.getElementById("profileAvatar");
    const profileUsername = document.getElementById("profileUsername");

    if (!profileAvatar || !profileUsername) {
        console.error("❌ Profile elements not found");
        return;
    }

    // Fallback avatar and username if GitHub data is missing
    profileAvatar.src = profile.avatarUrl || "https://via.placeholder.com/100";
    profileUsername.textContent = profile.username || "Unknown User";
}

document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "/index.html";
});
