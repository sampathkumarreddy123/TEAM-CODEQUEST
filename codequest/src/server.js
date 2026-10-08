import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
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

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

// Serve static assets from src directory
app.use(express.static(__dirname));

// MongoDB connection with automatic fallback and retry
async function connectMongoDB() {
    const options = { serverSelectionTimeoutMS: 5000 };
    const primaryUri = process.env.MONGO_URI || (process.env.NODE_ENV === "production" ? process.env.MONGO_REMOTE_URI : "mongodb://127.0.0.1:27017/codequest");

    try {
        if (!primaryUri) {
            throw new Error("No MONGO_URI or MONGO_REMOTE_URI configured.");
        }
        await mongoose.connect(primaryUri, options);
        console.log("✅ MongoDB connected successfully to:", primaryUri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@"));
    } catch (err1) {
        console.warn(`⚠️ Primary MongoDB connection failed (${err1.message}). Trying fallback...`);
        const fallbackUri = primaryUri && (primaryUri.includes("127.0.0.1") || primaryUri.includes("localhost"))
            ? (process.env.MONGO_REMOTE_URI || "mongodb://localhost:27017/codequest")
            : (process.env.MONGO_URI || "mongodb://127.0.0.1:27017/codequest");

        try {
            await mongoose.connect(fallbackUri, options);
            console.log("✅ Connected to fallback MongoDB:", fallbackUri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@"));
        } catch (err2) {
            console.error("❌ Both primary and fallback MongoDB connections failed:", err2.message);
            console.warn("⚠️ Database is currently unavailable. Please verify MONGO_URI in your environment settings (ensure MongoDB Atlas cluster is active and Network Access allows 0.0.0.0/0).");
            
            // Re-attempt connection after 15 seconds in background
            setTimeout(connectMongoDB, 15000);
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
    isAdmin: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    questionText: { type: String, required: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    isSolved: { type: Boolean, default: false },
    solvedAnswerId: { type: mongoose.Schema.Types.ObjectId, ref: "Answer", default: null },
    isPinned: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    answerText: { type: String, required: true },
    audioNote: {
        audioData: { type: String, default: null },
        duration: { type: Number, default: 0 },
        mimeType: { type: String, default: "audio/webm" }
    },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Question = mongoose.model("Question", questionSchema);
const Answer = mongoose.model("Answer", answerSchema);

// ----------------- Admin Helpers -----------------
function checkIsAdmin(user) {
    if (!user) return false;
    if (user.isAdmin === true) return true;
    const adminList = (process.env.ADMIN_USERNAMES || "sampathkumarreddy123,sampathkumarreddy")
        .split(",")
        .map(s => s.trim().toLowerCase());
    const username = (user.username || "").toLowerCase();
    return adminList.includes(username);
}

// ----------------- Gamification & Quest System Helper -----------------
function computeUserGamification(user, questionsCount, answersCount, userQuestions = [], userAnswers = []) {
    const isAdmin = checkIsAdmin(user);
    
    // Calculate total likes received
    const qLikes = userQuestions.reduce((sum, q) => sum + (q.likes || 0), 0);
    const aLikes = userAnswers.reduce((sum, a) => sum + (a.likes || 0), 0);
    const totalLikes = qLikes + aLikes;

    // Calculate accepted solutions count
    const solutionsCount = userAnswers.filter(a => a.questionId && a.questionId.isSolved && String(a.questionId.solvedAnswerId) === String(a._id)).length;

    // XP formula: questions (15 XP) + answers (25 XP) + solutions (60 XP) + likes (8 XP)
    const xp = (questionsCount * 15) + (answersCount * 25) + (solutionsCount * 60) + (totalLikes * 8);

    // Levels and Rank Titles
    let level = 1;
    let rankTitle = "Novice Explorer";
    let baseLevelXp = 0;
    let nextLevelXp = 100;

    if (xp >= 1000) {
        level = 5;
        rankTitle = "Legendary Architect";
        baseLevelXp = 1000;
        nextLevelXp = 2500;
    } else if (xp >= 500) {
        level = 4;
        rankTitle = "Quest Master";
        baseLevelXp = 500;
        nextLevelXp = 1000;
    } else if (xp >= 250) {
        level = 3;
        rankTitle = "Bug Hunter";
        baseLevelXp = 250;
        nextLevelXp = 500;
    } else if (xp >= 100) {
        level = 2;
        rankTitle = "Code Crafter";
        baseLevelXp = 100;
        nextLevelXp = 250;
    }

    const range = Math.max(1, nextLevelXp - baseLevelXp);
    const currentProgress = Math.max(0, xp - baseLevelXp);
    const xpProgressPercent = Math.min(100, Math.round((currentProgress / range) * 100));

    // Dynamic Quest Achievement Badges
    const badges = [
        {
            id: "first_quest",
            title: "First Quest",
            description: "Asked your first question in CodeQuest",
            icon: "fa-regular fa-paper-plane",
            unlocked: questionsCount >= 1
        },
        {
            id: "problem_solver",
            title: "Problem Solver",
            description: "Contributed an answer to help the community",
            icon: "fa-solid fa-code-pull-request",
            unlocked: answersCount >= 1
        },
        {
            id: "master_mind",
            title: "Solution Master",
            description: "Authored a verified accepted solution",
            icon: "fa-solid fa-circle-check",
            unlocked: solutionsCount >= 1
        },
        {
            id: "community_pillar",
            title: "Community Pillar",
            description: "Earned 5 or more upvotes from fellow developers",
            icon: "fa-solid fa-heart",
            unlocked: totalLikes >= 5
        },
        {
            id: "prolific_coder",
            title: "Prolific Contributor",
            description: "Shared 5 or more solutions with the community",
            icon: "fa-solid fa-award",
            unlocked: answersCount >= 5
        },
        {
            id: "admin_guardian",
            title: "Community Guardian",
            description: "Verified platform administrator and moderator",
            icon: "fa-solid fa-shield-halved",
            unlocked: isAdmin
        }
    ];

    return {
        xp,
        level,
        rankTitle,
        baseLevelXp,
        nextLevelXp,
        xpProgressPercent,
        totalLikes,
        solutionsCount,
        badges
    };
}

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

        if (checkIsAdmin(user) && !user.isAdmin) {
            user.isAdmin = true;
            await user.save().catch(() => {});
        }

        req.user = user;
        req.user.isAdmin = checkIsAdmin(user);
        next();
    } catch (error) {
        console.error("Token verification error:", error);
        res.status(500).json({ error: "Authentication failed" });
    }
}

function verifyAdmin(req, res, next) {
    if (!req.user || !checkIsAdmin(req.user)) {
        return res.status(403).json({ error: "Access denied. Administrator privileges required." });
    }
    next();
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

        // Check MongoDB connection readiness before querying to avoid buffering timeouts
        if (mongoose.connection.readyState !== 1) {
            console.error("❌ MongoDB is not connected (readyState:", mongoose.connection.readyState, ")");
            return res.redirect(`/login.html?error=db_disconnected&msg=${encodeURIComponent("Database is not connected on server. Please check MongoDB Atlas connection and IP access in Render settings.")}`);
        }

        const isUserAdmin = checkIsAdmin({ username: login });
        let user = await User.findOne({ githubId: String(id) });
        if (!user) {
            user = new User({
                githubId: String(id),
                username: login,
                avatarUrl: avatar_url || "default-avatar.png",
                token: accessToken,
                isAdmin: isUserAdmin
            });
            await user.save();
        } else {
            user.token = accessToken;
            user.username = login;
            user.avatarUrl = avatar_url || user.avatarUrl;
            if (isUserAdmin) user.isAdmin = true;
            await user.save();
        }

        const isProduction = process.env.NODE_ENV === "production";
        const cookieOpts = {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            path: "/",
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days persistence
        };
        res.cookie("token", accessToken, cookieOpts);
        res.cookie("username", user.username, { ...cookieOpts, httpOnly: false });
        res.cookie("avatarUrl", user.avatarUrl, { ...cookieOpts, httpOnly: false });
        res.cookie("isAdmin", String(checkIsAdmin(user)), { ...cookieOpts, httpOnly: false });

        res.redirect("/dashboard.html");
    } catch (error) {
        console.error("❌ Error exchanging GitHub code:", error.response?.data || error.message);
        res.redirect("/login.html?error=github_auth_failed");
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

        const isAdmin = checkIsAdmin(user);
        if (isAdmin && !user.isAdmin) {
            user.isAdmin = true;
            await user.save().catch(() => {});
        }

        res.json({
            loggedIn: true,
            userId: user._id,
            username: user.username,
            avatarUrl: user.avatarUrl || "default-avatar.png",
            isAdmin
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
        res.clearCookie("isAdmin", { sameSite: "Lax" });

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
        const userAnswers = await Answer.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .populate("questionId", "questionText isSolved solvedAnswerId")
            .lean();

        const gamification = computeUserGamification(req.user, questionsCount, answersCount, userQuestions, userAnswers);

        res.json({
            _id: req.user._id,
            username: req.user.username,
            avatarUrl: req.user.avatarUrl,
            isAdmin: checkIsAdmin(req.user),
            createdAt: req.user.createdAt,
            questionsCount,
            answersCount,
            questions: userQuestions,
            answers: userAnswers,
            gamification
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
        const userAnswers = await Answer.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .populate("questionId", "questionText isSolved solvedAnswerId")
            .lean();

        const gamification = computeUserGamification(user, questionsCount, answersCount, userQuestions, userAnswers);

        res.json({
            _id: user._id,
            username: user.username,
            avatarUrl: user.avatarUrl || "default-avatar.png",
            isAdmin: checkIsAdmin(user),
            createdAt: user.createdAt,
            questionsCount,
            answersCount,
            questions: userQuestions,
            answers: userAnswers,
            gamification
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

// ----------------- Real-Time Live Sync (SSE) -----------------
let sseClients = [];

app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (res.flushHeaders) res.flushHeaders();

    const clientId = Date.now() + "_" + Math.random().toString(36).substring(2);
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    // Initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

    req.on("close", () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

function broadcastEvent(type, payload) {
    const data = JSON.stringify({ type, payload, timestamp: Date.now() });
    sseClients.forEach(client => {
        try {
            client.res.write(`data: ${data}\n\n`);
        } catch (e) {
            // Client closed connection
        }
    });
}

// Keep-alive heartbeat every 20 seconds to prevent proxy / Render connection timeouts
setInterval(() => {
    sseClients.forEach(client => {
        try {
            client.res.write(": keepalive\n\n");
        } catch (e) {}
    });
}, 20000);

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

        let sortOption = { isPinned: -1, createdAt: -1 };
        if (tab === "popular") {
            sortOption = { isPinned: -1, likes: -1, createdAt: -1 };
        }

        let questions = await Question.find(filter)
            .sort(sortOption)
            .populate("userId", "username avatarUrl isAdmin")
            .lean();

        // Get current user and admin status
        const token = req.cookies.token;
        let currentUserId = null;
        let currentUserIsAdmin = false;
        if (token) {
            const user = await User.findOne({ token });
            if (user) {
                currentUserId = user._id.toString();
                currentUserIsAdmin = checkIsAdmin(user);
            }
        }

        let questionsWithDetails = await Promise.all(
            questions.map(async (q) => {
                const answerCount = await Answer.countDocuments({ questionId: q._id });
                const isLiked = currentUserId && q.likedBy ? q.likedBy.some(id => id.toString() === currentUserId) : false;
                const isOwner = currentUserId && q.userId ? q.userId._id.toString() === currentUserId : false;
                const authorIsAdmin = q.userId ? checkIsAdmin(q.userId) : false;
                return {
                    ...q,
                    isPinned: Boolean(q.isPinned),
                    isLocked: Boolean(q.isLocked),
                    answerCount,
                    isLiked,
                    isOwner,
                    authorIsAdmin,
                    canManage: isOwner || currentUserIsAdmin,
                    currentUserIsAdmin
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
            .populate("userId", "username avatarUrl isAdmin")
            .lean();

        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        const answerCount = await Answer.countDocuments({ questionId: question._id });
        const token = req.cookies.token;
        let isOwner = false;
        let isLiked = false;
        let currentUserIsAdmin = false;

        if (token) {
            const user = await User.findOne({ token });
            if (user) {
                const uid = user._id.toString();
                currentUserIsAdmin = checkIsAdmin(user);
                if (question.userId) {
                    isOwner = question.userId._id.toString() === uid;
                }
                if (question.likedBy) {
                    isLiked = question.likedBy.some(id => id.toString() === uid);
                }
            }
        }

        const authorIsAdmin = question.userId ? checkIsAdmin(question.userId) : false;
        res.json({
            ...question,
            isPinned: Boolean(question.isPinned),
            isLocked: Boolean(question.isLocked),
            answerCount,
            isOwner,
            isLiked,
            authorIsAdmin,
            canManage: isOwner || currentUserIsAdmin,
            currentUserIsAdmin
        });
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
            .populate("userId", "username avatarUrl isAdmin");

        const qObj = {
            ...populatedQuestion.toObject(),
            answerCount: 0,
            isPinned: false,
            isLocked: false,
            authorIsAdmin: checkIsAdmin(req.user)
        };
        broadcastEvent("new_question", { question: qObj });

        res.status(201).json({
            message: "Question posted successfully!",
            question: { ...qObj, isOwner: true, canManage: true }
        });
    } catch (error) {
        console.error("❌ Error posting question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Edit a question (Author or Admin)
app.put("/questions/:questionId", verifyToken, async (req, res) => {
    try {
        const { questionText, tags } = req.body;
        const question = await Question.findById(req.params.questionId);
        if (!question) return res.status(404).json({ error: "Question not found" });

        const isOwner = question.userId.toString() === req.user._id.toString();
        const isAdmin = checkIsAdmin(req.user);
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "Not authorized to edit this question." });
        }

        if (questionText && questionText.trim()) {
            question.questionText = questionText.trim();
        }

        if (tags !== undefined) {
            let parsedTags = [];
            if (Array.isArray(tags)) {
                parsedTags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
            } else if (typeof tags === "string") {
                parsedTags = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
            }
            question.tags = parsedTags.slice(0, 5);
        }

        await question.save();
        const updated = await Question.findById(question._id).populate("userId", "username avatarUrl isAdmin");
        broadcastEvent("question_updated", { question: updated });

        res.json({ success: true, message: "Question updated successfully!", question: updated });
    } catch (error) {
        console.error("❌ Error updating question:", error);
        res.status(500).json({ error: "Failed to update question" });
    }
});

// Toggle solved status on question (Author or Admin)
app.post("/questions/:questionId/solve/:answerId", verifyToken, async (req, res) => {
    try {
        const { questionId, answerId } = req.params;
        const question = await Question.findById(questionId);

        if (!question) return res.status(404).json({ error: "Question not found" });
        const isOwner = question.userId.toString() === req.user._id.toString();
        const isAdmin = checkIsAdmin(req.user);
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "Only the question creator or an administrator can accept a solution." });
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
        broadcastEvent("question_solved", {
            questionId: question._id,
            isSolved: question.isSolved,
            solvedAnswerId: question.solvedAnswerId
        });

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

// Delete a question (Author or Admin)
app.delete("/questions/:questionId", verifyToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        const isOwner = question.userId.toString() === req.user._id.toString();
        const isAdmin = checkIsAdmin(req.user);
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "Not authorized to delete this question" });
        }

        await Answer.deleteMany({ questionId: question._id });
        await Question.findByIdAndDelete(question._id);
        broadcastEvent("question_deleted", { questionId: question._id });

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
        broadcastEvent("question_liked", { questionId: question._id, likes: question.likes });

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
            .sort({ createdAt: -1 }) // Newest first so newly posted answers are added in first
            .populate("userId", "username avatarUrl isAdmin")
            .lean();

        const token = req.cookies.token;
        let currentUserId = null;
        let currentUserIsAdmin = false;
        if (token) {
            const user = await User.findOne({ token });
            if (user) {
                currentUserId = user._id.toString();
                currentUserIsAdmin = checkIsAdmin(user);
            }
        }

        const enrichedAnswers = answers.map(ans => {
            const isOwner = currentUserId && ans.userId ? ans.userId._id.toString() === currentUserId : false;
            return {
                ...ans,
                likes: ans.likes || 0,
                isLiked: currentUserId && ans.likedBy ? ans.likedBy.some(id => id.toString() === currentUserId) : false,
                isOwner,
                canManage: isOwner || currentUserIsAdmin,
                authorIsAdmin: ans.userId ? checkIsAdmin(ans.userId) : false,
                isAcceptedSolution: question.isSolved && String(question.solvedAnswerId) === String(ans._id)
            };
        });

        // Pin accepted solution at top (if present), while keeping newest answers first
        enrichedAnswers.sort((a, b) => {
            if (a.isAcceptedSolution && !b.isAcceptedSolution) return -1;
            if (!a.isAcceptedSolution && b.isAcceptedSolution) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        res.json(enrichedAnswers);
    } catch (error) {
        console.error("❌ Error fetching answers:", error);
        res.status(500).json({ error: "Failed to fetch answers" });
    }
});

// Like / Upvote an answer
app.post("/answers/:answerId/like", verifyToken, async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.answerId);
        if (!answer) {
            return res.status(404).json({ error: "Answer not found" });
        }

        const userIdStr = req.user._id.toString();
        if (!answer.likedBy) answer.likedBy = [];
        const alreadyLikedIndex = answer.likedBy.findIndex(id => id.toString() === userIdStr);

        let isLiked = false;
        if (alreadyLikedIndex > -1) {
            answer.likedBy.splice(alreadyLikedIndex, 1);
            answer.likes = Math.max(0, (answer.likes || 1) - 1);
        } else {
            answer.likedBy.push(req.user._id);
            answer.likes = (answer.likes || 0) + 1;
            isLiked = true;
        }

        await answer.save();
        broadcastEvent("answer_liked", {
            questionId: answer.questionId,
            answerId: answer._id,
            likes: answer.likes
        });

        res.json({ success: true, likes: answer.likes, isLiked });
    } catch (error) {
        console.error("❌ Error liking answer:", error);
        res.status(500).json({ error: "Failed to toggle like on answer" });
    }
});

// Post an answer (Blocked if question is locked, unless admin)
app.post("/answers/:questionId", verifyToken, async (req, res) => {
    try {
        const { answerText, audioNote } = req.body;
        const textContent = (answerText || "").trim();
        const hasAudio = audioNote && typeof audioNote.audioData === "string" && audioNote.audioData.startsWith("data:audio/");

        if (!textContent && !hasAudio) {
            return res.status(400).json({ error: "Answer text or audio walkthrough is required" });
        }

        const question = await Question.findById(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        if (question.isLocked && !checkIsAdmin(req.user)) {
            return res.status(403).json({ error: "This discussion has been locked by an administrator. New answers are closed." });
        }

        let sanitizedAudioNote = null;
        if (hasAudio) {
            sanitizedAudioNote = {
                audioData: audioNote.audioData,
                duration: Math.min(180, Math.max(1, Math.round(Number(audioNote.duration) || 0))),
                mimeType: typeof audioNote.mimeType === "string" ? audioNote.mimeType : "audio/webm"
            };
        }

        const newAnswer = new Answer({
            userId: req.user._id,
            questionId: req.params.questionId,
            answerText: textContent || "🎙️ [Voice Walkthrough Attached]",
            audioNote: sanitizedAudioNote
        });

        await newAnswer.save();

        const populatedAnswer = await Answer.findById(newAnswer._id)
            .populate("userId", "username avatarUrl isAdmin");

        const totalAnswers = await Answer.countDocuments({ questionId: question._id });
        broadcastEvent("new_answer", {
            questionId: question._id,
            answer: { ...populatedAnswer.toObject(), likes: 0, authorIsAdmin: checkIsAdmin(req.user) },
            answerCount: totalAnswers
        });

        res.status(201).json({
            message: "Answer posted successfully!",
            answer: { ...populatedAnswer.toObject(), isOwner: true, canManage: true, authorIsAdmin: checkIsAdmin(req.user) }
        });
    } catch (error) {
        console.error("❌ Error posting answer:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Edit an answer (Author or Admin)
app.put("/answers/:answerId", verifyToken, async (req, res) => {
    try {
        const { answerText, audioNote } = req.body;
        const textContent = answerText !== undefined ? answerText.trim() : null;

        const answer = await Answer.findById(req.params.answerId);
        if (!answer) return res.status(404).json({ error: "Answer not found" });

        const isOwner = answer.userId.toString() === req.user._id.toString();
        const isAdmin = checkIsAdmin(req.user);
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "Not authorized to edit this answer" });
        }

        if (textContent !== null) {
            answer.answerText = textContent;
        }

        if (audioNote !== undefined) {
            if (audioNote && typeof audioNote.audioData === "string" && audioNote.audioData.startsWith("data:audio/")) {
                answer.audioNote = {
                    audioData: audioNote.audioData,
                    duration: Math.min(180, Math.max(1, Math.round(Number(audioNote.duration) || 0))),
                    mimeType: typeof audioNote.mimeType === "string" ? audioNote.mimeType : "audio/webm"
                };
            } else if (audioNote === null) {
                answer.audioNote = null;
            }
        }

        await answer.save();

        const updated = await Answer.findById(answer._id).populate("userId", "username avatarUrl isAdmin");
        broadcastEvent("answer_updated", { questionId: answer.questionId, answer: updated });

        res.json({ success: true, message: "Answer updated successfully", answer: updated });
    } catch (error) {
        console.error("❌ Error updating answer:", error);
        res.status(500).json({ error: "Failed to update answer" });
    }
});

// Delete an answer (Author or Admin)
app.delete("/answers/:answerId", verifyToken, async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.answerId);
        if (!answer) {
            return res.status(404).json({ error: "Answer not found" });
        }

        const isOwner = answer.userId.toString() === req.user._id.toString();
        const isAdmin = checkIsAdmin(req.user);
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "Not authorized to delete this answer" });
        }

        const qId = answer.questionId;

        // If this answer was the accepted solution, reset question solution
        await Question.updateOne(
            { solvedAnswerId: answer._id },
            { $set: { isSolved: false, solvedAnswerId: null } }
        );

        await Answer.findByIdAndDelete(answer._id);
        const remainingAnswers = await Answer.countDocuments({ questionId: qId });

        broadcastEvent("answer_deleted", {
            questionId: qId,
            answerId: answer._id,
            answerCount: remainingAnswers
        });

        res.json({ success: true, message: "Answer deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting answer:", error);
        res.status(500).json({ error: "Failed to delete answer" });
    }
});

// ----------------- Admin Management Routes -----------------

// Admin Stats
app.get("/api/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalQuestions = await Question.countDocuments();
        const totalAnswers = await Answer.countDocuments();
        const totalSolved = await Question.countDocuments({ isSolved: true });
        const totalPinned = await Question.countDocuments({ isPinned: true });
        const totalLocked = await Question.countDocuments({ isLocked: true });

        res.json({ totalUsers, totalQuestions, totalAnswers, totalSolved, totalPinned, totalLocked });
    } catch (error) {
        console.error("❌ Error fetching admin stats:", error);
        res.status(500).json({ error: "Failed to fetch admin stats" });
    }
});

// Admin Pin / Unpin question
app.post("/api/admin/questions/:questionId/pin", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (!question) return res.status(404).json({ error: "Question not found" });

        question.isPinned = !question.isPinned;
        await question.save();

        broadcastEvent("question_pinned", { questionId: question._id, isPinned: question.isPinned });
        res.json({
            success: true,
            isPinned: question.isPinned,
            message: question.isPinned ? "Question pinned to top!" : "Question unpinned."
        });
    } catch (error) {
        console.error("❌ Error toggling pin:", error);
        res.status(500).json({ error: "Failed to toggle pin" });
    }
});

// Admin Lock / Unlock question
app.post("/api/admin/questions/:questionId/lock", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (!question) return res.status(404).json({ error: "Question not found" });

        question.isLocked = !question.isLocked;
        await question.save();

        broadcastEvent("question_locked", { questionId: question._id, isLocked: question.isLocked });
        res.json({
            success: true,
            isLocked: question.isLocked,
            message: question.isLocked ? "Discussion locked (no new answers)." : "Discussion unlocked."
        });
    } catch (error) {
        console.error("❌ Error toggling lock:", error);
        res.status(500).json({ error: "Failed to toggle lock" });
    }
});

// Admin list all questions for panel
app.get("/api/admin/all-questions", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const questions = await Question.find({})
            .sort({ isPinned: -1, createdAt: -1 })
            .populate("userId", "username avatarUrl")
            .lean();

        const enriched = await Promise.all(questions.map(async q => {
            const answerCount = await Answer.countDocuments({ questionId: q._id });
            return { ...q, answerCount };
        }));

        res.json(enriched);
    } catch (error) {
        console.error("❌ Error fetching admin questions:", error);
        res.status(500).json({ error: "Failed to fetch admin questions" });
    }
});

// Admin list all recent answers for panel
app.get("/api/admin/all-answers", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const answers = await Answer.find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .populate("userId", "username avatarUrl")
            .populate("questionId", "questionText")
            .lean();

        res.json(answers);
    } catch (error) {
        console.error("❌ Error fetching admin answers:", error);
        res.status(500).json({ error: "Failed to fetch admin answers" });
    }
});

// Claim Admin / Ensure Admin endpoint
app.post("/api/admin/claim-admin", verifyToken, async (req, res) => {
    try {
        const isEligible = checkIsAdmin(req.user) || (req.body.adminSecret && req.body.adminSecret === process.env.SESSION_SECRET);
        if (isEligible) {
            req.user.isAdmin = true;
            await req.user.save();
            const cookieOpts = {
                httpOnly: false,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 30 * 24 * 60 * 60 * 1000
            };
            res.cookie("isAdmin", "true", cookieOpts);
            return res.json({ success: true, isAdmin: true, message: `Admin privileges confirmed for ${req.user.username}!` });
        }
        res.status(403).json({ error: "Not authorized to claim admin role." });
    } catch (error) {
        console.error("❌ Error claiming admin:", error);
        res.status(500).json({ error: "Failed to claim admin" });
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

// ----------------- Live Collab Debug Room REST Endpoints -----------------
const collabRooms = new Map();

function getOrCreateRoom(roomId, initialData = {}) {
    const cleanId = String(roomId || "").trim().toUpperCase();
    if (!collabRooms.has(cleanId)) {
        collabRooms.set(cleanId, {
            id: cleanId,
            questionId: initialData.questionId || null,
            title: initialData.title || "Collaborative Debug Session",
            code: initialData.code || '// Welcome to CodeQuest Live Debug Room!\n// Both developers can code and debug face-to-face in real-time.\n\nfunction solution() {\n    console.log("Ready to pair-program!");\n}\n\nsolution();\n',
            lang: initialData.lang || "javascript",
            peers: new Map(), // peerId -> { ws, user, isMuted, isVideoOff }
            createdAt: Date.now()
        });
    }
    return collabRooms.get(cleanId);
}

// Create or join room endpoint
app.post("/api/collab/create-room", async (req, res) => {
    try {
        const { questionId, title, code, lang } = req.body || {};
        const randomCode = `CQ-${Math.floor(1000 + Math.random() * 9000)}`;
        const room = getOrCreateRoom(randomCode, { questionId, title, code, lang });
        res.json({
            success: true,
            roomId: room.id,
            roomUrl: `/collab.html?room=${room.id}` + (questionId ? `&questionId=${questionId}` : "")
        });
    } catch (err) {
        console.error("Error creating collab room:", err);
        res.status(500).json({ error: "Failed to create room" });
    }
});

// Get room details
app.get("/api/collab/room/:roomId", (req, res) => {
    const cleanId = String(req.params.roomId || "").trim().toUpperCase();
    const room = collabRooms.get(cleanId);
    if (!room) {
        return res.status(404).json({ error: "Room not found or expired" });
    }
    res.json({
        success: true,
        room: {
            id: room.id,
            questionId: room.questionId,
            title: room.title,
            code: room.code,
            lang: room.lang,
            peerCount: room.peers.size
        }
    });
});

// Helper to resolve an authenticated user or safely fallback to an author account
async function resolveCollabUser(req) {
    try {
        if (req.cookies && req.cookies.token) {
            const u = await User.findOne({ token: req.cookies.token });
            if (u) return u;
        }
        let fallbackUser = await User.findOne({ isAdmin: false });
        if (!fallbackUser) fallbackUser = await User.findOne({});
        if (!fallbackUser) {
            fallbackUser = new User({
                username: "CodeQuestDeveloper",
                token: "collab_demo_" + Date.now(),
                avatarUrl: "default-avatar.png",
                isDemo: true
            });
            await fallbackUser.save().catch(() => {});
        }
        return fallbackUser;
    } catch (e) {
        console.warn("Collab author resolution note:", e);
        return null;
    }
}

// Export debugged solution as an Answer
app.post("/api/collab/export-answer", async (req, res) => {
    try {
        const { questionId, code, lang, notes } = req.body;
        if (!questionId) {
            return res.status(400).json({ error: "Please select or link a question to answer" });
        }
        if (!code || !code.trim()) {
            return res.status(400).json({ error: "Code snippet cannot be empty" });
        }

        const question = await Question.findById(questionId);
        if (!question) {
            return res.status(404).json({ error: "Target question was not found in database" });
        }

        const author = await resolveCollabUser(req);
        if (!author) {
            return res.status(500).json({ error: "Unable to resolve author profile" });
        }

        const answerContent = `### 👥 Live Pair Programming Solution\n${notes ? `*Debug Notes: ${notes.trim()}*\n\n` : ""}\`\`\`${lang || "javascript"}\n${code.trim()}\n\`\`\`\n\n*Solved collaboratively in CodeQuest Live Collab Room.*`;

        const newAnswer = new Answer({
            userId: author._id,
            questionId: question._id,
            answerText: answerContent
        });

        await newAnswer.save();

        res.json({
            success: true,
            questionId: question._id,
            answerId: newAnswer._id,
            message: "Solution exported and posted to question thread successfully!"
        });
    } catch (err) {
        console.error("Error exporting collab answer:", err);
        res.status(500).json({ error: "Failed to export answer: " + err.message });
    }
});

// Export debugged code as a New Question
app.post("/api/collab/export-question", async (req, res) => {
    try {
        const { title, code, lang, tags, description } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ error: "Question title is required" });
        }

        const author = await resolveCollabUser(req);
        if (!author) {
            return res.status(500).json({ error: "Unable to resolve author profile" });
        }

        const formattedQuestionText = `${title.trim()}\n\n${description ? `${description.trim()}\n\n` : ""}\`\`\`${lang || "javascript"}\n${(code || "").trim()}\n\`\`\``;

        const tagList = Array.isArray(tags) ? tags : (tags ? String(tags).split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : ["debugging", lang || "javascript"]);

        const newQuestion = new Question({
            userId: author._id,
            questionText: formattedQuestionText,
            tags: tagList
        });

        await newQuestion.save();

        res.json({
            success: true,
            questionId: newQuestion._id,
            message: "New question created successfully from Live Collab Room!"
        });
    } catch (err) {
        console.error("Error creating collab question:", err);
        res.status(500).json({ error: "Failed to create question: " + err.message });
    }
});

// Get recent questions for linking in Collab room
app.get("/api/collab/recent-questions", async (req, res) => {
    try {
        const questions = await Question.find({})
            .sort({ createdAt: -1 })
            .limit(15)
            .select("_id questionText isSolved createdAt")
            .lean();
        
        const mapped = questions.map(q => ({
            _id: q._id,
            id: q._id,
            title: q.questionText ? q.questionText.split("\n")[0].slice(0, 80) : "Untitled Question",
            isSolved: q.isSolved
        }));

        res.json({ success: true, questions: mapped });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch questions" });
    }
});

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Setup WebSocket Server for Real-Time Collab & WebRTC Signaling
const wss = new WebSocketServer({ server, path: "/ws/collab" });

wss.on("connection", (ws, req) => {
    let currentRoomId = null;
    let currentPeerId = null;
    let currentUser = null;

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const { type, roomId } = data;

            if (type === "join-room") {
                currentRoomId = String(roomId || "").trim().toUpperCase();
                currentPeerId = data.peerId || `peer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                currentUser = data.user || { username: "Guest Developer", avatarUrl: "default-avatar.png" };

                const room = getOrCreateRoom(currentRoomId, {
                    questionId: data.questionId,
                    title: data.title,
                    code: data.code,
                    lang: data.lang
                });

                // Gather list of existing peers in the room
                const existingPeers = [];
                room.peers.forEach((peer, pId) => {
                    existingPeers.push({ peerId: pId, user: peer.user, isMuted: peer.isMuted, isVideoOff: peer.isVideoOff });
                });

                // Add new peer
                room.peers.set(currentPeerId, {
                    ws,
                    user: currentUser,
                    isMuted: false,
                    isVideoOff: false,
                    joinedAt: Date.now()
                });

                // Confirm join to the new peer with room state
                ws.send(JSON.stringify({
                    type: "room-joined",
                    peerId: currentPeerId,
                    roomId: currentRoomId,
                    code: room.code,
                    lang: room.lang,
                    title: room.title,
                    questionId: room.questionId,
                    peers: existingPeers
                }));

                // Broadcast to all existing peers that a new peer joined
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "peer-joined",
                            peerId: currentPeerId,
                            user: currentUser
                        }));
                    }
                });
                return;
            }

            if (!currentRoomId || !collabRooms.has(currentRoomId)) return;
            const room = collabRooms.get(currentRoomId);

            // WebRTC Signaling: route offer, answer, ice-candidate
            if (type === "webrtc-signal") {
                const targetPeer = room.peers.get(data.targetPeerId);
                if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
                    targetPeer.ws.send(JSON.stringify({
                        type: "webrtc-signal",
                        fromPeerId: currentPeerId,
                        signal: data.signal
                    }));
                }
                return;
            }

            // Real-Time Code Change: broadcast to all other peers
            if (type === "code-change") {
                room.code = data.code;
                if (data.lang) room.lang = data.lang;

                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "code-change",
                            fromPeerId: currentPeerId,
                            fromUser: currentUser ? currentUser.username : "Partner",
                            code: data.code,
                            lang: data.lang,
                            cursor: data.cursor
                        }));
                    }
                });
                return;
            }

            // Synchronized Run Event: broadcast run trigger & results
            if (type === "run-code" || type === "run-result") {
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            ...data,
                            fromPeerId: currentPeerId,
                            fromUser: currentUser ? currentUser.username : "Partner"
                        }));
                    }
                });
                return;
            }

            // In-room Chat message: broadcast to all peers
            if (type === "chat-message") {
                room.peers.forEach((peer, pId) => {
                    if (peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "chat-message",
                            fromPeerId: currentPeerId,
                            message: data.message
                        }));
                    }
                });
                return;
            }

            // Peer Media Status (Muted/VideoOff/ScreenSharing)
            if (type === "peer-status") {
                const myPeer = room.peers.get(currentPeerId);
                if (myPeer) {
                    if (data.isMuted !== undefined) myPeer.isMuted = data.isMuted;
                    if (data.isVideoOff !== undefined) myPeer.isVideoOff = data.isVideoOff;
                }
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "peer-status",
                            peerId: currentPeerId,
                            ...data
                        }));
                    }
                });
                return;
            }

        } catch (e) {
            console.error("Collab WS message error:", e);
        }
    });

    ws.on("close", () => {
        if (currentRoomId && currentPeerId && collabRooms.has(currentRoomId)) {
            const room = collabRooms.get(currentRoomId);
            room.peers.delete(currentPeerId);

            // Notify remaining peers
            room.peers.forEach((peer) => {
                if (peer.ws.readyState === WebSocket.OPEN) {
                    peer.ws.send(JSON.stringify({
                        type: "peer-left",
                        peerId: currentPeerId,
                        user: currentUser
                    }));
                }
            });

            // If empty, schedule cleanup after 30 mins
            if (room.peers.size === 0) {
                setTimeout(() => {
                    if (collabRooms.has(currentRoomId) && collabRooms.get(currentRoomId).peers.size === 0) {
                        collabRooms.delete(currentRoomId);
                    }
                }, 30 * 60 * 1000);
            }
        }
    });
});

// Start the HTTP & WebSocket server
server.listen(PORT, () => {
    console.log(`🚀 CodeQuest Server with Live Collab WebSockets is running on http://localhost:${PORT}`);
});

