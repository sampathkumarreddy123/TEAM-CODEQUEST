
document.addEventListener("DOMContentLoaded", async function () {
    const API_URL = "http://localhost:3000";

    const selectedMessage = document.getElementById("selected-message");
    const answersContainer = document.querySelector(".answers-container");
    const noAnswersText = document.getElementById("no-answers");
    const replyInput = document.getElementById("reply");
    const sendReplyButton = document.getElementById("sendReply");

    // ✅ Retrieve selected question from sessionStorage
    const questionId = sessionStorage.getItem("selectedQuestionId");
    const questionText = sessionStorage.getItem("selectedQuestionText");

    if (!questionId || !questionText) {
        selectedMessage.textContent = "❌ Invalid Question";
        noAnswersText.textContent = "Question data missing.";
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
            console.log("✅ Received answers:", answers);  
            renderAnswers(answers);
        } catch (error) {
            console.error("❌ Error fetching answers:", error);
            noAnswersText.textContent = "Error loading answers";
        }
    }

    function renderAnswers(answers) {
        answersContainer.innerHTML = ""; // Clear previous content
    
        if (!answers.length) {
            noAnswersText.style.display = "block"; // Show "No answers yet."
            return;
        }
    
        noAnswersText.style.display = "none"; // Hide "No answers yet."
    
        answers.forEach((answer) => {
            console.log("📝 Rendering answer:", answer);
    
            const userId = answer.userId?._id; // Get the user's ID
            const username = answer.userId?.username || "Anonymous";
            const avatarUrl = answer.userId?.avatarUrl || "default-avatar.png";
            const postedTime = new Date(answer.createdAt).toLocaleString();
    
            // ✅ Create answer div
            const answerDiv = document.createElement("div");
            answerDiv.className = "answer p-3 border mb-2 bg-white";
    
            // ✅ Create avatar link
            const profileLink = document.createElement("a");
            profileLink.href = `/profile.html?userId=${userId}`; // ✅ Pass userId correctly
    
            // ✅ Create avatar image
            const avatarImg = document.createElement("img");
            avatarImg.src = avatarUrl;
            avatarImg.alt = "Avatar";
            avatarImg.width = 30;
            avatarImg.id = "userProfile";
    
            profileLink.appendChild(avatarImg); // Wrap avatar with profile link
    
            // ✅ Create user info container
            const userInfo = document.createElement("div");
            userInfo.appendChild(profileLink); // ✅ Use the profile link for avatar
    
            // ✅ Create username text
            const usernameText = document.createElement("strong");
            usernameText.id = "userName";
            usernameText.textContent = username;
            userInfo.appendChild(usernameText);
    
            // ✅ Create answer text
            const answerText = document.createElement("p");
            answerText.textContent = answer.answerText;
    
            // ✅ Create posted time
            const postedTimeText = document.createElement("small");
            postedTimeText.textContent = `Posted on: ${postedTime}`;
            postedTimeText.id = "postedTime";
    
            // ✅ Append all elements
            answerDiv.appendChild(userInfo);
            answerDiv.appendChild(answerText);
            answerDiv.appendChild(postedTimeText);
    
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
