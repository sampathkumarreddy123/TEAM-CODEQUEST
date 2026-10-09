/**
 * CodeQuest Live Huddle Client Engine
 * - Predominantly Light Theme & Refined UX
 * - 6-Tab Workspace Architecture: Editor, Test Lab, Publish, History, AI Copilot, Memory
 * - Multi-Peer Synchronization with Collaborator Cursor Presence
 * - Bi-directional Shared Publishing Draft & Explicit Editor Import
 * - Isolated Smart Test Lab Runner
 * - Time-Travel Version History with Diff & Safe Auto-Snapshot Restore
 * - AI Copilot with Configurable LLM API / Heuristic Static Analysis
 * - Resilient WebRTC Face-to-Face Video, Screen Sharing & Floating Reactions
 * - Enhanced Pair Chat with Syntax Snippets & Copy Action
 */

(function () {
    "use strict";

    // -------------------------------------------------------------
    // 1. STATE MANAGEMENT
    // -------------------------------------------------------------
    const urlParams = new URLSearchParams(window.location.search);
    let roomId = (urlParams.get("room") || "").trim().toUpperCase();
    if (!roomId) {
        roomId = `CQ-${Math.floor(1000 + Math.random() * 9000)}`;
        urlParams.set("room", roomId);
        window.history.replaceState({}, "", `${window.location.pathname}?${urlParams.toString()}`);
    }
    const questionId = urlParams.get("questionId") || urlParams.get("id") || null;

    let currentUser = {
        username: "Developer_" + Math.floor(Math.random() * 899 + 100),
        avatarUrl: "default-avatar.png",
        id: null
    };

    let ws = null;
    let myPeerId = null;
    let remotePeerId = null;

    // WebRTC Media State
    let peerConnection = null;
    let localStream = null;
    let remoteMediaStream = null;
    let iceCandidatesQueue = [];
    let screenStream = null;
    let isMicMuted = false;
    let isVideoOff = false;
    let isScreenSharing = false;

    // Call Timer
    let callTimerInterval = null;
    let callElapsedSeconds = 0;

    // Chat unread count
    let chatUnreadCount = 0;

    // Editor & Sync State
    let isRemoteTyping = false;
    let lastKnownCode = "";
    let lastKnownLang = "javascript";
    let lastConsoleError = "";

    // Test Lab State
    let testCases = [
        { id: "tc-1", name: "Sample 1", input: "1 2\n", expectedOutput: "3", passed: null, actual: "", error: "", duration: "" },
        { id: "tc-2", name: "Sample 2", input: "10 20\n", expectedOutput: "30", passed: null, actual: "", error: "", duration: "" }
    ];

    // Shared Publishing Draft State
    let publishDraft = {
        title: "",
        description: "",
        problemStatement: "",
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        sampleInput: "",
        sampleOutput: "",
        explanation: "",
        language: "javascript",
        solutionCode: "",
        testCases: [],
        lastSaved: null,
        isPublished: false
    };

    // Time-Travel Checkpoints State
    let checkpoints = [];
    let selectedCheckpoint = null;

    // Session Memory State
    let sessionNotes = "";
    let sessionObjectives = [
        { id: "obj-1", text: "Implement core algorithm", done: false },
        { id: "obj-2", text: "Pass all edge test cases", done: false }
    ];

    // Copilot Proposed Fix
    let pendingAiFixCode = null;

    const rtcConfig = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" }
        ]
    };

    // -------------------------------------------------------------
    // 2. DOM ELEMENT REFERENCES
    // -------------------------------------------------------------
    const displayRoomId = document.getElementById("displayRoomId");
    const copyInviteLinkBtn = document.getElementById("copyInviteLinkBtn");
    const copiedTooltip = document.getElementById("copiedTooltip");
    const connStatusDot = document.getElementById("connStatusDot");
    const connStatusText = document.getElementById("connStatusText");
    const huddleTimerBadge = document.getElementById("huddleTimerBadge");
    const activePeersCounter = document.getElementById("activePeersCounter");
    const runCollabCodeBtn = document.getElementById("runCollabCodeBtn");
    const toggleHuddleDockBtn = document.getElementById("toggleHuddleDockBtn");
    const toggleChatDrawerBtn = document.getElementById("toggleChatDrawerBtn");
    const chatUnreadBadge = document.getElementById("chatUnreadBadge");

    // Workspace Views & Navigation Tabs
    const workspaceTabs = document.querySelectorAll(".cq-tab-btn");
    const viewPanes = {
        editor: document.getElementById("viewPaneEditor"),
        testlab: document.getElementById("viewPaneTestLab"),
        publish: document.getElementById("viewPanePublish"),
        history: document.getElementById("viewPaneHistory"),
        copilot: document.getElementById("viewPaneCopilot"),
        notes: document.getElementById("viewPaneNotes")
    };

    // Editor Pane
    const collabCodeInput = document.getElementById("collabCodeInput");
    const editorLineNumbers = document.getElementById("editorLineNumbers");
    const editorLangSelect = document.getElementById("editorLangSelect");
    const syncIndicator = document.getElementById("syncIndicator");
    const fileTabName = document.getElementById("fileTabName");
    const fileTabIcon = document.getElementById("fileTabIcon");
    const partnerCursorFlag = document.getElementById("partnerCursorFlag");
    const collaboratorCursorElem = document.getElementById("collaboratorCursorElem");
    const collaboratorCursorBadge = document.getElementById("collaboratorCursorBadge");
    const clearConsoleBtn = document.getElementById("clearConsoleBtn");
    const consoleLogsList = document.getElementById("consoleLogsList");
    const collabExecTime = document.getElementById("collabExecTime");

    // Test Lab Pane
    const testCasesList = document.getElementById("testCasesList");
    const addNewTestCaseBtn = document.getElementById("addNewTestCaseBtn");
    const runAllTestsBtn = document.getElementById("runAllTestsBtn");
    const importAiTestsBtn = document.getElementById("importAiTestsBtn");
    const labTotalCount = document.getElementById("labTotalCount");
    const labPassedCount = document.getElementById("labPassedCount");
    const labFailedCount = document.getElementById("labFailedCount");
    const labExecTimeVal = document.getElementById("labExecTimeVal");
    const testCasesCounterBadge = document.getElementById("testCasesCounterBadge");

    // Publishing Pane
    const publishTitleInput = document.getElementById("publishTitleInput");
    const publishDescInput = document.getElementById("publishDescInput");
    const publishStatementInput = document.getElementById("publishStatementInput");
    const publishInputFormat = document.getElementById("publishInputFormat");
    const publishOutputFormat = document.getElementById("publishOutputFormat");
    const publishConstraints = document.getElementById("publishConstraints");
    const publishSampleInput = document.getElementById("publishSampleInput");
    const publishSampleOutput = document.getElementById("publishSampleOutput");
    const publishExplanation = document.getElementById("publishExplanation");
    const publishLangSelect = document.getElementById("publishLangSelect");
    const publishSolutionCode = document.getElementById("publishSolutionCode");
    const importEditorCodeToDraftBtn = document.getElementById("importEditorCodeToDraftBtn");
    const publishChallengeSubmitBtn = document.getElementById("publishChallengeSubmitBtn");
    const publishDraftStatusBadge = document.getElementById("publishDraftStatusBadge");

    // History Pane
    const checkpointTimelineList = document.getElementById("checkpointTimelineList");
    const createManualCheckpointBtn = document.getElementById("createManualCheckpointBtn");
    const createCheckpointQuickBtn = document.getElementById("createCheckpointQuickBtn");
    const checkpointCodeDiffViewer = document.getElementById("checkpointCodeDiffViewer");
    const selectedCheckpointTitle = document.getElementById("selectedCheckpointTitle");
    const selectedCheckpointAuthor = document.getElementById("selectedCheckpointAuthor");
    const restoreSelectedCheckpointBtn = document.getElementById("restoreSelectedCheckpointBtn");
    const confirmRestoreActionBtn = document.getElementById("confirmRestoreActionBtn");

    // AI Copilot Pane
    const aiProviderBadge = document.getElementById("aiProviderBadge");
    const aiActionExplainError = document.getElementById("aiActionExplainError");
    const aiActionReviewBugs = document.getElementById("aiActionReviewBugs");
    const aiActionSuggestFix = document.getElementById("aiActionSuggestFix");
    const aiActionGenerateTests = document.getElementById("aiActionGenerateTests");
    const aiCustomPromptInput = document.getElementById("aiCustomPromptInput");
    const aiSendCustomPromptBtn = document.getElementById("aiSendCustomPromptBtn");
    const copilotResultCard = document.getElementById("copilotResultCard");
    const copilotResponseTitle = document.getElementById("copilotResponseTitle");
    const copilotResponseBody = document.getElementById("copilotResponseBody");
    const copilotResultTools = document.getElementById("copilotResultTools");
    const copilotApplyFixBtn = document.getElementById("copilotApplyFixBtn");
    const copilotImportTestsBtn = document.getElementById("copilotImportTestsBtn");
    const aiDiffReviewCode = document.getElementById("aiDiffReviewCode");
    const confirmApplyAiFixBtn = document.getElementById("confirmApplyAiFixBtn");

    // Session Memory Pane
    const sessionNotesTextarea = document.getElementById("sessionNotesTextarea");
    const sessionObjectivesList = document.getElementById("sessionObjectivesList");
    const newObjectiveInput = document.getElementById("newObjectiveInput");
    const addObjectiveBtn = document.getElementById("addObjectiveBtn");

    // Huddle Stage & Controls
    const huddleDockPane = document.getElementById("huddleDockPane");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const remoteAudio = document.getElementById("remoteAudio");
    const localVideoPlaceholder = document.getElementById("localVideoPlaceholder");
    const remoteVideoPlaceholder = document.getElementById("remoteVideoPlaceholder");
    const remoteUserName = document.getElementById("remoteUserName");
    const remotePlaceholderText = document.getElementById("remotePlaceholderText");
    const remoteUserTagLabel = document.getElementById("remoteUserTagLabel");
    const remoteAudioStatusIcon = document.getElementById("remoteAudioStatusIcon");
    const localAudioStatusIcon = document.getElementById("localAudioStatusIcon");
    const screenShareActivePill = document.getElementById("screenShareActivePill");
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    const toggleCamBtn = document.getElementById("toggleCamBtn");
    const toggleScreenBtn = document.getElementById("toggleScreenBtn");
    const toggleReactionBtn = document.getElementById("toggleReactionBtn");
    const huddleReactionPopover = document.getElementById("huddleReactionPopover");
    const huddleFloatingReactions = document.getElementById("huddleFloatingReactions");
    const stageFullscreenBtn = document.getElementById("stageFullscreenBtn");

    // Pair Chat
    const chatMessagesContainer = document.getElementById("chatMessagesContainer");
    const chatInputForm = document.getElementById("chatInputForm");
    const chatMessageInput = document.getElementById("chatMessageInput");
    const insertEditorCodeBtn = document.getElementById("insertEditorCodeBtn");

    // -------------------------------------------------------------
    // 3. INITIALIZATION & AUTHENTICATION
    // -------------------------------------------------------------
    async function initUser() {
        if (displayRoomId) displayRoomId.textContent = roomId;

        try {
            const res = await fetch("/api/user", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                if (data && (data.user || data.username)) {
                    const u = data.user || data;
                    currentUser.username = u.username || currentUser.username;
                    currentUser.avatarUrl = u.avatarUrl || "default-avatar.png";
                    currentUser.id = u._id || u.id;
                }
            }
        } catch (e) {
            console.warn("User auth fetch note:", e);
        }

        // Initialize local camera & mic
        await setupLocalMedia();
        // Connect WebSocket
        connectWebSocket();
        // Hydrate initial room state via REST
        await hydrateRoomState();
    }

    // -------------------------------------------------------------
    // 4. WORKSPACE TAB NAVIGATION
    // -------------------------------------------------------------
    workspaceTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const targetView = tab.getAttribute("data-tab");
            switchWorkspaceTab(targetView);
        });
    });

    function switchWorkspaceTab(tabName) {
        workspaceTabs.forEach(t => {
            t.classList.toggle("active", t.getAttribute("data-tab") === tabName);
        });
        Object.entries(viewPanes).forEach(([name, pane]) => {
            if (pane) pane.classList.toggle("active", name === tabName);
        });
        if (tabName === "editor") {
            updateLineNumbers();
        }
    }

    // -------------------------------------------------------------
    // 5. COPY INVITE LINK
    // -------------------------------------------------------------
    if (copyInviteLinkBtn) {
        copyInviteLinkBtn.addEventListener("click", async () => {
            const inviteUrl = window.location.href;
            try {
                await navigator.clipboard.writeText(inviteUrl);
                if (copiedTooltip) {
                    copiedTooltip.classList.add("show");
                    setTimeout(() => copiedTooltip.classList.remove("show"), 2000);
                }
                showToast("Invite link copied to clipboard!", "success");
            } catch (err) {
                prompt("Copy this Huddle invite link:", inviteUrl);
            }
        });
    }

    // -------------------------------------------------------------
    // 6. WEBSOCKET REAL-TIME NETWORKING
    // -------------------------------------------------------------
    function connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/collab?room=${roomId}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateConnectionStatus("connected", "In Huddle");
            startCallTimer();
            // Send join-room
            ws.send(JSON.stringify({
                type: "join-room",
                roomId,
                user: currentUser,
                lang: editorLangSelect ? editorLangSelect.value : "javascript",
                code: collabCodeInput ? collabCodeInput.value : ""
            }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (e) {
                console.error("WS Parse Error:", e);
            }
        };

        ws.onclose = () => {
            updateConnectionStatus("disconnected", "Reconnecting...");
            setTimeout(connectWebSocket, 2500);
        };

        ws.onerror = (err) => {
            console.error("WebSocket Error:", err);
            updateConnectionStatus("disconnected", "Connection Error");
        };
    }

    function handleServerMessage(msg) {
        switch (msg.type) {
            case "room-joined":
                myPeerId = msg.peerId;
                if (msg.code !== undefined && !collabCodeInput.value.trim()) {
                    setEditorContent(msg.code, msg.lang);
                }
                if (msg.publishDraft) {
                    publishDraft = { ...publishDraft, ...msg.publishDraft };
                    renderPublishDraft();
                }
                if (Array.isArray(msg.testCases)) {
                    testCases = msg.testCases;
                    renderTestCases();
                }
                if (typeof msg.sessionNotes === "string" && msg.sessionNotes) {
                    sessionNotes = msg.sessionNotes;
                    if (sessionNotesTextarea) sessionNotesTextarea.value = sessionNotes;
                }
                if (Array.isArray(msg.sessionObjectives)) {
                    sessionObjectives = msg.sessionObjectives;
                    renderObjectives();
                }
                if (Array.isArray(msg.checkpoints)) {
                    checkpoints = msg.checkpoints;
                    renderCheckpoints();
                }
                if (Array.isArray(msg.chatHistory)) {
                    msg.chatHistory.forEach(renderChatMessage);
                }
                if (Array.isArray(msg.peers) && msg.peers.length > 0) {
                    const otherPeer = msg.peers[0];
                    remotePeerId = otherPeer.peerId;
                    updateRemoteUserUI(otherPeer.user);
                    // Initiate WebRTC offer as the joining peer
                    createWebRtcPeer(true);
                }
                updatePeerCountDisplay();
                break;

            case "peer-joined":
                remotePeerId = msg.peerId;
                updateRemoteUserUI(msg.user);
                updatePeerCountDisplay();
                showToast(`${msg.user ? msg.user.username : "Partner"} joined the Huddle`, "info");
                break;

            case "peer-left":
                showToast(`${msg.user ? msg.user.username : "Partner"} left the Huddle`, "warning");
                remotePeerId = null;
                resetRemoteMedia();
                updatePeerCountDisplay();
                break;

            case "room-full":
                const fullModalElem = document.getElementById("roomFullModal");
                if (fullModalElem && window.bootstrap) {
                    const fullModal = new bootstrap.Modal(fullModalElem);
                    fullModal.show();
                }
                break;

            case "webrtc-signal":
                handleWebRtcSignal(msg);
                break;

            case "code-change":
                handleRemoteCodeChange(msg);
                break;

            case "cursor-position":
                handleRemoteCursorPosition(msg);
                break;

            case "publish-draft-update":
                if (msg.draft) {
                    publishDraft = { ...publishDraft, ...msg.draft };
                    renderPublishDraft();
                }
                break;

            case "challenge-published":
                showToast(`🏆 Challenge "${msg.title}" published collaboratively by @${msg.author}!`, "success");
                publishDraft.isPublished = true;
                if (publishDraftStatusBadge) {
                    publishDraftStatusBadge.textContent = "Published";
                    publishDraftStatusBadge.className = "cq-badge-draft text-success bg-success-subtle";
                }
                break;

            case "test-cases-update":
                if (Array.isArray(msg.testCases)) {
                    testCases = msg.testCases;
                    renderTestCases();
                }
                break;

            case "session-notes-update":
                if (typeof msg.notes === "string") {
                    sessionNotes = msg.notes;
                    if (sessionNotesTextarea && document.activeElement !== sessionNotesTextarea) {
                        sessionNotesTextarea.value = sessionNotes;
                    }
                }
                if (Array.isArray(msg.objectives)) {
                    sessionObjectives = msg.objectives;
                    renderObjectives();
                }
                break;

            case "checkpoint-created":
                if (Array.isArray(msg.checkpoints)) {
                    checkpoints = msg.checkpoints;
                    renderCheckpoints();
                    showToast(`Checkpoint saved: "${msg.checkpoint.note}"`, "info");
                }
                break;

            case "code-restored":
                setEditorContent(msg.code, msg.lang);
                if (Array.isArray(msg.checkpoints)) {
                    checkpoints = msg.checkpoints;
                    renderCheckpoints();
                }
                showToast(`Code version restored by ${msg.restoredBy}`, "warning");
                break;

            case "run-code":
                showToast(`Partner triggered code execution...`, "info");
                break;

            case "run-result":
                displayConsoleOutput(msg.output, msg.error, msg.duration);
                break;

            case "chat-message":
                renderChatMessage(msg);
                if (huddleDockPane && huddleDockPane.classList.contains("collapsed")) {
                    chatUnreadCount++;
                    if (chatUnreadBadge) {
                        chatUnreadBadge.textContent = chatUnreadCount;
                        chatUnreadBadge.style.display = "inline-block";
                    }
                }
                break;

            case "huddle-reaction":
                triggerFloatingEmoji(msg.emoji);
                break;

            case "peer-status":
                if (msg.peerId === remotePeerId) {
                    if (msg.isMuted !== undefined) {
                        remoteAudioStatusIcon.innerHTML = msg.isMuted ?
                            `<i class="fa-solid fa-microphone-slash text-danger"></i>` :
                            `<i class="fa-solid fa-microphone text-success"></i>`;
                    }
                    if (msg.isVideoOff !== undefined) {
                        if (remoteVideoPlaceholder) {
                            remoteVideoPlaceholder.style.display = msg.isVideoOff ? "flex" : "none";
                        }
                    }
                }
                break;
        }
    }

    // -------------------------------------------------------------
    // 7. REST HYDRATION (RESTORE SESSION STATE)
    // -------------------------------------------------------------
    async function hydrateRoomState() {
        try {
            const res = await fetch(`/api/collab/room/${roomId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.room) {
                    const r = data.room;
                    if (r.code && !collabCodeInput.value.trim()) {
                        setEditorContent(r.code, r.lang || "javascript");
                    }
                    if (r.publishDraft) {
                        publishDraft = { ...publishDraft, ...r.publishDraft };
                        renderPublishDraft();
                    }
                    if (Array.isArray(r.testCases)) {
                        testCases = r.testCases;
                        renderTestCases();
                    }
                    if (r.sessionNotes && sessionNotesTextarea) {
                        sessionNotes = r.sessionNotes;
                        sessionNotesTextarea.value = sessionNotes;
                    }
                    if (Array.isArray(r.sessionObjectives)) {
                        sessionObjectives = r.sessionObjectives;
                        renderObjectives();
                    }
                    if (Array.isArray(r.checkpoints)) {
                        checkpoints = r.checkpoints;
                        renderCheckpoints();
                    }
                }
            }
        } catch (e) {
            console.warn("Hydrate state note:", e);
        }
    }

    // -------------------------------------------------------------
    // 8. REAL-TIME COLLABORATIVE EDITOR ENGINE
    // -------------------------------------------------------------
    function setEditorContent(code, lang) {
        isRemoteTyping = true;
        collabCodeInput.value = code;
        lastKnownCode = code;
        if (lang && editorLangSelect) {
            editorLangSelect.value = lang;
            updateFileTabName(lang);
        }
        updateLineNumbers();
        isRemoteTyping = false;
        showSyncBadge("synced");
    }

    collabCodeInput.addEventListener("input", () => {
        if (isRemoteTyping) return;
        const code = collabCodeInput.value;
        const lang = editorLangSelect.value;
        lastKnownCode = code;
        updateLineNumbers();
        showSyncBadge("saving");

        // Broadcast code edit
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "code-change",
                code,
                lang
            }));
            // Broadcast cursor position
            sendCursorPosition();
        }

        debounce(() => {
            showSyncBadge("synced");
        }, 600)();
    });

    collabCodeInput.addEventListener("keyup", sendCursorPosition);
    collabCodeInput.addEventListener("click", sendCursorPosition);

    function sendCursorPosition() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const selStart = collabCodeInput.selectionStart;
        const textBefore = collabCodeInput.value.substring(0, selStart);
        const lines = textBefore.split("\n");
        const line = lines.length;
        const ch = lines[lines.length - 1].length;

        ws.send(JSON.stringify({
            type: "cursor-position",
            line,
            ch,
            selection: { start: selStart, end: collabCodeInput.selectionEnd }
        }));
    }

    function handleRemoteCodeChange(msg) {
        isRemoteTyping = true;
        const start = collabCodeInput.selectionStart;
        const end = collabCodeInput.selectionEnd;
        collabCodeInput.value = msg.code;
        lastKnownCode = msg.code;
        if (msg.lang && editorLangSelect && editorLangSelect.value !== msg.lang) {
            editorLangSelect.value = msg.lang;
            updateFileTabName(msg.lang);
        }
        // Preserve local cursor selection
        collabCodeInput.setSelectionRange(start, end);
        updateLineNumbers();
        isRemoteTyping = false;
        showSyncBadge("synced");
    }

    function handleRemoteCursorPosition(msg) {
        if (partnerCursorFlag) {
            partnerCursorFlag.style.display = "inline-flex";
            const pName = document.getElementById("partnerCursorName");
            if (pName) pName.textContent = msg.fromUser || "Partner";
            clearTimeout(partnerCursorFlag._hideTimer);
            partnerCursorFlag._hideTimer = setTimeout(() => {
                partnerCursorFlag.style.display = "none";
            }, 3000);
        }

        // Calculate visual cursor pin overlay
        if (collaboratorCursorElem) {
            const lineHeight = 22;
            const charWidth = 7.8;
            const top = 12 + (msg.line - 1) * lineHeight;
            const left = 14 + msg.ch * charWidth;
            collaboratorCursorElem.style.top = `${top}px`;
            collaboratorCursorElem.style.left = `${left}px`;
            collaboratorCursorElem.style.display = "block";
            if (collaboratorCursorBadge) {
                collaboratorCursorBadge.textContent = `@${msg.fromUser || "Partner"}`;
            }
            clearTimeout(collaboratorCursorElem._hideTimer);
            collaboratorCursorElem._hideTimer = setTimeout(() => {
                collaboratorCursorElem.style.display = "none";
            }, 3000);
        }
    }

    editorLangSelect.addEventListener("change", () => {
        const lang = editorLangSelect.value;
        lastKnownLang = lang;
        updateFileTabName(lang);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "code-change",
                code: collabCodeInput.value,
                lang
            }));
        }
    });

    function updateFileTabName(lang) {
        const extMap = {
            javascript: { name: "solution.js", icon: "fa-brands fa-js", color: "text-warning" },
            python: { name: "solution.py", icon: "fa-brands fa-python", color: "text-primary" },
            cpp: { name: "solution.cpp", icon: "fa-solid fa-c", color: "text-info" },
            java: { name: "Prog.java", icon: "fa-brands fa-java", color: "text-danger" },
            go: { name: "main.go", icon: "fa-brands fa-golang", color: "text-info" },
            rust: { name: "main.rs", icon: "fa-brands fa-rust", color: "text-warning" }
        };
        const item = extMap[lang] || { name: `solution.${lang}`, icon: "fa-solid fa-code", color: "text-secondary" };
        if (fileTabName) fileTabName.textContent = item.name;
        if (fileTabIcon) {
            fileTabIcon.className = `${item.icon} ${item.color} cq-lang-icon`;
        }
    }

    function updateLineNumbers() {
        if (!editorLineNumbers || !collabCodeInput) return;
        const count = collabCodeInput.value.split("\n").length;
        let str = "";
        for (let i = 1; i <= count; i++) {
            str += i + "\n";
        }
        editorLineNumbers.innerText = str;
    }

    function showSyncBadge(state) {
        if (!syncIndicator) return;
        if (state === "saving") {
            syncIndicator.className = "cq-sync-indicator bg-warning-subtle text-warning";
            syncIndicator.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i><span>Syncing...</span>`;
        } else {
            syncIndicator.className = "cq-sync-indicator synced";
            syncIndicator.innerHTML = `<i class="fa-solid fa-check me-1"></i><span>Synced</span>`;
        }
    }

    // -------------------------------------------------------------
    // 9. SANDBOX CODE RUNNER & CONSOLE OUTPUT
    // -------------------------------------------------------------
    runCollabCodeBtn.addEventListener("click", runCode);

    // Ctrl+Enter keyboard shortcut for code execution
    collabCodeInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            runCode();
        }
        // Indentation handling for Tab key
        if (e.key === "Tab") {
            e.preventDefault();
            const start = collabCodeInput.selectionStart;
            const end = collabCodeInput.selectionEnd;
            collabCodeInput.value = collabCodeInput.value.substring(0, start) + "    " + collabCodeInput.value.substring(end);
            collabCodeInput.selectionStart = collabCodeInput.selectionEnd = start + 4;
            updateLineNumbers();
        }
    });

    async function runCode() {
        const code = collabCodeInput.value.trim();
        const lang = editorLangSelect.value;
        if (!code) {
            showToast("Editor is empty. Write code before running.", "warning");
            return;
        }

        displayConsoleOutput("Compiling and executing code in sandbox...", null, null, true);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "run-code", lang }));
        }

        try {
            const res = await fetch("/api/execute-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, lang })
            });
            const data = await res.json();
            displayConsoleOutput(data.output, data.error, data.duration);

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "run-result",
                    output: data.output,
                    error: data.error,
                    duration: data.duration
                }));
            }
        } catch (err) {
            displayConsoleOutput(null, "Execution failure: " + err.message);
        }
    }

    function displayConsoleOutput(output, error, duration, isSystem = false) {
        if (!consoleLogsList) return;
        if (isSystem) {
            consoleLogsList.innerHTML = `<div class="cq-log-line system"><i class="fa-solid fa-spinner fa-spin me-2"></i>${escapeHtml(output)}</div>`;
            return;
        }

        consoleLogsList.innerHTML = "";
        lastConsoleError = error || "";

        if (duration && collabExecTime) {
            collabExecTime.textContent = `${duration}s`;
            collabExecTime.style.display = "inline-block";
        }

        if (error) {
            const errDiv = document.createElement("div");
            errDiv.className = "cq-log-line stderr";
            errDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i>${escapeHtml(error)}`;
            consoleLogsList.appendChild(errDiv);
        }

        if (output) {
            const outDiv = document.createElement("div");
            outDiv.className = "cq-log-line stdout";
            outDiv.textContent = output;
            consoleLogsList.appendChild(outDiv);
        }

        if (!output && !error) {
            consoleLogsList.innerHTML = `<div class="cq-log-line system">Code executed cleanly without stdout.</div>`;
        }
    }

    if (clearConsoleBtn) {
        clearConsoleBtn.addEventListener("click", () => {
            consoleLogsList.innerHTML = `<div class="cq-console-empty"><i class="fa-solid fa-play text-muted me-2"></i>Console cleared. Click <b>Run</b> to execute code.</div>`;
            if (collabExecTime) collabExecTime.style.display = "none";
        });
    }

    // -------------------------------------------------------------
    // 10. SMART TEST LAB ENGINE
    // -------------------------------------------------------------
    function renderTestCases() {
        if (!testCasesList) return;
        testCasesList.innerHTML = "";
        if (testCasesCounterBadge) testCasesCounterBadge.textContent = testCases.length;
        if (labTotalCount) labTotalCount.textContent = testCases.length;

        let passed = 0;
        let failed = 0;

        testCases.forEach((tc, idx) => {
            if (tc.passed === true) passed++;
            if (tc.passed === false) failed++;

            const card = document.createElement("div");
            card.className = "cq-test-card";
            card.innerHTML = `
                <div class="cq-test-card-header">
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold">${escapeHtml(tc.name || `Test Case #${idx + 1}`)}</span>
                        <span class="cq-test-badge ${tc.passed === true ? 'passed' : tc.passed === false ? 'failed' : 'pending'}">
                            ${tc.passed === true ? 'Passed' : tc.passed === false ? 'Failed' : 'Pending'}
                        </span>
                        ${tc.duration ? `<span class="small text-muted font-monospace">${tc.duration}s</span>` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-cq-ghost-xs text-danger btn-delete-tc" data-idx="${idx}" title="Delete Test Case">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <div class="cq-test-grid">
                    <div>
                        <div class="cq-test-box-title">Standard Input (stdin)</div>
                        <textarea class="form-control cq-test-box-content tc-input-field" data-idx="${idx}">${escapeHtml(tc.input || "")}</textarea>
                    </div>
                    <div>
                        <div class="cq-test-box-title">Expected Output</div>
                        <textarea class="form-control cq-test-box-content tc-expected-field" data-idx="${idx}">${escapeHtml(tc.expectedOutput || "")}</textarea>
                    </div>
                    <div>
                        <div class="cq-test-box-title">Actual Output / Error</div>
                        <div class="cq-test-box-content ${tc.passed === false ? 'text-danger' : tc.passed === true ? 'text-success' : 'text-muted'}">
                            ${escapeHtml(tc.error || tc.actual || "--")}
                        </div>
                    </div>
                </div>
            `;
            testCasesList.appendChild(card);
        });

        if (labPassedCount) labPassedCount.textContent = passed;
        if (labFailedCount) labFailedCount.textContent = failed;

        // Wire inputs and delete buttons
        testCasesList.querySelectorAll(".tc-input-field").forEach(el => {
            el.addEventListener("input", (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                testCases[idx].input = e.target.value;
                broadcastTestCases();
            });
        });
        testCasesList.querySelectorAll(".tc-expected-field").forEach(el => {
            el.addEventListener("input", (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                testCases[idx].expectedOutput = e.target.value;
                broadcastTestCases();
            });
        });
        testCasesList.querySelectorAll(".btn-delete-tc").forEach(el => {
            el.addEventListener("click", (e) => {
                const btn = e.target.closest(".btn-delete-tc");
                const idx = parseInt(btn.dataset.idx, 10);
                testCases.splice(idx, 1);
                broadcastTestCases();
                renderTestCases();
            });
        });
    }

    if (addNewTestCaseBtn) {
        addNewTestCaseBtn.addEventListener("click", () => {
            testCases.push({
                id: `tc-${Date.now()}`,
                name: `Test Case #${testCases.length + 1}`,
                input: "",
                expectedOutput: "",
                passed: null,
                actual: "",
                error: "",
                duration: ""
            });
            broadcastTestCases();
            renderTestCases();
        });
    }

    function broadcastTestCases() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "test-cases-update",
                testCases
            }));
        }
    }

    if (runAllTestsBtn) {
        runAllTestsBtn.addEventListener("click", runAllTestCases);
    }

    async function runAllTestCases() {
        const code = collabCodeInput.value.trim();
        const lang = editorLangSelect.value;
        if (!code) {
            showToast("Editor code is empty. Write code before running tests.", "warning");
            return;
        }
        if (testCases.length === 0) {
            showToast("No test cases defined. Add a test case first.", "info");
            return;
        }

        runAllTestsBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;
        runAllTestsBtn.disabled = true;

        try {
            const res = await fetch("/api/collab/run-test-cases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, lang, testCases })
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.results)) {
                data.results.forEach((r, idx) => {
                    if (testCases[idx]) {
                        testCases[idx].passed = r.passed;
                        testCases[idx].actual = r.actual;
                        testCases[idx].error = r.error;
                        testCases[idx].duration = r.duration;
                    }
                });
                renderTestCases();
                showToast(`Test execution complete: ${data.passed}/${data.total} passed`, data.failed === 0 ? "success" : "warning");
            }
        } catch (e) {
            showToast("Failed to run test cases: " + e.message, "danger");
        } finally {
            runAllTestsBtn.innerHTML = `<i class="fa-solid fa-vial-circle-check me-1"></i>Run All Cases`;
            runAllTestsBtn.disabled = false;
        }
    }

    // -------------------------------------------------------------
    // 11. SHARED PUBLISHING WORKSPACE
    // -------------------------------------------------------------
    function renderPublishDraft() {
        if (publishTitleInput && document.activeElement !== publishTitleInput) publishTitleInput.value = publishDraft.title || "";
        if (publishDescInput && document.activeElement !== publishDescInput) publishDescInput.value = publishDraft.description || "";
        if (publishStatementInput && document.activeElement !== publishStatementInput) publishStatementInput.value = publishDraft.problemStatement || "";
        if (publishInputFormat && document.activeElement !== publishInputFormat) publishInputFormat.value = publishDraft.inputFormat || "";
        if (publishOutputFormat && document.activeElement !== publishOutputFormat) publishOutputFormat.value = publishDraft.outputFormat || "";
        if (publishConstraints && document.activeElement !== publishConstraints) publishConstraints.value = publishDraft.constraints || "";
        if (publishSampleInput && document.activeElement !== publishSampleInput) publishSampleInput.value = publishDraft.sampleInput || "";
        if (publishSampleOutput && document.activeElement !== publishSampleOutput) publishSampleOutput.value = publishDraft.sampleOutput || "";
        if (publishExplanation && document.activeElement !== publishExplanation) publishExplanation.value = publishDraft.explanation || "";
        if (publishLangSelect) publishLangSelect.value = publishDraft.language || "javascript";
        if (publishSolutionCode && document.activeElement !== publishSolutionCode) publishSolutionCode.value = publishDraft.solutionCode || "";

        if (publishDraftStatusBadge) {
            if (publishDraft.isPublished) {
                publishDraftStatusBadge.textContent = "Published";
                publishDraftStatusBadge.className = "cq-badge-draft text-success bg-success-subtle";
            } else {
                publishDraftStatusBadge.textContent = "Shared Draft";
                publishDraftStatusBadge.className = "cq-badge-draft";
            }
        }
    }

    // Explicit "Import from Editor" button (never overwrites automatically)
    if (importEditorCodeToDraftBtn) {
        importEditorCodeToDraftBtn.addEventListener("click", () => {
            const editorCode = collabCodeInput.value.trim();
            const editorLang = editorLangSelect.value;
            if (!editorCode) {
                showToast("Editor code is currently empty.", "warning");
                return;
            }
            publishDraft.solutionCode = editorCode;
            publishDraft.language = editorLang;
            if (publishSolutionCode) publishSolutionCode.value = editorCode;
            if (publishLangSelect) publishLangSelect.value = editorLang;
            broadcastPublishDraft();
            showToast("Editor code imported into publishing draft!", "success");
        });
    }

    // Attach sync event listeners to all draft inputs
    const draftFieldMap = [
        [publishTitleInput, "title"],
        [publishDescInput, "description"],
        [publishStatementInput, "problemStatement"],
        [publishInputFormat, "inputFormat"],
        [publishOutputFormat, "outputFormat"],
        [publishConstraints, "constraints"],
        [publishSampleInput, "sampleInput"],
        [publishSampleOutput, "sampleOutput"],
        [publishExplanation, "explanation"],
        [publishSolutionCode, "solutionCode"],
        [publishLangSelect, "language"]
    ];

    draftFieldMap.forEach(([el, key]) => {
        if (el) {
            el.addEventListener("input", () => {
                publishDraft[key] = el.value;
                broadcastPublishDraft();
            });
        }
    });

    function broadcastPublishDraft() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "publish-draft-update",
                draft: publishDraft
            }));
        }
    }

    if (publishChallengeSubmitBtn) {
        publishChallengeSubmitBtn.addEventListener("click", publishChallenge);
    }

    async function publishChallenge() {
        if (!publishDraft.title.trim()) {
            showToast("Challenge Title is required before publishing.", "warning");
            if (publishTitleInput) publishTitleInput.focus();
            return;
        }
        if (!publishDraft.problemStatement.trim()) {
            showToast("Problem Statement is required before publishing.", "warning");
            if (publishStatementInput) publishStatementInput.focus();
            return;
        }
        if (!publishDraft.solutionCode.trim()) {
            showToast("Solution Code is required. Click 'Import from Editor' to populate.", "warning");
            if (publishSolutionCode) publishSolutionCode.focus();
            return;
        }

        publishChallengeSubmitBtn.disabled = true;
        publishChallengeSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Publishing...`;

        try {
            const res = await fetch("/api/collab/publish-challenge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomId,
                    ...publishDraft,
                    testCases
                })
            });
            const data = await res.json();
            if (data.success) {
                publishDraft.isPublished = true;
                if (publishDraftStatusBadge) {
                    publishDraftStatusBadge.textContent = "Published";
                    publishDraftStatusBadge.className = "cq-badge-draft text-success bg-success-subtle";
                }
                showToast("Challenge published to CodeQuest successfully!", "success");
            } else {
                showToast(data.error || "Failed to publish challenge", "danger");
            }
        } catch (e) {
            showToast("Network error publishing challenge: " + e.message, "danger");
        } finally {
            publishChallengeSubmitBtn.disabled = false;
            publishChallengeSubmitBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-1"></i>Publish Challenge`;
        }
    }

    // -------------------------------------------------------------
    // 12. TIME-TRAVEL CODE HISTORY
    // -------------------------------------------------------------
    function renderCheckpoints() {
        if (!checkpointTimelineList) return;
        checkpointTimelineList.innerHTML = "";

        checkpoints.forEach((cp) => {
            const item = document.createElement("div");
            item.className = `cq-checkpoint-card ${selectedCheckpoint && selectedCheckpoint.id === cp.id ? 'active' : ''}`;
            const timeStr = new Date(cp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            item.innerHTML = `
                <div class="d-flex justify-content-between">
                    <span class="cq-checkpoint-author">@${escapeHtml(cp.author || "Dev")}</span>
                    <span class="cq-checkpoint-time">${timeStr}</span>
                </div>
                <div class="cq-checkpoint-note">${escapeHtml(cp.note || "Checkpoint")}</div>
            `;
            item.addEventListener("click", () => {
                selectCheckpoint(cp);
            });
            checkpointTimelineList.appendChild(item);
        });
    }

    function selectCheckpoint(cp) {
        selectedCheckpoint = cp;
        renderCheckpoints();
        if (selectedCheckpointTitle) selectedCheckpointTitle.textContent = cp.note || "Selected Checkpoint";
        if (selectedCheckpointAuthor) selectedCheckpointAuthor.textContent = `Saved by @${cp.author} at ${new Date(cp.timestamp).toLocaleTimeString()}`;
        if (checkpointCodeDiffViewer) checkpointCodeDiffViewer.textContent = cp.code;
        if (restoreSelectedCheckpointBtn) restoreSelectedCheckpointBtn.disabled = false;
    }

    if (createManualCheckpointBtn) {
        createManualCheckpointBtn.addEventListener("click", createCheckpointPrompt);
    }
    if (createCheckpointQuickBtn) {
        createCheckpointQuickBtn.addEventListener("click", createCheckpointPrompt);
    }

    function createCheckpointPrompt() {
        const note = prompt("Enter a description note for this checkpoint:", "Pair debug milestone");
        if (note === null) return;
        const code = collabCodeInput.value;
        const lang = editorLangSelect.value;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "checkpoint-create",
                code,
                lang,
                note: note.trim() || "Manual checkpoint"
            }));
        }
    }

    if (restoreSelectedCheckpointBtn) {
        restoreSelectedCheckpointBtn.addEventListener("click", () => {
            if (!selectedCheckpoint) return;
            const modalElem = document.getElementById("restoreConfirmModal");
            if (modalElem && window.bootstrap) {
                const modal = new bootstrap.Modal(modalElem);
                modal.show();
            }
        });
    }

    if (confirmRestoreActionBtn) {
        confirmRestoreActionBtn.addEventListener("click", () => {
            if (!selectedCheckpoint) return;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "checkpoint-restore",
                    checkpointId: selectedCheckpoint.id
                }));
            }
            const modalElem = document.getElementById("restoreConfirmModal");
            if (modalElem && window.bootstrap) {
                const modal = bootstrap.Modal.getInstance(modalElem);
                if (modal) modal.hide();
            }
            switchWorkspaceTab("editor");
        });
    }

    // -------------------------------------------------------------
    // 13. AI DEBUGGING COPILOT
    // -------------------------------------------------------------
    if (aiActionExplainError) {
        aiActionExplainError.addEventListener("click", () => triggerAiCopilot("explain-error"));
    }
    if (aiActionReviewBugs) {
        aiActionReviewBugs.addEventListener("click", () => triggerAiCopilot("review-bugs"));
    }
    if (aiActionSuggestFix) {
        aiActionSuggestFix.addEventListener("click", () => triggerAiCopilot("suggest-fix"));
    }
    if (aiActionGenerateTests) {
        aiActionGenerateTests.addEventListener("click", () => triggerAiCopilot("generate-tests"));
    }
    if (importAiTestsBtn) {
        importAiTestsBtn.addEventListener("click", () => {
            switchWorkspaceTab("copilot");
            triggerAiCopilot("generate-tests");
        });
    }
    if (aiSendCustomPromptBtn) {
        aiSendCustomPromptBtn.addEventListener("click", () => {
            const promptVal = aiCustomPromptInput ? aiCustomPromptInput.value.trim() : "";
            if (!promptVal) {
                showToast("Enter a prompt for AI Copilot.", "info");
                return;
            }
            triggerAiCopilot("custom", promptVal);
        });
    }

    async function triggerAiCopilot(action, customPrompt = "") {
        const code = collabCodeInput.value;
        const lang = editorLangSelect.value;
        const errorOutput = lastConsoleError;

        if (copilotResultCard) copilotResultCard.style.display = "block";
        if (copilotResponseBody) {
            copilotResponseBody.innerHTML = `<div class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin fa-2x mb-2 text-primary"></i><div>AI Copilot is analyzing code...</div></div>`;
        }
        if (copilotResultTools) copilotResultTools.style.display = "none";

        try {
            const res = await fetch("/api/ai/copilot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    code,
                    lang,
                    errorOutput,
                    customPrompt
                })
            });
            const data = await res.json();

            // Update Provider Badge
            if (aiProviderBadge) {
                aiProviderBadge.textContent = data.configured ? (data.provider || "Active LLM") : "Static Heuristic Engine (API Key Not Set)";
                aiProviderBadge.className = data.configured ? "cq-copilot-badge text-success bg-success-subtle" : "cq-copilot-badge text-warning bg-warning-subtle";
            }

            if (copilotResponseTitle) {
                copilotResponseTitle.textContent = action === "explain-error" ? "Error Diagnostic" :
                    action === "suggest-fix" ? "Suggested Fix & Code Diff" :
                    action === "generate-tests" ? "Generated Boundary Test Cases" : "Code Review Analysis";
            }

            if (data.configured && data.response) {
                copilotResponseBody.innerHTML = `<div class="cq-markdown-body" style="white-space: pre-wrap;">${escapeHtml(data.response)}</div>`;
                if (data.parsed && data.parsed.extractedCode) {
                    pendingAiFixCode = data.parsed.extractedCode;
                    if (copilotResultTools) copilotResultTools.style.display = "flex";
                }
                if (data.parsed && Array.isArray(data.parsed.testCases) && data.parsed.testCases.length > 0) {
                    if (copilotImportTestsBtn) {
                        copilotImportTestsBtn.style.display = "inline-flex";
                        copilotImportTestsBtn.onclick = () => {
                            data.parsed.testCases.forEach((tc, i) => {
                                testCases.push({
                                    id: `tc-ai-${Date.now()}-${i}`,
                                    name: `AI Case #${testCases.length + 1}`,
                                    input: tc.input || "",
                                    expectedOutput: tc.expectedOutput || "",
                                    passed: null,
                                    actual: "",
                                    error: "",
                                    duration: ""
                                });
                            });
                            broadcastTestCases();
                            renderTestCases();
                            showToast("AI Test Cases added to Smart Test Lab!", "success");
                            switchWorkspaceTab("testlab");
                        };
                    }
                }
            } else if (!data.configured && data.staticAnalysis) {
                // Static Analysis result
                const sa = data.staticAnalysis;
                let html = `<div class="alert alert-warning py-2 small mb-3"><i class="fa-solid fa-circle-info me-1"></i><b>Notice:</b> ${escapeHtml(data.message)}</div>`;

                if (Array.isArray(sa.findings)) {
                    html += `<h6 class="fw-bold mb-2">Static Analysis Findings:</h6><div class="d-flex flex-direction-column gap-2 mb-3">`;
                    sa.findings.forEach(f => {
                        html += `
                            <div class="p-2 rounded bg-light border">
                                <div class="fw-semibold text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>${escapeHtml(f.summary)}</div>
                                <div class="small text-muted mt-1">${escapeHtml(f.explanation)}</div>
                                <div class="small text-primary mt-1"><b>Suggested fix:</b> ${escapeHtml(f.fixSuggestion)}</div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                }

                if (action === "generate-tests" && Array.isArray(sa.generatedTests)) {
                    html += `<h6 class="fw-bold mb-2">Heuristic Boundary Test Cases:</h6>`;
                    if (copilotImportTestsBtn) {
                        copilotImportTestsBtn.style.display = "inline-flex";
                        copilotImportTestsBtn.onclick = () => {
                            sa.generatedTests.forEach((tc, i) => {
                                testCases.push({
                                    id: `tc-heur-${Date.now()}-${i}`,
                                    name: tc.name,
                                    input: tc.input,
                                    expectedOutput: tc.expectedOutput,
                                    passed: null,
                                    actual: "",
                                    error: "",
                                    duration: ""
                                });
                            });
                            broadcastTestCases();
                            renderTestCases();
                            showToast("Generated test cases added to Lab!", "success");
                            switchWorkspaceTab("testlab");
                        };
                    }
                    if (copilotResultTools) copilotResultTools.style.display = "flex";
                }

                copilotResponseBody.innerHTML = html;
            }
        } catch (e) {
            copilotResponseBody.innerHTML = `<div class="text-danger">Copilot analysis failed: ${escapeHtml(e.message)}</div>`;
        }
    }

    // Modal to review diff and safely apply AI Fix
    if (copilotApplyFixBtn) {
        copilotApplyFixBtn.addEventListener("click", () => {
            if (!pendingAiFixCode) return;
            if (aiDiffReviewCode) aiDiffReviewCode.textContent = pendingAiFixCode;
            const modalElem = document.getElementById("aiDiffReviewModal");
            if (modalElem && window.bootstrap) {
                const modal = new bootstrap.Modal(modalElem);
                modal.show();
            }
        });
    }

    if (confirmApplyAiFixBtn) {
        confirmApplyAiFixBtn.addEventListener("click", () => {
            if (!pendingAiFixCode) return;
            // Create auto safety checkpoint first
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "checkpoint-create",
                    code: collabCodeInput.value,
                    lang: editorLangSelect.value,
                    note: "Auto-saved before applying AI Copilot fix"
                }));
            }
            setEditorContent(pendingAiFixCode, editorLangSelect.value);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "code-change",
                    code: pendingAiFixCode,
                    lang: editorLangSelect.value
                }));
            }
            const modalElem = document.getElementById("aiDiffReviewModal");
            if (modalElem && window.bootstrap) {
                const modal = bootstrap.Modal.getInstance(modalElem);
                if (modal) modal.hide();
            }
            showToast("AI Fix applied to code editor!", "success");
            switchWorkspaceTab("editor");
        });
    }

    // -------------------------------------------------------------
    // 14. SESSION MEMORY & OBJECTIVES
    // -------------------------------------------------------------
    if (sessionNotesTextarea) {
        sessionNotesTextarea.addEventListener("input", () => {
            sessionNotes = sessionNotesTextarea.value;
            broadcastSessionNotes();
        });
    }

    function renderObjectives() {
        if (!sessionObjectivesList) return;
        sessionObjectivesList.innerHTML = "";
        sessionObjectives.forEach((obj, idx) => {
            const item = document.createElement("div");
            item.className = "cq-check-item";
            item.innerHTML = `
                <input type="checkbox" id="chk_obj_${idx}" class="form-check-input" ${obj.done ? 'checked' : ''}>
                <label for="chk_obj_${idx}" class="${obj.done ? 'text-decoration-line-through text-muted' : ''}">${escapeHtml(obj.text)}</label>
            `;
            item.querySelector("input").addEventListener("change", (e) => {
                sessionObjectives[idx].done = e.target.checked;
                broadcastSessionNotes();
                renderObjectives();
            });
            sessionObjectivesList.appendChild(item);
        });
    }

    if (addObjectiveBtn && newObjectiveInput) {
        addObjectiveBtn.addEventListener("click", () => {
            const val = newObjectiveInput.value.trim();
            if (!val) return;
            sessionObjectives.push({ id: `obj-${Date.now()}`, text: val, done: false });
            newObjectiveInput.value = "";
            broadcastSessionNotes();
            renderObjectives();
        });
    }

    function broadcastSessionNotes() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "session-notes-update",
                notes: sessionNotes,
                objectives: sessionObjectives
            }));
        }
    }

    // -------------------------------------------------------------
    // 15. WEBRTC AUDIO & VIDEO HUDDLE STREAMING
    // -------------------------------------------------------------
    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { width: { ideal: 640 }, height: { ideal: 480 } }
            });
            if (localVideo) {
                localVideo.srcObject = localStream;
            }
            if (localVideoPlaceholder) localVideoPlaceholder.style.display = "none";
        } catch (err) {
            console.warn("Camera/mic access warning:", err.message);
            // Fallback: try audio only
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (localVideoPlaceholder) localVideoPlaceholder.style.display = "flex";
            } catch (aErr) {
                console.warn("Microphone access warning:", aErr.message);
            }
        }
    }

    function createWebRtcPeer(isInitiator) {
        if (peerConnection) {
            try { peerConnection.close(); } catch(e){}
        }

        peerConnection = new RTCPeerConnection(rtcConfig);

        // Add local tracks to peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // On receiving remote track
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                remoteMediaStream = event.streams[0];
                if (remoteVideo) remoteVideo.srcObject = remoteMediaStream;
                if (remoteAudio) remoteAudio.srcObject = remoteMediaStream;
                if (remoteVideoPlaceholder) remoteVideoPlaceholder.style.display = "none";
            }
        };

        // ICE candidate generation
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "webrtc-signal",
                    targetPeerId: remotePeerId,
                    signal: { candidate: event.candidate }
                }));
            }
        };

        if (isInitiator) {
            peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: "webrtc-signal",
                            targetPeerId: remotePeerId,
                            signal: { desc: peerConnection.localDescription }
                        }));
                    }
                })
                .catch(err => console.error("WebRTC Offer Error:", err));
        }
    }

    async function handleWebRtcSignal(msg) {
        const signal = msg.signal;
        if (!peerConnection) {
            createWebRtcPeer(false);
        }

        if (signal.desc) {
            const desc = new RTCSessionDescription(signal.desc);
            await peerConnection.setRemoteDescription(desc);
            // Process queued ice candidates
            while (iceCandidatesQueue.length > 0) {
                const c = iceCandidatesQueue.shift();
                await peerConnection.addIceCandidate(c);
            }

            if (desc.type === "offer") {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "webrtc-signal",
                        targetPeerId: msg.fromPeerId,
                        signal: { desc: peerConnection.localDescription }
                    }));
                }
            }
        } else if (signal.candidate) {
            const candidate = new RTCIceCandidate(signal.candidate);
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(candidate);
            } else {
                iceCandidatesQueue.push(candidate);
            }
        }
    }

    function resetRemoteMedia() {
        if (remoteVideo) remoteVideo.srcObject = null;
        if (remoteAudio) remoteAudio.srcObject = null;
        if (remoteVideoPlaceholder) remoteVideoPlaceholder.style.display = "flex";
        if (remoteUserName) remoteUserName.textContent = "Partner";
        if (remotePlaceholderText) remotePlaceholderText.textContent = "Waiting for partner to join...";
    }

    function updateRemoteUserUI(user) {
        const name = user ? user.username : "Partner";
        if (remoteUserName) remoteUserName.textContent = name;
        if (remoteUserTagLabel) remoteUserTagLabel.textContent = name;
        if (remotePlaceholderText) remotePlaceholderText.textContent = "In Huddle";
        const initials = document.getElementById("remoteAvatarInitials");
        if (initials) initials.textContent = name.charAt(0).toUpperCase();
    }

    // Media Controls: Mic, Camera, Screen Share
    if (toggleMicBtn) {
        toggleMicBtn.addEventListener("click", () => {
            isMicMuted = !isMicMuted;
            if (localStream) {
                localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
            }
            toggleMicBtn.classList.toggle("active-danger", isMicMuted);
            toggleMicBtn.innerHTML = isMicMuted ? `<i class="fa-solid fa-microphone-slash"></i>` : `<i class="fa-solid fa-microphone"></i>`;
            if (localAudioStatusIcon) {
                localAudioStatusIcon.innerHTML = isMicMuted ? `<i class="fa-solid fa-microphone-slash text-danger"></i>` : `<i class="fa-solid fa-microphone text-success"></i>`;
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "peer-status", isMuted: isMicMuted }));
            }
        });
    }

    if (toggleCamBtn) {
        toggleCamBtn.addEventListener("click", () => {
            isVideoOff = !isVideoOff;
            if (localStream) {
                localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
            }
            toggleCamBtn.classList.toggle("active-danger", isVideoOff);
            toggleCamBtn.innerHTML = isVideoOff ? `<i class="fa-solid fa-video-slash"></i>` : `<i class="fa-solid fa-video"></i>`;
            if (localVideoPlaceholder) localVideoPlaceholder.style.display = isVideoOff ? "flex" : "none";
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "peer-status", isVideoOff }));
            }
        });
    }

    if (toggleScreenBtn) {
        toggleScreenBtn.addEventListener("click", async () => {
            if (!isScreenSharing) {
                try {
                    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                    const screenTrack = screenStream.getVideoTracks()[0];
                    if (peerConnection) {
                        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
                        if (sender) sender.replaceTrack(screenTrack);
                    }
                    if (localVideo) localVideo.srcObject = screenStream;
                    isScreenSharing = true;
                    toggleScreenBtn.classList.add("active-danger");
                    if (screenShareActivePill) screenShareActivePill.style.display = "flex";

                    screenTrack.onended = () => stopScreenShare();
                } catch (e) {
                    console.warn("Screen share cancelled:", e);
                }
            } else {
                stopScreenShare();
            }
        });
    }

    function stopScreenShare() {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
        if (localStream && peerConnection) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
        }
        if (localVideo && localStream) localVideo.srcObject = localStream;
        isScreenSharing = false;
        toggleScreenBtn.classList.remove("active-danger");
        if (screenShareActivePill) screenShareActivePill.style.display = "none";
    }

    // Emoji Reactions
    if (toggleReactionBtn && huddleReactionPopover) {
        toggleReactionBtn.addEventListener("click", () => {
            huddleReactionPopover.style.display = huddleReactionPopover.style.display === "none" ? "flex" : "none";
        });
        huddleReactionPopover.querySelectorAll(".cq-emoji-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const emoji = btn.dataset.emoji;
                triggerFloatingEmoji(emoji);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "huddle-reaction", emoji }));
                }
                huddleReactionPopover.style.display = "none";
            });
        });
    }

    function triggerFloatingEmoji(emoji) {
        if (!huddleFloatingReactions) return;
        const elem = document.createElement("div");
        elem.className = "cq-floating-emoji";
        elem.textContent = emoji;
        elem.style.left = `${30 + Math.random() * 40}%`;
        huddleFloatingReactions.appendChild(elem);
        setTimeout(() => elem.remove(), 2400);
    }

    // Fullscreen stage toggle
    if (stageFullscreenBtn) {
        stageFullscreenBtn.addEventListener("click", () => {
            const stage = document.getElementById("huddleStage");
            if (!document.fullscreenElement) {
                if (stage.requestFullscreen) stage.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });
    }

    // Toggle Huddle Dock (Collapse / Expand)
    if (toggleHuddleDockBtn && huddleDockPane) {
        toggleHuddleDockBtn.addEventListener("click", () => {
            huddleDockPane.classList.toggle("collapsed");
            toggleHuddleDockBtn.classList.toggle("active", !huddleDockPane.classList.contains("collapsed"));
        });
    }

    // Toggle Chat Drawer
    if (toggleChatDrawerBtn && huddleDockPane) {
        toggleChatDrawerBtn.addEventListener("click", () => {
            if (huddleDockPane.classList.contains("collapsed")) {
                huddleDockPane.classList.remove("collapsed");
            }
            chatUnreadCount = 0;
            if (chatUnreadBadge) chatUnreadBadge.style.display = "none";
            const chatInput = document.getElementById("chatMessageInput");
            if (chatInput) chatInput.focus();
        });
    }

    // -------------------------------------------------------------
    // 16. PAIR CHAT
    // -------------------------------------------------------------
    if (chatInputForm) {
        chatInputForm.addEventListener("submit", sendChatMessage);
    }

    if (chatMessageInput) {
        // Enter to send, Shift+Enter for new line
        chatMessageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage(e);
            }
        });
    }

    function sendChatMessage(e) {
        if (e) e.preventDefault();
        const text = chatMessageInput.value.trim();
        if (!text) return;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "chat-message",
                message: text
            }));
        }
        chatMessageInput.value = "";
    }

    // Quick Insert Editor Code into Chat
    if (insertEditorCodeBtn) {
        insertEditorCodeBtn.addEventListener("click", () => {
            const code = collabCodeInput.value.trim();
            const lang = editorLangSelect.value;
            if (!code) {
                showToast("Editor is empty. No code to share in chat.", "info");
                return;
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "chat-message",
                    message: "Shared current solution code:",
                    codeSnippet: code,
                    lang
                }));
            }
            showToast("Editor code shared into chat!", "info");
        });
    }

    function renderChatMessage(msg) {
        if (!chatMessagesContainer) return;
        const isOutgoing = msg.fromPeerId === myPeerId || (msg.sender && currentUser.username && msg.sender.toLowerCase() === currentUser.username.toLowerCase());
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

        const item = document.createElement("div");
        item.className = `cq-chat-item ${isOutgoing ? 'outgoing' : ''}`;

        let snippetHtml = "";
        if (msg.codeSnippet) {
            snippetHtml = `
                <div class="cq-chat-snippet">
                    <div class="cq-snippet-header">
                        <span><i class="fa-solid fa-code me-1"></i>${escapeHtml(msg.lang || "code")}</span>
                        <button class="cq-snippet-copy" onclick="navigator.clipboard.writeText(this.closest('.cq-chat-snippet').querySelector('.cq-snippet-code').innerText).then(()=>alert('Code copied!'))">Copy</button>
                    </div>
                    <pre class="cq-snippet-code">${escapeHtml(msg.codeSnippet)}</pre>
                </div>
            `;
        }

        item.innerHTML = `
            <div class="cq-chat-meta">
                <span class="cq-chat-sender">${escapeHtml(msg.sender || "Partner")}</span>
                <span class="cq-chat-time">${timeStr}</span>
            </div>
            <div class="cq-chat-bubble">
                ${escapeHtml(msg.message)}
                ${snippetHtml}
            </div>
        `;
        chatMessagesContainer.appendChild(item);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // -------------------------------------------------------------
    // 17. UTILITY & HELPER FUNCTIONS
    // -------------------------------------------------------------
    function updateConnectionStatus(status, text) {
        if (connStatusDot) {
            connStatusDot.className = `cq-status-dot ${status === 'connected' ? 'connected' : ''}`;
        }
        if (connStatusText) {
            connStatusText.textContent = text;
        }
    }

    function updatePeerCountDisplay() {
        if (!activePeersCounter) return;
        const count = remotePeerId ? 2 : 1;
        activePeersCounter.textContent = `${count} in call`;
    }

    function startCallTimer() {
        if (callTimerInterval) clearInterval(callTimerInterval);
        callElapsedSeconds = 0;
        callTimerInterval = setInterval(() => {
            callElapsedSeconds++;
            const mins = String(Math.floor(callElapsedSeconds / 60)).padStart(2, "0");
            const secs = String(callElapsedSeconds % 60).padStart(2, "0");
            if (huddleTimerBadge) huddleTimerBadge.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function showToast(message, type = "info") {
        if (window.showFeatureToast) {
            window.showFeatureToast(message, type);
            return;
        }
        const toast = document.createElement("div");
        toast.className = `alert alert-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'primary'} position-fixed bottom-0 start-50 translate-middle-x mb-4 shadow`;
        toast.style.zIndex = 9999;
        toast.innerHTML = `<i class="fa-solid fa-circle-info me-2"></i>${escapeHtml(message)}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // Initialize application on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initUser);
    } else {
        initUser();
    }

})();
