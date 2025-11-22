const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Random Name Generator
const adjectives = [
  "Happy",
  "Cool",
  "Super",
  "Fast",
  "Quiet",
  "Loud",
  "Brave",
  "Calm",
  "Mystic",
  "Neon",
];
const nouns = [
  "Panda",
  "Tiger",
  "Eagle",
  "Lion",
  "Bear",
  "Wolf",
  "Fox",
  "Cat",
  "Dragon",
  "Phoenix",
];

function getRandomName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj} ${noun} ${num}`;
}

// Configure Multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Always save as 'current_movie.mp4' to keep it simple for this demo
    // In a real app, you'd manage multiple files/rooms
    cb(null, "current_movie" + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Serve static files from 'public' directory
app.use(express.static("public"));
// Serve uploaded files from 'uploads' directory
app.use("/uploads", express.static("uploads"));

// Upload endpoint
app.post("/upload", upload.single("videoFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  // Notify all clients that a new video is available
  const videoUrl = `/uploads/${req.file.filename}`;
  io.emit("videoUploaded", { url: videoUrl, filename: req.file.originalname });
  res.json({ message: "File uploaded successfully", url: videoUrl });
});

// Current state of the video room
let currentState = {
  isPlaying: false,
  currentTime: 0,
  timestamp: Date.now(),
};

const users = {};

io.on("connection", (socket) => {
  const username = getRandomName();
  users[socket.id] = username;
  console.log(`User connected: ${username}`);

  // Send current state to new user
  socket.emit("syncState", currentState);
  socket.emit("welcome", { username: username });

  // Notify others
  socket.broadcast.emit("chatMessage", {
    type: "system",
    text: `${username} joined the party!`,
  });

  // Check if a video exists and tell the new user
  const uploadDir = "uploads";
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir);
    const videoFile = files.find((f) => f.startsWith("current_movie"));
    if (videoFile) {
      socket.emit("videoUploaded", {
        url: `/uploads/${videoFile}`,
        filename: "Current Movie",
      });
    }
  }

  // Handle Play
  socket.on("play", (time) => {
    currentState.isPlaying = true;
    currentState.currentTime = time;
    currentState.timestamp = Date.now();
    socket.broadcast.emit("play", time);
  });

  // Handle Pause
  socket.on("pause", (time) => {
    currentState.isPlaying = false;
    currentState.currentTime = time;
    currentState.timestamp = Date.now();
    socket.broadcast.emit("pause", time);
  });

  // Handle Seek
  socket.on("seek", (time) => {
    currentState.currentTime = time;
    currentState.timestamp = Date.now();
    socket.broadcast.emit("seek", time);
  });

  // Handle Sync Request (optional, for drift correction)
  socket.on("syncRequest", (time) => {
    // Logic to handle drift if needed
  });

  // Handle Chat
  socket.on("chatMessage", (msg) => {
    const user = users[socket.id] || "Anonymous";
    console.log(`Chat from ${user}: ${msg}`);
    io.emit("chatMessage", {
      type: "user",
      username: user,
      text: msg,
      timestamp: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    console.log(`User disconnected: ${user}`);
    delete users[socket.id];
    io.emit("chatMessage", {
      type: "system",
      text: `${user} left the party.`,
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);

  // Get local IP address
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (interface.family === "IPv4" && !interface.internal) {
        console.log(`Network URL: http://${interface.address}:${PORT}`);
      }
    }
  }
});
