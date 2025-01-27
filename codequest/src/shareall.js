document.addEventListener("DOMContentLoaded", function () {
    const plusIcon = document.querySelector(".plus-icon i");
    const searchInput = document.getElementById("search");
    const plusButton = document.querySelector(".plus-icon");
    const messagesContainer = document.querySelector(".messages-container");

    // Load existing messages from localStorage
    const messages = JSON.parse(localStorage.getItem("messages")) || [];

    // Display all existing messages
    function displayMessages(filter = "") {
        messagesContainer.innerHTML = ""; // Clear previous messages
        const filteredMessages = messages.filter((message) =>
            message.toLowerCase().includes(filter.toLowerCase())
        );
        // Append matching messages
        filteredMessages.forEach((message) => {
            const messageDiv = document.createElement("div");
            messageDiv.className = "message";
            messageDiv.textContent = message;
            messagesContainer.appendChild(messageDiv);
        });
    }

    displayMessages();

    // Change icon to "send" when input field is focused
    searchInput.addEventListener("focus", function () {
        if (plusIcon.classList.contains("fa-plus")) {
            plusIcon.classList.remove("fa-plus");
            plusIcon.classList.add("fa-paper-plane");
        }
    });
    // Handle click on the send button
    plusButton.addEventListener("click", function () {
        if (plusIcon.classList.contains("fa-paper-plane")) {
            const userInput = searchInput.value.trim();
            if (userInput) {
                // Store the new message
                messages.push(userInput);
                localStorage.setItem("messages", JSON.stringify(messages)); // Save to localStorage

                // Add the new message to the container
                const newMessage = document.createElement("div");
                newMessage.className = "message";
                newMessage.textContent = userInput;
                messagesContainer.prepend(newMessage); // Add new messages at the top

                // Reset the input field and icon
                searchInput.value = "";
                plusIcon.classList.remove("fa-paper-plane");
                plusIcon.classList.add("fa-plus");
            } else {
                alert("Please enter a message before sending.");
            }
        }
    });

    // Search functionality
    searchInput.addEventListener("input", function () {
        displayMessages(searchInput.value);
    });

    // Reset the icon if the input loses focus and is empty
    searchInput.addEventListener("blur", function () {
        if (!searchInput.value.trim()) {
            plusIcon.classList.remove("fa-paper-plane");
            plusIcon.classList.add("fa-plus");
        }
    });
});
