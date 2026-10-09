/**
 * CodeQuest Live 1-on-1 Collab Debug Room (Slack Huddle Architecture)
 * - P2P Face-to-Face WebRTC Video & Audio Stream (Dedicated Audio Track + Real Camera)
 * - Active Speaker Detection (Web Audio Analyser)
 * - Real-Time Synchronized Code Editor & Sandbox Console
 * - Slack-Style Floating Controls Pill & Clean Participant Tiles
 * - Multi-Mode Publish & Export System
 */

(function () {
    "use strict";

    // -------------------------------------------------------------
    // 1. STATE & DOM REFERENCES
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

    // WebRTC State
    let peerConnection = null;
    let localStream = null;
    let remoteMediaStream = null;
    let iceCandidatesQueue = [];
    let screenStream = null;
    let isMicMuted = false;
    let isVideoOff = false;
    let isScreenSharing = false;

    // Web Audio Active Speaker Detection
    let audioCtx = null;

    const rtcConfig = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
            { urls: "stun:global.stun.twilio.com:3478" }
        ],
        iceCandidatePoolSize: 6
    };

    // Header & Context Elements
    const displayRoomIdEl = document.getElementById("displayRoomId");
    const copyInviteLinkBtn = document.getElementById("copyInviteLinkBtn");
    const copiedTooltip = document.getElementById("copiedTooltip");
    const connStatusDot = document.getElementById("connStatusDot");
    const connStatusText = document.getElementById("connStatusText");
    const activePeersCounter = document.getElementById("activePeersCounter");

    // Mobile View Tab Elements
    const mTabEditor = document.getElementById("mTabEditor");
    const mTabMedia = document.getElementById("mTabMedia");
    const mobileUnreadDot = document.getElementById("mobileUnreadDot");
    const paneCollabEditor = document.getElementById("paneCollabEditor");
    const paneCollabMedia = document.getElementById("paneCollabMedia");

    // Editor & Console
    const editorLangSelect = document.getElementById("editorLangSelect");
    const fileTabName = document.getElementById("fileTabName");
    const fileTabIcon = document.getElementById("fileTabIcon");
    const collabCodeInput = document.getElementById("collabCodeInput");
    const editorLineNumbers = document.getElementById("editorLineNumbers");
    const syncIndicator = document.getElementById("syncIndicator");

    const runCollabCodeBtn = document.getElementById("runCollabCodeBtn");
    const collabExecTime = document.getElementById("collabExecTime");
    const clearConsoleBtn = document.getElementById("clearConsoleBtn");
    const consoleLogsList = document.getElementById("consoleLogsList");

    // Video & Audio Elements
    const remoteAudio = document.getElementById("remoteAudio");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const remotePeerTile = document.getElementById("remotePeerTile");
    const localPeerTile = document.getElementById("localPeerTile");
    const localVideoPlaceholder = document.getElementById("localVideoPlaceholder");
    const remoteVideoPlaceholder = document.getElementById("remoteVideoPlaceholder");
    const remotePlaceholderText = document.getElementById("remotePlaceholderText");
    const remoteUserName = document.getElementById("remoteUserName");
    const remoteUserTagLabel = document.getElementById("remoteUserTagLabel");
    const localAvatarInitials = document.getElementById("localAvatarInitials");
    const remoteAvatarInitials = document.getElementById("remoteAvatarInitials");
    const localAudioStatusIcon = document.getElementById("localAudioStatusIcon");
    const remoteAudioStatusIcon = document.getElementById("remoteAudioStatusIcon");

    // Slack Floating Controls
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    const toggleCamBtn = document.getElementById("toggleCamBtn");
    const toggleScreenBtn = document.getElementById("toggleScreenBtn");
    const toggleChatBtn = document.getElementById("toggleChatBtn");
    const hangupBtn = document.getElementById("hangupBtn");
    const leaveRoomBtn = document.getElementById("leaveRoomBtn");
    const huddleChatPanel = document.getElementById("huddleChatPanel");
    const closeChatBtn = document.getElementById("closeChatBtn");

    // Chat Elements
    const chatMessagesContainer = document.getElementById("chatMessagesContainer");
    const chatInputForm = document.getElementById("chatInputForm");
    const chatMessageInput = document.getElementById("chatMessageInput");

    // Publish Modal Elements
    const publishSolutionBtn = document.getElementById("publishSolutionBtn");
    const exportCodePreview = document.getElementById("exportCodePreview");
    const confirmPublishBtn = document.getElementById("confirmPublishBtn");
    const confirmPublishBtnText = document.getElementById("confirmPublishBtnText");
    const exportModalEl = document.getElementById("exportAnswerModal");
    let exportModalInstance = null;

    const tabModeAnswer = document.getElementById("tabModeAnswer");
    const tabModeQuestion = document.getElementById("tabModeQuestion");
    const tabModeVault = document.getElementById("tabModeVault");
    const selectedQuestionDisplay = document.getElementById("selectedQuestionDisplay");
    const selectQuestionContainer = document.getElementById("selectQuestionContainer");
    const chooseQuestionSelect = document.getElementById("chooseQuestionSelect");
    const exportNotesInput = document.getElementById("exportNotesInput");
    const newQuestionTitleInput = document.getElementById("newQuestionTitleInput");
    const newQuestionTagsInput = document.getElementById("newQuestionTagsInput");
    const newQuestionDescInput = document.getElementById("newQuestionDescInput");

    if (displayRoomIdEl) displayRoomIdEl.textContent = roomId;

    function getInitials(name) {
        if (!name) return "CQ";
        const parts = name.trim().split(/[\s_.-]+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    // -------------------------------------------------------------
    // 2. INITIALIZATION & USER AUTH
    // -------------------------------------------------------------
    async function initUser() {
        try {
            const res = await fetch("/auth/status", { credentials: "include" });
            const data = await res.json();
            if (data && data.loggedIn) {
                currentUser = {
                    username: data.username,
                    avatarUrl: data.avatarUrl || "default-avatar.png",
                    id: data.userId || (data.user && data.user._id)
                };
            }
        } catch (e) {
            console.warn("Auth check note:", e);
        }

        if (localAvatarInitials) {
            localAvatarInitials.textContent = getInitials(currentUser.username);
        }

        await initQuestionContext();
    }

    async function initQuestionContext() {
        if (questionId) {
            try {
                const res = await fetch(`/api/collab/question-info?id=${encodeURIComponent(questionId)}`);
                if (res.ok) {
                    const qData = await res.json();
                    if (qData && qData.success && qData.question) {
                        if (selectedQuestionDisplay) {
                            selectedQuestionDisplay.innerHTML = `<span class="badge bg-secondary me-2">Fixing:</span> <strong>${escapeHtml(qData.question.title || "Linked Question")}</strong>`;
                        }
                        if (qData.question.code && !collabCodeInput.value.trim()) {
                            collabCodeInput.value = qData.question.code;
                            updateLineNumbers();
                        }
                        return;
                    }
                }
            } catch (e) {
                console.warn("Question info fetch note:", e);
            }

            if (selectedQuestionDisplay) {
                selectedQuestionDisplay.innerHTML = `<span class="badge bg-secondary me-2">Linked:</span> <code>#${escapeHtml(questionId.slice(-6))}</code>`;
            }
        } else {
            if (selectedQuestionDisplay) {
                selectedQuestionDisplay.innerHTML = `<span class="text-secondary small">No question linked directly. Choose one below or switch to Ask as Question.</span>`;
            }
            if (selectQuestionContainer) {
                selectQuestionContainer.style.display = "block";
            }
            loadRecentQuestions();
        }
    }

    async function loadRecentQuestions() {
        if (!chooseQuestionSelect) return;
        try {
            const res = await fetch("/api/collab/recent-questions");
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.questions)) {
                    chooseQuestionSelect.innerHTML = `<option value="">-- Select Question to Answer --</option>`;
                    data.questions.forEach((q) => {
                        const opt = document.createElement("option");
                        opt.value = q._id || q.id;
                        opt.textContent = q.title || "Untitled Question";
                        chooseQuestionSelect.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.warn("Could not load recent questions:", e);
        }
    }

    // -------------------------------------------------------------
    // 3. WEBSOCKET REAL-TIME NETWORKING
    // -------------------------------------------------------------
    let isRemoteTyping = false;
    let codeSyncTimeout = null;

    function connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/collab`;

        updateConnStatus("connecting", "Connecting to Huddle...");

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateConnStatus("connected", "In Huddle");
            ws.send(JSON.stringify({
                type: "join-room",
                roomId: roomId,
                questionId: questionId,
                user: currentUser
            }));
        };

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                handleSocketMessage(data);
            } catch (err) {
                console.error("WS Parse error:", err);
            }
        };

        ws.onclose = () => {
            updateConnStatus("disconnected", "Reconnecting...");
            setTimeout(connectWebSocket, 2500);
        };

        ws.onerror = (err) => {
            console.error("WS Connection error:", err);
        };
    }

    function updateConnStatus(status, text) {
        if (connStatusText) connStatusText.textContent = text;
        if (!connStatusDot) return;
        if (status === "connected") {
            connStatusDot.className = "huddle-status-dot active";
        } else {
            connStatusDot.className = "huddle-status-dot";
        }
    }

    async function handleSocketMessage(data) {
        switch (data.type) {
            case "room-joined":
                myPeerId = data.peerId;
                if (data.code && !collabCodeInput.value.trim()) {
                    collabCodeInput.value = data.code;
                    updateLineNumbers();
                }
                if (data.lang) {
                    editorLangSelect.value = data.lang;
                    updateEditorLang(data.lang);
                }

                if (data.peers && data.peers.length > 0) {
                    if (activePeersCounter) activePeersCounter.textContent = `${data.peers.length + 1} in huddle`;
                    const primaryPeer = data.peers[0];
                    remotePeerId = primaryPeer.peerId;
                    setRemotePeerProfile(primaryPeer.user);

                    // Initiator connects to existing peer
                    initiatePeerConnection(remotePeerId, true);
                } else {
                    if (activePeersCounter) activePeersCounter.textContent = `1 in huddle`;
                    if (remotePlaceholderText) remotePlaceholderText.textContent = "Waiting for partner to join...";
                }
                break;

            case "peer-joined":
                remotePeerId = data.peerId;
                setRemotePeerProfile(data.user);
                if (activePeersCounter) activePeersCounter.textContent = `2 in huddle`;
                showToast(`@${data.user.username} joined the huddle`);

                sendCodeChange();

                if (!peerConnection || peerConnection.signalingState === "closed") {
                    initiatePeerConnection(remotePeerId, false);
                }
                break;

            case "webrtc-signal":
                if (data.signal) {
                    handleWebRtcSignal(data.signal, data.fromPeerId);
                }
                break;

            case "code-change":
                isRemoteTyping = true;
                collabCodeInput.value = data.code;
                updateLineNumbers();
                if (data.lang && data.lang !== editorLangSelect.value) {
                    editorLangSelect.value = data.lang;
                    updateEditorLang(data.lang);
                }
                if (syncIndicator) {
                    syncIndicator.innerHTML = `<i class="fa-solid fa-check me-1"></i>Synced`;
                }
                setTimeout(() => { isRemoteTyping = false; }, 400);
                break;

            case "run-code":
                showToast(`@${data.fromUser || "Partner"} ran the code`);
                runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;
                setTimeout(() => { executeCode(collabCodeInput.value, false); }, 100);
                break;

            case "run-result":
                displayExecutionResults(data.logs, data.duration, data.error);
                runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-play me-1"></i><span>Run</span>`;
                break;

            case "chat-message":
                appendChatMessage(data.message, false);
                break;

            case "peer-status":
                if (data.isMuted !== undefined && remoteAudioStatusIcon) {
                    remoteAudioStatusIcon.innerHTML = data.isMuted
                        ? `<i class="fa-solid fa-microphone-slash text-danger"></i>`
                        : `<i class="fa-solid fa-microphone text-success"></i>`;
                }
                if (data.isVideoOff !== undefined) {
                    if (remoteVideoPlaceholder) {
                        remoteVideoPlaceholder.style.display = data.isVideoOff ? "flex" : "none";
                    }
                    if (remoteVideo) {
                        remoteVideo.style.display = data.isVideoOff ? "none" : "block";
                    }
                    if (data.isVideoOff && remotePlaceholderText) {
                        remotePlaceholderText.textContent = "Camera is turned off";
                    }
                }
                break;

            case "peer-left":
                showToast(`Partner left the huddle`);
                if (activePeersCounter) activePeersCounter.textContent = `1 in huddle`;
                if (remoteVideo) remoteVideo.srcObject = null;
                if (remoteAudio) remoteAudio.srcObject = null;
                if (remoteVideoPlaceholder) remoteVideoPlaceholder.style.display = "flex";
                if (remotePlaceholderText) remotePlaceholderText.textContent = "Partner left. Waiting for partner...";
                if (remotePeerTile) remotePeerTile.classList.remove("is-speaking");

                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
                break;

            case "room-full":
                showRoomFullOverlay(data.roomId, data.members);
                break;

            case "third-person-attempted":
                showToast(`Notice: @${data.visitor || "A developer"} tried to join, but 1-on-1 huddle is full.`);
                break;

            case "publish-modal-opened":
                showToast(`@${data.fromUser || "Partner"} opened the Publish dialog`);
                break;

            case "solution-published":
                showPartnerPublishedModal(data);
                break;
        }
    }

    function setRemotePeerProfile(user) {
        const username = user && user.username ? user.username : "Partner";
        if (remoteUserName) remoteUserName.textContent = username;
        if (remoteUserTagLabel) remoteUserTagLabel.textContent = username;
        if (remoteAvatarInitials) remoteAvatarInitials.textContent = getInitials(username);
        if (remotePlaceholderText) remotePlaceholderText.textContent = "Connecting video feed...";
    }

    // -------------------------------------------------------------
    // 4. WEBRTC AUDIO & VIDEO ENGINE
    // -------------------------------------------------------------
    async function initLocalMedia() {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
            console.warn("getUserMedia unavailable on this client/protocol.");
            isVideoOff = true;
            isMicMuted = true;
            updateMediaControlsUI();
            return;
        }

        try {
            // Request clean HD webcam and noise-suppressed microphone
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });

            localVideo.srcObject = localStream;
            localVideoPlaceholder.style.display = "none";
            localVideo.style.display = "block";
            isVideoOff = false;
            isMicMuted = false;

            setupAudioAnalyser(localStream, true);
        } catch (err) {
            console.warn("Could not acquire video camera, falling back to audio-only:", err.name, err.message);
            try {
                // Audio-only fallback
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });
                isVideoOff = true;
                isMicMuted = false;
                localVideoPlaceholder.style.display = "flex";
                localVideo.style.display = "none";
                setupAudioAnalyser(localStream, true);
            } catch (audioErr) {
                console.warn("Audio also unavailable or denied:", audioErr.name, audioErr.message);
                isVideoOff = true;
                isMicMuted = true;
                localVideoPlaceholder.style.display = "flex";
                localVideo.style.display = "none";
            }
        }

        updateMediaControlsUI();
    }

    function updateMediaControlsUI() {
        if (toggleMicBtn) {
            toggleMicBtn.classList.toggle("is-muted", isMicMuted);
            toggleMicBtn.innerHTML = isMicMuted
                ? `<i class="fa-solid fa-microphone-slash"></i>`
                : `<i class="fa-solid fa-microphone"></i>`;
        }
        if (toggleCamBtn) {
            toggleCamBtn.classList.toggle("is-video-off", isVideoOff);
            toggleCamBtn.innerHTML = isVideoOff
                ? `<i class="fa-solid fa-video-slash"></i>`
                : `<i class="fa-solid fa-video"></i>`;
        }
        if (localAudioStatusIcon) {
            localAudioStatusIcon.innerHTML = isMicMuted
                ? `<i class="fa-solid fa-microphone-slash text-danger"></i>`
                : `<i class="fa-solid fa-microphone text-success"></i>`;
        }
    }

    /**
     * Active Speaker Detection via Web Audio API (Slack-style green pulse)
     */
    function setupAudioAnalyser(stream, isLocal) {
        if (!window.AudioContext && !window.webkitAudioContext) return;
        if (!stream || stream.getAudioTracks().length === 0) return;

        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContextClass();
            }
            if (audioCtx.state === "suspended") {
                audioCtx.resume().catch(() => {});
            }

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const buffer = new Uint8Array(analyser.frequencyBinCount);

            function checkAudioLevel() {
                analyser.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) {
                    sum += buffer[i];
                }
                const avg = sum / buffer.length;
                const isSpeaking = avg > 20;

                const targetTile = isLocal ? localPeerTile : remotePeerTile;
                if (targetTile) {
                    if (isSpeaking && !(isLocal && isMicMuted)) {
                        targetTile.classList.add("is-speaking");
                    } else {
                        targetTile.classList.remove("is-speaking");
                    }
                }

                requestAnimationFrame(checkAudioLevel);
            }

            checkAudioLevel();
        } catch (e) {
            console.warn("Audio analyser setup error:", e);
        }
    }

    function initiatePeerConnection(targetId, isCaller) {
        if (targetId) remotePeerId = targetId;

        if (peerConnection && peerConnection.signalingState !== "closed") {
            try { peerConnection.close(); } catch (e) {}
            peerConnection = null;
        }

        peerConnection = new RTCPeerConnection(rtcConfig);

        // Attach local tracks
        if (localStream) {
            localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Dedicated remote track handling
        peerConnection.ontrack = (event) => {
            console.log("📹 [WebRTC] Remote track arrived:", event.track.kind);

            if (event.track.kind === "audio") {
                if (remoteAudio) {
                    if (!remoteAudio.srcObject) {
                        remoteAudio.srcObject = new MediaStream();
                    }
                    remoteAudio.srcObject.addTrack(event.track);
                    remoteAudio.play().catch(() => {
                        console.log("Audio autoplay waiting for user interaction unlock");
                    });
                }
                setupAudioAnalyser(new MediaStream([event.track]), false);
            }

            if (event.track.kind === "video") {
                if (remoteVideo) {
                    if (!remoteVideo.srcObject) {
                        remoteVideo.srcObject = new MediaStream();
                    }
                    remoteVideo.srcObject.addTrack(event.track);
                    remoteVideo.play().catch(() => {});
                    remoteVideo.style.display = "block";
                }
                if (remoteVideoPlaceholder) {
                    remoteVideoPlaceholder.style.display = "none";
                }
            }
        };

        // ICE candidate exchange
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "webrtc-signal",
                    targetPeerId: targetId || remotePeerId,
                    signal: { candidate: event.candidate }
                }));
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log("🔗 WebRTC connectionState:", peerConnection.connectionState);
            if (peerConnection.connectionState === "connected") {
                updateConnStatus("connected", "In Huddle (Connected)");
            }
        };

        if (isCaller) {
            peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
                .then((offer) => peerConnection.setLocalDescription(offer))
                .then(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: "webrtc-signal",
                            targetPeerId: targetId || remotePeerId,
                            signal: { sdp: peerConnection.localDescription }
                        }));
                    }
                })
                .catch((e) => console.error("Error creating SDP offer:", e));
        }
    }

    async function handleWebRtcSignal(signal, fromPeerId) {
        if (fromPeerId) remotePeerId = fromPeerId;

        if (signal.sdp) {
            if (!peerConnection || peerConnection.signalingState === "closed") {
                initiatePeerConnection(remotePeerId, false);
            }

            try {
                if (signal.sdp.type === "offer") {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    await processQueuedIceCandidates();

                    const answer = await peerConnection.createAnswer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });
                    await peerConnection.setLocalDescription(answer);

                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: "webrtc-signal",
                            targetPeerId: remotePeerId,
                            signal: { sdp: peerConnection.localDescription }
                        }));
                    }
                } else if (signal.sdp.type === "answer") {
                    if (peerConnection.signalingState === "have-local-offer") {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                        await processQueuedIceCandidates();
                    }
                }
            } catch (err) {
                console.error("Error processing SDP:", err);
            }
        } else if (signal.candidate) {
            if (!peerConnection || !peerConnection.remoteDescription || !peerConnection.remoteDescription.type) {
                iceCandidatesQueue.push(signal.candidate);
            } else {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } catch (e) {
                    console.warn("ICE candidate add note:", e);
                }
            }
        }
    }

    async function processQueuedIceCandidates() {
        if (!peerConnection || !peerConnection.remoteDescription || !peerConnection.remoteDescription.type) return;
        while (iceCandidatesQueue.length > 0) {
            const cand = iceCandidatesQueue.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
                console.warn("Queued ICE add note:", err);
            }
        }
    }

    // Audio Unblock Handler (Global click unlocks browser autoplay restriction)
    function unlockMediaAudio() {
        if (audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => {});
        }
        if (remoteAudio && remoteAudio.paused && remoteAudio.srcObject) {
            remoteAudio.play().catch(() => {});
        }
        if (remoteVideo && remoteVideo.paused && remoteVideo.srcObject) {
            remoteVideo.play().catch(() => {});
        }
    }
    window.addEventListener("click", unlockMediaAudio, { passive: true });
    window.addEventListener("keydown", unlockMediaAudio, { passive: true });

    // -------------------------------------------------------------
    // 5. SLACK CONTROLS: MIC, CAMERA, SCREEN SHARE
    // -------------------------------------------------------------
    if (toggleMicBtn) {
        toggleMicBtn.addEventListener("click", () => {
            isMicMuted = !isMicMuted;
            if (localStream) {
                localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
            }
            updateMediaControlsUI();
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "peer-status", isMuted: isMicMuted }));
            }
            showToast(isMicMuted ? "Microphone muted" : "Microphone active");
        });
    }

    if (toggleCamBtn) {
        toggleCamBtn.addEventListener("click", async () => {
            isVideoOff = !isVideoOff;

            // If user turns video ON and has no existing video track, acquire video
            if (!isVideoOff && (!localStream || localStream.getVideoTracks().length === 0) && navigator.mediaDevices) {
                try {
                    const vStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
                    });
                    const vTrack = vStream.getVideoTracks()[0];
                    if (vTrack) {
                        if (!localStream) localStream = new MediaStream();
                        localStream.addTrack(vTrack);
                        if (peerConnection) {
                            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
                            if (sender) {
                                sender.replaceTrack(vTrack);
                            } else {
                                peerConnection.addTrack(vTrack, localStream);
                            }
                        }
                    }
                } catch (err) {
                    console.warn("Could not start camera:", err);
                    isVideoOff = true;
                }
            }

            if (localStream) {
                localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
            }

            if (localVideo) {
                localVideo.style.display = isVideoOff ? "none" : "block";
            }
            if (localVideoPlaceholder) {
                localVideoPlaceholder.style.display = isVideoOff ? "flex" : "none";
            }

            updateMediaControlsUI();

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "peer-status", isVideoOff: isVideoOff }));
            }
            showToast(isVideoOff ? "Camera turned off" : "Camera turned on");
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
                    if (localVideo) {
                        localVideo.srcObject = screenStream;
                        localVideo.style.display = "block";
                    }
                    if (localVideoPlaceholder) localVideoPlaceholder.style.display = "none";

                    isScreenSharing = true;
                    toggleScreenBtn.classList.add("is-active-share");

                    screenTrack.onended = () => stopScreenShare();
                    showToast("Screen sharing active");
                } catch (err) {
                    console.warn("Screen share cancelled:", err);
                }
            } else {
                stopScreenShare();
            }
        });
    }

    function stopScreenShare() {
        if (!isScreenSharing) return;
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
        const videoTrack = localStream ? localStream.getVideoTracks()[0] : null;
        if (peerConnection && videoTrack) {
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) sender.replaceTrack(videoTrack);
        }
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.display = isVideoOff ? "none" : "block";
        }
        if (localVideoPlaceholder) {
            localVideoPlaceholder.style.display = isVideoOff ? "flex" : "none";
        }
        isScreenSharing = false;
        toggleScreenBtn.classList.remove("is-active-share");
        showToast("Screen sharing stopped");
    }

    // Toggle Chat Panel
    if (toggleChatBtn && huddleChatPanel) {
        toggleChatBtn.addEventListener("click", () => {
            const isHidden = huddleChatPanel.style.display === "none";
            huddleChatPanel.style.display = isHidden ? "flex" : "none";
        });
    }
    if (closeChatBtn && huddleChatPanel) {
        closeChatBtn.addEventListener("click", () => {
            huddleChatPanel.style.display = "none";
        });
    }

    // Hangup / Leave Call
    function leaveHuddle() {
        if (peerConnection) {
            try { peerConnection.close(); } catch (e) {}
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        window.location.href = "dashboard.html";
    }

    if (hangupBtn) hangupBtn.addEventListener("click", leaveHuddle);
    if (leaveRoomBtn) leaveRoomBtn.addEventListener("click", leaveHuddle);

    // -------------------------------------------------------------
    // 6. SYNCHRONIZED CODE EDITOR & LINE NUMBERS
    // -------------------------------------------------------------
    function updateLineNumbers() {
        const lines = (collabCodeInput.value || "").split("\n").length;
        let lineNums = "";
        for (let i = 1; i <= lines; i++) {
            lineNums += i + "\n";
        }
        editorLineNumbers.textContent = lineNums;
    }

    function sendCodeChange() {
        if (isRemoteTyping) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "code-change",
                roomId: roomId,
                code: collabCodeInput.value,
                lang: editorLangSelect.value
            }));
        }
    }

    collabCodeInput.addEventListener("input", () => {
        updateLineNumbers();
        clearTimeout(codeSyncTimeout);
        codeSyncTimeout = setTimeout(sendCodeChange, 80);
    });

    collabCodeInput.addEventListener("scroll", () => {
        editorLineNumbers.scrollTop = collabCodeInput.scrollTop;
    });

    collabCodeInput.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const start = collabCodeInput.selectionStart;
            const end = collabCodeInput.selectionEnd;
            collabCodeInput.value = collabCodeInput.value.substring(0, start) + "    " + collabCodeInput.value.substring(end);
            collabCodeInput.selectionStart = collabCodeInput.selectionEnd = start + 4;
            sendCodeChange();
        } else if (e.key === "Enter") {
            const start = collabCodeInput.selectionStart;
            const curLine = collabCodeInput.value.substring(0, start).split("\n").pop();
            const matchIndent = curLine.match(/^(\s+)/);
            if (matchIndent) {
                e.preventDefault();
                const indent = matchIndent[1];
                collabCodeInput.value = collabCodeInput.value.substring(0, start) + "\n" + indent + collabCodeInput.value.substring(start);
                collabCodeInput.selectionStart = collabCodeInput.selectionEnd = start + 1 + indent.length;
                updateLineNumbers();
                sendCodeChange();
            }
        }
    });

    editorLangSelect.addEventListener("change", () => {
        const lang = editorLangSelect.value;
        updateEditorLang(lang);
        sendCodeChange();
    });

    function updateEditorLang(lang) {
        if (lang === "javascript") {
            fileTabName.textContent = "solution.js";
            fileTabIcon.className = "fa-brands fa-js text-warning me-2";
        } else if (lang === "html") {
            fileTabName.textContent = "index.html";
            fileTabIcon.className = "fa-brands fa-html5 text-danger me-2";
        } else if (lang === "python") {
            fileTabName.textContent = "main.py";
            fileTabIcon.className = "fa-brands fa-python text-info me-2";
        } else if (lang === "css") {
            fileTabName.textContent = "styles.css";
            fileTabIcon.className = "fa-brands fa-css3-alt text-primary me-2";
        } else {
            fileTabName.textContent = "data.json";
            fileTabIcon.className = "fa-solid fa-code text-light me-2";
        }
    }

    // -------------------------------------------------------------
    // 7. CODE EXECUTION & CONSOLE DRAWER
    // -------------------------------------------------------------
    runCollabCodeBtn.addEventListener("click", () => {
        const code = collabCodeInput.value;
        if (!code.trim()) {
            showToast("Editor is empty. Type some code first!");
            return;
        }

        runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "run-code", roomId: roomId }));
        }

        setTimeout(() => {
            executeCode(code, true);
        }, 80);
    });

    async function executeCode(code, broadcastResults = true) {
        const lang = editorLangSelect.value;
        let execution = { logs: [], duration: "0.00", error: null };

        if (lang && lang !== "javascript") {
            try {
                const response = await fetch("/api/execute-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: code, lang: lang })
                });
                const data = await response.json();
                const captured = [];
                if (data.output && data.output.trim()) {
                    data.output.trim().split("\n").forEach(line => {
                        captured.push({ type: "log", text: line });
                    });
                }
                if (data.error && data.error.trim()) {
                    data.error.trim().split("\n").forEach(line => {
                        captured.push({ type: "error", text: line });
                    });
                }
                if (captured.length === 0) {
                    captured.push({ type: "return", text: "Code executed cleanly without console logs." });
                }
                execution.logs = captured;
                execution.duration = data.duration ? (parseFloat(data.duration) * 1000).toFixed(2) : "45.00";
                if (data.error && !data.output) {
                    execution.error = new Error(data.error);
                }
            } catch (err) {
                execution.logs = [{ type: "error", text: "Execution failed: " + err.message }];
                execution.error = err;
            }
        } else if (window.CodeQuestPro && typeof window.CodeQuestPro.executeJavaScript === "function") {
            execution = await window.CodeQuestPro.executeJavaScript(code, () => {});
        } else {
            const captured = [];
            const originalLog = console.log;
            const startTime = performance.now();
            console.log = (...args) => captured.push({ type: "log", text: args.join(" ") });

            try {
                const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
                const fn = new AsyncFn(code);
                const res = await fn();
                if (res !== undefined) captured.push({ type: "return", text: "Return => " + JSON.stringify(res) });
            } catch (err) {
                captured.push({ type: "error", text: err.name + ": " + err.message });
                execution.error = err;
            } finally {
                console.log = originalLog;
            }
            execution.logs = captured;
            execution.duration = (performance.now() - startTime).toFixed(2);
        }

        displayExecutionResults(execution.logs, execution.duration, execution.error);
        runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-play me-1"></i><span>Run</span>`;

        if (broadcastResults && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "run-result",
                roomId: roomId,
                logs: execution.logs,
                duration: execution.duration,
                error: execution.error ? execution.error.message : null
            }));
        }
    }

    function displayExecutionResults(logs, duration, error) {
        consoleLogsList.innerHTML = "";
        if (collabExecTime) {
            collabExecTime.textContent = `${duration || "0.00"}ms`;
            collabExecTime.style.display = "inline";
        }

        if (!logs || logs.length === 0) {
            consoleLogsList.innerHTML = `
                <div class="console-log-row text-success">
                    ✓ Code executed cleanly with no stdout output (${duration}ms).
                </div>
            `;
            return;
        }

        logs.forEach(log => {
            const row = document.createElement("div");
            row.className = `console-log-row log-${log.type || "log"}`;
            row.textContent = log.text;
            consoleLogsList.appendChild(row);
        });
    }

    clearConsoleBtn.addEventListener("click", () => {
        consoleLogsList.innerHTML = `<div class="console-empty-state">Console cleared.</div>`;
        if (collabExecTime) collabExecTime.style.display = "none";
    });

    // -------------------------------------------------------------
    // 8. PAIR PROGRAMMING CHAT
    // -------------------------------------------------------------
    chatInputForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = chatMessageInput.value.trim();
        if (!text) return;

        const msgObj = {
            id: `msg_${Date.now()}`,
            text: text,
            user: currentUser,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };

        appendChatMessage(msgObj, true);
        chatMessageInput.value = "";

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "chat-message",
                roomId: roomId,
                message: msgObj
            }));
        }
    });

    function appendChatMessage(msg, isMine) {
        const bubble = document.createElement("div");
        bubble.className = `chat-message-bubble ${isMine ? "me" : "partner"}`;
        bubble.innerHTML = `
            ${!isMine ? `<span class="chat-bubble-author">@${escapeHtml(msg.user.username)}</span>` : ""}
            <div class="chat-bubble-body">${escapeHtml(msg.text)}</div>
        `;
        chatMessagesContainer.appendChild(bubble);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        if (!isMine && mobileUnreadDot && paneCollabMedia && paneCollabMedia.classList.contains("mobile-hidden")) {
            mobileUnreadDot.style.display = "inline-block";
        }
    }

    // -------------------------------------------------------------
    // 9. COPY INVITE LINK & MULTI-MODE PUBLISH MODAL
    // -------------------------------------------------------------
    function copyInviteLink() {
        const link = window.location.href;
        navigator.clipboard.writeText(link).then(() => {
            if (copiedTooltip) {
                copiedTooltip.classList.add("show");
                setTimeout(() => copiedTooltip.classList.remove("show"), 1800);
            }
            showToast("Huddle link copied to clipboard");
        }).catch(() => {
            prompt("Copy this huddle link:", link);
        });
    }

    if (copyInviteLinkBtn) copyInviteLinkBtn.addEventListener("click", copyInviteLink);

    let currentPublishMode = "answer";

    if (tabModeAnswer) {
        tabModeAnswer.addEventListener("shown.bs.tab", () => {
            currentPublishMode = "answer";
            if (confirmPublishBtnText) confirmPublishBtnText.textContent = "Post as Answer";
        });
    }
    if (tabModeQuestion) {
        tabModeQuestion.addEventListener("shown.bs.tab", () => {
            currentPublishMode = "question";
            if (confirmPublishBtnText) confirmPublishBtnText.textContent = "Ask as Question";
        });
    }
    if (tabModeVault) {
        tabModeVault.addEventListener("shown.bs.tab", () => {
            currentPublishMode = "vault";
            if (confirmPublishBtnText) confirmPublishBtnText.textContent = "Save to Vault";
        });
    }

    function openPublishModal() {
        const currentCode = (collabCodeInput ? collabCodeInput.value : "").trim();
        if (exportCodePreview) {
            exportCodePreview.value = currentCode || "// Collaborative code snippet\nconsole.log('Ready to publish');";
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "publish-modal-opened",
                roomId: roomId,
                fromUser: currentUser ? currentUser.username : "Partner"
            }));
        }

        if (!questionId && chooseQuestionSelect && !chooseQuestionSelect.value) {
            if (tabModeQuestion && window.bootstrap) {
                try {
                    const tab = bootstrap.Tab.getInstance(tabModeQuestion) || new bootstrap.Tab(tabModeQuestion);
                    tab.show();
                } catch(e){}
            }
        }

        if (window.bootstrap && exportModalEl) {
            exportModalInstance = bootstrap.Modal.getInstance(exportModalEl) || new bootstrap.Modal(exportModalEl);
            exportModalInstance.show();
        }
    }

    if (publishSolutionBtn) {
        publishSolutionBtn.addEventListener("click", openPublishModal);
    }

    if (chooseQuestionSelect) {
        chooseQuestionSelect.addEventListener("change", () => {
            if (chooseQuestionSelect.value && selectedQuestionDisplay) {
                const selectedText = chooseQuestionSelect.options[chooseQuestionSelect.selectedIndex].text;
                selectedQuestionDisplay.innerHTML = `<span class="badge bg-secondary me-2">Selected:</span> <strong>${escapeHtml(selectedText)}</strong>`;
            }
        });
    }

    if (confirmPublishBtn) {
        confirmPublishBtn.addEventListener("click", async () => {
            const code = (exportCodePreview ? exportCodePreview.value : (collabCodeInput ? collabCodeInput.value : "")).trim();
            if (!code) {
                alert("Please enter a code snippet before publishing.");
                if (exportCodePreview) exportCodePreview.focus();
                return;
            }
            const lang = editorLangSelect ? editorLangSelect.value : "javascript";

            // MODE 1: Post as Answer
            if (currentPublishMode === "answer") {
                const targetQId = questionId || (chooseQuestionSelect ? chooseQuestionSelect.value : null);
                if (!targetQId) {
                    alert("Please select a target question to answer, or switch to 'Ask as Question'!");
                    return;
                }

                const notes = exportNotesInput ? exportNotesInput.value.trim() : "";
                confirmPublishBtn.disabled = true;
                confirmPublishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Publishing...`;

                try {
                    const res = await fetch("/api/collab/export-answer", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ questionId: targetQId, code, lang, notes })
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        const targetUrl = `messageDetails.html?questionId=${encodeURIComponent(targetQId)}&id=${encodeURIComponent(targetQId)}`;
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: "solution-published",
                                roomId: roomId,
                                fromUser: currentUser ? currentUser.username : "Partner",
                                mode: "answer",
                                title: "Answer to Question",
                                targetUrl: targetUrl
                            }));
                        }
                        if (exportModalInstance) exportModalInstance.hide();
                        showPartnerPublishedModal({
                            fromUser: "You",
                            mode: "answer",
                            targetUrl: targetUrl
                        });
                    } else {
                        alert(data.error || "Failed to post answer.");
                    }
                } catch (err) {
                    alert("Network error. Please try again.");
                } finally {
                    confirmPublishBtn.disabled = false;
                    confirmPublishBtn.innerHTML = `<i class="fa-solid fa-check me-1"></i><span id="confirmPublishBtnText">Post as Answer</span>`;
                }

            // MODE 2: Ask as Question
            } else if (currentPublishMode === "question") {
                const title = newQuestionTitleInput ? newQuestionTitleInput.value.trim() : "";
                if (!title) {
                    alert("Please enter a question title.");
                    if (newQuestionTitleInput) newQuestionTitleInput.focus();
                    return;
                }
                const tags = newQuestionTagsInput ? newQuestionTagsInput.value.trim() : "";
                const description = newQuestionDescInput ? newQuestionDescInput.value.trim() : "";

                confirmPublishBtn.disabled = true;
                confirmPublishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Publishing...`;

                try {
                    const res = await fetch("/api/collab/export-question", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ title, code, lang, tags, description })
                    });
                    const data = await res.json();
                    if (res.ok && data.success && data.questionId) {
                        const targetUrl = `messageDetails.html?questionId=${encodeURIComponent(data.questionId)}&id=${encodeURIComponent(data.questionId)}`;
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: "solution-published",
                                roomId: roomId,
                                fromUser: currentUser ? currentUser.username : "Partner",
                                mode: "question",
                                title: title,
                                targetUrl: targetUrl
                            }));
                        }
                        if (exportModalInstance) exportModalInstance.hide();
                        showPartnerPublishedModal({
                            fromUser: "You",
                            mode: "question",
                            targetUrl: targetUrl
                        });
                    } else {
                        alert(data.error || "Failed to create question.");
                    }
                } catch (err) {
                    alert("Network error. Please try again.");
                } finally {
                    confirmPublishBtn.disabled = false;
                    confirmPublishBtn.innerHTML = `<i class="fa-solid fa-check me-1"></i><span id="confirmPublishBtnText">Ask as Question</span>`;
                }

            // MODE 3: Save to Vault
            } else if (currentPublishMode === "vault") {
                const snippetTitle = `Huddle Snippet - ${roomId} (${lang.toUpperCase()})`;
                try {
                    const vault = JSON.parse(localStorage.getItem("codequest_vault") || "[]");
                    vault.push({
                        id: "vault_" + Date.now(),
                        title: snippetTitle,
                        code: code,
                        lang: lang,
                        createdAt: new Date().toISOString()
                    });
                    localStorage.setItem("codequest_vault", JSON.stringify(vault));
                } catch (e) {}

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "solution-published",
                        roomId: roomId,
                        fromUser: currentUser ? currentUser.username : "Partner",
                        mode: "vault",
                        title: snippetTitle,
                        targetUrl: "dashboard.html"
                    }));
                }

                if (exportModalInstance) exportModalInstance.hide();
                showPartnerPublishedModal({
                    fromUser: "You",
                    mode: "vault",
                    targetUrl: "dashboard.html"
                });
            }
        });
    }

    function showRoomFullOverlay(fullRoomId, members) {
        if (peerConnection) {
            try { peerConnection.close(); } catch(e) {}
            peerConnection = null;
        }

        const existing = document.getElementById("codequestRoomFullOverlay");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = "codequestRoomFullOverlay";
        overlay.className = "room-full-overlay";

        const membersList = (members && members.length > 0)
            ? members.map(m => `@${escapeHtml(m)}`).join(" & ")
            : "2 developers";

        const newRandomRoom = `CQ-${Math.floor(1000 + Math.random() * 9000)}`;

        overlay.innerHTML = `
            <div class="room-full-card">
                <div class="room-full-icon">
                    <i class="fa-solid fa-users-slash"></i>
                </div>
                <h2 class="room-full-title">1-on-1 Huddle is Full</h2>
                <p class="room-full-desc">
                    This live pair-programming room (<strong>${escapeHtml(fullRoomId || roomId)}</strong>) is currently occupied by <strong>${membersList}</strong> (2/2 active developers).
                    <br><br>
                    You can start your own fresh debug huddle below:
                </p>
                <div class="room-full-actions">
                    <a href="collab.html?room=${newRandomRoom}" class="btn-room-full-action btn-room-full-create">
                        <i class="fa-solid fa-plus-circle me-1"></i>Create My Own Huddle
                    </a>
                    <a href="dashboard.html" class="btn-room-full-action btn-room-full-dash">
                        <i class="fa-solid fa-arrow-left me-1"></i>Return to Dashboard
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function showPartnerPublishedModal(data) {
        const modalId = "codequestPartnerPublishedModal";
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        const modeLabel = data.mode === "question"
            ? "a Question"
            : (data.mode === "vault" ? "Code Vault" : "an Answer");

        const isAuthor = (data.fromUser === "You");
        const titleText = isAuthor ? "Solution Published" : `@${escapeHtml(data.fromUser)} Published Solution`;

        const modalDiv = document.createElement("div");
        modalDiv.id = modalId;
        modalDiv.className = "modal fade";
        modalDiv.tabIndex = -1;
        modalDiv.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content collab-modal-content">
                    <div class="modal-header border-0 pb-0">
                        <h5 class="modal-title text-light"><i class="fa-solid fa-circle-check text-success me-2"></i>${titleText}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body py-3 text-center">
                        <p class="text-secondary small mb-0">
                            The collaborative code has been published as <strong>${escapeHtml(modeLabel)}</strong>. Both developers can view it below:
                        </p>
                    </div>
                    <div class="modal-footer border-0 justify-content-center gap-2 pt-0 pb-3">
                        <button type="button" class="btn btn-collab-modal-cancel" data-bs-dismiss="modal">Stay in Huddle</button>
                        ${data.targetUrl ? `
                            <a href="${data.targetUrl}" target="_blank" class="btn btn-collab-modal-publish text-decoration-none">
                                <i class="fa-solid fa-arrow-up-right-from-square me-1"></i>View Solution
                            </a>
                        ` : ""}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
        if (window.bootstrap) {
            const bsModal = new bootstrap.Modal(modalDiv);
            bsModal.show();
        }
        showToast(titleText);
    }

    function showToast(msg) {
        if (window.CodeQuestPro && typeof window.CodeQuestPro.showAppToast === "function") {
            window.CodeQuestPro.showAppToast(msg);
        } else {
            console.log("🔔 [CodeQuest Huddle]", msg);
        }
    }

    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // Mobile View switcher
    if (mTabEditor && mTabMedia) {
        mTabEditor.addEventListener("click", () => {
            mTabEditor.classList.add("active");
            mTabMedia.classList.remove("active");
            if (paneCollabEditor) paneCollabEditor.classList.remove("mobile-hidden");
            if (paneCollabMedia) paneCollabMedia.classList.remove("mobile-visible");
        });

        mTabMedia.addEventListener("click", () => {
            mTabMedia.classList.add("active");
            mTabEditor.classList.remove("active");
            if (paneCollabMedia) paneCollabMedia.classList.add("mobile-visible");
            if (paneCollabEditor) paneCollabEditor.classList.add("mobile-hidden");
            if (mobileUnreadDot) mobileUnreadDot.style.display = "none";
        });
    }

    // -------------------------------------------------------------
    // 10. STARTUP ENTRY POINT
    // -------------------------------------------------------------
    async function start() {
        await initUser();
        updateLineNumbers();
        await initLocalMedia();
        connectWebSocket();
    }

    start();

})();
