

document.addEventListener("DOMContentLoaded", async function () {
    const API_URL = "http://localhost:3000";

    const selectedMessage = document.getElementById("selected-message");
    const answersContainer = document.querySelector(".answers-container");
    const replyInput = document.getElementById("reply");
    const sendReplyButton = document.getElementById("sendReply");

    // ✅ Retrieve selected question from sessionStorage
    const questionId = sessionStorage.getItem("selectedQuestionId");
    const questionText = sessionStorage.getItem("selectedQuestionText");

    if (!questionId || !questionText) {
        selectedMessage.textContent = "❌ Invalid Question";
        answersContainer.innerHTML = "<p style='color: red;'>Question data missing.</p>";
        return;
    }

    selectedMessage.textContent = questionText; // ✅ Display the selected question

    // ✅ Fetch and display answers
    async function fetchAnswers() {
        try {
            console.log(`🚀 Fetching answers from: ${API_URL}/answers/${questionId}`);
    
            const response = await fetch(`${API_URL}/answers/${questionId}`, {
                credentials: "include",
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
    
            const answers = await response.json();
            console.log("✅ Received answers:", answers);  // Log answers received
            renderAnswers(answers);
        } catch (error) {
            console.error("❌ Error fetching answers:", error);
            answersContainer.innerHTML = "<p style='color: red;'>Error loading answers</p>";
        }
    }
    

    function renderAnswers(answers) {
        answersContainer.innerHTML = "";
    
        if (!answers.length) {
            console.log("ℹ️ No answers found for this question.");
            answersContainer.innerHTML = "<p>No answers yet.</p>";
            return;
        }
    
        answers.forEach((answer) => {
            console.log("📝 Rendering answer:", answer);
            
            // Ensure userId exists before accessing properties
            const username = answer.userId?.username || "Anonymous";
            const avatarUrl = answer.userId?.avatarUrl || "default-avatar.png";
    
            const answerDiv = document.createElement("div");
            answerDiv.className = "answer";
            answerDiv.innerHTML = `
                <p><strong>${username}:</strong> ${answer.answerText}</p>
                <img src="${avatarUrl}" alt="Avatar" width="30">
            `;
            answersContainer.appendChild(answerDiv);
        });
    }
    

    // ✅ Post an answer
    sendReplyButton.addEventListener("click", async function () {
        const userReply = replyInput.value.trim();
        if (!userReply) return;

        try {
            const response = await fetch(`${API_URL}/answers/${questionId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", 
                body: JSON.stringify({ answerText: userReply }),
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

