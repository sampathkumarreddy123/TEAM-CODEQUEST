
document.addEventListener("DOMContentLoaded", function () {
    const API_URL = "http://localhost:3000";

    const searchInput = document.getElementById("search");
    const plusButton = document.querySelector(".plus-icon");
    const messagesContainer = document.querySelector(".messages-container");
    const logoutBtn = document.getElementById("logoutBtn");
    const profileIcon = document.getElementById("profile");

    // ✅ Redirect to profile page when profile icon is clicked
    if (profileIcon) {
        profileIcon.addEventListener("click", () => {
            window.location.href = "/profile.html";
        });
    }

    // ✅ Check login status and display username
    async function checkAuthStatus() {
        try {
            const response = await fetch("/auth/status", {
                method: "GET",
                credentials: "include",
                cache: "no-cache"
            });

            if (!response.ok) throw new Error("Failed to check auth status");

            const data = await response.json();

            if (data.loggedIn) {
                console.log("✅ Logged in as:", data.username);
                profileIcon.style.display = "block"; // Show profile icon
            } else {
                console.log("❌ Not logged in");
                profileIcon.style.display = "none"; // Hide profile icon
                window.location.href = "/auth/github"; // Redirect to login
            }
        } catch (error) {
            console.error("❌ Error checking auth status:", error);
        }
    }

    // ✅ Fetch and display all questions
    async function fetchQuestions() {
        try {
            const response = await fetch(`${API_URL}/questions`, {
                method: "GET",
                credentials: "include"
            });

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

            const data = await response.json();
            displayQuestions(data);
        } catch (error) {
            console.error("❌ Error fetching questions:", error);
        }
    }

function displayQuestions(questions) {
    messagesContainer.innerHTML = "";
    if (!questions.length) {
        const noQuestionsMsg = document.createElement("p");
        noQuestionsMsg.textContent = "No questions found.";
        messagesContainer.appendChild(noQuestionsMsg);
        return;
    }

    questions.forEach((question) => {
        const questionDiv = document.createElement("div");
        questionDiv.classList.add("message");

        // ✅ User avatar
        const avatarImg = document.createElement("img");
        avatarImg.src = question.userId?.avatarUrl || "default-avatar.png"; // Default avatar if none exists
        avatarImg.alt = "User Avatar";
        avatarImg.classList.add("user-avatar");

        // ✅ Redirect to user's profile when avatar is clicked
        avatarImg.addEventListener("click", function (event) {
            event.stopPropagation(); // Prevent triggering the question click event
            if (question.userId?._id) {
                window.location.href = `/profile.html?userId=${question.userId._id}`;
            } else {
                console.error("❌ No user ID found for this question.");
            }
        });

        // ✅ Question text
        const questionText = document.createElement("p");
        questionText.textContent = question.questionText;
        questionText.classList.add("question-text");

        // ✅ Posted time
        const postedTime = document.createElement("p");
        postedTime.textContent = "Posted on: " + new Date(question.createdAt).toLocaleString();
        postedTime.id = "posted-time";

        // ✅ Append elements inside questionDiv
        questionDiv.appendChild(avatarImg);
        questionDiv.appendChild(questionText);
        questionDiv.appendChild(postedTime);

        // ✅ Store selected question in sessionStorage before navigating
        questionDiv.addEventListener("click", function () {
            sessionStorage.setItem("selectedQuestionId", question._id);
            sessionStorage.setItem("selectedQuestionText", question.questionText);
            window.location.href = "messageDetails.html";
        });

        messagesContainer.appendChild(questionDiv);
    });
}


    if (plusButton) {
        plusButton.addEventListener("click", async function () {
            const userInput = searchInput.value.trim();
            if (!userInput) return;
    
            // Check if user is authenticated before posting
            const authResponse = await fetch("/auth/status", { method: "GET", credentials: "include" });
            const authData = await authResponse.json();
    
            if (!authData.loggedIn) {
                console.error("❌ User not authenticated. Redirecting to login...");
                window.location.href = "/auth/github";
                return;
            }
    
            try {
                console.log("🚀 Posting question:", userInput);
                const response = await fetch(`${API_URL}/questions`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ questionText: userInput }),
                });
    
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to post question");
                }
    
                searchInput.value = "";
                fetchQuestions(); // Refresh questions
            } catch (error) {
                console.error("❌ Error posting question:", error);
            }
        });
    }
    

    // ✅ Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async function () {
            logoutBtn.disabled = true; // Prevent multiple clicks

            try {
                const response = await fetch("/logout", {
                    method: "POST",
                    credentials: "include",
                    cache: "no-cache"
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Logout failed");
                }

                console.log("✅ Successfully logged out");
                window.location.href = "/auth/github"; // Redirect to GitHub login
            } catch (error) {
                console.error("❌ Error logging out:", error);
                logoutBtn.disabled = false; // Re-enable button if there's an error
            }
        });
    }
    document.addEventListener("click", (event) => {
        if (event.target.classList.contains("profile-icon")) {
            const userId = event.target.dataset.userId; // Assuming userId is stored in data-user-id attribute
            window.location.href = `profile.html?userId=${userId}`;
        }
    });
    
    // ✅ Run authentication check and fetch questions
    checkAuthStatus();
    fetchQuestions();
});
