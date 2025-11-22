const socket = io();
const video = document.getElementById("mainVideo");
const videoInput = document.getElementById("videoInput");
const statusSpan = document.getElementById("status");
const connectionStatus = document.getElementById("connectionStatus");
const connectionText = connectionStatus.querySelector(".text");

// Chat Elements
const chatMessages = document.getElementById("chatMessages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const myUsernameSpan = document.getElementById("myUsername");
const myAvatarDiv = document.getElementById("myAvatar");

const chatOverlay = document.getElementById("chatOverlay");
const videoContainer = document.getElementById("videoContainer");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");

let myUsername = "";
let hostId = null;
let peers = {}; // Keep track of peer connections
let amIHost = false;
let localStream = null;

// --- Start Overlay Handling ---
startBtn.addEventListener("click", () => {
  startOverlay.classList.add("hidden");
  // If we are viewer, this click allows us to play the incoming stream
  if (!amIHost && video.srcObject) {
    video.muted = false; // Unmute when user interacts
    video
      .play()
      .then(() => {
        statusSpan.textContent = "Playing Stream 🔴";
      })
      .catch((e) => {
        console.error("Play failed", e);
        statusSpan.textContent = "Play failed. Try clicking again.";
        startOverlay.classList.remove("hidden");
      });
  }
});

// --- Socket Connection ---
socket.on("connect", () => {
  connectionStatus.classList.add("connected");
  connectionText.textContent = "Connected";
  statusSpan.textContent = "Connected to server...";

  // Check if using localhost
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    alert(
      "⚠️ WARNING: You are on 'localhost'.\n\nFor mobile devices to connect, you MUST use your computer's IP address (e.g., 192.168.x.x) instead of localhost."
    );
    statusSpan.textContent = "⚠️ Please use Network IP (not localhost)";
    statusSpan.style.color = "red";
  }
});

socket.on("welcome", (data) => {
  myUsername = data.username;
  myUsernameSpan.textContent = myUsername;
  if (myUsername) myAvatarDiv.textContent = myUsername.charAt(0).toUpperCase();

  hostId = data.hostId;
  updateHostStatus();

  // If there is already a host, initiate connection
  if (hostId && hostId !== socket.id) {
    // Check if we are on the same domain/IP as the host (rough check)
    // We can't know the host's URL for sure, but we can warn the user.
    statusSpan.textContent = "Found Host. Connecting P2P...";
    createPeer(hostId, true); // I am initiator (Viewer connects to Host)
  }
});

socket.on("hostChanged", (data) => {
  hostId = data.hostId;
  updateHostStatus();
  if (hostId && hostId !== socket.id) {
    statusSpan.textContent = "New Host found. Connecting...";
    createPeer(hostId, true);
  }
});

socket.on("hostLeft", () => {
  hostId = null;
  updateHostStatus();
  if (video.srcObject) {
    video.srcObject = null;
  }
  statusSpan.textContent = "Host left. Waiting for new host...";
  // Destroy all peers
  Object.values(peers).forEach((p) => p.destroy());
  peers = {};
});

socket.on("disconnect", () => {
  connectionStatus.classList.remove("connected");
  connectionText.textContent = "Disconnected";
});

function updateHostStatus() {
  if (hostId === socket.id) {
    amIHost = true;
    statusSpan.textContent = "You are the Host 👑";
  } else if (hostId) {
    amIHost = false;
    statusSpan.textContent = "Watching Stream 🍿";
  } else {
    amIHost = false;
    statusSpan.textContent = "No Host. Upload a movie to host!";
  }
}

// --- WebRTC Logic ---

function createPeer(targetId, initiator) {
  if (peers[targetId]) {
    peers[targetId].destroy();
  }

  console.log(`Creating peer to ${targetId}, initiator: ${initiator}`);
  statusSpan.textContent = initiator
    ? "Initiating connection..."
    : "Responding to connection...";

  const p = new SimplePeer({
    initiator: initiator,
    // trickle: false, // Commented out to enable Trickle ICE (faster/more reliable)
    stream: localStream, // Only host has a stream initially
    config: {
      iceServers: [], // No STUN servers = Local Network Only
    },
  });

  p.on("signal", (data) => {
    console.log("SIGNAL", JSON.stringify(data));
    statusSpan.textContent = `Sending signal (${data.type || "candidate"})...`;
    socket.emit("signal", { to: targetId, signal: data });
  });

  p.on("connect", () => {
    console.log("P2P Connection Established");
    statusSpan.textContent = "P2P Connected! Waiting for data...";
  });

  p.on("stream", (stream) => {
    // Viewers receive stream here
    console.log("Received stream from host", stream);

    // Mobile browser hacks
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    video.srcObject = stream;
    video.muted = true; // Mute initially to allow autoplay on mobile

    // Wait for metadata to confirm we have video
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width === 0 || height === 0) {
        statusSpan.textContent = "⚠️ Stream active but empty (0x0)";
      } else {
        statusSpan.textContent = `Stream Ready: ${width}x${height}`;
        attemptPlay();
      }
    };

    function attemptPlay() {
      video
        .play()
        .then(() => {
          statusSpan.textContent = "Playing Stream 🔴 (Tap to Unmute)";
          startOverlay.classList.add("hidden");
        })
        .catch((e) => {
          console.log("Autoplay blocked", e);
          statusSpan.textContent = "Tap 'Click to Join' to watch!";
          startOverlay.classList.remove("hidden"); // Show overlay if autoplay blocked
        });
    }

    // Fallback: If it doesn't play after 1s, try again
    setTimeout(attemptPlay, 1000);
  });

  p.on("close", () => {
    delete peers[targetId];
  });

  p.on("error", (err) => {
    console.error("Peer error:", err);
    delete peers[targetId];
  });

  peers[targetId] = p;
}

socket.on("signal", (data) => {
  // If we are host, and a viewer signals us, we create a peer (non-initiator)
  if (amIHost && !peers[data.from]) {
    if (!localStream) {
      console.error("Received signal but no local stream to share!");
      statusSpan.textContent = "Error: No stream to share!";
      return;
    }
    createPeer(data.from, false);
  }

  if (peers[data.from]) {
    console.log(
      "Received signal from",
      data.from,
      data.signal.type || "candidate"
    );
    peers[data.from].signal(data.signal);
  }
});

// --- Video Upload / Host Logic ---
videoInput.addEventListener("change", async () => {
  const file = videoInput.files[0];
  if (!file) return;

  console.log("File selected:", file.name);

  // 1. Play file locally
  const url = URL.createObjectURL(file);
  video.src = url;
  video.loop = true; // Loop video so stream doesn't end unexpectedly

  try {
    await video.play();
    console.log("Video playing locally");
  } catch (e) {
    console.error("Local play failed:", e);
    alert("Could not play video locally. Please try again.");
    return;
  }

  statusSpan.textContent = `Hosting: ${file.name} (Keep tab active!)`;

  // 2. Capture Stream (Canvas Method for better compatibility)
  // We use a canvas to draw the video and capture the stream from there.
  // This fixes "black screen" issues caused by unsupported codecs or high resolutions.

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Cap resolution to 720p for mobile performance & bandwidth
  const MAX_WIDTH = 1280;
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  canvas.width = video.videoWidth * scale;
  canvas.height = video.videoHeight * scale;

  console.log(
    `Capturing at ${canvas.width}x${canvas.height} (Scale: ${scale})`
  );

  // Draw loop
  function drawStep() {
    if (!video.paused && !video.ended) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(drawStep);
  }
  drawStep();

  // Capture video from canvas at 30 FPS
  const stream = canvas.captureStream(30);

  // Capture audio from the original video element
  try {
    let audioStream;
    if (video.captureStream) {
      audioStream = video.captureStream();
    } else if (video.mozCaptureStream) {
      audioStream = video.mozCaptureStream();
    }

    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log("Added audio track to stream");
        stream.addTrack(audioTracks[0]);
      } else {
        console.warn("No audio tracks found in video stream");
      }
    }
  } catch (e) {
    console.error("Error capturing audio:", e);
  }

  localStream = stream;

  if (localStream.getVideoTracks().length === 0) {
    alert("Warning: No video tracks captured! Stream might be black.");
  }

  console.log("Stream captured", localStream);

  // 3. Announce we are host
  socket.emit("becomeHost");
  amIHost = true;
  hostId = socket.id;
  updateHostStatus();
});

// --- Chat Handling ---
function appendMessage(data) {
  const div = document.createElement("div");
  div.classList.add("message");

  if (data.type === "system") {
    div.classList.add("system");
    div.innerHTML = `<span>${data.text}</span>`;
  } else {
    div.classList.add("user");
    if (data.username === myUsername) {
      div.classList.add("own");
    }

    const author = document.createElement("span");
    author.classList.add("message-author");
    author.textContent = data.username || "Anonymous";

    const text = document.createElement("div");
    text.textContent = data.text;

    div.appendChild(author);
    div.appendChild(text);
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (data.type !== "system") {
    showOverlayMessage(data);
  }
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (text) {
    socket.emit("chatMessage", text);
    msgInput.value = "";
  }
}

socket.on("chatMessage", (data) => {
  appendMessage(data);
});

// --- Full Screen Handling ---
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    videoContainer.requestFullscreen().catch((err) => {
      console.log(
        `Error attempting to enable full-screen mode: ${err.message} (${err.name})`
      );
    });
  } else {
    document.exitFullscreen();
  }
});

// --- Chat Overlay Handling ---
function showOverlayMessage(data) {
  const div = document.createElement("div");
  div.classList.add("overlay-message");

  const authorSpan = document.createElement("span");
  authorSpan.classList.add("author");
  authorSpan.textContent = data.username || "System";

  const textSpan = document.createElement("span");
  textSpan.textContent = data.text;

  div.appendChild(authorSpan);
  div.appendChild(textSpan);

  chatOverlay.appendChild(div);

  setTimeout(() => {
    if (div.parentNode) {
      div.parentNode.removeChild(div);
    }
  }, 6000);
}
