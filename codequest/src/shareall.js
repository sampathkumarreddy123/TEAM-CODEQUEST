document.addEventListener("DOMContentLoaded", function () {
    const plusIcon = document.querySelector(".plus-icon i");
    const searchInput = document.getElementById("search");
    const plusButton = document.querySelector(".plus-icon");
    const messagesContainer = document.querySelector(".messages-container");

    const messages = JSON.parse(localStorage.getItem("messages")) || [];

    function displayMessages(filter = "") {
        messagesContainer.innerHTML = "";
        const filteredMessages = messages.filter((message) =>
            message.toLowerCase().includes(filter.toLowerCase())
        );
        filteredMessages.forEach((message) => {
            const messageDiv = document.createElement("div");
            messageDiv.className = "message";
            messageDiv.textContent = message;
            messageDiv.addEventListener("click", function () {
                localStorage.setItem("clickedMessage", message);
                window.location.href = "messageDetails.html";
            });
            messagesContainer.appendChild(messageDiv);
        });
    }

    displayMessages();

    searchInput.addEventListener("focus", function () {
        plusIcon.classList.remove("fa-plus");
        plusIcon.classList.add("fa-share-square-o");
    });

    plusButton.addEventListener("click", function () {
        if (plusIcon.classList.contains("fa-share-square-o")) {
            const userInput = searchInput.value.trim();
            if (userInput) {
                messages.push(userInput);
                localStorage.setItem("messages", JSON.stringify(messages));
                displayMessages();
                searchInput.value = "";
                plusIcon.classList.remove("fa-share-square-o");
                plusIcon.classList.add("fa-plus");
            } else {
                alert("Please enter a message before sending.");
            }
        }
    });

    searchInput.addEventListener("input", function () {
        displayMessages(searchInput.value);
    });

    searchInput.addEventListener("blur", function () {
        if (!searchInput.value.trim()) {
            plusIcon.classList.remove("fa-share-square-o");
            plusIcon.classList.add("fa-plus");
        }
    });
});
