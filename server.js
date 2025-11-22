const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
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

// Serve static files from 'public' directory
app.use(express.static("public"));

// Current state
let hostId = null;
const users = {};

io.on("connection", (socket) => {
  const username = getRandomName();
  users[socket.id] = username;
  console.log(`User connected: ${username}`);

  // Send welcome message
  socket.emit("welcome", { username: username, hostId: hostId });

  // Notify others
  socket.broadcast.emit("chatMessage", {
    type: "system",
    text: `${username} joined the party!`,
  });

  // If this user becomes a host
  socket.on("becomeHost", () => {
    hostId = socket.id;
    socket.broadcast.emit("hostChanged", { hostId: hostId });
    console.log(`New host: ${username} (${hostId})`);

    io.emit("chatMessage", {
      type: "system",
      text: `${username} is now hosting a movie!`,
    });
  });

  // WebRTC Signaling
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", {
      signal: data.signal,
      from: socket.id,
    });
  });

  // Handle Chat
  socket.on("chatMessage", (msg) => {
    const user = users[socket.id] || "Anonymous";
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

    if (socket.id === hostId) {
      hostId = null;
      io.emit("hostLeft");
      io.emit("chatMessage", {
        type: "system",
        text: `The host ${user} left. Stream ended.`,
      });
    } else {
      io.emit("chatMessage", {
        type: "system",
        text: `${user} left the party.`,
      });
    }
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
