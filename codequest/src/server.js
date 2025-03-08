

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: './src/.env' });

const clientID = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
const MONGO_URI = process.env.MONGO_URI;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(cookieParser());

const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "src")));

mongoose.connect(MONGO_URI, {})
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    });

const userSchema = new mongoose.Schema({
    githubId: String,
    username: String,
    avatarUrl: String,
    token: String,
    createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    questionText: String,
    createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
    answerText: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Question = mongoose.model("Question", questionSchema);
const Answer = mongoose.model("Answer", answerSchema);

// ✅ GitHub Authentication
app.get("/auth/github", (req, res) => {
    const redirectUri = "http://localhost:3000/auth/github/callback";
    if (!clientID) return res.status(500).send("GitHub Client ID is not defined");
    const githubLoginUrl = `https://github.com/login/oauth/authorize?client_id=${clientID}&redirect_uri=${redirectUri}`;
    res.redirect(githubLoginUrl);
});

app.get("/auth/github/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("Code is missing");

    try {
        const response = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: clientID,
            client_secret: clientSecret,
            code,
        }, {
            headers: { Accept: "application/json" },
        });

        const accessToken = response.data.access_token;
        if (!accessToken) return res.status(400).send("Failed to get access token");

        const userResponse = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { id, login, avatar_url } = userResponse.data;

        let user = await User.findOne({ githubId: id });
        if (!user) {
            user = new User({
                githubId: id,
                username: login,
                avatarUrl: avatar_url,
                token: accessToken
            });
            await user.save();
        } else {
            user.token = accessToken;
            await user.save();
        }

        res.cookie('token', accessToken, { httpOnly: true, sameSite: 'Strict' });
        res.cookie('username', login, { sameSite: 'Strict' });
        res.cookie('avatarUrl', avatar_url, { sameSite: 'Strict' });

        res.redirect("/dashboard.html");
    } catch (error) {
        console.error("❌ Error exchanging code for access token:", error);
        res.status(500).send("Internal Server Error");
    }
});

// ✅ Middleware to Verify Token
async function verifyToken(req, res, next) {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const user = await User.findOne({ token });
        if (!user) return res.status(401).json({ error: "Invalid token" });

        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ error: "Token verification failed" });
    }
}

// ✅ Fetch logged-in user's profile
app.get("/profile", verifyToken, (req, res) => {
    res.json({
        username: req.user.username,
        avatarUrl: req.user.avatarUrl
    });
});

// ✅ Fetch another user's profile by ID
app.get("/users/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({
            username: user.username,
            avatarUrl: user.avatarUrl || "https://via.placeholder.com/100"
        });
    } catch (error) {
        console.error("❌ Error fetching user profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Check authentication status
app.get("/auth/status", async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ loggedIn: false });

        const user = await User.findOne({ token });
        if (!user) return res.status(401).json({ loggedIn: false });

        res.json({ loggedIn: true, username: user.username });
    } catch (error) {
        console.error("❌ Error checking auth status:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Logout
app.post("/logout", (req, res) => {
    try {
        res.clearCookie("token", { httpOnly: true, sameSite: "Strict" });
        res.clearCookie("username", { sameSite: "Strict" });
        res.clearCookie("avatarUrl", { sameSite: "Strict" });

        console.log("✅ Token removed successfully");
        res.status(200).json({ redirectUrl: "/auth/github" });
    } catch (error) {
        console.error("❌ Error during logout:", error);
        res.status(500).json({ error: "Logout failed" });
    }
});

// ✅ Post a new question
app.post("/questions", verifyToken, async (req, res) => {
    try {
        const { questionText } = req.body;
        if (!questionText) return res.status(400).json({ error: "Question text is required" });

        const newQuestion = new Question({ userId: req.user._id, questionText });
        await newQuestion.save();
        res.status(201).json({ message: "Question posted successfully!", question: newQuestion });
    } catch (error) {
        console.error("❌ Error posting question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Get all questions
app.get('/questions', verifyToken, async (req, res) => {
    try {
        const questions = await Question.find().populate("userId", "username avatarUrl");
        res.json(questions);
    } catch (error) {
        res.status(500).send('Error fetching questions');
    }
});

// ✅ Get all answers for a question
app.get("/answers/:questionId", verifyToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (!question) return res.status(404).json({ error: "Invalid Question" });

        const answers = await Answer.find({ questionId: req.params.questionId })
            .sort({ createdAt: -1 })
            .populate("userId", "username avatarUrl");

        res.json(answers);
    } catch (error) {
        console.error("❌ Error fetching answers:", error);
        res.status(500).json({ error: "Failed to fetch answers" });
    }
});

// ✅ Post an answer
app.post("/answers/:questionId", verifyToken, async (req, res) => {
    try {
        const { answerText } = req.body;
        if (!answerText) return res.status(400).json({ error: "Answer text is required" });

        const question = await Question.findById(req.params.questionId);
        if (!question) return res.status(404).json({ error: "Invalid Question" });

        const newAnswer = new Answer({
            userId: req.user._id,
            questionId: req.params.questionId,
            answerText
        });

        await newAnswer.save();
        res.status(201).json({ message: "Answer posted successfully!", answer: newAnswer });
    } catch (error) {
        console.error("❌ Error posting answer:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

