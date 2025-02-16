// document.addEventListener("DOMContentLoaded", function () {
//     const plusIcon = document.querySelector(".plus-icon i");
//     const searchInput = document.getElementById("search");
//     const plusButton = document.querySelector(".plus-icon");
//     const messagesContainer = document.querySelector(".messages-container");

//     const messages = JSON.parse(localStorage.getItem("messages")) || [];

//     function displayMessages(filter = "") {
//         messagesContainer.innerHTML = "";
//         const filteredMessages = messages.filter((message) =>
//             message.toLowerCase().includes(filter.toLowerCase())
//         );
//         filteredMessages.forEach((message) => {
//             const messageDiv = document.createElement("div");
//             messageDiv.className = "message";
//             messageDiv.textContent = message;
//             messageDiv.addEventListener("click", function () {
//                 localStorage.setItem("clickedMessage", message);
//                 window.location.href = "messageDetails.html";
//             });
//             messagesContainer.appendChild(messageDiv);
//         });
//     }

//     displayMessages();

//     searchInput.addEventListener("focus", function () {
//         plusIcon.classList.remove("fa-plus");
//         plusIcon.classList.add("fa-share-square-o");
//     });

//     plusButton.addEventListener("click", function () {
//         if (plusIcon.classList.contains("fa-share-square-o")) {
//             const userInput = searchInput.value.trim();
//             if (userInput) {
//                 messages.push(userInput);
//                 localStorage.setItem("messages", JSON.stringify(messages));
//                 displayMessages();
//                 searchInput.value = "";
//                 plusIcon.classList.remove("fa-share-square-o");
//                 plusIcon.classList.add("fa-plus");
//             } else {
//                 alert("Please enter a message before sending.");
//             }
//         }
//     });

//     searchInput.addEventListener("input", function () {
//         displayMessages(searchInput.value);
//     });

//     searchInput.addEventListener("blur", function () {
//         if (!searchInput.value.trim()) {
//             plusIcon.classList.remove("fa-share-square-o");
//             plusIcon.classList.add("fa-plus");
//         }
//     });
// });


// document.addEventListener("DOMContentLoaded", function () {
//     const searchInput = document.getElementById("search");
//     const plusButton = document.querySelector(".plus-icon");
//     const messagesContainer = document.querySelector(".messages-container");

//     async function fetchQuestions() {
//         const response = await fetch("http://localhost:3000/questions");
//         const data = await response.json();
//         displayMessages(data);
//     }

//     function displayMessages(messages) {
//         messagesContainer.innerHTML = "";
//         messages.forEach((message) => {
//             const messageDiv = document.createElement("div");
//             messageDiv.className = "message";
//             messageDiv.textContent = message.text;
//             messageDiv.addEventListener("click", function () {
//                 localStorage.setItem("clickedMessage", message._id);
//                 window.location.href = "messageDetails.html";
//             });
//             messagesContainer.appendChild(messageDiv);
//         });
//     }

//     plusButton.addEventListener("click", async function () {
//         const userInput = searchInput.value.trim();
//         if (userInput) {
//             await fetch("http://localhost:3000/questions", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({ text: userInput }),
//             });
//             searchInput.value = "";
//             fetchQuestions();
//         }
//     });

//     fetchQuestions();
// });


// document.addEventListener("DOMContentLoaded", function () {
//     const searchInput = document.getElementById("search");
//     const plusButton = document.querySelector(".plus-icon");
//     const messagesContainer = document.querySelector(".messages-container");

//     async function fetchQuestions() {
//         try {
//             const response = await fetch("http://localhost:3000/questions");
//             const data = await response.json();
//             displayMessages(data);
//         } catch (error) {
//             console.error("Error fetching questions:", error);
//         }
//     }

//     function displayMessages(questions) {
//         messagesContainer.innerHTML = "";
//         questions.forEach((question) => {
//             const questionDiv = document.createElement("div");
//             questionDiv.className = "message";
//             questionDiv.textContent = question.questionText;
//             questionDiv.addEventListener("click", function () {
//                 window.location.href = `messageDetails.html?id=${question._id}`;
//             });
//             messagesContainer.appendChild(questionDiv);
//         });
//     }

//     plusButton.addEventListener("click", async function () {
//         const userInput = searchInput.value.trim();
//         if (userInput) {
//             try {
//                 await fetch("http://localhost:3000/questions", {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({ questionText: userInput }),
//                 });
//                 searchInput.value = "";
//                 fetchQuestions(); // Refresh the questions list
//             } catch (error) {
//                 console.error("Error posting question:", error);
//             }
//         }
//     });

//     fetchQuestions();
// });

// document.addEventListener("DOMContentLoaded", function () {
//     const API_URL = "http://localhost:3000";  

//     const searchInput = document.getElementById("search");
//     const plusButton = document.querySelector(".plus-icon");
//     const messagesContainer = document.querySelector(".messages-container");

//     // ✅ Function to fetch and display questions
//     async function fetchQuestions() {
//         try {
//             console.log("Fetching questions from:", `${API_URL}/questions`);
//             const response = await fetch(`${API_URL}/questions`);
//             if (!response.ok) throw new Error("Failed to fetch questions");

//             const data = await response.json();
//             console.log("Fetched questions:", data); // Debugging
//             displayMessages(data);
//         } catch (error) {
//             console.error("Error fetching questions:", error);
//             messagesContainer.innerHTML = "<p style='color: red;'>Failed to load questions</p>";
//         }
//     }

//     // ✅ Function to display questions
//     function displayMessages(questions) {
//         messagesContainer.innerHTML = "";
//         if (!questions || questions.length === 0) {
//             messagesContainer.innerHTML = "<p>No questions found.</p>";
//             return;
//         }

//         questions.forEach((question) => {
//             const questionDiv = document.createElement("div");
//             questionDiv.className = "message";
//             questionDiv.textContent = question.questionText;

//             // ✅ Store question ID in sessionStorage and navigate to details page
//             questionDiv.addEventListener("click", function () {
//                 sessionStorage.setItem("selectedQuestionId", question._id);
//                 window.location.href = "messageDetails.html"; // No ID in URL
//             });

//             messagesContainer.appendChild(questionDiv);
//         });
//     }

//     // ✅ Function to post a new question
//     if (plusButton) {
//         plusButton.addEventListener("click", async function () {
//             const userInput = searchInput.value.trim();
//             if (!userInput) return;

//             try {
//                 console.log("Posting question:", userInput);
//                 const response = await fetch(`${API_URL}/questions`, {  
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({ questionText: userInput }),
//                 });

//                 if (!response.ok) throw new Error("Failed to post question");

//                 console.log("Question posted successfully!");
//                 searchInput.value = "";
//                 fetchQuestions(); // Refresh the question list
//             } catch (error) {
//                 console.error("Error posting question:", error);
//             }
//         });
//     }

//     // ✅ Load existing questions when the page loads
//     fetchQuestions();
// });


// document.addEventListener("DOMContentLoaded", function () {
//     const API_URL = "http://localhost:3000";  

//     const searchInput = document.getElementById("search");
//     const plusButton = document.querySelector(".plus-icon");
//     const messagesContainer = document.querySelector(".messages-container");

//     // ✅ Fetch and display all questions
//     async function fetchQuestions() {
//         try {
//             console.log("Fetching questions..."); // ✅ Debug log
//             const response = await fetch(`${API_URL}/questions`);
//             console.log("Response status:", response.status); // ✅ Log HTTP status
    
//             if (!response.ok) throw new Error("Failed to fetch questions");
    
//             const questions = await response.json();
//             console.log("Fetched questions:", questions); // ✅ Log the data
//             displayMessages(questions);
//         } catch (error) {
//             console.error("❌ Error fetching questions:", error);
//             messagesContainer.innerHTML = "<p style='color: red;'>Failed to load questions</p>";
//         }
//     }
    

//     // ✅ Display fetched questions
//     function displayMessages(questions) {
//         messagesContainer.innerHTML = "";
//         if (!questions.length) {
//             messagesContainer.innerHTML = "<p>No questions found.</p>";
//             return;
//         }

//         questions.forEach((question) => {
//             const questionDiv = document.createElement("div");
//             questionDiv.className = "message";
//             questionDiv.textContent = question.questionText;

//             // ✅ Store question ID in sessionStorage and navigate to details page
//             questionDiv.addEventListener("click", function () {
//                 sessionStorage.setItem("selectedQuestionId", question._id);
//                 sessionStorage.setItem("selectedQuestionText", question.questionText);
//                 window.location.href = "messageDetails.html"; // Navigate to details page
//             });

//             messagesContainer.appendChild(questionDiv);
//         });
//     }

//     // ✅ Post a new question
//     if (plusButton) {
//         plusButton.addEventListener("click", async function () {
//             const userInput = searchInput.value.trim();
//             if (!userInput) return;

//             try {
//                 const response = await fetch(`${API_URL}/questions`, {  
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({ questionText: userInput }),
//                 });

//                 if (!response.ok) throw new Error("Failed to post question");

//                 searchInput.value = "";
//                 fetchQuestions(); // Refresh questions
//             } catch (error) {
//                 console.error("Error posting question:", error);
//             }
//         });
//     }

//     // ✅ Load questions on page load
//     fetchQuestions();
// });
document.addEventListener("DOMContentLoaded", function () {
    const API_URL = "http://localhost:3000";  

    const searchInput = document.getElementById("search");
    const plusButton = document.querySelector(".plus-icon");
    const messagesContainer = document.querySelector(".messages-container");

    // ✅ Fetch and display all questions
    async function fetchQuestions() {
        try {
            console.log("🚀 Fetching questions...");
            const response = await fetch(`${API_URL}/questions`);
            console.log("Response status:", response.status);

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
            questionDiv.className = "message";
            questionDiv.textContent = question.questionText;

            // ✅ Store question ID in sessionStorage and navigate to details page
            questionDiv.addEventListener("click", function () {
                sessionStorage.setItem("selectedQuestionId", question._id);
                sessionStorage.setItem("selectedQuestionText", question.questionText);
                window.location.href = "messageDetails.html"; // Navigate to details page
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

                console.log("Response status:", response.status);
                const data = await response.json();
                console.log("Server response:", data);

                if (!response.ok) throw new Error(data.error || "Failed to post question");

                searchInput.value = "";
                fetchQuestions(); // Refresh questions
            } catch (error) {
                console.error("❌ Error posting question:", error);
            }
        });
    }

    // ✅ Load questions on page load
    fetchQuestions();
});
