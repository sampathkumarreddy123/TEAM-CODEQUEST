import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in the same directory or project root
dotenv.config({ path: path.join(__dirname, ".env") });

const clientID = process.env.GITHUB_CLIENT_ID ? process.env.GITHUB_CLIENT_ID.trim().replace(/^["']|["']$/g, "") : null;
const clientSecret = process.env.GITHUB_CLIENT_SECRET ? process.env.GITHUB_CLIENT_SECRET.trim().replace(/^["']|["']$/g, "") : null;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/codequest";
const MONGO_REMOTE_URI = process.env.MONGO_REMOTE_URI;
const PORT = process.env.PORT || 3000;


const app = express();

// Trust reverse proxies like Render
app.set("trust proxy", 1);

app.use(express.json());
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

// Serve static assets from src directory
app.use(express.static(__dirname));

// MongoDB connection with automatic fallback
async function connectMongoDB() {
    const options = { serverSelectionTimeoutMS: 4000 };
    try {
        await mongoose.connect(MONGO_URI, options);
        console.log("✅ MongoDB connected successfully to:", MONGO_URI);
    } catch (err1) {
        console.warn(`⚠️ Primary MongoDB connection failed (${err1.message}). Trying fallback...`);
        const fallbackUri = MONGO_URI.includes("127.0.0.1") || MONGO_URI.includes("localhost")
            ? (MONGO_REMOTE_URI || "mongodb://localhost:27017/codequest")
            : "mongodb://127.0.0.1:27017/codequest";

        try {
            await mongoose.connect(fallbackUri, options);
            console.log("✅ Connected to fallback MongoDB:", fallbackUri);
        } catch (err2) {
            console.error("❌ Both primary and fallback MongoDB connections failed:", err2.message);
            console.warn("⚠️ Server will continue running, but database operations may fail until MongoDB is available.");
        }
    }
}

connectMongoDB();

// ----------------- Mongoose Schemas -----------------
const userSchema = new mongoose.Schema({
    githubId: { type: String, default: null },
    username: { type: String, required: true },
    avatarUrl: { type: String, default: "default-avatar.png" },
    token: { type: String, required: true },
    isDemo: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    questionText: { type: String, required: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    isSolved: { type: Boolean, default: false },
    solvedAnswerId: { type: mongoose.Schema.Types.ObjectId, ref: "Answer", default: null },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    answerText: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Question = mongoose.model("Question", questionSchema);
const Answer = mongoose.model("Answer", answerSchema);

// ----------------- Auth Middleware -----------------
async function verifyToken(req, res, next) {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ error: "Unauthorized. Please log in." });
        }

        const user = await User.findOne({ token });
        if (!user) {
            res.clearCookie("token");
            return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Token verification error:", error);
        res.status(500).json({ error: "Authentication failed" });
    }
}

// ----------------- Auth Routes -----------------

// GitHub OAuth initiation
app.get("/auth/github", (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const baseUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : `${proto}://${host}`;
    const redirectUri = `${baseUrl}/auth/github/callback`;

    if (!clientID) {
        return res.status(500).send("GitHub Client ID is not configured in .env or Render environment variables.");
    }
    const githubLoginUrl = `https://github.com/login/oauth/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
    res.redirect(githubLoginUrl);
});

// GitHub OAuth callback
app.get("/auth/github/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.redirect("/login.html?error=missing_code");
    }

    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const baseUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : `${proto}://${host}`;
    const redirectUri = `${baseUrl}/auth/github/callback`;

    try {
        const response = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: clientID,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri
            },
            { headers: { Accept: "application/json" } }
        );

        const accessToken = response.data.access_token;
        if (!accessToken) {
            console.error("❌ GitHub OAuth token exchange failed:", response.data);
            const errDesc = response.data.error_description || "Authentication code expired or already used. Please click Login with GitHub again.";
            return res.redirect(`/login.html?error=github_token_failed&msg=${encodeURIComponent(errDesc)}`);
        }

        const userResponse = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { id, login, avatar_url } = userResponse.data;

        let user = await User.findOne({ githubId: String(id) });
        if (!user) {
            user = new User({
                githubId: String(id),
                username: login,
                avatarUrl: avatar_url || "default-avatar.png",
                token: accessToken
            });
            await user.save();
        } else {
            user.token = accessToken;
            user.username = login;
            user.avatarUrl = avatar_url || user.avatarUrl;
            await user.save();
        }

        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("token", accessToken, { httpOnly: true, sameSite: "lax", secure: isProduction });
        res.cookie("username", user.username, { sameSite: "lax", secure: isProduction });
        res.cookie("avatarUrl", user.avatarUrl, { sameSite: "lax", secure: isProduction });

        res.redirect("/dashboard.html");
    } catch (error) {
        console.error("❌ Error exchanging GitHub code:", error.response?.data || error.message);
        res.redirect("/login.html?error=github_auth_failed");
    }
});

// Quick Demo / Guest Login
app.post("/auth/demo", async (req, res) => {
    try {
        const rawName = (req.body.username || "").trim();
        const username = rawName ? rawName.slice(0, 25) : "DevGuest_" + Math.floor(1000 + Math.random() * 9000);
        const demoToken = "demo_token_" + Buffer.from(username + Date.now()).toString("hex");

        const avatarColors = ["4F46E5", "06B6D4", "10B981", "F59E0B", "EF4444", "8B5CF6", "EC4899"];
        const color = avatarColors[Math.floor(Math.random() * avatarColors.length)];
        const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}&backgroundColor=${color}`;

        let user = await User.findOne({ username });
        if (!user) {
            user = new User({
                username,
                avatarUrl,
                token: demoToken,
                isDemo: true
            });
            await user.save();
        } else {
            user.token = demoToken;
            await user.save();
        }

        res.cookie("token", demoToken, { httpOnly: true, sameSite: "Lax" });
        res.cookie("username", user.username, { sameSite: "Lax" });
        res.cookie("avatarUrl", user.avatarUrl, { sameSite: "Lax" });

        res.json({
            success: true,
            redirectUrl: "/dashboard.html",
            user: { _id: user._id, username: user.username, avatarUrl: user.avatarUrl }
        });
    } catch (error) {
        console.error("❌ Demo login error:", error);
        res.status(500).json({ error: "Failed to create demo session" });
    }
});

// Check authentication status
app.get("/auth/status", async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.json({ loggedIn: false });
        }

        const user = await User.findOne({ token });
        if (!user) {
            return res.json({ loggedIn: false });
        }

        res.json({
            loggedIn: true,
            userId: user._id,
            username: user.username,
            avatarUrl: user.avatarUrl || "default-avatar.png"
        });
    } catch (error) {
        console.error("❌ Error checking auth status:", error);
        res.status(500).json({ loggedIn: false, error: "Auth check failed" });
    }
});

// Logout
app.post("/logout", (req, res) => {
    try {
        res.clearCookie("token", { httpOnly: true, sameSite: "Lax" });
        res.clearCookie("username", { sameSite: "Lax" });
        res.clearCookie("avatarUrl", { sameSite: "Lax" });

        res.status(200).json({ success: true, redirectUrl: "/login.html" });
    } catch (error) {
        console.error("❌ Error during logout:", error);
        res.status(500).json({ error: "Logout failed" });
    }
});

// ----------------- Profile Routes -----------------

// Logged-in user's own profile with activity stats
app.get("/profile", verifyToken, async (req, res) => {
    try {
        const questionsCount = await Question.countDocuments({ userId: req.user._id });
        const answersCount = await Answer.countDocuments({ userId: req.user._id });
        const userQuestions = await Question.find({ userId: req.user._id }).sort({ createdAt: -1 });

        res.json({
            _id: req.user._id,
            username: req.user.username,
            avatarUrl: req.user.avatarUrl,
            createdAt: req.user.createdAt,
            questionsCount,
            answersCount,
            questions: userQuestions
        });
    } catch (error) {
        console.error("❌ Error fetching own profile:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// Another user's profile with stats
app.get("/users/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const questionsCount = await Question.countDocuments({ userId: user._id });
        const answersCount = await Answer.countDocuments({ userId: user._id });
        const userQuestions = await Question.find({ userId: user._id }).sort({ createdAt: -1 });

        res.json({
            _id: user._id,
            username: user.username,
            avatarUrl: user.avatarUrl || "default-avatar.png",
            createdAt: user.createdAt,
            questionsCount,
            answersCount,
            questions: userQuestions
        });
    } catch (error) {
        console.error("❌ Error fetching user profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ----------------- Tags & Topics -----------------
app.get("/tags", async (req, res) => {
    try {
        const tags = await Question.aggregate([
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 12 }
        ]);
        res.json(tags.map(t => ({ name: t._id, count: t.count })));
    } catch (err) {
        res.json([]);
    }
});

// ----------------- Questions Routes -----------------

// Get all questions with search, tag filter, tabs, and answer counts
app.get("/questions", async (req, res) => {
    try {
        const { search, tag, tab } = req.query;
        const filter = {};

        if (search && search.trim()) {
            filter.questionText = { $regex: search.trim(), $options: "i" };
        }

        if (tag && tag.trim()) {
            filter.tags = tag.trim().toLowerCase();
        }

        if (tab === "solved") {
            filter.isSolved = true;
        }

        let sortOption = { createdAt: -1 };
        if (tab === "popular") {
            sortOption = { likes: -1, createdAt: -1 };
        }

        let questions = await Question.find(filter)
            .sort(sortOption)
            .populate("userId", "username avatarUrl")
            .lean();

        // Get answer count & user like status
        const token = req.cookies.token;
        let currentUserId = null;
        if (token) {
            const user = await User.findOne({ token }).select("_id");
            if (user) currentUserId = user._id.toString();
        }

        let questionsWithDetails = await Promise.all(
            questions.map(async (q) => {
                const answerCount = await Answer.countDocuments({ questionId: q._id });
                const isLiked = currentUserId && q.likedBy ? q.likedBy.some(id => id.toString() === currentUserId) : false;
                const isOwner = currentUserId && q.userId ? q.userId._id.toString() === currentUserId : false;
                return {
                    ...q,
                    answerCount,
                    isLiked,
                    isOwner
                };
            })
        );

        if (tab === "unanswered") {
            questionsWithDetails = questionsWithDetails.filter(q => q.answerCount === 0);
        }

        res.json(questionsWithDetails);
    } catch (error) {
        console.error("❌ Error fetching questions:", error);
        res.status(500).json({ error: "Error fetching questions" });
    }
});

// Get a single question by ID
app.get("/questions/:questionId", async (req, res) => {
    try {
        const { questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(404).json({ error: "Question not found" });
        }

        const question = await Question.findById(questionId)
            .populate("userId", "username avatarUrl")
            .lean();

        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        const answerCount = await Answer.countDocuments({ questionId: question._id });
        const token = req.cookies.token;
        let isOwner = false;
        let isLiked = false;

        if (token) {
            const user = await User.findOne({ token }).select("_id");
            if (user) {
                const uid = user._id.toString();
                if (question.userId) {
                    isOwner = question.userId._id.toString() === uid;
                }
                if (question.likedBy) {
                    isLiked = question.likedBy.some(id => id.toString() === uid);
                }
            }
        }

        res.json({ ...question, answerCount, isOwner, isLiked });
    } catch (error) {
        console.error("❌ Error fetching question:", error);
        res.status(500).json({ error: "Failed to fetch question" });
    }
});

// Post a new question with optional tags
app.post("/questions", verifyToken, async (req, res) => {
    try {
        const { questionText, tags } = req.body;
        if (!questionText || !questionText.trim()) {
            return res.status(400).json({ error: "Question text is required" });
        }

        let parsedTags = [];
        if (Array.isArray(tags)) {
            parsedTags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
        } else if (typeof tags === "string") {
            parsedTags = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
        }

        // Auto-extract tags from text if none provided (e.g. hashtags #javascript)
        if (parsedTags.length === 0) {
            const hashtagMatches = questionText.match(/#(\w+)/g);
            if (hashtagMatches) {
                parsedTags = hashtagMatches.map(t => t.replace("#", "").toLowerCase());
            }
        }

        const newQuestion = new Question({
            userId: req.user._id,
            questionText: questionText.trim(),
            tags: parsedTags.slice(0, 5) // max 5 tags
        });
        await newQuestion.save();

        const populatedQuestion = await Question.findById(newQuestion._id)
            .populate("userId", "username avatarUrl");

        res.status(201).json({
            message: "Question posted successfully!",
            question: { ...populatedQuestion.toObject(), answerCount: 0, isOwner: true }
        });
    } catch (error) {
        console.error("❌ Error posting question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Toggle solved status on question (Author only)
app.post("/questions/:questionId/solve/:answerId", verifyToken, async (req, res) => {
    try {
        const { questionId, answerId } = req.params;
        const question = await Question.findById(questionId);

        if (!question) return res.status(404).json({ error: "Question not found" });
        if (question.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Only the question creator can accept a solution." });
        }

        if (question.isSolved && String(question.solvedAnswerId) === String(answerId)) {
            // Un-mark solution
            question.isSolved = false;
            question.solvedAnswerId = null;
        } else {
            // Mark as accepted solution
            question.isSolved = true;
            question.solvedAnswerId = answerId;
        }

        await question.save();
        res.json({
            success: true,
            isSolved: question.isSolved,
            solvedAnswerId: question.solvedAnswerId
        });
    } catch (error) {
        console.error("❌ Error marking answer as solved:", error);
        res.status(500).json({ error: "Failed to mark solution" });
    }
});

// Delete a question (author only)
app.delete("/questions/:questionId", verifyToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        if (question.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Not authorized to delete this question" });
        }

        await Answer.deleteMany({ questionId: question._id });
        await Question.findByIdAndDelete(question._id);

        res.json({ success: true, message: "Question and associated answers deleted." });
    } catch (error) {
        console.error("❌ Error deleting question:", error);
        res.status(500).json({ error: "Failed to delete question" });
    }
});

// Like / Upvote a question
app.post("/questions/:questionId/like", verifyToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        const userIdStr = req.user._id.toString();
        const alreadyLikedIndex = question.likedBy.findIndex(id => id.toString() === userIdStr);

        let isLiked = false;
        if (alreadyLikedIndex > -1) {
            question.likedBy.splice(alreadyLikedIndex, 1);
            question.likes = Math.max(0, question.likes - 1);
        } else {
            question.likedBy.push(req.user._id);
            question.likes += 1;
            isLiked = true;
        }

        await question.save();
        res.json({ success: true, likes: question.likes, isLiked });
    } catch (error) {
        console.error("❌ Error liking question:", error);
        res.status(500).json({ error: "Failed to toggle like" });
    }
});

// ----------------- Answers Routes -----------------

// Get all answers for a question
app.get("/answers/:questionId", async (req, res) => {
    try {
        const { questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(404).json({ error: "Invalid Question ID" });
        }

        const question = await Question.findById(questionId);
        if (!question) {
            return res.status(404).json({ error: "Invalid Question" });
        }

        const answers = await Answer.find({ questionId: req.params.questionId })
            .sort({ createdAt: 1 }) // Chronological order
            .populate("userId", "username avatarUrl")
            .lean();

        const token = req.cookies.token;
        let currentUserId = null;
        if (token) {
            const user = await User.findOne({ token }).select("_id");
            if (user) currentUserId = user._id.toString();
        }

        const enrichedAnswers = answers.map(ans => ({
            ...ans,
            isOwner: currentUserId && ans.userId ? ans.userId._id.toString() === currentUserId : false,
            isAcceptedSolution: question.isSolved && String(question.solvedAnswerId) === String(ans._id)
        }));

        res.json(enrichedAnswers);
    } catch (error) {
        console.error("❌ Error fetching answers:", error);
        res.status(500).json({ error: "Failed to fetch answers" });
    }
});

// Post an answer
app.post("/answers/:questionId", verifyToken, async (req, res) => {
    try {
        const { answerText } = req.body;
        if (!answerText || !answerText.trim()) {
            return res.status(400).json({ error: "Answer text is required" });
        }

        const question = await Question.findById(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        const newAnswer = new Answer({
            userId: req.user._id,
            questionId: req.params.questionId,
            answerText: answerText.trim()
        });

        await newAnswer.save();

        const populatedAnswer = await Answer.findById(newAnswer._id)
            .populate("userId", "username avatarUrl");

        res.status(201).json({
            message: "Answer posted successfully!",
            answer: { ...populatedAnswer.toObject(), isOwner: true }
        });
    } catch (error) {
        console.error("❌ Error posting answer:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Delete an answer (author only)
app.delete("/answers/:answerId", verifyToken, async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.answerId);
        if (!answer) {
            return res.status(404).json({ error: "Answer not found" });
        }

        if (answer.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Not authorized to delete this answer" });
        }

        // If this answer was the accepted solution, reset question solution
        await Question.updateOne(
            { solvedAnswerId: answer._id },
            { $set: { isSolved: false, solvedAnswerId: null } }
        );

        await Answer.findByIdAndDelete(answer._id);
        res.json({ success: true, message: "Answer deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting answer:", error);
        res.status(500).json({ error: "Failed to delete answer" });
    }
});

// ----------------- Root Page Route -----------------
app.get("/", (req, res) => {
    if (req.cookies.token) {
        res.sendFile(path.join(__dirname, "dashboard.html"));
    } else {
        res.sendFile(path.join(__dirname, "login.html"));
    }
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`🚀 CodeQuest Server is running on http://localhost:${PORT}`);
});
