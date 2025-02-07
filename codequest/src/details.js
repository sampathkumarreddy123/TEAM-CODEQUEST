document.addEventListener("DOMContentLoaded", function () {
    const selectedMessage = document.getElementById("selected-message");
    const answersContainer = document.querySelector(".answers-container");
    const replyInput = document.getElementById("reply");
    const sendReplyButton = document.getElementById("sendReply");

    const clickedMessage = localStorage.getItem("clickedMessage");
    const replies = JSON.parse(localStorage.getItem("replies")) || {};
    const currentUser = localStorage.getItem("currentUser") || "Guest"; // Assuming current user is stored
    const messageOwner = localStorage.getItem("messageOwner") || "Guest"; // Store the user who posted the message

    if (clickedMessage) {
        selectedMessage.textContent = clickedMessage;
        if (replies[clickedMessage]) {
            renderReplies(replies[clickedMessage]);
        }
    }

    sendReplyButton.addEventListener("click", function () {
        const userReply = replyInput.value.trim();
        if (userReply) {
            if (!replies[clickedMessage]) replies[clickedMessage] = [];

            // Store reply as an object with user info
            const replyObj = { text: userReply, user: currentUser };
            replies[clickedMessage].unshift(replyObj);

            localStorage.setItem("replies", JSON.stringify(replies));
            replyInput.value = "";
            renderReplies(replies[clickedMessage]);
        }
    });

    function renderReplies(repliesArray) {
        answersContainer.innerHTML = repliesArray
            .map((replyObj) => {
                // If the logged-in user is the one who posted the message
                if (replyObj.user === currentUser) {
                    return `<div class="reply your-reply"><strong>Your Answer:</strong> ${replyObj.text}</div>`;
                }
                // If another user posted the reply, show their profile icon
                else {
                    return `
                        <div class="reply other-reply">
                            <img src="images/profile-icon.png" class="profile-icon" alt="Profile">
                            <span>${replyObj.text}</span>
                        </div>`;
                }
            })
            .join("");
    }
});
