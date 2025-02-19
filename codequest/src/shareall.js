
document.addEventListener("DOMContentLoaded", function () {
    const API_URL = "http://localhost:3000";

    const searchInput = document.getElementById("search");
    const plusButton = document.querySelector(".plus-icon");
    const messagesContainer = document.querySelector(".messages-container");
    const clearButton = document.getElementById("clearButton");

    // ✅ Fetch and display all questions
    async function fetchQuestions() {
        try {
            console.log("🚀 Fetching questions...");
            const response = await fetch(`${API_URL}/questions`);

            if (!response.ok) throw new Error("Failed to fetch questions");

            const questions = await response.json();
            console.log("✅ Questions fetched:", questions);
            displayMessages(questions);
        } catch (error) {
            console.error("❌ Error fetching questions:", error);
            messagesContainer.innerHTML = "<p style='color: red;'>Failed to load questions</p>";
        }
    }

    // ✅ Display fetched questions
    function displayMessages(questions) {
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

    // ✅ Clear all questions
    // if (clearButton) {
    //     clearButton.addEventListener("click", async function () {
    //         try {
    //             console.log("🚀 Clearing all questions...");
    //             const response = await fetch(`${API_URL}/clear-questions`, { method: "DELETE" });

    //             if (!response.ok) throw new Error("Failed to clear questions");

    //             fetchQuestions(); // Refresh after clearing
    //         } catch (error) {
    //             console.error("❌ Error clearing questions:", error);
    //         }
    //     });
    // }

    // ✅ Load questions on page load
    fetchQuestions();
});




