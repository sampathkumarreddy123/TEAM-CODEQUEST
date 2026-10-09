/**
 * CodeQuest Live Huddle Client Engine
 * - Clean Focused Interface:
 *   * Video Cam (Face-to-Face WebRTC, Screen Sharing, Controls)
 *   * Code Editor (Synchronized, Multi-Language, Collaborator Cursors)
 *   * Custom Input Box (stdin) & Output Box (stdout)
 *   * Real-Time Pair Chat Box (Syntax Highlighted Code Snippets)
 *   * Collaborative Solution Publishing
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

    // Editor & Sync State
    let isRemoteTyping = false;
    let lastKnownCode = "";

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
    const editorLangSelect = document.getElementById("editorLangSelect");
    const runCollabCodeBtn = document.getElementById("runCollabCodeBtn");
    const publishSolutionBtn = document.getElementById("publishSolutionBtn");

    // Editor Pane
    const collabCodeInput = document.getElementById("collabCodeInput");
    const editorLineNumbers = document.getElementById("editorLineNumbers");
    const syncIndicator = document.getElementById("syncIndicator");
    const fileTabName = document.getElementById("fileTabName");
    const fileTabIcon = document.getElementById("fileTabIcon");
    const partnerCursorFlag = document.getElementById("partnerCursorFlag");
    const collaboratorCursorElem = document.getElementById("collaboratorCursorElem");
    const collaboratorCursorBadge = document.getElementById("collaboratorCursorBadge");

    // Custom Input (stdin) & Output (stdout)
    const customStdinInput = document.getElementById("customStdinInput");
    const clearConsoleBtn = document.getElementById("clearConsoleBtn");
    const consoleLogsList = document.getElementById("consoleLogsList");
    const collabExecTime = document.getElementById("collabExecTime");

    // Video Cam Stage & Controls
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

    // Publish Modal Elements
    const publishSolutionModal = document.getElementById("publishSolutionModal");
    const publishTitleInput = document.getElementById("publishTitleInput");
    const publishDescInput = document.getElementById("publishDescInput");
    const publishSolutionCode = document.getElementById("publishSolutionCode");
    const refreshPublishCodeBtn = document.getElementById("refreshPublishCodeBtn");
    const confirmPublishBtn = document.getElementById("confirmPublishBtn");

    // -------------------------------------------------------------
    // 3. INITIALIZATION & USER AUTH
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
        // Initialize line numbers
        updateLineNumbers();
    }

    // -------------------------------------------------------------
    // 4. COPY INVITE LINK
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
    // 5. WEBSOCKET REAL-TIME NETWORKING
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

            case "run-code":
                showToast(`Partner triggered code execution...`, "info");
                break;

            case "run-result":
                displayConsoleOutput(msg.output, msg.error, msg.duration);
                break;

            case "chat-message":
                renderChatMessage(msg);
                break;

            case "huddle-reaction":
                triggerFloatingEmoji(msg.emoji);
                break;

            case "publish-modal-opened":
                if (publishSolutionModal && window.bootstrap) {
                    const modal = bootstrap.Modal.getOrCreateInstance(publishSolutionModal);
                    modal.show();
                    if (publishSolutionCode) publishSolutionCode.value = collabCodeInput.value;
                }
                break;

            case "challenge-published":
                showToast(`🏆 Solution "${escapeHtml(msg.title)}" published! <a href="/answers.html?id=${msg.questionId || ''}" target="_blank" class="text-white text-decoration-underline ms-1">View Post ↗</a>`, "success");
                if (publishSolutionModal && window.bootstrap) {
                    const modal = bootstrap.Modal.getInstance(publishSolutionModal);
                    if (modal) modal.hide();
                }
                break;

            case "peer-status":
                if (msg.peerId === remotePeerId || !remotePeerId) {
                    if (msg.isMuted !== undefined) {
                        if (remoteAudioStatusIcon) {
                            remoteAudioStatusIcon.innerHTML = msg.isMuted ?
                                `<i class="fa-solid fa-microphone-slash text-danger"></i>` :
                                `<i class="fa-solid fa-microphone text-success"></i>`;
                        }
                        if (msg.isMuted && remotePeerTile) {
                            remotePeerTile.classList.remove("speaking");
                            const wave = document.getElementById("remoteAudioWave");
                            if (wave) wave.style.display = "none";
                            const dot = document.getElementById("remoteSpeakerDot");
                            if (dot) dot.classList.remove("active");
                        }
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
    // 6. REST HYDRATION (RESTORE STATE ON LOAD)
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
                }
            }
        } catch (e) {
            console.warn("Hydrate state note:", e);
        }
    }

    // -------------------------------------------------------------
    // 7. REAL-TIME COLLABORATIVE EDITOR ENGINE
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
    // 8. RUN CODE (WITH CUSTOM INPUT BOX STDIN)
    // -------------------------------------------------------------
    runCollabCodeBtn.addEventListener("click", runCode);

    // Ctrl+Enter keyboard shortcut to execute code
    collabCodeInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            runCode();
        }
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
        const customInput = customStdinInput ? customStdinInput.value : "";

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
                body: JSON.stringify({
                    code,
                    lang,
                    input: customInput
                })
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
            consoleLogsList.innerHTML = `<div class="cq-console-empty"><i class="fa-solid fa-play text-muted me-2"></i>Console cleared. Click <b>Run Code</b> to execute.</div>`;
            if (collabExecTime) collabExecTime.style.display = "none";
        });
    }

    // -------------------------------------------------------------
    // 9. WEBRTC FACE-TO-FACE VIDEO CAM STAGE
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
            setupAudioActivityMonitor(localStream, localPeerTile, null, document.getElementById("localSpeakerDot"));
        } catch (err) {
            console.warn("Camera/mic access warning:", err.message);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (localVideoPlaceholder) localVideoPlaceholder.style.display = "flex";
                setupAudioActivityMonitor(localStream, localPeerTile, null, document.getElementById("localSpeakerDot"));
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
                setupAudioActivityMonitor(remoteMediaStream, remotePeerTile, document.getElementById("remoteAudioWave"), document.getElementById("remoteSpeakerDot"));
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

    // -------------------------------------------------------------
    // SLACK REAL-TIME AUDIO ACTIVITY & SPEAKING ANALYZER
    // -------------------------------------------------------------
    function setupAudioActivityMonitor(stream, tileElem, waveElem, dotElem) {
        if (!stream || !stream.getAudioTracks().length) return null;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            const ctx = new AudioCtx();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            let isSpeaking = false;

            const checkVolume = () => {
                if (ctx.state === "suspended") ctx.resume().catch(() => {});
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const avg = sum / bufferLength;

                const speakingNow = avg > 12;
                if (speakingNow !== isSpeaking) {
                    isSpeaking = speakingNow;
                    if (tileElem) tileElem.classList.toggle("speaking", isSpeaking);
                    if (waveElem) waveElem.style.display = isSpeaking ? "inline-flex" : "none";
                    if (dotElem) dotElem.classList.toggle("active", isSpeaking);
                }
                requestAnimationFrame(checkVolume);
            };
            requestAnimationFrame(checkVolume);
            return { ctx, analyser };
        } catch (e) {
            console.warn("Audio analyzer note:", e);
            return null;
        }
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
            if (isMicMuted && localPeerTile) {
                localPeerTile.classList.remove("speaking");
                const dot = document.getElementById("localSpeakerDot");
                if (dot) dot.classList.remove("active");
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

    // Fullscreen video stage toggle
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

    // -------------------------------------------------------------
    // 10. PAIR CHAT BOX
    // -------------------------------------------------------------
    if (chatInputForm) {
        chatInputForm.addEventListener("submit", sendChatMessage);
    }

    if (chatMessageInput) {
        // Enter sends message; Shift+Enter creates a new line
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

    // Insert editor code snippet into chat
    if (insertEditorCodeBtn) {
        insertEditorCodeBtn.addEventListener("click", () => {
            const code = collabCodeInput.value.trim();
            const lang = editorLangSelect.value;
            if (!code) {
                showToast("Editor is empty. No code to share.", "info");
                return;
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "chat-message",
                    message: "Shared current solution code snippet:",
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
        const senderName = msg.sender || (isOutgoing ? currentUser.username : "Partner");
        const initial = senderName.charAt(0).toUpperCase();

        const item = document.createElement("div");
        item.className = `cq-chat-item ${isOutgoing ? 'outgoing' : ''}`;

        let snippetHtml = "";
        if (msg.codeSnippet) {
            snippetHtml = `
                <div class="cq-chat-snippet">
                    <div class="cq-snippet-header">
                        <span><i class="fa-solid fa-code me-1"></i>${escapeHtml(msg.lang || "code")}</span>
                        <button class="cq-snippet-copy" onclick="navigator.clipboard.writeText(this.closest('.cq-chat-snippet').querySelector('.cq-snippet-code').innerText).then(()=>alert('Code snippet copied to clipboard!'))">Copy</button>
                    </div>
                    <pre class="cq-snippet-code">${escapeHtml(msg.codeSnippet)}</pre>
                </div>
            `;
        }

        item.innerHTML = `
            <div class="cq-chat-avatar">${escapeHtml(initial)}</div>
            <div class="cq-chat-content-wrap">
                <div class="cq-chat-meta">
                    <span class="cq-chat-sender">${escapeHtml(senderName)}</span>
                    <span class="cq-chat-time">${timeStr}</span>
                </div>
                <div class="cq-chat-bubble">
                    ${escapeHtml(msg.message)}
                    ${snippetHtml}
                </div>
            </div>
        `;
        chatMessagesContainer.appendChild(item);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // -------------------------------------------------------------
    // 11. PUBLISH SOLUTION MODAL & FLOW
    // -------------------------------------------------------------
    if (publishSolutionBtn) {
        publishSolutionBtn.addEventListener("click", () => {
            if (publishSolutionCode) publishSolutionCode.value = collabCodeInput.value.trim();
            if (publishSolutionModal && window.bootstrap) {
                const modal = bootstrap.Modal.getOrCreateInstance(publishSolutionModal);
                modal.show();
            }
            // Broadcast opening modal to partner
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "publish-modal-opened" }));
            }
        });
    }

    if (refreshPublishCodeBtn) {
        refreshPublishCodeBtn.addEventListener("click", () => {
            if (publishSolutionCode) publishSolutionCode.value = collabCodeInput.value.trim();
            showToast("Solution code refreshed from editor!", "info");
        });
    }

    if (confirmPublishBtn) {
        confirmPublishBtn.addEventListener("click", async () => {
            const title = publishTitleInput ? publishTitleInput.value.trim() : "";
            const desc = publishDescInput ? publishDescInput.value.trim() : "";
            const solutionCode = publishSolutionCode ? publishSolutionCode.value.trim() : "";
            const lang = editorLangSelect.value;

            if (!title) {
                showToast("Please enter a title for the solution.", "warning");
                if (publishTitleInput) publishTitleInput.focus();
                return;
            }
            if (!desc) {
                showToast("Please enter a brief description or problem statement.", "warning");
                if (publishDescInput) publishDescInput.focus();
                return;
            }
            if (!solutionCode) {
                showToast("Solution code is empty. Write or paste code.", "warning");
                return;
            }

            confirmPublishBtn.disabled = true;
            confirmPublishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Publishing...`;

            try {
                const res = await fetch("/api/collab/publish-challenge", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        roomId,
                        title,
                        description: desc,
                        problemStatement: desc,
                        solutionCode,
                        language: lang,
                        sampleInput: customStdinInput ? customStdinInput.value : ""
                    })
                });
                const data = await res.json();
                if (data.success) {
                    const postUrl = data.questionUrl || `/answers.html?id=${data.questionId || ''}`;
                    showToast(`Solution published to CodeQuest successfully! <a href="${postUrl}" target="_blank" class="text-white text-decoration-underline ms-1">View Post ↗</a>`, "success");
                    if (publishSolutionModal && window.bootstrap) {
                        const modal = bootstrap.Modal.getInstance(publishSolutionModal);
                        if (modal) modal.hide();
                    }
                } else {
                    showToast(data.error || "Failed to publish solution", "danger");
                }
            } catch (e) {
                showToast("Network error publishing: " + e.message, "danger");
            } finally {
                confirmPublishBtn.disabled = false;
                confirmPublishBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-1"></i>Publish to CodeQuest`;
            }
        });
    }

    // -------------------------------------------------------------
    // 12. UTILITY & HELPER FUNCTIONS
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
        activePeersCounter.textContent = `${count} in huddle`;
    }

    // Keyboard Shortcuts: 'M' for Mute, 'V' for Video, 'S' for Screen Share
    window.addEventListener("keydown", (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (activeTag === "textarea" || activeTag === "input" || activeTag === "select") return;

        if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            if (toggleMicBtn) toggleMicBtn.click();
        } else if (e.key === "v" || e.key === "V") {
            e.preventDefault();
            if (toggleCamBtn) toggleCamBtn.click();
        } else if (e.key === "s" || e.key === "S") {
            e.preventDefault();
            if (toggleScreenBtn) toggleScreenBtn.click();
        }
    });

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
