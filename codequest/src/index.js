      document.addEventListener("DOMContentLoaded", function () {
            const plusIcon = document.querySelector(".plus-icon i");
            const searchInput = document.getElementById("search");
            const plusButton = document.querySelector(".plus-icon");
            const messagesContainer = document.querySelector(".messages-container");
            const messages = []; // Store previous messages

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
                const searchQuery = searchInput.value.trim().toLowerCase();

                // Clear all displayed messages
                messagesContainer.innerHTML = "";

                // Filter matching messages
                const matchingMessages = messages.filter((message) =>
                    message.toLowerCase().includes(searchQuery)
                );

                // Display matching messages first, highlighted
                matchingMessages.forEach((message) => {
                    const matchMessage = document.createElement("div");
                    matchMessage.className = "message highlight";
                    matchMessage.textContent = message;
                    messagesContainer.appendChild(matchMessage);
                });

                // Display all other messages below matches
                messages.forEach((message) => {
                    if (!searchQuery || !message.toLowerCase().includes(searchQuery)) {
                        const otherMessage = document.createElement("div");
                        otherMessage.className = "message";
                        otherMessage.textContent = message;
                        messagesContainer.appendChild(otherMessage);
                    }
                });
            });

            // Reset the icon if the input loses focus and is empty
            searchInput.addEventListener("blur", function () {
                if (!searchInput.value.trim()) {
                    plusIcon.classList.remove("fa-paper-plane");
                    plusIcon.classList.add("fa-plus");
                }
            });
        })