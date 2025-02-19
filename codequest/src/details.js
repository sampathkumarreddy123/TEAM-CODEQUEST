
document.addEventListener("DOMContentLoaded", async function () {
    const API_URL = "http://localhost:3000";

    const selectedMessage = document.getElementById("selected-message");
    const answersContainer = document.querySelector(".answers-container");
    const replyInput = document.getElementById("reply");
    const sendReplyButton = document.getElementById("sendReply");

    const questionId = sessionStorage.getItem("selectedQuestionId");
    const questionText = sessionStorage.getItem("selectedQuestionText");

    if (!questionId) {
        selectedMessage.textContent = "Invalid Question";
        return;
    }

    // ✅ Display the selected question
    selectedMessage.textContent = questionText;

    // ✅ Fetch and display answers
    async function fetchAnswers() {
        try {
            const response = await fetch(`${API_URL}/answers/${questionId}`);
            if (!response.ok) throw new Error("Failed to fetch answers");

            const answers = await response.json();
            renderAnswers(answers);
        } catch (error) {
            console.error("❌ Error fetching answers:", error);
            answersContainer.innerHTML = "<p style='color: red;'>Error loading answers</p>";
        }
    }

    function renderAnswers(answers) {
        answersContainer.innerHTML = "";
        if (!answers.length) {
            answersContainer.innerHTML = "<p>No answers yet.</p>";
            return;
        }

        answers.forEach((answer) => {
            const answerDiv = document.createElement("div");
            answerDiv.className = "answer";
            answerDiv.textContent = answer.answerText;
            answersContainer.appendChild(answerDiv);
        });
    }

    // ✅ Post an answer
    sendReplyButton.addEventListener("click", async function () {
        const userReply = replyInput.value.trim();
        if (!userReply) return;

        try {
            const response = await fetch(`${API_URL}/answers/${questionId}`, { // ✅ Correct API URL
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answerText: userReply }), // ✅ Send only answerText
            });

            if (!response.ok) throw new Error("Failed to post answer");

            console.log("✅ Answer posted successfully");
            replyInput.value = "";
            fetchAnswers(); // Refresh answers after posting
        } catch (error) {
            console.error("❌ Error posting answer:", error);
        }
    });

    // ✅ Load answers on page load
    fetchAnswers();
});

