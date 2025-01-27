document.addEventListener("DOMContentLoaded", function () {
    const clearButton = document.getElementById("clearButton"); // Assuming you have a button to clear data

    // Clear all data from localStorage when the button is clicked
    clearButton.addEventListener("click", function () {
        localStorage.clear();  // Clear all stored data
        alert("All data has been cleared!");
        
        // Optionally, refresh the page or update the UI
        location.reload();  // This will reload the page to reflect the changes
    });
});
// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelectorAll(".nav-link");

    // Function to set active class
    const setActiveLink = () => {
        const currentPage = window.location.pathname.split("/").pop(); // Get current page filename
        navLinks.forEach(link => {
            // Check if the link's href matches the current page
            if (link.getAttribute("href") === currentPage) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    };

    // Call on page load
    setActiveLink();

    // Optionally re-run when navigation happens (useful for SPA-like behavior)
    window.addEventListener("popstate", setActiveLink);
});
