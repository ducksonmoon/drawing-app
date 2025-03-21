// Get RxJS from the UMD bundle
const { fromEvent, merge } = rxjs;
const { map, switchMap, takeUntil, tap, filter, share, pairwise, startWith } =
  rxjs.operators;

// Set up canvas and context
const canvas = document.getElementById("drawing-canvas");
const context = canvas.getContext("2d");
const usersElement = document.getElementById("users");
const clearButton = document.getElementById("clear-btn");
const myColorElement = document.getElementById("my-color");

// Socket.io is loaded from the server
const socket = io();

// Set the canvas size to match its display size
function setupCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 3;
}

// Set up the canvas when page loads and when window resizes
window.addEventListener("load", setupCanvas);
window.addEventListener("resize", setupCanvas);

// Keep track of our user
let myColor;
let myUserId;
let users = {};

// Process drawing events from the server
socket.on("draw", drawLine);

// Process initial state when connecting
socket.on("init", (data) => {
  // Save user info
  myUserId = socket.id;
  myColor = data.users[myUserId].color;
  users = data.users;

  // Display my color
  myColorElement.textContent = myColor;
  myColorElement.style.color = myColor;

  // Draw the existing drawing
  data.drawHistory.forEach(drawLine);

  // Update the user list
  updateUserList();
});

// Handle user joining
socket.on("userJoined", (user) => {
  users[user.id] = user;
  updateUserList();
});

// Handle user leaving
socket.on("userLeft", (userId) => {
  delete users[userId];
  updateUserList();
});

// Handle user state change (drawing or not)
socket.on("userStateChanged", (data) => {
  users[data.userId].isDrawing = data.isDrawing;
  updateUserList();
});

// Clear button handler
clearButton.addEventListener("click", () => {
  // Clear locally
  context.clearRect(0, 0, canvas.width, canvas.height);
  // Tell server to clear for everyone
  socket.emit("clearCanvas");
});

// Server tells us to clear
socket.on("clearCanvas", () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
});

// Draw a line segment based on coordinates
function drawLine(data) {
  context.strokeStyle = data.color;
  context.beginPath();
  context.moveTo(data.prevX, data.prevY);
  context.lineTo(data.currX, data.currY);
  context.stroke();
}

// Update the user list display
function updateUserList() {
  usersElement.innerHTML = "";
  Object.values(users).forEach((user) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="user-color" style="background-color: ${user.color}"></span>
      <span class="${user.isDrawing ? "user-drawing" : ""}">${
      user.id === myUserId ? "You" : `User ${user.id.substr(0, 5)}`
    }</span>
      ${user.isDrawing ? " (drawing)" : ""}
    `;
    usersElement.appendChild(li);
  });
}

// Now for the reactive part!
// Let's create observables from mouse events on the canvas
const mouseMove$ = fromEvent(canvas, "mousemove");
const mouseDown$ = fromEvent(canvas, "mousedown");
const mouseUp$ = fromEvent(canvas, "mouseup");
const mouseLeave$ = fromEvent(canvas, "mouseleave");

// This is where reactive programming really shines for drawing apps
// We'll track mouse movements while the mouse is down
const drawing$ = mouseDown$.pipe(
  tap(() => {
    // Tell everyone we're drawing
    socket.emit("drawingState", true);
  }),
  // switchMap lets us switch to a new observable sequence
  switchMap((down) => {
    // Create a starting point object
    const startPoint = {
      offsetX: down.offsetX,
      offsetY: down.offsetY
    };
    
    return mouseMove$.pipe(
      // Start with the initial point to connect properly
      startWith(startPoint),
      // Use pairwise to get previous and current points together
      pairwise(),
      // Map to the drawing format
      map(([prev, curr]) => ({
        prevX: prev.offsetX,
        prevY: prev.offsetY,
        currX: curr.offsetX,
        currY: curr.offsetY
      })),
      takeUntil(merge(mouseUp$, mouseLeave$))
    );
  }),
  // This is important! Share makes this a hot observable
  // so multiple subscribers don't recreate the events
  share()
);

// When we finish drawing
merge(mouseUp$, mouseLeave$).subscribe(() => {
  socket.emit("drawingState", false);
});

// Subscribe to the drawing stream
drawing$.subscribe((coords) => {
  // Draw locally
  drawLine({
    ...coords,
    color: myColor,
  });

  // Emit to the server
  socket.emit("draw", coords);
});

// Debug when we connect/disconnect
socket.on("connect", () => console.log("Connected to server"));
socket.on("disconnect", () => console.log("Disconnected from server"));