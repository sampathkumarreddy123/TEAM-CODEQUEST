document.addEventListener("DOMContentLoaded", function () {
    const messagesContainer = document.querySelector(".messages-container");

    // Load existing messages from localStorage
    const messages = JSON.parse(localStorage.getItem("messages")) || [];

    // Display all messages
    function displayMessages() {
        messagesContainer.innerHTML = "";
        messages.forEach((message) => {
            const messageDiv = document.createElement("div");
            messageDiv.className = "message";
            messageDiv.textContent = message;
            messagesContainer.appendChild(messageDiv);
        });
    }

    displayMessages();
});
