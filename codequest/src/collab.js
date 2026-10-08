/**
 * CodeQuest Live 1-on-1 Collab Debug Room
 * - WebRTC Peer-to-Peer Face-to-Face Video & Audio
 * - Real-Time Synchronized Code Editor
 * - Shared Live Interactive Console Drawer
 * - Pair Programming Chat & Answer Export
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

    const rtcConfig = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
            { urls: "stun:openrelay.metered.ca:80" },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelay",
                credential: "openrelay"
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelay",
                credential: "openrelay"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelay",
                credential: "openrelay"
            }
        ],
        iceCandidatePoolSize: 10
    };

    // Header & Context Elements
    const displayRoomIdEl = document.getElementById("displayRoomId");
    const copyInviteLinkBtn = document.getElementById("copyInviteLinkBtn");
    const invitePartnerBtn = document.getElementById("invitePartnerBtn");
    const connStatusIcon = document.getElementById("connStatusIcon");
    const connStatusText = document.getElementById("connStatusText");
    const webrtcStatusBadge = document.getElementById("webrtcStatusBadge");
    const questionContextTag = document.getElementById("questionContextTag");
    const questionContextLink = document.getElementById("questionContextLink");
    const collabQuestionBanner = document.getElementById("collabQuestionBanner");
    const bannerQuestionTitle = document.getElementById("bannerQuestionTitle");

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
    const activePeersCounter = document.getElementById("activePeersCounter");
    const formatCodeBtn = document.getElementById("formatCodeBtn");
    const clearCodeBtn = document.getElementById("clearCodeBtn");

    const runCollabCodeBtn = document.getElementById("runCollabCodeBtn");
    const collabExecTime = document.getElementById("collabExecTime");
    const clearConsoleBtn = document.getElementById("clearConsoleBtn");
    const consoleLogsList = document.getElementById("consoleLogsList");
    const consoleLogsCount = document.getElementById("consoleLogsCount");
    const tabBtnConsole = document.getElementById("tabBtnConsole");
    const tabBtnPreview = document.getElementById("tabBtnPreview");
    const paneConsole = document.getElementById("paneConsole");
    const panePreview = document.getElementById("panePreview");
    const collabPreviewFrame = document.getElementById("collabPreviewFrame");

    // Video Elements
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const unmuteAudioBanner = document.getElementById("unmuteAudioBanner");
    const localVideoPlaceholder = document.getElementById("localVideoPlaceholder");
    const remoteVideoPlaceholder = document.getElementById("remoteVideoPlaceholder");
    const remotePlaceholderText = document.getElementById("remotePlaceholderText");
    const remoteUserName = document.getElementById("remoteUserName");
    const localAudioStatusIcon = document.getElementById("localAudioStatusIcon");
    const remoteAudioStatusIcon = document.getElementById("remoteAudioStatusIcon");
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    const toggleCamBtn = document.getElementById("toggleCamBtn");
    const toggleScreenBtn = document.getElementById("toggleScreenBtn");

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

    // Publish Mode Tabs & Controls
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

    // -------------------------------------------------------------
    // 2. INITIALIZATION & USER AUTH
    // -------------------------------------------------------------
    async function initUser() {
        try {
            const res = await fetch("/api/auth/status", { credentials: "include" });
            const data = await res.json();
            if (data.authenticated && data.user) {
                currentUser = {
                    username: data.user.username,
                    avatarUrl: data.user.avatarUrl || "default-avatar.png",
                    id: data.user._id || data.user.id
                };
            }
        } catch (e) {
            console.warn("Auth check note:", e);
        }

        await initQuestionContext();
    }

    async function initQuestionContext() {
        if (questionId) {
            try {
                const res = await fetch(`/api/questions/${encodeURIComponent(questionId)}`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    const q = data.question || data;
                    if (q && q.title) {
                        if (questionContextTag) {
                            questionContextTag.style.display = "inline-flex";
                            if (questionContextLink) {
                                questionContextLink.href = `messageDetails.html?id=${encodeURIComponent(questionId)}`;
                                questionContextLink.textContent = `Q: ${q.title.length > 25 ? q.title.slice(0, 22) + "..." : q.title}`;
                                questionContextLink.title = q.title;
                            }
                        }
                        if (collabQuestionBanner && bannerQuestionTitle) {
                            collabQuestionBanner.style.display = "flex";
                            bannerQuestionTitle.textContent = q.title;
                        }
                        if (selectedQuestionDisplay) {
                            selectedQuestionDisplay.innerHTML = `<span class="badge bg-primary me-2"><i class="fa-solid fa-link me-1"></i>Linked</span> <strong>${escapeHtml(q.title)}</strong>`;
                        }
                        return;
                    }
                }
            } catch (err) {
                console.warn("Could not fetch question details:", err);
            }

            // Fallback display if fetch doesn't return title
            if (questionContextTag) {
                questionContextTag.style.display = "inline-flex";
                if (questionContextLink) {
                    questionContextLink.href = `messageDetails.html?id=${encodeURIComponent(questionId)}`;
                    questionContextLink.textContent = `Question #${questionId.slice(-6)}`;
                }
            }
            if (collabQuestionBanner && bannerQuestionTitle) {
                collabQuestionBanner.style.display = "flex";
                bannerQuestionTitle.textContent = `Question #${questionId.slice(-6)}`;
            }
            if (selectedQuestionDisplay) {
                selectedQuestionDisplay.innerHTML = `<span class="badge bg-primary me-2"><i class="fa-solid fa-link me-1"></i>Linked ID:</span> <code>${escapeHtml(questionId)}</code>`;
            }
        } else {
            // No question ID in URL
            if (selectedQuestionDisplay) {
                selectedQuestionDisplay.innerHTML = `<span class="text-warning"><i class="fa-solid fa-circle-info me-1"></i>No question linked directly.</span> Select one below, or switch to <strong>Ask as New Question</strong>.`;
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

        updateConnStatus("connecting", "Connecting to Room...");

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateConnStatus("connected", "Connected to Room");
            // Join Room
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
            setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
            console.error("WS Connection error:", err);
        };
    }

    function updateConnStatus(status, text) {
        connStatusText.textContent = text;
        if (status === "connected") {
            connStatusIcon.className = "fa-solid fa-circle text-success me-1";
        } else if (status === "connecting") {
            connStatusIcon.className = "fa-solid fa-circle-notch fa-spin text-warning me-1";
        } else {
            connStatusIcon.className = "fa-solid fa-circle-xmark text-danger me-1";
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

                // If existing peers are in the room, connect to the first peer
                if (data.peers && data.peers.length > 0) {
                    activePeersCounter.innerHTML = `<i class="fa-solid fa-users me-1 text-success"></i>${data.peers.length + 1} in room`;
                    const primaryPeer = data.peers[0];
                    remotePeerId = primaryPeer.peerId;
                    remoteUserName.innerHTML = `<i class="fa-solid fa-user me-1"></i>${escapeHtml(primaryPeer.user.username)}`;
                    remotePlaceholderText.textContent = `Connecting with @${primaryPeer.user.username}...`;

                    // We initiate WebRTC call
                    initiatePeerConnection(remotePeerId, true);
                } else {
                    activePeersCounter.innerHTML = `<i class="fa-solid fa-users me-1 text-primary"></i>1 in room`;
                }
                break;

            case "peer-joined":
                remotePeerId = data.peerId;
                remoteUserName.innerHTML = `<i class="fa-solid fa-user me-1"></i>${escapeHtml(data.user.username)}`;
                remotePlaceholderText.textContent = `Partner joined! Starting video stream...`;
                activePeersCounter.innerHTML = `<i class="fa-solid fa-users me-1 text-success"></i>2 in room`;
                showToast(`🚀 @${data.user.username} joined the Live Debug Room!`);

                // Send our current code so new peer has latest version
                sendCodeChange();

                // Receiver creates peer connection waiting for offer
                initiatePeerConnection(remotePeerId, false);
                break;

            case "webrtc-signal":
                if (data.signal) {
                    handleWebRtcSignal(data.signal, data.fromPeerId);
                }
                break;

            case "code-change":
                isRemoteTyping = true;
                const prevPos = collabCodeInput.selectionStart;
                collabCodeInput.value = data.code;
                updateLineNumbers();
                if (data.lang && data.lang !== editorLangSelect.value) {
                    editorLangSelect.value = data.lang;
                    updateEditorLang(data.lang);
                }
                syncIndicator.innerHTML = `<i class="fa-solid fa-check me-1"></i>Synced from @${escapeHtml(data.fromUser)}`;
                setTimeout(() => {
                    syncIndicator.innerHTML = `<i class="fa-solid fa-cloud-check me-1"></i>Synced`;
                    isRemoteTyping = false;
                }, 800);
                break;

            case "run-code":
                showToast(`▶️ @${data.fromUser} triggered Code Execution`);
                runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;
                setTimeout(() => {
                    executeCode(collabCodeInput.value, false);
                }, 100);
                break;

            case "run-result":
                displayExecutionResults(data.logs, data.duration, data.error);
                runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-play me-1"></i><span>Run Code</span>`;
                break;

            case "chat-message":
                appendChatMessage(data.message, false);
                break;

            case "peer-status":
                if (data.isMuted !== undefined) {
                    remoteAudioStatusIcon.innerHTML = data.isMuted
                        ? `<i class="fa-solid fa-microphone-slash text-danger"></i>`
                        : `<i class="fa-solid fa-microphone text-success"></i>`;
                }
                if (data.isVideoOff !== undefined) {
                    if (data.isVideoOff) {
                        remoteVideoPlaceholder.style.display = "flex";
                        remotePlaceholderText.textContent = "Partner turned off camera";
                    } else {
                        remoteVideoPlaceholder.style.display = "none";
                    }
                }
                break;

            case "peer-left":
                showToast(`Partner left the room.`);
                activePeersCounter.innerHTML = `<i class="fa-solid fa-users me-1 text-primary"></i>1 in room`;
                remoteVideo.srcObject = null;
                remoteVideoPlaceholder.style.display = "flex";
                remotePlaceholderText.textContent = "Partner left. Waiting for partner to join...";
                remoteUserName.innerHTML = `<i class="fa-solid fa-user me-1"></i>Partner`;
                webrtcStatusBadge.textContent = "Waiting";
                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
                break;
        }
    }

    // -------------------------------------------------------------
    // 4. WEBRTC FACE-TO-FACE VIDEO & AUDIO STREAM
    // -------------------------------------------------------------
    async function initLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } },
                audio: true
            });
            localVideo.srcObject = localStream;
            localVideoPlaceholder.style.display = "none";
        } catch (err) {
            console.warn("Could not access camera/mic:", err.name, err.message);
            // Fallback: Audio only or dummy stream
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localVideoPlaceholder.style.display = "flex";
                webrtcStatusBadge.textContent = "Audio Only";
                showToast("🎤 Audio mode active (No camera detected or permission denied)");
            } catch (audioErr) {
                console.warn("No mic found either, running in silent mode:", audioErr);
                localStream = new MediaStream();
                localVideoPlaceholder.style.display = "flex";
                webrtcStatusBadge.textContent = "Avatar Mode";
            }
        }
    }

    function attachTracksToPeerConnection() {
        if (!peerConnection) return;

        // 1. Attach available local tracks
        if (localStream && localStream.getTracks().length > 0) {
            const senders = peerConnection.getSenders();
            localStream.getTracks().forEach((track) => {
                const existing = senders.find(s => s.track && s.track.kind === track.kind);
                if (existing) {
                    existing.replaceTrack(track);
                } else {
                    peerConnection.addTrack(track, localStream);
                }
            });
        }

        // 2. ALWAYS ensure sendrecv transceivers exist for both audio and video
        if (peerConnection.getTransceivers && peerConnection.addTransceiver) {
            const transceivers = peerConnection.getTransceivers();
            const hasAudio = transceivers.some(t => t.receiver && t.receiver.track && t.receiver.track.kind === "audio");
            const hasVideo = transceivers.some(t => t.receiver && t.receiver.track && t.receiver.track.kind === "video");
            if (!hasAudio) {
                try { peerConnection.addTransceiver("audio", { direction: "sendrecv" }); } catch(e){}
            }
            if (!hasVideo) {
                try { peerConnection.addTransceiver("video", { direction: "sendrecv" }); } catch(e){}
            }
        }
    }

    async function processQueuedIceCandidates() {
        if (!peerConnection || !peerConnection.remoteDescription || !peerConnection.remoteDescription.type) return;
        while (iceCandidatesQueue.length > 0) {
            const candidate = iceCandidatesQueue.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn("Queued ICE candidate note:", err);
            }
        }
    }

    function safePlayRemoteVideo() {
        if (!remoteVideo) return;
        const playPromise = remoteVideo.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if (remoteVideoPlaceholder) remoteVideoPlaceholder.style.display = "none";
            }).catch((err) => {
                console.warn("Unmuted autoplay restricted by browser policy. Playing muted fallback:", err);
                remoteVideo.muted = true;
                remoteVideo.play().then(() => {
                    if (remoteVideoPlaceholder) remoteVideoPlaceholder.style.display = "none";
                    if (unmuteAudioBanner) unmuteAudioBanner.style.display = "flex";
                }).catch(e => console.error("Muted play also failed:", e));
            });
        }
    }

    function unmuteRemoteAudio() {
        if (remoteVideo && remoteVideo.muted) {
            remoteVideo.muted = false;
        }
        if (unmuteAudioBanner) {
            unmuteAudioBanner.style.display = "none";
        }
    }

    if (unmuteAudioBanner) {
        unmuteAudioBanner.addEventListener("click", (e) => {
            e.stopPropagation();
            unmuteRemoteAudio();
        });
    }

    document.addEventListener("click", () => {
        unmuteRemoteAudio();
    });

    function initiatePeerConnection(targetId, isCaller) {
        if (targetId) remotePeerId = targetId;

        if (peerConnection) {
            try { peerConnection.close(); } catch(e) {}
            peerConnection = null;
        }

        remoteMediaStream = new MediaStream();
        remoteVideo.srcObject = remoteMediaStream;

        peerConnection = new RTCPeerConnection(rtcConfig);

        // Attach local tracks or transceivers
        attachTracksToPeerConnection();

        // On remote track received (handles both event.streams and unified plan track additions)
        peerConnection.ontrack = (event) => {
            console.log("📹 [WebRTC] Remote track received:", event.track.kind, event.track.id);

            if (!remoteMediaStream) {
                remoteMediaStream = new MediaStream();
            }

            // Always add the incoming track to remoteMediaStream if not already added
            if (!remoteMediaStream.getTracks().some(t => t.id === event.track.id)) {
                remoteMediaStream.addTrack(event.track);
            }

            // Also import any tracks in event.streams[0]
            if (event.streams && event.streams[0]) {
                event.streams[0].getTracks().forEach(t => {
                    if (!remoteMediaStream.getTracks().some(existing => existing.id === t.id)) {
                        remoteMediaStream.addTrack(t);
                    }
                });
            }

            // Bind to remoteVideo
            if (remoteVideo.srcObject !== remoteMediaStream) {
                remoteVideo.srcObject = remoteMediaStream;
            }

            if (remoteVideoPlaceholder) {
                remoteVideoPlaceholder.style.display = "none";
            }
            remoteVideo.style.display = "block";

            // If track was muted, wait for unmute to ensure smooth playback
            event.track.onunmute = () => {
                console.log("🟢 Remote track unmuted and active:", event.track.kind);
                if (remoteVideoPlaceholder) remoteVideoPlaceholder.style.display = "none";
                remoteVideo.style.display = "block";
                safePlayRemoteVideo();
            };

            safePlayRemoteVideo();

            webrtcStatusBadge.textContent = "🟢 Live Call";
            webrtcStatusBadge.style.background = "rgba(34, 197, 94, 0.2)";
            webrtcStatusBadge.style.color = "#4ade80";
        };

        // ICE Candidate generation
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
            const state = peerConnection.connectionState;
            console.log("🔗 WebRTC connection state:", state);
            if (state === "connected") {
                webrtcStatusBadge.textContent = "🟢 P2P Connected";
                webrtcStatusBadge.style.background = "rgba(34, 197, 94, 0.2)";
                webrtcStatusBadge.style.color = "#4ade80";
            } else if (state === "disconnected" || state === "failed") {
                webrtcStatusBadge.textContent = "🟡 Reconnecting";
            }
        };

        // If caller, create SDP Offer
        if (isCaller) {
            peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
                .then((offer) => peerConnection.setLocalDescription(offer))
                .then(() => {
                    ws.send(JSON.stringify({
                        type: "webrtc-signal",
                        targetPeerId: targetId || remotePeerId,
                        signal: { sdp: peerConnection.localDescription }
                    }));
                })
                .catch((e) => console.error("Error creating SDP offer:", e));
        }
    }

    async function handleWebRtcSignal(signal, fromPeerId) {
        if (fromPeerId) {
            remotePeerId = fromPeerId;
        }

        if (signal.sdp) {
            if (!peerConnection) {
                initiatePeerConnection(remotePeerId, false);
            }

            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await processQueuedIceCandidates();

            if (signal.sdp.type === "offer") {
                attachTracksToPeerConnection();

                const answer = await peerConnection.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(answer);

                ws.send(JSON.stringify({
                    type: "webrtc-signal",
                    targetPeerId: remotePeerId,
                    signal: { sdp: peerConnection.localDescription }
                }));
            }
        } else if (signal.candidate) {
            if (!peerConnection || !peerConnection.remoteDescription || !peerConnection.remoteDescription.type) {
                iceCandidatesQueue.push(signal.candidate);
            } else {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } catch (e) {
                    console.warn("ICE candidate add error:", e);
                }
            }
        }
    }

    // Media Controls
    toggleMicBtn.addEventListener("click", () => {
        isMicMuted = !isMicMuted;
        if (localStream) {
            localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
        }
        toggleMicBtn.classList.toggle("is-muted", isMicMuted);
        toggleMicBtn.classList.toggle("is-active", !isMicMuted);
        toggleMicBtn.innerHTML = isMicMuted
            ? `<i class="fa-solid fa-microphone-slash"></i>`
            : `<i class="fa-solid fa-microphone"></i>`;

        localAudioStatusIcon.innerHTML = isMicMuted
            ? `<i class="fa-solid fa-microphone-slash text-danger"></i>`
            : `<i class="fa-solid fa-microphone text-success"></i>`;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "peer-status", isMuted: isMicMuted }));
        }
    });

    toggleCamBtn.addEventListener("click", () => {
        isVideoOff = !isVideoOff;
        if (localStream) {
            localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
        }
        toggleCamBtn.classList.toggle("is-muted", isVideoOff);
        toggleCamBtn.classList.toggle("is-active", !isVideoOff);
        toggleCamBtn.innerHTML = isVideoOff
            ? `<i class="fa-solid fa-video-slash"></i>`
            : `<i class="fa-solid fa-video"></i>`;

        localVideoPlaceholder.style.display = isVideoOff ? "flex" : "none";

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "peer-status", isVideoOff: isVideoOff }));
        }
    });

    toggleScreenBtn.addEventListener("click", async () => {
        if (!isScreenSharing) {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                // Replace video track in peer connection
                if (peerConnection) {
                    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
                    if (sender) sender.replaceTrack(screenTrack);
                }
                localVideo.srcObject = screenStream;
                isScreenSharing = true;
                toggleScreenBtn.classList.add("is-active");

                screenTrack.onended = () => stopScreenShare();
                showToast("🖥️ Screen sharing started");
            } catch (err) {
                console.warn("Screen share cancelled:", err);
            }
        } else {
            stopScreenShare();
        }
    });

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
        localVideo.srcObject = localStream;
        isScreenSharing = false;
        toggleScreenBtn.classList.remove("is-active");
        showToast("Screen sharing stopped");
    }

    // -------------------------------------------------------------
    // 5. SYNCHRONIZED CODE EDITOR & LINE NUMBERS
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

    // Handle Tab Indentation and Enter auto-indent
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

    // Language Selector change
    editorLangSelect.addEventListener("change", () => {
        const lang = editorLangSelect.value;
        updateEditorLang(lang);
        sendCodeChange();
    });

    function updateEditorLang(lang) {
        if (lang === "javascript") {
            fileTabName.textContent = "solution.js";
            fileTabIcon.className = "fa-brands fa-js text-warning me-1";
        } else if (lang === "html") {
            fileTabName.textContent = "index.html";
            fileTabIcon.className = "fa-brands fa-html5 text-danger me-1";
        } else if (lang === "python") {
            fileTabName.textContent = "main.py";
            fileTabIcon.className = "fa-brands fa-python text-info me-1";
        } else if (lang === "css") {
            fileTabName.textContent = "styles.css";
            fileTabIcon.className = "fa-brands fa-css3-alt text-primary me-1";
        } else {
            fileTabName.textContent = "data.json";
            fileTabIcon.className = "fa-solid fa-code text-light me-1";
        }
    }

    // Format code button
    formatCodeBtn.addEventListener("click", () => {
        const raw = collabCodeInput.value;
        const formatted = raw
            .split("\n")
            .map(line => line.replace(/\t/g, "    "))
            .join("\n");
        collabCodeInput.value = formatted;
        updateLineNumbers();
        sendCodeChange();
        showToast("Code formatted with 4-space indentation");
    });

    if (clearCodeBtn) {
        clearCodeBtn.addEventListener("click", () => {
            if (confirm("Clear code editor for both users?")) {
                collabCodeInput.value = "";
                updateLineNumbers();
                sendCodeChange();
            }
        });
    }

    // -------------------------------------------------------------
    // 6. CODE RUNNER & SHARED LIVE CONSOLE
    // -------------------------------------------------------------
    runCollabCodeBtn.addEventListener("click", () => {
        const code = collabCodeInput.value;
        if (!code.trim()) {
            showToast("Editor is empty. Write or paste code first!");
            return;
        }

        runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Running...`;

        // Broadcast run event to partner
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "run-code", roomId: roomId }));
        }

        setTimeout(() => {
            executeCode(code, true);
        }, 80);
    });

    async function executeCode(code, broadcastResults = true) {
        const lang = editorLangSelect.value;

        // If HTML or preview selected, render preview tab
        if (lang === "html" || code.trim().startsWith("<") || panePreview.style.display !== "none") {
            collabPreviewFrame.srcdoc = code;
            tabBtnPreview.click();
            runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-play me-1"></i><span>Run Code</span>`;
            return;
        }

        // Switch to console tab
        tabBtnConsole.click();

        let execution = { logs: [], duration: "0.00", error: null };

        // Use CodeQuestPro sandbox engine if available
        if (window.CodeQuestPro && typeof window.CodeQuestPro.executeJavaScript === "function") {
            execution = await window.CodeQuestPro.executeJavaScript(code, () => {});
        } else {
            // Native fallback evaluation
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
        runCollabCodeBtn.innerHTML = `<i class="fa-solid fa-play me-1"></i><span>Run Code</span>`;

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
        consoleLogsCount.textContent = logs ? logs.length : "0";

        if (collabExecTime) {
            collabExecTime.textContent = `⏱️ ${duration || "0.00"}ms`;
            collabExecTime.style.display = "inline";
        }

        if (!logs || logs.length === 0) {
            consoleLogsList.innerHTML = `
                <div class="collab-log-row">
                    <span class="collab-log-badge log">DONE</span>
                    <span class="collab-log-msg text-success">Code executed cleanly with no stdout output (${duration}ms).</span>
                </div>
            `;
            return;
        }

        logs.forEach(log => {
            const row = document.createElement("div");
            row.className = "collab-log-row";
            row.innerHTML = `
                <span class="collab-log-badge ${log.type}">${(log.type || "LOG").toUpperCase()}</span>
                <span class="collab-log-msg ${log.type === "error" ? "error" : ""}">${escapeHtml(log.text)}</span>
            `;
            consoleLogsList.appendChild(row);
        });
    }

    clearConsoleBtn.addEventListener("click", () => {
        consoleLogsList.innerHTML = `<div class="console-empty-state"><i class="fa-solid fa-circle-check text-muted me-1"></i>Console output cleared.</div>`;
        consoleLogsCount.textContent = "0";
    });

    // Console Tab switching
    tabBtnConsole.addEventListener("click", () => {
        tabBtnConsole.classList.add("active");
        tabBtnPreview.classList.remove("active");
        paneConsole.style.display = "block";
        panePreview.style.display = "none";
    });

    tabBtnPreview.addEventListener("click", () => {
        tabBtnPreview.classList.add("active");
        tabBtnConsole.classList.remove("active");
        paneConsole.style.display = "none";
        panePreview.style.display = "block";
        collabPreviewFrame.srcdoc = collabCodeInput.value;
    });

    // -------------------------------------------------------------
    // 7. PAIR PROGRAMMING CHAT & DEBUG NOTES
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
        bubble.className = `chat-bubble ${isMine ? "mine" : "theirs"}`;
        bubble.innerHTML = `
            ${!isMine ? `<span class="chat-bubble-author">@${escapeHtml(msg.user.username)}</span>` : ""}
            <span>${escapeHtml(msg.text)}</span>
            <span class="chat-bubble-time">${msg.time}</span>
        `;
        chatMessagesContainer.appendChild(bubble);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        // On mobile, if media tab is currently hidden, light up the unread dot
        if (!isMine && mobileUnreadDot && paneCollabMedia && paneCollabMedia.classList.contains("is-mobile-hidden")) {
            mobileUnreadDot.style.display = "inline-block";
        }
    }

    // Quick Chip clicks
    document.querySelectorAll(".btn-quick-chip").forEach(btn => {
        btn.addEventListener("click", () => {
            const msg = btn.dataset.msg;
            chatMessageInput.value = msg;
            chatInputForm.dispatchEvent(new Event("submit"));
        });
    });

    // -------------------------------------------------------------
    // 8. MOBILE VIEW TAB SWITCHING
    // -------------------------------------------------------------
    if (mTabEditor && mTabMedia) {
        mTabEditor.addEventListener("click", () => {
            mTabEditor.classList.add("active");
            mTabMedia.classList.remove("active");
            if (paneCollabEditor) paneCollabEditor.classList.remove("is-mobile-hidden");
            if (paneCollabMedia) paneCollabMedia.classList.add("is-mobile-hidden");
        });

        mTabMedia.addEventListener("click", () => {
            mTabMedia.classList.add("active");
            mTabEditor.classList.remove("active");
            if (paneCollabMedia) paneCollabMedia.classList.remove("is-mobile-hidden");
            if (paneCollabEditor) paneCollabEditor.classList.add("is-mobile-hidden");
            // Clear unread notification dot when opening media/chat tab
            if (mobileUnreadDot) mobileUnreadDot.style.display = "none";
        });
    }

    // -------------------------------------------------------------
    // 9. INVITE LINK & PROFESSIONAL MULTI-MODE PUBLISH MODAL
    // -------------------------------------------------------------
    function copyInviteLink() {
        const link = window.location.href;
        navigator.clipboard.writeText(link).then(() => {
            showToast("🔗 Room invite link copied to clipboard! Share it with a partner.");
        }).catch(() => {
            prompt("Copy this invite link:", link);
        });
    }

    if (copyInviteLinkBtn) copyInviteLinkBtn.addEventListener("click", copyInviteLink);
    if (invitePartnerBtn) invitePartnerBtn.addEventListener("click", copyInviteLink);

    // Track active publish mode ('answer', 'question', 'vault')
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

    // Open Publish Modal
    function openPublishModal() {
        const currentCode = (collabCodeInput ? collabCodeInput.value : "").trim();
        if (exportCodePreview) {
            exportCodePreview.value = currentCode || "// Collaborative code snippet\nconsole.log('Ready to publish');";
        }

        // If no question is linked and dropdown has not been chosen, switch to 'Ask as Question' tab
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
        publishSolutionBtn.addEventListener("click", () => {
            openPublishModal();
        });
    }

    // Auto-update target question display when user picks from dropdown
    if (chooseQuestionSelect) {
        chooseQuestionSelect.addEventListener("change", () => {
            if (chooseQuestionSelect.value) {
                const selectedText = chooseQuestionSelect.options[chooseQuestionSelect.selectedIndex].text;
                if (selectedQuestionDisplay) {
                    selectedQuestionDisplay.innerHTML = `<span class="badge bg-success me-2"><i class="fa-solid fa-check me-1"></i>Selected:</span> <strong>${escapeHtml(selectedText)}</strong>`;
                }
            }
        });
    }

    // Confirm Publish / Export
    if (confirmPublishBtn) {
        confirmPublishBtn.addEventListener("click", async () => {
            const code = (exportCodePreview ? exportCodePreview.value : (collabCodeInput ? collabCodeInput.value : "")).trim();
            if (!code) {
                alert("Please enter or review your code snippet before publishing.");
                if (exportCodePreview) exportCodePreview.focus();
                return;
            }
            const lang = editorLangSelect ? editorLangSelect.value : "javascript";

            // MODE 1: Post as Answer to target question
            if (currentPublishMode === "answer") {
                const targetQId = questionId || (chooseQuestionSelect ? chooseQuestionSelect.value : null);
                if (!targetQId) {
                    alert("Please select a question from the dropdown to answer, or switch to the 'Ask as New Question' tab!");
                    if (chooseQuestionSelect) chooseQuestionSelect.focus();
                    return;
                }

                const notes = exportNotesInput ? exportNotesInput.value.trim() : "";
                confirmPublishBtn.disabled = true;
                confirmPublishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Posting Answer...`;

                try {
                    const res = await fetch("/api/collab/export-answer", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ questionId: targetQId, code, lang, notes })
                    });

                    const data = await res.json();
                    if (res.ok && data.success) {
                        showToast("🎉 Solution successfully exported and posted as an answer!");
                        if (exportModalInstance) exportModalInstance.hide();
                        sessionStorage.setItem("selectedQuestionId", targetQId);
                        setTimeout(() => {
                            window.location.href = `messageDetails.html?questionId=${encodeURIComponent(targetQId)}&id=${encodeURIComponent(targetQId)}`;
                        }, 1000);
                    } else {
                        alert(data.error || "Failed to post answer.");
                    }
                } catch (err) {
                    console.error("Export error:", err);
                    alert("Error posting answer. Please check your network.");
                } finally {
                    confirmPublishBtn.disabled = false;
                    confirmPublishBtn.innerHTML = `<i class="fa-solid fa-check me-1"></i><span id="confirmPublishBtnText">Post as Answer</span>`;
                }

            // MODE 2: Ask as New Question
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
                confirmPublishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Creating Question...`;

                try {
                    const res = await fetch("/api/collab/export-question", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ title, code, lang, tags, description })
                    });

                    const data = await res.json();
                    if (res.ok && data.success && data.questionId) {
                        showToast("🚀 Question successfully created and published!");
                        if (exportModalInstance) exportModalInstance.hide();
                        sessionStorage.setItem("selectedQuestionId", data.questionId);
                        setTimeout(() => {
                            window.location.href = `messageDetails.html?questionId=${encodeURIComponent(data.questionId)}&id=${encodeURIComponent(data.questionId)}`;
                        }, 1000);
                    } else {
                        alert(data.error || "Failed to create question.");
                    }
                } catch (err) {
                    console.error("Question creation error:", err);
                    alert("Error creating question. Please check your network.");
                } finally {
                    confirmPublishBtn.disabled = false;
                    confirmPublishBtn.innerHTML = `<i class="fa-solid fa-check me-1"></i><span id="confirmPublishBtnText">Ask as Question</span>`;
                }

            // MODE 3: Save to Vault
            } else if (currentPublishMode === "vault") {
                if (window.CodeQuestPro && window.CodeQuestPro.CodeVault && typeof window.CodeQuestPro.CodeVault.save === "function") {
                    const snippetTitle = (collabQuestionBanner && bannerQuestionTitle && bannerQuestionTitle.textContent && !bannerQuestionTitle.textContent.startsWith("Loading"))
                        ? bannerQuestionTitle.textContent
                        : `Live Collab - ${roomId} (${lang.toUpperCase()})`;
                    window.CodeQuestPro.CodeVault.save(snippetTitle, code, lang);
                    showToast("💾 Snippet successfully saved to your personal Code Vault!");
                    if (exportModalInstance) exportModalInstance.hide();
                } else {
                    try {
                        const vault = JSON.parse(localStorage.getItem("codequest_vault") || "[]");
                        vault.push({
                            id: "vault_" + Date.now(),
                            title: `Live Collab - ${roomId} (${lang.toUpperCase()})`,
                            code: code,
                            lang: lang,
                            createdAt: new Date().toISOString()
                        });
                        localStorage.setItem("codequest_vault", JSON.stringify(vault));
                        showToast("💾 Saved to your personal Code Vault!");
                        if (exportModalInstance) exportModalInstance.hide();
                    } catch (e) {
                        showToast("Saved locally!");
                    }
                }
            }
        });
    }

    // Helper: Toast notifications
    function showToast(msg) {
        if (window.CodeQuestPro && typeof window.CodeQuestPro.showAppToast === "function") {
            window.CodeQuestPro.showAppToast(msg);
        } else {
            console.log("🔔 [CodeQuest Collab]", msg);
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

    // -------------------------------------------------------------
    // 9. STARTUP ENTRY POINT
    // -------------------------------------------------------------
    async function start() {
        await initUser();
        updateLineNumbers();
        await initLocalMedia();
        connectWebSocket();
    }

    start();

})();
