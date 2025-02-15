document.addEventListener("DOMContentLoaded", async function () {
    const answersContainer = document.querySelector(".answers-container");
    const answerInput = document.getElementById("answer");
    const submitButton = document.getElementById("submitAnswer");
    const questionId = localStorage.getItem("questionId");

    async function fetchAnswers() {
        const response = await fetch(`http://localhost:5000/questions/${questionId}`);
        const question = await response.json();
        document.getElementById("questionTitle").textContent = question.text;
        displayAnswers(question.answers);
    }

    function displayAnswers(answers) {
        answersContainer.innerHTML = "";
        answers.forEach((answer) => {
            const answerDiv = document.createElement("div");
            answerDiv.className = "answer";
            answerDiv.textContent = answer.text;
            answersContainer.appendChild(answerDiv);
        });
    }

    submitButton.addEventListener("click", async function () {
        const userInput = answerInput.value.trim();
        if (userInput) {
            await fetch(`http://localhost:5000/questions/${questionId}/answers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: userInput }),
            });
            answerInput.value = "";
            fetchAnswers();
        }
    });

    fetchAnswers();
});
