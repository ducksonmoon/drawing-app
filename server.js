const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

// Create our Express app, HTTP server, and Socket.io server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Keep track of all drawing points to replay for new users
let drawHistory = [];
// Keep track of connected users
let users = {};

// When a client connects
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Create a random color for this user
  const color = getRandomColor();
  users[socket.id] = {
    id: socket.id,
    color,
    isDrawing: false,
  };

  // Send the current state to the new user
  socket.emit("init", {
    drawHistory,
    users,
  });

  // Let everyone know about the new user
  io.emit("userJoined", users[socket.id]);

  // When user sends draw data
  socket.on("draw", (data) => {
    data.color = users[socket.id].color;
    data.userId = socket.id;

    // Store in history (so new users can see existing drawing)
    drawHistory.push(data);

    // Keep history from getting too big
    if (drawHistory.length > 1000) {
      drawHistory = drawHistory.slice(drawHistory.length - 1000);
    }

    // Send to all OTHER clients (broadcasting)
    socket.broadcast.emit("draw", data);
  });

  // When user starts/stops drawing
  socket.on("drawingState", (isDrawing) => {
    users[socket.id].isDrawing = isDrawing;
    io.emit("userStateChanged", { userId: socket.id, isDrawing });
  });

  // Handle clear canvas request
  socket.on("clearCanvas", () => {
    // Clear the drawing history
    drawHistory = [];
    // Broadcast to all clients to clear their canvases
    io.emit("clearCanvas");
  });

  // When user disconnects
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    delete users[socket.id];
    io.emit("userLeft", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Helper to generate random colors
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}