// src/displayQuestion.js

document.addEventListener('DOMContentLoaded', () => {
    // Get the question parameter from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const question = urlParams.get('question');

    // Map of questions to answers
    const questionAnswers = {
        JAVA: "Java is a popular programming language, particularly for server-side applications.",
        PYTHON: "Python is a versatile and easy-to-learn programming language used for many purposes.",
        C: "C is a procedural programming language often used in systems programming.",
        "C++": "C++ is an extension of C that includes object-oriented features."
    };

    // Display the active question
    const activeQuestionDiv = document.getElementById('active-question');
    activeQuestionDiv.innerHTML = `<h3>${question}</h3>`;

    // Display the corresponding answer
    const answerDiv = document.getElementById('answer');
    if (questionAnswers[question]) {
        answerDiv.innerHTML = `<p>${questionAnswers[question]}</p>`;
    } else {
        answerDiv.innerHTML = "<p>No answer available for this question.</p>";
    }
});
