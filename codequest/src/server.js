// import mongoose from "mongoose";
// import express from "express";
// import cors from "cors";

// const app = express();
// const PORT = 3000;

// app.use(cors());
// app.use(express.json());

// // Connect to MongoDB (Remove deprecated options)
// mongoose.connect("mongodb://127.0.0.1:27017/codequestdb")
//     .then(() => console.log("MongoDB connected"))
//     .catch(err => console.error("MongoDB connection error:", err));

// // Define Schema
// const questionSchema = new mongoose.Schema({
//     text: String,
// });
// const Question = mongoose.model("Question", questionSchema);

// // API to fetch questions
// app.get("/questions", async (req, res) => {
//     const questions = await Question.find();
//     res.json(questions);
// });

// // API to add a question
// app.post("/questions", async (req, res) => {
//   try {
//       const { questionText } = req.body;  // Get question from request
//       const question = new Question({ questionText, createdAt: new Date() });
//       await question.save();  // Save to MongoDB
//       res.status(201).json(question);  // Send response
//   } catch (err) {
//       res.status(500).json({ error: "Failed to save question" });
//   }
// });


// // Start server
// app.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });

// import express from "express";
// import mongoose from "mongoose";
// import cors from "cors";

// // Initialize Express App
// const app = express();
// const PORT = process.env.PORT || 3000;

// // MongoDB Connection String (Directly inside server.js)
// const MONGO_URI = "mongodb+srv://sampathkumarreddy:sampath317.@cluster0.irpbz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// // Middleware
// app.use(express.json());
// app.use(cors());

// // Connect to MongoDB
// mongoose.connect(MONGO_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true
// })
// .then(() => console.log("✅ MongoDB connected"))
// .catch(err => {
//     console.error("❌ MongoDB connection error:", err);
//     process.exit(1);
// });

// // Define Mongoose Schema & Models
// const questionSchema = new mongoose.Schema({
//     questionText: String,
//     createdAt: { type: Date, default: Date.now }
// });

// const answerSchema = new mongoose.Schema({
//     questionId: mongoose.Schema.Types.ObjectId,
//     answerText: String,
//     createdAt: { type: Date, default: Date.now }
// });

// const Question = mongoose.model("Question", questionSchema);
// const Answer = mongoose.model("Answer", answerSchema);

// // Routes
// app.post("/questions", async (req, res) => {
//     try {
//         const { questionText } = req.body;
//         if (!questionText) return res.status(400).json({ error: "Question text is required" });

//         const newQuestion = new Question({ questionText });
//         await newQuestion.save();
//         res.status(201).json({ message: "Question posted successfully!" });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to post question" });
//     }
// });

// app.get("/questions", async (req, res) => {
//     try {
//         const questions = await Question.find().sort({ createdAt: -1 });
//         res.json(questions);
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch questions" });
//     }
// });

// app.post("/answers/:questionId", async (req, res) => {
//     try {
//         const { answerText } = req.body;
//         if (!answerText) return res.status(400).json({ error: "Answer text is required" });

//         const newAnswer = new Answer({ questionId: req.params.questionId, answerText });
//         await newAnswer.save();
//         res.status(201).json({ message: "Answer posted successfully!" });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to post answer" });
//     }
// });

// app.get("/answers/:questionId", async (req, res) => {
//     try {
//         const answers = await Answer.find({ questionId: req.params.questionId }).sort({ createdAt: -1 });
//         res.json(answers);
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch answers" });
//     }
// });

// // Start Server
// app.listen(PORT, () => {
//     console.log(`🚀 Server is running on http://localhost:${PORT}`);
// });

// import express from "express";
// import mongoose from "mongoose";
// import cors from "cors";
// import path from "path";

// // Initialize Express App
// const app = express();
// const PORT = process.env.PORT || 3000;

// // MongoDB Connection String (DO NOT REMOVE)
// const MONGO_URI = "mongodb+srv://sampathkumarreddy:sampath317.@cluster0.irpbz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// // Middleware
// app.use(express.json());
// app.use(cors());

// // Serve Static Frontend Files
// const __dirname = path.resolve();
// app.use(express.static(path.join(__dirname, "src")));

// // Connect to MongoDB
// mongoose.connect(MONGO_URI, {})
//     .then(() => console.log("✅ MongoDB connected"))
//     .catch(err => {
//         console.error("❌ MongoDB connection error:", err);
//         process.exit(1);
//     });

// // Define Mongoose Schema & Models
// const questionSchema = new mongoose.Schema({
//     questionText: String,
//     createdAt: { type: Date, default: Date.now }
// });

// const answerSchema = new mongoose.Schema({
//     questionId: mongoose.Schema.Types.ObjectId,
//     answerText: String,
//     createdAt: { type: Date, default: Date.now }
// });

// const Question = mongoose.model("Question", questionSchema);
// const Answer = mongoose.model("Answer", answerSchema);

// // Routes
// app.post("/questions", async (req, res) => {
//     try {
//         const { questionText } = req.body;
//         if (!questionText) return res.status(400).json({ error: "Question text is required" });

//         const newQuestion = new Question({ questionText });
//         await newQuestion.save();
//         res.status(201).json({ message: "Question posted successfully!" });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to post question" });
//     }
// });

// app.get("/questions", async (req, res) => {
//     try {
//         const questions = await Question.find().sort({ createdAt: -1 });
//         res.json(questions);
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch questions" });
//     }
// });

// app.post("/answers/:questionId", async (req, res) => {
//     try {
//         const { answerText } = req.body;
//         if (!answerText) return res.status(400).json({ error: "Answer text is required" });

//         const newAnswer = new Answer({ questionId: req.params.questionId, answerText });
//         await newAnswer.save();
//         res.status(201).json({ message: "Answer posted successfully!" });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to post answer" });
//     }
// });

// app.get("/answers/:questionId", async (req, res) => {
//     try {
//         const answers = await Answer.find({ questionId: req.params.questionId }).sort({ createdAt: -1 });
//         res.json(answers);
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch answers" });
//     }
// });

// // Serve `index.html` for unknown routes
// app.get("*", (req, res) => {
//     res.sendFile(path.join(__dirname, "src", "index.html"));
// });

// // Start Server
// app.listen(PORT, () => {
//     console.log(`🚀 Server is running on http://localhost:${PORT}`);
// });

// import express from "express";
// import mongoose from "mongoose";
// import cors from "cors";
// import path from "path";

// // Initialize Express App
// const app = express();
// const PORT = process.env.PORT || 3000;

// // MongoDB Connection String
// const MONGO_URI = "mongodb+srv://sampathkumarreddy:sampath317.@cluster0.irpbz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// // Middleware
// app.use(express.json());
// app.use(cors());

// // Serve Static Frontend Files
// const __dirname = path.resolve();
// app.use(express.static(path.join(__dirname, "src")));

// // Connect to MongoDB
// mongoose.connect(MONGO_URI, {})
//     .then(() => console.log("✅ MongoDB connected"))
//     .catch(err => {
//         console.error("❌ MongoDB connection error:", err);
//         process.exit(1);
//     });

// // Define Mongoose Schema & Models
// const questionSchema = new mongoose.Schema({
//     questionText: String,
//     createdAt: { type: Date, default: Date.now }
// });

// const answerSchema = new mongoose.Schema({
//     questionId: mongoose.Schema.Types.ObjectId,
//     answerText: String,
//     createdAt: { type: Date, default: Date.now }
// });

// const Question = mongoose.model("Question", questionSchema);
// const Answer = mongoose.model("Answer", answerSchema);

// // Routes
// app.post("/questions", async (req, res) => {
//     try {
//         const { questionText } = req.body;
//         if (!questionText) return res.status(400).json({ error: "Question text is required" });

//         const newQuestion = new Question({ questionText });
//         await newQuestion.save();
//         res.status(201).json({ message: "Question posted successfully!", question: newQuestion });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to post question" });
//     }
// });

// // ✅ Get all questions
// app.get("/questions", async (req, res) => {
//     try {
//         const questions = await Question.find({});
//         res.json(questions);
//     } catch (error) {
//         console.error("❌ Error fetching questions:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ✅ Post a new question
// app.post("/questions", async (req, res) => {
//     try {
//         const { questionText } = req.body;
//         if (!questionText) {
//             return res.status(400).json({ error: "Question text is required" });
//         }

//         const newQuestion = new Question({ questionText, answers: [] });
//         await newQuestion.save();
//         res.status(201).json(newQuestion);
//     } catch (error) {
//         console.error("❌ Error posting question:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// });


// app.get("/answers/:questionId", async (req, res) => {
//     try {
//         const answers = await Answer.find({ questionId: req.params.questionId }).sort({ createdAt: -1 });
//         res.json(answers);
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch answers" });
//     }
// });

// // Serve `index.html` correctly for unknown routes
// app.get("*", (req, res) => {
//     res.sendFile(path.join(__dirname, "src", "index.html"));
// });

// // Start Server
// app.listen(PORT, () => {
//     console.log(`🚀 Server is running on http://localhost:${PORT}`);
// });

import express from "express"; 
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import fs from "fs";

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection String
const MONGO_URI = "mongodb+srv://sampathkumarreddy:sampath317.@cluster0.irpbz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Middleware
app.use(express.json());
app.use(cors());

// Serve Static Frontend Files
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "src")));

// Connect to MongoDB
mongoose.connect(MONGO_URI, {})
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    });

// Define Mongoose Schema & Models
const questionSchema = new mongoose.Schema({
    questionText: String,
    createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
    questionId: mongoose.Schema.Types.ObjectId,
    answerText: String,
    createdAt: { type: Date, default: Date.now }
});

const Question = mongoose.model("Question", questionSchema);
const Answer = mongoose.model("Answer", answerSchema);

// ✅ Post a new question
app.post("/questions", async (req, res) => {
    try {
        const { questionText } = req.body;
        if (!questionText) {
            return res.status(400).json({ error: "Question text is required" });
        }

        const newQuestion = new Question({ questionText });
        await newQuestion.save();
        res.status(201).json({ message: "Question posted successfully!", question: newQuestion });
    } catch (error) {
        console.error("❌ Error posting question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Get all questions
app.get("/questions", async (req, res) => {
    try {
        const questions = await Question.find({}).sort({ createdAt: -1 });
        res.json(questions);
    } catch (error) {
        console.error("❌ Error fetching questions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Get all answers for a question
app.get("/answers/:questionId", async (req, res) => {
    try {
        const answers = await Answer.find({ questionId: req.params.questionId }).sort({ createdAt: -1 });
        res.json(answers);
    } catch (error) {
        console.error("❌ Error fetching answers:", error);
        res.status(500).json({ error: "Failed to fetch answers" });
    }
});

// ✅ Post an answer
app.post("/answers/:questionId", async (req, res) => {
    try {
        const { answerText } = req.body;
        const { questionId } = req.params;

        if (!answerText) {
            return res.status(400).json({ error: "Answer text is required" });
        }

        const newAnswer = new Answer({ questionId, answerText });
        await newAnswer.save();

        res.status(201).json({ message: "Answer posted successfully!", answer: newAnswer });
    } catch (error) {
        console.error("❌ Error posting answer:", error);
        res.status(500).json({ error: "Failed to post answer" });
    }
});

// ✅ Serve HTML files properly
app.get("*", (req, res) => {
    const filePath = path.join(__dirname, "src", req.path);
    if (filePath.endsWith(".html") && fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(__dirname, "src", "index.html"));
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
