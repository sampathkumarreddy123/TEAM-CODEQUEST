
document.addEventListener("DOMContentLoaded", function () {
    const API_URL = "http://localhost:3000";

    const searchInput = document.getElementById("search");
    const plusButton = document.querySelector(".plus-icon");
    const messagesContainer = document.querySelector(".messages-container");
    const logoutBtn = document.getElementById("logoutBtn");

    // ✅ Fetch and display all questions
    function fetchQuestions() {
        fetch('/questions', {
            method: 'GET',
            credentials: 'include' // Ensure cookies are sent with the request
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
        .then(data => displayQuestions(data))
        .catch(error => console.error('❌ Error fetching questions:', error));
    }

    // ✅ Display fetched questions
    function displayQuestions(questions) {
        messagesContainer.innerHTML = "";
        if (!questions.length) {
            messagesContainer.innerHTML = "<p>No questions found.</p>";
            return;
        }

        questions.forEach((question) => {
            const questionDiv = document.createElement("div");
            questionDiv.classList.add("message");
            questionDiv.textContent = question.questionText;

            // ✅ Store question ID in sessionStorage and navigate to details page
            questionDiv.addEventListener("click", function () {
                sessionStorage.setItem("selectedQuestionId", question._id);
                sessionStorage.setItem("selectedQuestionText", question.questionText);
                window.location.href = "messageDetails.html";
            });

            messagesContainer.appendChild(questionDiv);
        });
    }

    // ✅ Post a new question
    if (plusButton) {
        plusButton.addEventListener("click", async function () {
            const userInput = searchInput.value.trim();
            if (!userInput) return;

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
            try {
                const response = await fetch("/logout", {
                    method: "POST",
                    credentials: "include" // Send cookies with the request
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Logout failed");
                }

                // ✅ After logout, redirect to GitHub authentication
                window.location.href = "/auth/github";
            } catch (error) {
                console.error("❌ Error logging out:", error);
            }
        });
    }

    fetchQuestions();
});

