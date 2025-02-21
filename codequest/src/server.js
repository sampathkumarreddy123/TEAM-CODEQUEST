
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config({ path: './src/.env' });

const clientID = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
const sessionSecret = process.env.SESSION_SECRET;

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = "mongodb+srv://sampathkumarreddy:sampath317.@cluster0.irpbz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(express.json());
app.use(cors());
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
    token: String,
    createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
    questionText: String,
    createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
    questionId: mongoose.Schema.Types.ObjectId,
    answerText: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Question = mongoose.model("Question", questionSchema);
const Answer = mongoose.model("Answer", answerSchema);

// ✅ GitHub Authentication
app.get("/auth/github", (req, res) => {
    const redirectUri = "http://localhost:3000/auth/github/callback";

    if (!clientID) {
        return res.status(500).send("GitHub Client ID is not defined");
    }

    const githubLoginUrl = `https://github.com/login/oauth/authorize?client_id=${clientID}&redirect_uri=${redirectUri}`;
    res.redirect(githubLoginUrl);
});

app.get("/auth/github/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send("Code is missing");
    }

    try {
        const response = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: clientID,
            client_secret: clientSecret,
            code,
        }, {
            headers: { Accept: "application/json" },
        });

        const accessToken = response.data.access_token;

        if (!accessToken) {
            return res.status(400).send("Failed to get access token");
        }

        // Store token in cookies
        res.cookie('token', accessToken, { httpOnly: true, sameSite: 'Strict' });
        res.redirect("/index.html");
    } catch (error) {
        console.error("❌ Error exchanging code for access token:", error);
        res.status(500).send("Internal Server Error");
    }
});

// ✅ Middleware to Verify Token
function verifyToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).send('Unauthorized');

    next();
}

// ✅ Logout
app.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logout successful" });
});

// ✅ Post a new question
app.post("/questions", verifyToken, async (req, res) => {
    try {
        const { questionText } = req.body;
        if (!questionText) return res.status(400).json({ error: "Question text is required" });

        const newQuestion = new Question({ questionText });
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
        const questions = await Question.find();
        res.json(questions);
    } catch (error) {
        res.status(500).send('Error fetching questions');
    }
});

// ✅ Get all answers for a question
app.get("/answers/:questionId", verifyToken, async (req, res) => {
    try {
        const answers = await Answer.find({ questionId: req.params.questionId }).sort({ createdAt: -1 });
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
        const { questionId } = req.params;

        if (!answerText) return res.status(400).json({ error: "Answer text is required" });

        const newAnswer = new Answer({ questionId, answerText });
        await newAnswer.save();

        res.status(201).json({ message: "Answer posted successfully!", answer: newAnswer });
    } catch (error) {
        console.error("❌ Error posting answer:", error);
        res.status(500).json({ error: "Failed to post answer" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
