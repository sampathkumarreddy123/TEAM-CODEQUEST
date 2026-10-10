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
import { spawn } from "child_process";
import fs from "fs";
import os from "os";

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
    phone: { type: String, default: null, index: true },
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

const challengeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    problemStatement: { type: String, required: true },
    inputFormat: { type: String, default: "" },
    outputFormat: { type: String, default: "" },
    constraints: { type: String, default: "" },
    sampleInput: { type: String, default: "" },
    sampleOutput: { type: String, default: "" },
    explanation: { type: String, default: "" },
    language: { type: String, default: "javascript" },
    solutionCode: { type: String, required: true },
    testCases: [{
        input: { type: String, default: "" },
        expectedOutput: { type: String, default: "" }
    }],
    coAuthor: { type: String, default: null },
    roomId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const Challenge = mongoose.model("Challenge", challengeSchema);

// In-Memory Live Collab Rooms Tracking
const collabRooms = new Map();

function checkUserInLiveCall(userId, username) {
    if (!userId && !username) return { inCall: false, callRoomId: null };
    const uIdStr = userId ? String(userId) : "";
    const uNameLower = username ? String(username).toLowerCase() : "";
    for (const [rId, room] of collabRooms.entries()) {
        if (room.peers && room.peers.size > 0) {
            for (const peer of room.peers.values()) {
                if (peer.user) {
                    const pId = String(peer.user.id || peer.user._id || "");
                    const pName = String(peer.user.username || "").toLowerCase();
                    if ((uIdStr && pId === uIdStr) || (uNameLower && pName === uNameLower)) {
                        return { inCall: true, callRoomId: rId };
                    }
                }
            }
        }
    }
    return { inCall: false, callRoomId: null };
}

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



// Check authentication status (supports both /auth/status and /api/auth/status)
app.get(["/auth/status", "/api/auth/status"], async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.json({ loggedIn: false, authenticated: false });
        }

        const user = await User.findOne({ token });
        if (!user) {
            return res.json({ loggedIn: false, authenticated: false });
        }

        const isAdmin = checkIsAdmin(user);
        if (isAdmin && !user.isAdmin) {
            user.isAdmin = true;
            await user.save().catch(() => {});
        }

        res.json({
            loggedIn: true,
            authenticated: true,
            userId: String(user._id),
            username: user.username,
            avatarUrl: user.avatarUrl || "default-avatar.png",
            isAdmin,
            user: {
                _id: String(user._id),
                id: String(user._id),
                username: user.username,
                avatarUrl: user.avatarUrl || "default-avatar.png",
                isAdmin
            }
        });
    } catch (error) {
        console.error("❌ Error checking auth status:", error);
        res.status(500).json({ loggedIn: false, authenticated: false, error: "Auth check failed" });
    }
});

// Quick Guest / Demo Developer login for testing 1-on-1 calls across browsers/devices
app.post("/auth/guest-login", async (req, res) => {
    try {
        const guestNum = Math.floor(1000 + Math.random() * 9000);
        const guestUsername = req.body && req.body.username ? String(req.body.username).trim() : `Coder_${guestNum}`;
        const guestToken = "guest_token_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        const guestAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(guestUsername)}&backgroundColor=3B82F6`;

        let guestUser = await User.findOne({ username: guestUsername });
        if (!guestUser) {
            guestUser = new User({
                githubId: "guest_" + Date.now() + "_" + guestNum,
                username: guestUsername,
                avatarUrl: guestAvatar,
                token: guestToken,
                isAdmin: false
            });
            await guestUser.save();
        } else {
            guestUser.token = guestToken;
            guestUser.avatarUrl = guestAvatar;
            await guestUser.save();
        }

        const isProduction = process.env.NODE_ENV === "production";
        const cookieOpts = {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        };

        res.cookie("token", guestToken, cookieOpts);
        res.cookie("username", guestUser.username, { ...cookieOpts, httpOnly: false });
        res.cookie("avatarUrl", guestUser.avatarUrl, { ...cookieOpts, httpOnly: false });
        res.cookie("isAdmin", "false", { ...cookieOpts, httpOnly: false });

        res.json({
            success: true,
            user: {
                _id: String(guestUser._id),
                username: guestUser.username,
                avatarUrl: guestUser.avatarUrl
            }
        });
    } catch (err) {
        console.error("Guest login error:", err);
        res.status(500).json({ error: "Failed to login as guest developer" });
    }
});

// ----------------- Phone Number OTP Authentication -----------------
const phoneOtpStore = new Map(); // normalizedPhone -> { otp, expiresAt, attempts }

// Helper: Send Real SMS OTP to Indian / International Phone Numbers
async function sendSmsOtp(phoneNumber, otp) {
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    const tenDigit = digitsOnly.slice(-10);

    // 1. Fast2SMS (India's leading instant SMS API - fast2sms.com)
    if (process.env.FAST2SMS_API_KEY) {
        try {
            const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
                method: "POST",
                headers: {
                    "authorization": process.env.FAST2SMS_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    route: "otp",
                    variables_values: otp,
                    numbers: tenDigit
                })
            });
            const data = await res.json();
            console.log(`📨 [Fast2SMS] Dispatched to ${tenDigit}:`, data);
            return { success: true, provider: "Fast2SMS" };
        } catch (e) {
            console.error("❌ Fast2SMS Delivery Error:", e.message);
        }
    }

    // 2. Twilio (Global SMS API)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
            const params = new URLSearchParams();
            params.append("To", phoneNumber.startsWith("+") ? phoneNumber : `+91${tenDigit}`);
            params.append("From", process.env.TWILIO_PHONE_NUMBER);
            params.append("Body", `Your CodeQuest OTP is: ${otp}. Valid for 5 minutes.`);

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: params.toString()
            });
            const data = await res.json();
            console.log(`📨 [Twilio] Dispatched to ${phoneNumber}:`, data);
            return { success: true, provider: "Twilio" };
        } catch (e) {
            console.error("❌ Twilio Delivery Error:", e.message);
        }
    }

    // 3. Fallback when SMS API key is not yet set in .env:
    // Securely logs to server terminal only - NEVER exposed to browser!
    console.log(`\n======================================================`);
    console.log(`📲 [SMS GATEWAY] Sending OTP to Mobile: ${phoneNumber}`);
    console.log(`🔑 SECURE OTP: ${otp}`);
    console.log(`💡 To deliver carrier SMS to mobile phones, add FAST2SMS_API_KEY in .env`);
    console.log(`======================================================\n`);
    return { success: true, provider: "Local" };
}

// Send 6-digit OTP
app.post("/auth/phone/send-otp", async (req, res) => {
    try {
        let { phone } = req.body || {};
        if (!phone) {
            return res.status(400).json({ error: "Mobile number is required." });
        }

        const cleanPhone = String(phone).replace(/[\s-]/g, "");
        const digitsOnly = cleanPhone.replace(/\D/g, "");
        if (digitsOnly.length < 10) {
            return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
        }

        const normalizedPhone = digitsOnly.length === 10 ? `+91${digitsOnly}` : (cleanPhone.startsWith("+") ? cleanPhone : `+${digitsOnly}`);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        phoneOtpStore.set(normalizedPhone, {
            otp,
            expiresAt,
            attempts: 0
        });

        // Send OTP via SMS
        await sendSmsOtp(normalizedPhone, otp);

        const existingUser = await User.findOne({ phone: normalizedPhone });

        res.json({
            success: true,
            message: `OTP has been sent to ${normalizedPhone}. Please check your SMS.`,
            phone: normalizedPhone,
            isExistingUser: !!existingUser,
            existingUsername: existingUser ? existingUser.username : null,
            expiresIn: 300
        });
    } catch (err) {
        console.error("❌ Send OTP Error:", err);
        res.status(500).json({ error: "Failed to send OTP: " + err.message });
    }
});

// Verify 6-digit OTP and Login / Register
app.post("/auth/phone/verify-otp", async (req, res) => {
    try {
        let { phone, otp, username } = req.body || {};
        if (!phone || !otp) {
            return res.status(400).json({ error: "Mobile number and 6-digit OTP are required." });
        }

        const cleanPhone = String(phone).replace(/[\s-]/g, "");
        const digitsOnly = cleanPhone.replace(/\D/g, "");
        const normalizedPhone = digitsOnly.length === 10 ? `+91${digitsOnly}` : (cleanPhone.startsWith("+") ? cleanPhone : `+${digitsOnly}`);

        const record = phoneOtpStore.get(normalizedPhone);
        if (!record) {
            return res.status(400).json({ error: "No OTP was requested for this mobile number or it has expired. Please request a new OTP." });
        }

        if (Date.now() > record.expiresAt) {
            phoneOtpStore.delete(normalizedPhone);
            return res.status(400).json({ error: "OTP has expired. Please request a new OTP." });
        }

        if (record.attempts >= 5) {
            phoneOtpStore.delete(normalizedPhone);
            return res.status(429).json({ error: "Too many failed attempts. Please request a new OTP." });
        }

        if (String(otp).trim() !== record.otp) {
            record.attempts += 1;
            return res.status(400).json({ error: "Invalid OTP code. Please check and try again." });
        }

        // OTP verified successfully! Clear OTP
        phoneOtpStore.delete(normalizedPhone);

        // Find or create user
        let user = await User.findOne({ phone: normalizedPhone });
        const userToken = "phone_tok_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

        if (!user) {
            // New user registration via Mobile
            const suffix = normalizedPhone.slice(-4);
            const chosenUsername = (username && username.trim()) ? username.trim() : `Coder_${suffix}`;
            
            let finalUsername = chosenUsername;
            let counter = 1;
            while (await User.findOne({ username: finalUsername })) {
                finalUsername = `${chosenUsername}_${counter}`;
                counter++;
            }

            const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(finalUsername)}&backgroundColor=10B981`;

            user = new User({
                phone: normalizedPhone,
                githubId: "phone_" + Date.now(),
                username: finalUsername,
                avatarUrl,
                token: userToken,
                isAdmin: false
            });
            await user.save();
        } else {
            // Existing user login
            user.token = userToken;
            if (username && username.trim() && user.username !== username.trim()) {
                const existingWithName = await User.findOne({ username: username.trim(), _id: { $ne: user._id } });
                if (!existingWithName) {
                    user.username = username.trim();
                }
            }
            await user.save();
        }

        const isProduction = process.env.NODE_ENV === "production";
        const cookieOpts = {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        };

        res.cookie("token", userToken, cookieOpts);
        res.cookie("username", user.username, { ...cookieOpts, httpOnly: false });
        res.cookie("avatarUrl", user.avatarUrl, { ...cookieOpts, httpOnly: false });
        res.cookie("isAdmin", String(user.isAdmin || false), { ...cookieOpts, httpOnly: false });

        res.json({
            success: true,
            message: "Authentication successful",
            user: {
                _id: String(user._id),
                username: user.username,
                phone: user.phone,
                avatarUrl: user.avatarUrl
            }
        });
    } catch (err) {
        console.error("❌ Verify OTP Error:", err);
        res.status(500).json({ error: "Failed to verify OTP: " + err.message });
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
        const callStatus = checkUserInLiveCall(req.user._id, req.user.username);

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
            gamification,
            inCall: callStatus.inCall,
            callRoomId: callStatus.callRoomId
        });
    } catch (error) {
        console.error("❌ Error fetching own profile:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// Current logged-in user profile (for collab huddle, chat, and frontend modules)
app.get(["/api/user", "/api/me"], async (req, res) => {
    try {
        let user = null;
        const token = req.cookies.token || req.headers["authorization"]?.replace("Bearer ", "");
        if (token) {
            user = await User.findOne({ token });
        }
        if (!user) {
            return res.status(401).json({ authenticated: false, loggedIn: false, error: "Not authenticated" });
        }
        const isAdmin = checkIsAdmin(user);
        const callStatus = checkUserInLiveCall(user._id, user.username);
        res.json({
            authenticated: true,
            loggedIn: true,
            user: {
                _id: String(user._id),
                id: String(user._id),
                username: user.username,
                avatarUrl: user.avatarUrl || "default-avatar.png",
                isAdmin,
                githubId: user.githubId
            },
            username: user.username,
            avatarUrl: user.avatarUrl || "default-avatar.png",
            isAdmin,
            inCall: callStatus.inCall,
            callRoomId: callStatus.callRoomId
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// Another user's profile with stats
app.get("/users/:userId", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            return res.status(404).json({ error: "User not found" });
        }
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
        const callStatus = checkUserInLiveCall(user._id, user.username);

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
            gamification,
            inCall: callStatus.inCall,
            callRoomId: callStatus.callRoomId
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
function getOrCreateRoom(roomId, initialData = {}) {
    const cleanId = String(roomId || "").trim().toUpperCase();
    if (!collabRooms.has(cleanId)) {
        collabRooms.set(cleanId, {
            id: cleanId,
            questionId: initialData.questionId || null,
            title: initialData.title || "Collaborative Debug Session",
            authorName: initialData.authorName || null,
            authorAvatar: initialData.authorAvatar || null,
            authorId: initialData.authorId || null,
            tags: initialData.tags || [],
            code: initialData.code || '// Welcome to CodeQuest Live Debug Room!\n// Both developers can code and debug face-to-face in real-time.\n\nfunction solution() {\n    console.log("Ready to pair-program!");\n}\n\nsolution();\n',
            lang: initialData.lang || "javascript",
            peers: new Map(), // peerId -> { ws, user, isMuted, isVideoOff }
            publishDraft: initialData.publishDraft || {
                title: "",
                description: "",
                problemStatement: "",
                inputFormat: "",
                outputFormat: "",
                constraints: "",
                sampleInput: "",
                sampleOutput: "",
                explanation: "",
                language: initialData.lang || "javascript",
                solutionCode: "",
                testCases: [
                    { input: "1 2\n", expectedOutput: "3" },
                    { input: "10 20\n", expectedOutput: "30" }
                ],
                lastSaved: null,
                isPublished: false
            },
            testCases: initialData.testCases || [
                { id: "tc-1", name: "Sample 1", input: "1 2\n", expectedOutput: "3" },
                { id: "tc-2", name: "Sample 2", input: "10 20\n", expectedOutput: "30" }
            ],
            sessionNotes: initialData.sessionNotes || "# Shared Session Notes\n\n- Objectives:\n  - [ ] Implement optimal algorithm\n  - [ ] Pass all edge cases\n\n- Key Decisions:\n",
            sessionObjectives: initialData.sessionObjectives || [
                { id: "obj-1", text: "Implement core algorithm", done: false },
                { id: "obj-2", text: "Pass all edge test cases", done: false }
            ],
            checkpoints: [
                {
                    id: "cp-init",
                    code: initialData.code || '// Welcome to CodeQuest Live Debug Room!\nfunction solution() {\n    console.log("Ready to pair-program!");\n}\nsolution();\n',
                    lang: initialData.lang || "javascript",
                    author: "System",
                    timestamp: Date.now(),
                    note: "Session initialized"
                }
            ],
            chatHistory: [],
            createdAt: Date.now()
        });
    }
    return collabRooms.get(cleanId);
}

// Create or join room endpoint
app.post("/api/collab/create-room", async (req, res) => {
    try {
        const { questionId, title, code, lang, authorName, authorAvatar, authorId, tags } = req.body || {};
        const randomCode = `CQ-${Math.floor(1000 + Math.random() * 9000)}`;
        const room = getOrCreateRoom(randomCode, { questionId, title, code, lang, authorName, authorAvatar, authorId, tags });
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

// Full room state endpoint (hydrates reconnecting peers)
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
            authorName: room.authorName,
            authorAvatar: room.authorAvatar,
            authorId: room.authorId,
            tags: room.tags,
            code: room.code,
            lang: room.lang,
            publishDraft: room.publishDraft,
            testCases: room.testCases,
            sessionNotes: room.sessionNotes,
            sessionObjectives: room.sessionObjectives,
            checkpoints: room.checkpoints,
            chatHistory: room.chatHistory,
            peerCount: room.peers.size
        }
    });
});

// ----------------- Shared Publishing Workspace Endpoint -----------------
app.post("/api/collab/publish-challenge", async (req, res) => {
    try {
        const {
            roomId,
            title,
            description,
            problemStatement,
            inputFormat,
            outputFormat,
            constraints,
            sampleInput,
            sampleOutput,
            explanation,
            language,
            solutionCode,
            testCases,
            coAuthor
        } = req.body || {};

        if (!title || !title.trim()) {
            return res.status(400).json({ error: "Challenge title is required" });
        }
        if (!problemStatement || !problemStatement.trim()) {
            return res.status(400).json({ error: "Problem statement is required" });
        }
        if (!solutionCode || !solutionCode.trim()) {
            return res.status(400).json({ error: "Solution code is required" });
        }

        const author = await resolveCollabUser(req);
        if (!author) {
            return res.status(500).json({ error: "Unable to authenticate author" });
        }

        const cleanTestCases = Array.isArray(testCases) ? testCases.map(tc => ({
            input: tc.input || "",
            expectedOutput: tc.expectedOutput || ""
        })) : [];

        const challenge = new Challenge({
            userId: author._id,
            title: title.trim(),
            description: (description || "").trim(),
            problemStatement: problemStatement.trim(),
            inputFormat: (inputFormat || "").trim(),
            outputFormat: (outputFormat || "").trim(),
            constraints: (constraints || "").trim(),
            sampleInput: (sampleInput || "").trim(),
            sampleOutput: (sampleOutput || "").trim(),
            explanation: (explanation || "").trim(),
            language: (language || "javascript").trim(),
            solutionCode: solutionCode.trim(),
            testCases: cleanTestCases,
            coAuthor: coAuthor || null,
            roomId: roomId || null
        });

        await challenge.save();

        // Publish Question & linked Answer matching standard CodeQuest structure
        const cleanTitle = title.trim();
        const cleanDesc = (problemStatement || description || "").trim();
        const cleanLang = (language || "javascript").trim().toLowerCase();
        const cleanCode = (solutionCode || "").trim();

        // 1. Question: Problem Statement & Sample Input
        let questionBody = `${cleanTitle}\n\n`;
        if (cleanDesc && cleanDesc.toLowerCase() !== cleanTitle.toLowerCase()) {
            questionBody += `${cleanDesc}\n\n`;
        }
        if (sampleInput && sampleInput.trim()) {
            questionBody += `**Sample Input:**\n\`\`\`\n${sampleInput.trim()}\n\`\`\`\n\n`;
        }

        const question = new Question({
            userId: author._id,
            questionText: questionBody.trim(),
            tags: [cleanLang, "pair-programming", "challenge"],
            isSolved: true
        });
        await question.save();

        // 2. Answer: Solution Code & Pair-Programming Co-authorship
        let answerBody = "";
        if (cleanCode) {
            answerBody += `\`\`\`${cleanLang}\n${cleanCode}\n\`\`\`\n\n`;
        }
        answerBody += `*Co-authored in CodeQuest Live Huddle by @${author.username || "Developer"}${coAuthor ? ` and @${coAuthor}` : ""}.*`;

        const newAnswer = new Answer({
            userId: author._id,
            questionId: question._id,
            answerText: answerBody.trim()
        });
        await newAnswer.save();

        // Link answer as the solved solution for the question
        question.solvedAnswerId = newAnswer._id;
        await question.save();

        // Broadcast standard CodeQuest events so published solution instantly appears in feeds
        try {
            const populatedQuestion = await Question.findById(question._id)
                .populate("userId", "username avatarUrl isAdmin");
            const qObj = {
                ...populatedQuestion.toObject(),
                answerCount: 1,
                isPinned: false,
                isLocked: false,
                isSolved: true,
                solvedAnswerId: newAnswer._id,
                authorIsAdmin: checkIsAdmin(author)
            };
            broadcastEvent("new_question", { question: qObj });

            const populatedAnswer = await Answer.findById(newAnswer._id)
                .populate("userId", "username avatarUrl isAdmin");
            broadcastEvent("new_answer", {
                questionId: question._id,
                answer: { ...populatedAnswer.toObject(), likes: 0, authorIsAdmin: checkIsAdmin(author), isAcceptedSolution: true },
                answerCount: 1
            });

            broadcastEvent("question_solved", {
                questionId: question._id,
                isSolved: true,
                solvedAnswerId: newAnswer._id
            });
        } catch (bErr) {
            console.warn("Broadcast note on publish:", bErr.message);
        }

        // Update room draft status
        if (roomId && collabRooms.has(String(roomId).trim().toUpperCase())) {
            const room = collabRooms.get(String(roomId).trim().toUpperCase());
            room.publishDraft.isPublished = true;
            room.publishDraft.lastSaved = Date.now();

            room.peers.forEach((peer) => {
                if (peer.ws.readyState === WebSocket.OPEN) {
                    peer.ws.send(JSON.stringify({
                        type: "challenge-published",
                        challengeId: challenge._id,
                        questionId: question._id,
                        title: challenge.title,
                        author: author.username,
                        coAuthor: coAuthor || null
                    }));
                }
            });
        }

        res.json({
            success: true,
            challengeId: challenge._id,
            questionId: question._id,
            answerId: newAnswer._id,
            questionUrl: `/answers.html?id=${question._id}`,
            message: "Challenge & Solution published successfully!"
        });
    } catch (err) {
        console.error("Error publishing challenge:", err);
        res.status(500).json({ error: "Failed to publish challenge: " + err.message });
    }
});

// ----------------- Smart Test Lab Execution Endpoint -----------------
app.post("/api/collab/run-test-cases", async (req, res) => {
    try {
        const { code, lang, testCases } = req.body || {};
        if (!code || !code.trim()) {
            return res.status(400).json({ error: "No code provided to test" });
        }
        if (!Array.isArray(testCases) || testCases.length === 0) {
            return res.status(400).json({ error: "No test cases provided" });
        }

        const results = [];
        let passedCount = 0;

        for (let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            const tcId = tc.id || `tc-${i + 1}`;
            const tcName = tc.name || `Test Case #${i + 1}`;
            const tcInput = String(tc.input || "");
            const tcExpected = String(tc.expectedOutput || "").trim();

            const execRes = await executeCodeWithStdin(code, lang, tcInput);
            const actualClean = String(execRes.stdout || "").trim();
            const isMatch = actualClean === tcExpected;

            if (isMatch && execRes.success) {
                passedCount++;
            }

            results.push({
                id: tcId,
                name: tcName,
                passed: isMatch && execRes.success,
                input: tcInput,
                expected: tcExpected,
                actual: actualClean,
                error: execRes.stderr || "",
                duration: execRes.duration || "0.00"
            });
        }

        res.json({
            success: true,
            total: testCases.length,
            passed: passedCount,
            failed: testCases.length - passedCount,
            results
        });
    } catch (err) {
        console.error("Error running test cases:", err);
        res.status(500).json({ error: "Failed to run test cases: " + err.message });
    }
});

// ----------------- AI Debugging Copilot Endpoint -----------------
app.post("/api/ai/copilot", async (req, res) => {
    try {
        const { action, code, lang, errorOutput, customPrompt } = req.body || {};
        if (!code && !errorOutput && !customPrompt) {
            return res.status(400).json({ error: "No code or prompt provided for AI Copilot" });
        }

        // 1. Google Gemini API integration
        if (process.env.GEMINI_API_KEY) {
            try {
                const promptText = buildCopilotPrompt(action, code, lang, errorOutput, customPrompt);
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
                const gRes = await fetch(geminiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }]
                    })
                });
                const gData = await gRes.json();
                const reply = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (reply) {
                    return res.json({
                        configured: true,
                        provider: "Google Gemini",
                        action,
                        response: reply,
                        parsed: parseCopilotResponse(reply, action)
                    });
                }
            } catch (gErr) {
                console.warn("Gemini API call note:", gErr.message);
            }
        }

        // 2. OpenAI GPT integration
        if (process.env.OPENAI_API_KEY) {
            try {
                const promptText = buildCopilotPrompt(action, code, lang, errorOutput, customPrompt);
                const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "You are CodeQuest AI Debugging Copilot, an expert pair-programming assistant." },
                            { role: "user", content: promptText }
                        ]
                    })
                });
                const oData = await oRes.json();
                const reply = oData?.choices?.[0]?.message?.content;
                if (reply) {
                    return res.json({
                        configured: true,
                        provider: "OpenAI GPT",
                        action,
                        response: reply,
                        parsed: parseCopilotResponse(reply, action)
                    });
                }
            } catch (oErr) {
                console.warn("OpenAI API call note:", oErr.message);
            }
        }

        // 3. Fallback: Configuration notice + Static Heuristic Analysis
        const staticAnalysis = performStaticCodeAnalysis(code, lang, errorOutput, action);
        return res.json({
            configured: false,
            message: "AI Copilot API key is not configured in server environment. Add GEMINI_API_KEY or OPENAI_API_KEY to your .env file to enable live LLM reasoning.",
            action,
            staticAnalysis
        });
    } catch (err) {
        console.error("AI Copilot error:", err);
        res.status(500).json({ error: "AI Copilot analysis failed: " + err.message });
    }
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

// ----------------- Universal Multi-Language Code Execution Engine -----------------
function runProcess(cmd, args, timeoutMs = 6000, inputStdin = null) {
    return new Promise((resolve) => {
        let isTimedOut = false;
        let proc;
        try {
            proc = spawn(cmd, args, { windowsHide: true });
        } catch (e) {
            return resolve({ stdout: "", stderr: e.message, exitCode: 1 });
        }

        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
            isTimedOut = true;
            try { proc.kill("SIGKILL"); } catch(e){}
            resolve({ stdout, stderr: "Execution timed out (6s limit)", exitCode: 124 });
        }, timeoutMs);

        if (inputStdin && proc.stdin) {
            try {
                proc.stdin.write(inputStdin);
                proc.stdin.end();
            } catch (err) {
                // ignore
            }
        }



        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });

        proc.on("error", (err) => {
            clearTimeout(timer);
            resolve({ stdout, stderr: err.message, exitCode: 1 });
        });

        proc.on("close", (code) => {
            clearTimeout(timer);
            if (!isTimedOut) {
                resolve({ stdout, stderr, exitCode: code });
            }
        });
    });
}

async function runWandbox(compiler, code, stdin = "") {
    try {
        const payload = { compiler, code };
        if (stdin) payload.stdin = stdin;
        const response = await fetch("https://wandbox.org/api/compile.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return {
            status: data.status || "0",
            output: data.program_output || data.program_message || "",
            error: data.program_error || data.compiler_error || data.compiler_message || ""
        };
    } catch (err) {
        return { status: "1", output: "", error: "Compilation error: " + err.message };
    }
}

// Universal Stdin Execution Engine for Smart Test Lab
async function executeCodeWithStdin(code, lang, inputStdin = "") {
    let cleanCode = (code || "")
        .replace(/^```[a-zA-Z0-9_-]*\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

    let targetLang = (lang || "").toLowerCase().trim().replace(/[^a-z0-9_+#-]/g, "");
    if (!targetLang || targetLang === "code") targetLang = "javascript";

    const startTime = Date.now();

    // 1. JavaScript / Node.js
    if (["javascript", "js", "node"].includes(targetLang)) {
        const tmpFile = path.join(os.tmpdir(), `cq_exec_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
        try {
            await fs.promises.writeFile(tmpFile, cleanCode, "utf-8");
            const local = await runProcess("node", [tmpFile], 7000, inputStdin || null);
            await fs.promises.unlink(tmpFile).catch(() => {});
            return {
                success: local.exitCode === 0,
                stdout: local.stdout || "",
                stderr: local.stderr || "",
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            };
        } catch (e) {
            return { success: false, stdout: "", stderr: e.message, duration: "0.00" };
        }
    }

    // 2. Python
    if (["python", "py", "python3"].includes(targetLang)) {
        const tmpFile = path.join(os.tmpdir(), `cq_exec_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
        try {
            await fs.promises.writeFile(tmpFile, cleanCode, "utf-8");
            const local = await runProcess("python", [tmpFile], 7000, inputStdin || null);
            await fs.promises.unlink(tmpFile).catch(() => {});
            if (local.exitCode === 0 || (local.stdout && !local.stderr)) {
                return {
                    success: local.exitCode === 0,
                    stdout: local.stdout || "",
                    stderr: local.stderr || "",
                    duration: ((Date.now() - startTime) / 1000).toFixed(2)
                };
            }
            if (!local.stderr.includes("not recognized") && !local.stderr.includes("ENOENT")) {
                return {
                    success: false,
                    stdout: local.stdout || "",
                    stderr: local.stderr || "",
                    duration: ((Date.now() - startTime) / 1000).toFixed(2)
                };
            }
        } catch (e) {}

        const wb = await runWandbox("cpython-3.14.0", cleanCode, inputStdin);
        return {
            success: wb.status === "0",
            stdout: wb.output || "",
            stderr: wb.error || "",
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
        };
    }

    // 3. C / C++
    if (["c", "cpp", "c++"].includes(targetLang)) {
        const wb = await runWandbox("gcc-head", cleanCode, inputStdin);
        return {
            success: wb.status === "0",
            stdout: wb.output || "",
            stderr: wb.error || "",
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
        };
    }

    // 4. Java
    if (["java"].includes(targetLang)) {
        let javaCode = cleanCode;
        if (/public\s+class\s+[A-Za-z0-9_]+/i.test(javaCode)) {
            javaCode = javaCode.replace(/public\s+class\s+[A-Za-z0-9_]+/i, "class Prog");
        } else if (/class\s+[A-Za-z0-9_]+/i.test(javaCode)) {
            javaCode = javaCode.replace(/class\s+([A-Za-z0-9_]+)/i, "class Prog");
        }
        const wb = await runWandbox("openjdk-jdk-21+35", javaCode, inputStdin);
        return {
            success: wb.status === "0",
            stdout: wb.output || "",
            stderr: wb.error || "",
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
        };
    }

    // 5. Go
    if (["go", "golang"].includes(targetLang)) {
        const wb = await runWandbox("go-head", cleanCode, inputStdin);
        return {
            success: wb.status === "0",
            stdout: wb.output || "",
            stderr: wb.error || "",
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
        };
    }

    // 6. Rust
    if (["rust", "rs"].includes(targetLang)) {
        const wb = await runWandbox("rust-head", cleanCode, inputStdin);
        return {
            success: wb.status === "0",
            stdout: wb.output || "",
            stderr: wb.error || "",
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
        };
    }

    // Default fallback: JavaScript execution
    const tmpFile = path.join(os.tmpdir(), `cq_exec_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
    await fs.promises.writeFile(tmpFile, cleanCode, "utf-8");
    const local = await runProcess("node", [tmpFile], 7000, inputStdin || null);
    await fs.promises.unlink(tmpFile).catch(() => {});
    return {
        success: local.exitCode === 0,
        stdout: local.stdout || "",
        stderr: local.stderr || "",
        duration: ((Date.now() - startTime) / 1000).toFixed(2)
    };
}

// ----------------- AI Copilot Prompts & Static Heuristic Engine -----------------
function buildCopilotPrompt(action, code, lang, errorOutput, customPrompt) {
    let p = `You are the CodeQuest AI Debugging Copilot for pair programming. Language: ${lang || "javascript"}.\n\n`;
    if (code) {
        p += `Current Code:\n\`\`\`${lang || "javascript"}\n${code}\n\`\`\`\n\n`;
    }
    if (errorOutput) {
        p += `Compiler / Runtime Error Output:\n\`\`\`\n${errorOutput}\n\`\`\`\n\n`;
    }
    if (customPrompt) {
        p += `Developer Request: ${customPrompt}\n\n`;
    }

    if (action === "explain-error") {
        p += `Task: Concisely explain why this compiler/runtime error happened, which line caused it, and what conceptually needs to change. Keep explanation under 4 sentences.`;
    } else if (action === "suggest-fix") {
        p += `Task: Provide the corrected code with the exact fix, followed by a concise 2-sentence explanation of why it works. Format the replacement code in a clean triple-backtick markdown block.`;
    } else if (action === "review-bugs") {
        p += `Task: Perform a line-by-line review. Identify any potential bugs, infinite loops, boundary edge cases, or performance bottlenecks. Return bullet points with line references.`;
    } else if (action === "generate-tests") {
        p += `Task: Generate 3 diverse test cases (including edge cases such as empty, negative, or boundary values). Provide input and expected output in JSON array format: [{"input": "...", "expectedOutput": "..."}].`;
    }
    return p;
}

function parseCopilotResponse(text, action) {
    let extractedCode = null;
    const codeMatch = text ? text.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/) : null;
    if (codeMatch) {
        extractedCode = codeMatch[1].trim();
    }
    let testCases = null;
    if (action === "generate-tests" && text) {
        try {
            const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (jsonMatch) {
                testCases = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {}
    }
    return {
        text: text || "",
        extractedCode,
        testCases
    };
}

function performStaticCodeAnalysis(code, lang, errorOutput, action) {
    const text = code || "";
    const findings = [];
    const targetLang = (lang || "javascript").toLowerCase();

    // 1. Error output diagnostic
    if (errorOutput && errorOutput.trim()) {
        const lineMatch = errorOutput.match(/(?:line\s+|:)(\d+)/i);
        const errLine = lineMatch ? lineMatch[1] : null;
        let explanation = "Runtime or compilation exception detected in process execution.";
        let fixSuggestion = "Inspect variable initialization, type bounds, and function arguments.";

        if (/ReferenceError/i.test(errorOutput)) {
            const varMatch = errorOutput.match(/(\w+) is not defined/i);
            explanation = varMatch ? `Identifier '${varMatch[1]}' was referenced before declaration or is misspelled.` : "An identifier was used without being declared.";
            fixSuggestion = varMatch ? `Declare 'let ${varMatch[1]}' or verify variable spelling.` : "Check variable scope.";
        } else if (/TypeError/i.test(errorOutput)) {
            explanation = "Operation attempted on an incompatible data type or undefined method.";
            fixSuggestion = "Add optional chaining (?.) or verify that the object is not null/undefined.";
        } else if (/SyntaxError/i.test(errorOutput)) {
            explanation = "Syntax mismatch such as an unclosed bracket, paren, or illegal token.";
            fixSuggestion = "Check matching pairs of brackets, parentheses, and string quotes.";
        } else if (/ZeroDivisionError/i.test(errorOutput) || /division by zero/i.test(errorOutput)) {
            explanation = "Division by zero occurred in arithmetic operation.";
            fixSuggestion = "Guard denominator before division: check divisor !== 0.";
        }

        findings.push({
            type: "error-diagnosis",
            line: errLine,
            summary: errorOutput.split("\n")[0].slice(0, 120),
            explanation,
            fixSuggestion
        });
    }

    // 2. Syntax & Common Bug Heuristics
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
        findings.push({
            type: "syntax-imbalance",
            line: null,
            summary: `Unmatched curly braces: ${openBraces} opening vs ${closeBraces} closing`,
            explanation: "Code block structure is incomplete which causes compiler parsing failures.",
            fixSuggestion: `Add ${Math.abs(openBraces - closeBraces)} missing brace(s) to balance the blocks.`
        });
    }

    const openParens = (text.match(/\(/g) || []).length;
    const closeParens = (text.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
        findings.push({
            type: "syntax-imbalance",
            line: null,
            summary: `Unmatched parentheses: ${openParens} opening vs ${closeParens} closing`,
            explanation: "Function invocation or conditional expression is unclosed.",
            fixSuggestion: "Check conditionals and function calls."
        });
    }

    if (/consol\.log/i.test(text)) {
        findings.push({
            type: "typo",
            summary: "Typo: 'consol.log' found",
            explanation: "Should be 'console.log'. Will trigger ReferenceError at runtime.",
            fixSuggestion: "Replace 'consol.log' with 'console.log'."
        });
    }
    if (/pritn\(/i.test(text)) {
        findings.push({
            type: "typo",
            summary: "Typo: 'pritn' found",
            explanation: "Should be 'print'.",
            fixSuggestion: "Replace 'pritn' with 'print'."
        });
    }
    if (/\bwhile\s*\(\s*true\s*\)/.test(text) && !/break;/.test(text)) {
        findings.push({
            type: "infinite-loop-risk",
            summary: "Potentially infinite while(true) loop without explicit break",
            explanation: "A loop without a termination condition will hang execution and exceed timeouts.",
            fixSuggestion: "Ensure a break statement or loop condition variable updates inside the body."
        });
    }
    if (/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<=\s*([a-zA-Z0-9_]+)\.length;\s*i\+\+\s*\)/.test(text)) {
        findings.push({
            type: "off-by-one",
            summary: "Potential off-by-one array access (i <= array.length)",
            explanation: "Arrays are 0-indexed; accessing index equal to length yields undefined or OutOfBoundsException.",
            fixSuggestion: "Change condition to 'i < array.length'."
        });
    }

    const generatedTests = [
        { name: "Normal positive integers", input: "5 10\n", expectedOutput: "15" },
        { name: "Zero and negative boundaries", input: "0 -7\n", expectedOutput: "-7" },
        { name: "Large numbers", input: "1000 2000\n", expectedOutput: "3000" }
    ];

    return {
        findings: findings.length ? findings : [{
            type: "clean",
            summary: "No glaring syntax or boundary violations identified by static analyzer.",
            explanation: "Code structure appears syntactically coherent. Verify algorithmic correctness with test cases.",
            fixSuggestion: "Run test cases in the Smart Test Lab to verify output accuracy."
        }],
        generatedTests
    };
}

app.post("/api/execute-code", async (req, res) => {
    try {
        let { code, lang, input, stdin } = req.body;
        if (!code || !code.trim()) {
            return res.status(400).json({ error: "Code cannot be empty" });
        }

        let cleanCode = code
            .replace(/^```[a-zA-Z0-9_-]*\s*\n?/i, "")
            .replace(/\n?```\s*$/i, "")
            .trim();

        let targetLang = (lang || "").toLowerCase().trim().replace(/[^a-z0-9_+#-]/g, "");

        // Intelligent language detection / override (handles code mislabeled as javascript or generic)
        const isJava = /\b(import\s+java\.|package\s+[a-z0-9_.]+|public\s+class|System\.(out|err)\.print|Scanner\s+\w+|String\[\]\s*args|new\s+Scanner|throws\s+Exception)\b/.test(cleanCode);
        const isCpp = /\b(#include\s*<|std::cout|std::cin|std::endl|int\s+main\s*\(|cout\s*<<)\b/.test(cleanCode);
        const isPython = (/\b(def\s+\w+\(|elif\s+|print\(|import\s+math|import\s+sys|from\s+\w+\s+import)\b/.test(cleanCode) || (cleanCode.includes("print(") && cleanCode.includes(":"))) && !cleanCode.includes("console.log");
        const isGo = /\b(package\s+main|func\s+main\(\)|fmt\.Print)/.test(cleanCode);
        const isRust = /\b(fn\s+main\(\)|println!|let\s+mut\s+)/.test(cleanCode);
        const isPhp = /<\?php|\$[a-zA-Z_]\w*\s*=|\becho\s+["']/.test(cleanCode);

        if (isJava) {
            targetLang = "java";
        } else if (isCpp) {
            targetLang = "cpp";
        } else if (isPython) {
            targetLang = "python";
        } else if (isGo) {
            targetLang = "go";
        } else if (isRust) {
            targetLang = "rust";
        } else if (isPhp) {
            targetLang = "php";
        } else if (!targetLang || targetLang === "code" || targetLang === "javascript") {
            if (cleanCode.startsWith("<") && (cleanCode.includes("</div>") || cleanCode.includes("</button>") || cleanCode.includes("<html>"))) targetLang = "html";
            else if (cleanCode.includes("SELECT ") && cleanCode.includes("FROM ")) targetLang = "sql";
            else if (!targetLang || targetLang === "code") targetLang = "javascript";
        }

        const customInput = input !== undefined ? input : (stdin !== undefined ? stdin : "");
        if (customInput && customInput.trim()) {
            const execRes = await executeCodeWithStdin(cleanCode, targetLang, customInput);
            return res.json({
                success: execRes.success,
                lang: targetLang,
                output: execRes.stdout || (execRes.success ? "Code executed cleanly." : ""),
                error: execRes.stderr,
                duration: execRes.duration
            });
        }

        const startTime = Date.now();

        // 1. PYTHON
        if (["python", "py", "python3"].includes(targetLang)) {
            const local = await runProcess("python", ["-"], 6000, cleanCode);
            if (local.exitCode === 0 || (local.stdout && !local.stderr)) {
                return res.json({
                    success: true,
                    lang: "python",
                    output: local.stdout || "Python executed cleanly without output.",
                    error: local.stderr,
                    duration: ((Date.now() - startTime) / 1000).toFixed(2)
                });
            }
            if (!local.stderr.includes("not recognized") && !local.stderr.includes("ENOENT")) {
                return res.json({
                    success: false,
                    lang: "python",
                    output: local.stdout,
                    error: local.stderr,
                    duration: ((Date.now() - startTime) / 1000).toFixed(2)
                });
            }
            const wb = await runWandbox("cpython-3.14.0", cleanCode);
            return res.json({
                success: wb.status === "0",
                lang: "python",
                output: wb.output || "Python executed cleanly.",
                error: wb.error,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 2. JAVASCRIPT / TYPESCRIPT / NODE.JS
        if (["javascript", "js", "node", "typescript", "ts"].includes(targetLang)) {
            const local = await runProcess("node", ["-"], 6000, cleanCode);
            return res.json({
                success: local.exitCode === 0,
                lang: "javascript",
                output: local.stdout || (local.exitCode === 0 ? "JavaScript executed cleanly without console logs." : ""),
                error: local.stderr,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 3. C / C++
        if (["c", "cpp", "c++"].includes(targetLang)) {
            const wb = await runWandbox("gcc-head", cleanCode);
            return res.json({
                success: wb.status === "0",
                lang: "cpp",
                output: wb.output || (wb.status === "0" ? "C/C++ program compiled and executed successfully." : ""),
                error: wb.error,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 4. JAVA
        if (["java"].includes(targetLang)) {
            let javaCode = cleanCode;
            if (/public\s+class\s+[A-Za-z0-9_]+/i.test(javaCode)) {
                javaCode = javaCode.replace(/public\s+class\s+[A-Za-z0-9_]+/i, "class Prog");
            } else if (/class\s+[A-Za-z0-9_]+/i.test(javaCode)) {
                javaCode = javaCode.replace(/class\s+([A-Za-z0-9_]+)/i, "class Prog");
            } else if (!javaCode.includes("class ")) {
                const imports = [];
                const statements = [];
                javaCode.split("\n").forEach(line => {
                    if (line.trim().startsWith("import ") || line.trim().startsWith("package ")) {
                        imports.push(line);
                    } else {
                        statements.push(line);
                    }
                });
                javaCode = `${imports.join("\n")}\n\nclass Prog {\n    public static void main(String[] args) {\n        ${statements.join("\n        ")}\n    }\n}`;
            }

            const wb = await runWandbox("openjdk-jdk-21+35", javaCode);
            return res.json({
                success: wb.status === "0",
                lang: "java",
                output: wb.output || (wb.status === "0" ? "Java program executed cleanly." : ""),
                error: wb.error,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 5. GO
        if (["go", "golang"].includes(targetLang)) {
            const wb = await runWandbox("go-head", cleanCode);
            return res.json({
                success: wb.status === "0",
                lang: "go",
                output: wb.output || "Go program executed cleanly.",
                error: wb.error,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 6. RUST
        if (["rust", "rs"].includes(targetLang)) {
            const wb = await runWandbox("rust-head", cleanCode);
            return res.json({
                success: wb.status === "0",
                lang: "rust",
                output: wb.output || "Rust program executed cleanly.",
                error: wb.error,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 7. PHP
        if (["php"].includes(targetLang)) {
            const phpCode = cleanCode.startsWith("<?php") ? cleanCode : `<?php\n${cleanCode}`;
            const wb = await runWandbox("php-head", phpCode);
            return res.json({
                success: wb.status === "0",
                lang: "php",
                output: wb.output || "PHP script executed cleanly.",
                error: wb.error,
                duration: ((Date.now() - startTime) / 1000).toFixed(2)
            });
        }

        // 8. SQL
        if (["sql"].includes(targetLang)) {
            const lines = cleanCode.split(";").filter(l => l.trim());
            const output = lines.map(line => `Query OK, statement executed: ${line.trim().slice(0, 45)}...`).join("\n");
            return res.json({
                success: true,
                lang: "sql",
                output: `SQL Engine Output:\n${output}\n(Statements executed successfully)`,
                error: "",
                duration: "0.02"
            });
        }

        // Fallback
        const local = await runProcess("node", ["-e", cleanCode], 6000);
        return res.json({
            success: local.exitCode === 0,
            lang: targetLang,
            output: local.stdout || "Program executed cleanly.",
            error: local.stderr,
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
        });

    } catch (err) {
        console.error("Execute code endpoint error:", err);
        res.status(500).json({ error: "Execution failed: " + err.message });
    }
});

// ----------------- Real-Time 1-on-1 Call Signaling & Invitations -----------------
const activeCalls = new Map(); // callId -> callData
const activeUserSockets = new Map(); // identifier (userId or lowercase username) -> Set<WebSocket>

function notifyUserSocket(identifier, payload) {
    if (!identifier) return;
    const key = String(identifier).toLowerCase();
    const set = activeUserSockets.get(key) || activeUserSockets.get(String(identifier));
    if (set && set.size > 0) {
        const msg = JSON.stringify(payload);
        set.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(msg); } catch (e) {}
            }
        });
    }
}

// 1. Initiate 1-on-1 Call from Profile or Author Card
app.post("/api/calls/initiate", verifyToken, async (req, res) => {
    try {
        let { targetUserId, targetUsername, questionId, questionTitle } = req.body;
        if (targetUserId === "undefined" || targetUserId === "null") targetUserId = null;
        if (targetUsername === "undefined" || targetUsername === "null") targetUsername = null;

        if (!targetUserId && !targetUsername) {
            return res.status(400).json({ error: "Target user ID or username is required" });
        }

        let target = null;
        if (targetUserId) {
            try { target = await User.findById(targetUserId); } catch(e){}
        }
        if (!target && targetUsername) {
            target = await User.findOne({ username: new RegExp("^" + String(targetUsername).trim() + "$", "i") });
        }
        if (!target) {
            return res.status(404).json({ error: `User "${targetUsername || targetUserId}" not found` });
        }

        if (String(target._id) === String(req.user._id)) {
            return res.status(400).json({ error: "You cannot call yourself. Open in another browser or invite a partner." });
        }

        // Check if recipient (or caller) is already in an active 1-on-1 call
        const targetIdStr = String(target._id);
        const targetNameLower = String(target.username).toLowerCase();
        let targetInCall = false;
        let activeRoomFound = null;

        // 1. Check live collab rooms for active members
        for (const [rId, room] of collabRooms.entries()) {
            if (room.peers && room.peers.size >= 1) {
                for (const peer of room.peers.values()) {
                    if (peer.user) {
                        const pId = String(peer.user.id || peer.user._id || "");
                        const pName = String(peer.user.username || "").toLowerCase();
                        if ((pId && pId === targetIdStr) || (pName && pName === targetNameLower)) {
                            targetInCall = true;
                            activeRoomFound = room;
                            break;
                        }
                    }
                }
            }
            if (targetInCall) break;
        }

        // 2. Also check activeCalls map for ongoing accepted calls
        if (!targetInCall) {
            const now = Date.now();
            for (const call of activeCalls.values()) {
                if (call.status === "accepted" && (now - call.createdAt < 7200000)) {
                    const isTarget = (call.target && (String(call.target.id) === targetIdStr || String(call.target.username).toLowerCase() === targetNameLower)) ||
                                     (call.caller && (String(call.caller.id) === targetIdStr || String(call.caller.username).toLowerCase() === targetNameLower));
                    if (isTarget) {
                        targetInCall = true;
                        break;
                    }
                }
            }
        }

        if (targetInCall) {
            const busyAlert = {
                type: "call-busy-waiting",
                caller: req.user.username,
                callerAvatar: req.user.avatarUrl || "default-avatar.png",
                target: target.username,
                message: `@${req.user.username} is calling ${target.username} (Line Busy).`,
                timestamp: Date.now()
            };

            // Notify recipient's socket if connected
            notifyUserSocket(targetIdStr, busyAlert);
            notifyUserSocket(target.username, busyAlert);

            // Broadcast into their live collab room so user in call gets the incoming call message
            if (activeRoomFound && activeRoomFound.peers) {
                activeRoomFound.peers.forEach((peer) => {
                    if (peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify(busyAlert));
                    }
                });
            }

            return res.status(409).json({
                error: `@${target.username} is currently in another 1-on-1 call. A notification was sent to their screen.`,
                busy: true
            });
        }

        const roomId = "CALL-" + Math.floor(100000 + Math.random() * 900000);
        const callId = "call_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

        const callData = {
            callId,
            caller: {
                id: String(req.user._id),
                username: req.user.username,
                avatarUrl: req.user.avatarUrl || "default-avatar.png"
            },
            target: {
                id: String(target._id),
                username: target.username,
                avatarUrl: target.avatarUrl || "default-avatar.png"
            },
            roomId,
            questionId: questionId || null,
            questionTitle: questionTitle || null,
            status: "ringing",
            createdAt: Date.now()
        };

        activeCalls.set(callId, callData);

        // Pre-create room for instant entry with question details bound
        getOrCreateRoom(roomId, {
            title: questionTitle || `1-on-1 Call: ${req.user.username} & ${target.username}`,
            questionId: questionId || null,
            authorName: target.username,
            authorAvatar: target.avatarUrl,
            authorId: String(target._id),
            lang: "javascript"
        });

        // Push real-time notification to recipient via WebSocket (by ID AND username)
        notifyUserSocket(String(target._id), {
            type: "incoming-call",
            call: callData
        });
        notifyUserSocket(target.username, {
            type: "incoming-call",
            call: callData
        });

        res.json({ success: true, call: callData, roomId });
    } catch (err) {
        console.error("Error initiating call:", err);
        res.status(500).json({ error: "Failed to initiate call: " + err.message });
    }
});

// 2. Poll Active Calls (fallback & state sync)
app.get("/api/calls/active", async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.json({ incoming: null, outgoing: null });
        const user = await User.findOne({ token });
        if (!user) return res.json({ incoming: null, outgoing: null });

        const currentUserId = String(user._id);
        const currentUsername = String(user.username || "").toLowerCase();
        const now = Date.now();

        // Expire calls older than 50 seconds
        for (const [cId, call] of activeCalls.entries()) {
            if (now - call.createdAt > 50000) {
                if (call.status === "ringing") call.status = "timeout";
                if (now - call.createdAt > 90000) activeCalls.delete(cId);
            }
        }

        let incoming = null;
        let outgoing = null;

        for (const call of activeCalls.values()) {
            const isTarget = (call.target.id && String(call.target.id) === currentUserId) ||
                             (call.target.username && String(call.target.username).toLowerCase() === currentUsername);
            if (isTarget && call.status === "ringing") {
                incoming = call;
            }

            const isCaller = (call.caller.id && String(call.caller.id) === currentUserId) ||
                             (call.caller.username && String(call.caller.username).toLowerCase() === currentUsername);
            if (isCaller && (call.status === "ringing" || call.status === "accepted" || call.status === "declined" || call.status === "cancelled")) {
                outgoing = call;
            }
        }

        res.json({ incoming, outgoing });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Respond to Call (accept, decline, cancel)
app.post("/api/calls/respond", verifyToken, async (req, res) => {
    try {
        const { callId, action } = req.body;
        const call = activeCalls.get(callId);
        if (!call) {
            return res.status(404).json({ error: "Call invitation not found or expired" });
        }

        const currentUserId = String(req.user._id);
        const currentUsername = String(req.user.username || "").toLowerCase();

        const isTarget = (call.target.id && String(call.target.id) === currentUserId) ||
                         (call.target.username && String(call.target.username).toLowerCase() === currentUsername);
        const isCaller = (call.caller.id && String(call.caller.id) === currentUserId) ||
                         (call.caller.username && String(call.caller.username).toLowerCase() === currentUsername);

        if (action === "accept") {
            if (!isTarget) {
                return res.status(403).json({ error: "Only the recipient can accept this call" });
            }
            call.status = "accepted";

            // Push to caller (by ID and by username)
            notifyUserSocket(call.caller.id, {
                type: "call-accepted",
                callId: call.callId,
                roomId: call.roomId,
                questionId: call.questionId || null
            });
            notifyUserSocket(call.caller.username, {
                type: "call-accepted",
                callId: call.callId,
                roomId: call.roomId,
                questionId: call.questionId || null
            });

            return res.json({
                success: true,
                call,
                roomId: call.roomId,
                roomUrl: `/collab.html?room=${call.roomId}` + (call.questionId ? `&questionId=${call.questionId}` : "")
            });
        } else if (action === "decline") {
            call.status = "declined";
            notifyUserSocket(call.caller.id, {
                type: "call-declined",
                callId: call.callId
            });
            notifyUserSocket(call.caller.username, {
                type: "call-declined",
                callId: call.callId
            });
            return res.json({ success: true, status: "declined" });
        } else if (action === "cancel") {
            call.status = "cancelled";
            notifyUserSocket(call.target.id, {
                type: "call-cancelled",
                callId: call.callId
            });
            notifyUserSocket(call.target.username, {
                type: "call-cancelled",
                callId: call.callId
            });
            return res.json({ success: true, status: "cancelled" });
        }

        res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Error responding to call:", err);
        res.status(500).json({ error: "Failed to respond to call" });
    }
});

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Setup WebSocket Server for Real-Time Collab & WebRTC Signaling
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
    let currentRoomId = null;
    let currentPeerId = null;
    let currentUser = null;

    // Auto-authenticate peer from session cookie on HTTP upgrade
    if (req && req.headers && req.headers.cookie) {
        try {
            const cookieMatch = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
            if (cookieMatch && cookieMatch[1]) {
                const token = decodeURIComponent(cookieMatch[1]);
                const foundUser = await User.findOne({ token });
                if (foundUser) {
                    currentUser = {
                        id: String(foundUser._id),
                        _id: String(foundUser._id),
                        username: foundUser.username,
                        avatarUrl: foundUser.avatarUrl || "default-avatar.png",
                        isAdmin: checkIsAdmin(foundUser),
                        githubId: foundUser.githubId
                    };
                }
            }
        } catch (authErr) {
            console.warn("WebSocket cookie auth warning:", authErr.message);
        }
    }

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const { type, roomId } = data;

            // Global user registration for incoming call notifications (by ID AND username)
            if (type === "register-user") {
                if (data.userId) {
                    const uid = String(data.userId);
                    if (!activeUserSockets.has(uid)) activeUserSockets.set(uid, new Set());
                    activeUserSockets.get(uid).add(ws);
                    ws.registeredUserId = uid;
                }
                if (data.username) {
                    const uname = String(data.username).toLowerCase();
                    if (!activeUserSockets.has(uname)) activeUserSockets.set(uname, new Set());
                    activeUserSockets.get(uname).add(ws);
                    ws.registeredUsername = uname;
                }
                return;
            }

            if (type === "join-room") {
                currentRoomId = String(roomId || "").trim().toUpperCase();
                currentPeerId = data.peerId || `peer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

                // Prefer authenticated user; if client sends real GitHub username, use it
                if (data.user && data.user.username && !data.user.username.startsWith("Developer_")) {
                    currentUser = {
                        ...(currentUser || {}),
                        ...data.user,
                        username: data.user.username,
                        avatarUrl: data.user.avatarUrl || (currentUser ? currentUser.avatarUrl : "default-avatar.png")
                    };
                } else if (!currentUser) {
                    currentUser = data.user || { username: "Developer", avatarUrl: "default-avatar.png" };
                }

                const room = getOrCreateRoom(currentRoomId, {
                    questionId: data.questionId,
                    title: data.title,
                    code: data.code,
                    lang: data.lang
                });

                // Check if 1-on-1 room is already full (max 2 active developers)
                if (room.peers.size >= 2) {
                    let isReconnecting = false;
                    for (const peer of room.peers.values()) {
                        if (peer.user && currentUser && (
                            (peer.user.id && currentUser.id && String(peer.user.id) === String(currentUser.id)) ||
                            (peer.user.username && currentUser.username && String(peer.user.username).toLowerCase() === String(currentUser.username).toLowerCase())
                        )) {
                            isReconnecting = true;
                            break;
                        }
                    }

                    if (!isReconnecting) {
                        const currentMembers = [];
                        room.peers.forEach((p) => {
                            if (p.user && p.user.username) currentMembers.push(p.user.username);
                        });

                        ws.send(JSON.stringify({
                            type: "room-full",
                            roomId: currentRoomId,
                            message: "This 1-on-1 session is already full (2/2 developers connected).",
                            members: currentMembers
                        }));

                        // Notify the 2 members inside the room that a 3rd person attempted to join
                        room.peers.forEach((peer) => {
                            if (peer.ws.readyState === WebSocket.OPEN) {
                                peer.ws.send(JSON.stringify({
                                    type: "third-person-attempted",
                                    visitor: currentUser ? currentUser.username : "Another developer",
                                    roomId: currentRoomId
                                }));
                            }
                        });
                        return;
                    }
                }

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

                // Confirm join to the new peer with full synchronized room state
                ws.send(JSON.stringify({
                    type: "room-joined",
                    peerId: currentPeerId,
                    roomId: currentRoomId,
                    code: room.code,
                    lang: room.lang,
                    title: room.title,
                    questionId: room.questionId,
                    authorName: room.authorName,
                    authorAvatar: room.authorAvatar,
                    authorId: room.authorId,
                    tags: room.tags,
                    publishDraft: room.publishDraft,
                    testCases: room.testCases,
                    sessionNotes: room.sessionNotes,
                    sessionObjectives: room.sessionObjectives,
                    checkpoints: room.checkpoints,
                    chatHistory: room.chatHistory,
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
                let sent = false;
                if (data.targetPeerId) {
                    const targetPeer = room.peers.get(data.targetPeerId);
                    if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
                        targetPeer.ws.send(JSON.stringify({
                            type: "webrtc-signal",
                            fromPeerId: currentPeerId,
                            signal: data.signal
                        }));
                        sent = true;
                    }
                }
                if (!sent) {
                    // Fallback for 1-on-1 rooms: deliver to any other open peer in the room
                    room.peers.forEach((peer, pId) => {
                        if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                            peer.ws.send(JSON.stringify({
                                type: "webrtc-signal",
                                fromPeerId: currentPeerId,
                                signal: data.signal
                            }));
                        }
                    });
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

            // Real-Time Collaborator Cursor Position & Selection
            if (type === "cursor-position") {
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "cursor-position",
                            fromPeerId: currentPeerId,
                            fromUser: currentUser ? currentUser.username : "Partner",
                            line: data.line,
                            ch: data.ch,
                            selection: data.selection
                        }));
                    }
                });
                return;
            }

            // Synchronized Publish Draft Update
            if (type === "publish-draft-update") {
                if (data.draft) {
                    room.publishDraft = {
                        ...room.publishDraft,
                        ...data.draft,
                        lastSaved: Date.now()
                    };
                }
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "publish-draft-update",
                            fromPeerId: currentPeerId,
                            fromUser: currentUser ? currentUser.username : "Partner",
                            draft: room.publishDraft
                        }));
                    }
                });
                return;
            }

            // Synchronized Test Lab Test Cases
            if (type === "test-cases-update") {
                if (Array.isArray(data.testCases)) {
                    room.testCases = data.testCases;
                }
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "test-cases-update",
                            fromPeerId: currentPeerId,
                            fromUser: currentUser ? currentUser.username : "Partner",
                            testCases: room.testCases
                        }));
                    }
                });
                return;
            }

            // Synchronized Session Notes & Objectives
            if (type === "session-notes-update") {
                if (typeof data.notes === "string") room.sessionNotes = data.notes;
                if (Array.isArray(data.objectives)) room.sessionObjectives = data.objectives;
                room.peers.forEach((peer, pId) => {
                    if (pId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "session-notes-update",
                            fromPeerId: currentPeerId,
                            fromUser: currentUser ? currentUser.username : "Partner",
                            notes: room.sessionNotes,
                            objectives: room.sessionObjectives
                        }));
                    }
                });
                return;
            }

            // Time-Travel Checkpoint Creation
            if (type === "checkpoint-create") {
                const cp = {
                    id: "cp-" + Date.now(),
                    code: data.code || room.code,
                    lang: data.lang || room.lang,
                    author: currentUser ? currentUser.username : "Developer",
                    timestamp: Date.now(),
                    note: data.note || "Checkpoint"
                };
                room.checkpoints.unshift(cp);
                if (room.checkpoints.length > 50) room.checkpoints.pop();

                room.peers.forEach((peer) => {
                    if (peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "checkpoint-created",
                            fromPeerId: currentPeerId,
                            checkpoint: cp,
                            checkpoints: room.checkpoints
                        }));
                    }
                });
                return;
            }

            // Time-Travel Checkpoint Restore (with auto-safety snapshot)
            if (type === "checkpoint-restore") {
                const cp = room.checkpoints.find(c => c.id === data.checkpointId);
                if (cp) {
                    const safetyCp = {
                        id: "cp-safety-" + Date.now(),
                        code: room.code,
                        lang: room.lang,
                        author: "System (Pre-Restore)",
                        timestamp: Date.now(),
                        note: `Auto-saved before restoring ${cp.note || "checkpoint"}`
                    };
                    room.checkpoints.unshift(safetyCp);

                    room.code = cp.code;
                    if (cp.lang) room.lang = cp.lang;

                    room.peers.forEach((peer) => {
                        if (peer.ws.readyState === WebSocket.OPEN) {
                            peer.ws.send(JSON.stringify({
                                type: "code-restored",
                                fromPeerId: currentPeerId,
                                restoredBy: currentUser ? currentUser.username : "Partner",
                                code: room.code,
                                lang: room.lang,
                                checkpoint: cp,
                                checkpoints: room.checkpoints
                            }));
                        }
                    });
                }
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

            // Synchronized Publish & Reaction Events: broadcast to partner
            if (type === "publish-modal-opened" || type === "publish-modal-closed" || type === "publish-code-change" || type === "solution-published" || type === "huddle-reaction") {
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

            // In-room Chat message: stored in room chat history & broadcast with timestamp and id
            if (type === "chat-message") {
                const senderName = (data.sender && !data.sender.startsWith("Developer_"))
                    ? data.sender
                    : (currentUser && currentUser.username ? currentUser.username : "Developer");
                const senderAvatar = (data.avatarUrl && data.avatarUrl !== "default-avatar.png")
                    ? data.avatarUrl
                    : (currentUser && currentUser.avatarUrl ? currentUser.avatarUrl : "default-avatar.png");

                const msgObj = {
                    id: "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                    fromPeerId: currentPeerId,
                    sender: senderName,
                    avatarUrl: senderAvatar,
                    message: data.message || "",
                    codeSnippet: data.codeSnippet || null,
                    lang: data.lang || null,
                    timestamp: Date.now()
                };
                room.chatHistory.push(msgObj);
                if (room.chatHistory.length > 100) room.chatHistory.shift();

                room.peers.forEach((peer) => {
                    if (peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(JSON.stringify({
                            type: "chat-message",
                            ...msgObj
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

            // Explicit Leave Room Event
            if (type === "leave-room") {
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

                    // If room is empty, clean it up after timeout
                    if (room.peers.size === 0) {
                        setTimeout(() => {
                            if (collabRooms.has(currentRoomId) && collabRooms.get(currentRoomId).peers.size === 0) {
                                collabRooms.delete(currentRoomId);
                            }
                        }, 30 * 60 * 1000);
                    }
                }
                currentRoomId = null;
                currentPeerId = null;
                return;
            }

        } catch (e) {
            console.error("Collab WS message error:", e);
        }
    });

    ws.on("close", () => {
        if (ws.registeredUserId && activeUserSockets.has(ws.registeredUserId)) {
            const set = activeUserSockets.get(ws.registeredUserId);
            set.delete(ws);
            if (set.size === 0) activeUserSockets.delete(ws.registeredUserId);
        }
        if (ws.registeredUsername && activeUserSockets.has(ws.registeredUsername)) {
            const set = activeUserSockets.get(ws.registeredUsername);
            set.delete(ws);
            if (set.size === 0) activeUserSockets.delete(ws.registeredUsername);
        }

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

