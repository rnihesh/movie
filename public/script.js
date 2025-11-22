const socket = io();
const video = document.getElementById("mainVideo");
const videoInput = document.getElementById("videoInput");
const uploadBtn = document.getElementById("uploadBtn");
const statusSpan = document.getElementById("status");
const connectionStatus = document.getElementById("connectionStatus");

// Chat Elements
const chatMessages = document.getElementById("chatMessages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const myUsernameSpan = document.getElementById("myUsername");

let isRemoteUpdate = false; // Flag to prevent infinite loops
let myUsername = "";

// --- Socket Connection ---
socket.on("connect", () => {
  connectionStatus.textContent = "Connected";
  connectionStatus.classList.add("connected");
});

socket.on("welcome", (data) => {
  myUsername = data.username;
  myUsernameSpan.textContent = myUsername;
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "Disconnected";
  connectionStatus.classList.remove("connected");
});

// --- Chat Handling ---
function appendMessage(data) {
  console.log("Appending message:", data);
  const div = document.createElement("div");
  div.classList.add("message");

  if (data.type === "system") {
    div.classList.add("system");
    div.textContent = data.text;
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

// --- Video Upload Handling ---
uploadBtn.addEventListener("click", () => {
  const file = videoInput.files[0];
  if (!file) {
    alert("Please select a file first");
    return;
  }

  const formData = new FormData();
  formData.append("videoFile", file);

  statusSpan.textContent = "Starting upload...";
  uploadBtn.disabled = true;

  const xhr = new XMLHttpRequest();
  const startTime = Date.now();

  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;

      // Calculate speed
      const timeElapsed = (Date.now() - startTime) / 1000; // in seconds
      const uploadSpeed = event.loaded / timeElapsed; // bytes per second

      // Format speed
      let speedText = "";
      if (uploadSpeed > 1024 * 1024) {
        speedText = (uploadSpeed / (1024 * 1024)).toFixed(2) + " MB/s";
      } else {
        speedText = (uploadSpeed / 1024).toFixed(2) + " KB/s";
      }

      statusSpan.textContent = `Uploading: ${percentComplete.toFixed(
        1
      )}% (${speedText})`;
    }
  });

  xhr.addEventListener("load", () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      statusSpan.textContent = "Upload complete!";
      videoInput.value = ""; // Clear input
    } else {
      statusSpan.textContent = "Upload failed.";
    }
    uploadBtn.disabled = false;
  });

  xhr.addEventListener("error", () => {
    console.error("Error uploading");
    statusSpan.textContent = "Error uploading.";
    uploadBtn.disabled = false;
  });

  xhr.open("POST", "/upload");
  xhr.send(formData);
});

socket.on("videoUploaded", (data) => {
  console.log("New video received:", data);
  const currentTime = video.currentTime;
  const isPlaying = !video.paused;

  video.src = data.url;
  statusSpan.textContent = `Playing: ${data.filename}`;

  // Optional: Try to restore state if it was just a reload,
  // but usually a new upload means start fresh.
});

// --- Synchronization Logic ---

// 1. Play
video.addEventListener("play", () => {
  if (!isRemoteUpdate) {
    socket.emit("play", video.currentTime);
  }
});

socket.on("play", (time) => {
  isRemoteUpdate = true;
  // Sync time if drift is significant (> 0.5s)
  if (Math.abs(video.currentTime - time) > 0.5) {
    video.currentTime = time;
  }
  video
    .play()
    .then(() => {
      isRemoteUpdate = false;
    })
    .catch((e) => {
      console.log("Autoplay prevented or error:", e);
      isRemoteUpdate = false;
    });
});

// 2. Pause
video.addEventListener("pause", () => {
  if (!isRemoteUpdate) {
    socket.emit("pause", video.currentTime);
  }
});

socket.on("pause", (time) => {
  isRemoteUpdate = true;
  video.pause();
  if (Math.abs(video.currentTime - time) > 0.5) {
    video.currentTime = time;
  }
  isRemoteUpdate = false;
});

// 3. Seek
video.addEventListener("seeked", () => {
  if (!isRemoteUpdate) {
    // We use 'seeked' instead of 'seeking' to avoid flooding events
    socket.emit("seek", video.currentTime);
  }
});

socket.on("seek", (time) => {
  isRemoteUpdate = true;
  video.currentTime = time;
  // After seeking, we might need to ensure play state is correct,
  // but usually play/pause events handle that separately.
  // However, setting currentTime might trigger 'seeked' locally,
  // so we need to be careful with the flag.
  // The 'seeked' event fires after currentTime is set.
  // We reset the flag in a small timeout or listen for the event once.

  // Better approach for seek flag reset:
  const onSeeked = () => {
    isRemoteUpdate = false;
    video.removeEventListener("seeked", onSeeked);
  };
  video.addEventListener("seeked", onSeeked);
});

// 4. Initial Sync / State Update
socket.on("syncState", (state) => {
  console.log("Syncing state:", state);
  if (state.isPlaying) {
    // Calculate time elapsed since the state was captured
    const timeDiff = (Date.now() - state.timestamp) / 1000;
    video.currentTime = state.currentTime + timeDiff;

    isRemoteUpdate = true;
    video
      .play()
      .then(() => (isRemoteUpdate = false))
      .catch(() => (isRemoteUpdate = false));
  } else {
    video.currentTime = state.currentTime;
    isRemoteUpdate = true;
    video.pause();
    isRemoteUpdate = false;
  }
});
