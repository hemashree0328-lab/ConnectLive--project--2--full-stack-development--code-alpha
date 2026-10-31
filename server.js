const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data");
const UPLOADS = path.join(__dirname, "uploads");
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });
const USERS = path.join(DATA, "users.json");
if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, "{}");
const readUsers = () => JSON.parse(fs.readFileSync(USERS, "utf8"));
const writeUsers = u => fs.writeFileSync(USERS, JSON.stringify(u, null, 2));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 24*60*60*1000 }
});
app.use(express.json({ limit: "1mb" }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/me", (req,res) => res.json({ user: req.session.user || null }));

app.post("/api/register", async (req,res) => {
  const { username, password } = req.body || {};
  if (!username || !password || username.trim().length < 2 || password.length < 8)
    return res.status(400).json({ error: "Use a name (2+ characters) and password (8+ characters)." });
  const users = readUsers(), key = username.trim().toLowerCase();
  if (users[key]) return res.status(409).json({ error: "That username already exists." });
  users[key] = { username: username.trim(), hash: await bcrypt.hash(password, 12) };
  writeUsers(users); req.session.user = { username: users[key].username };
  res.json({ user: req.session.user });
});
app.post("/api/login", async (req,res) => {
  const { username, password } = req.body || {};
  const user = readUsers()[(username || "").trim().toLowerCase()];
  if (!user || !await bcrypt.compare(password || "", user.hash))
    return res.status(401).json({ error: "Incorrect username or password." });
  req.session.user = { username: user.username };
  res.json({ user: req.session.user });
});
app.post("/api/logout", (req,res) => req.session.destroy(() => res.json({ ok: true })));

const storage = multer.diskStorage({
  destination: (_,__,cb) => cb(null, UPLOADS),
  filename: (_,file,cb) => cb(null, crypto.randomBytes(12).toString("hex") + path.extname(file.originalname).slice(0,10))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
app.post("/api/upload", (req,res,next) => {
  if (!req.session.user) return res.status(401).json({ error: "Log in first." });
  next();
}, upload.single("file"), (req,res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a file." });
  const room = String(req.body.room || "");
  if (!room || !roomMembers.has(room)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Meeting room not found." });
  }
  const item = { name: req.file.originalname, url: "/uploads/" + req.file.filename, by: req.session.user.username };
  io.to(room).emit("file-shared", item);
  res.json(item);
});
app.use("/uploads", (req,res,next) => {
  // Files are shared through unguessable names; production should use authenticated,
  // room-scoped download authorization and malware scanning.
  next();
}, express.static(UPLOADS));

const wrap = middleware => (socket,next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use((socket,next) => socket.request.session?.user ? next() : next(new Error("Please log in first.")));

const roomMembers = new Map();
io.on("connection", socket => {
  const username = socket.request.session.user.username;
  socket.on("join-room", room => {
    room = String(room || "").trim().slice(0,40);
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(room)) return socket.emit("app-error", "Room ID must be 3–40 letters, numbers, _ or -.");
    socket.join(room);
    if (!roomMembers.has(room)) roomMembers.set(room, new Set());
    const members = roomMembers.get(room);
    const peers = [...members].map(id => ({ id, username: io.sockets.sockets.get(id)?.request.session.user.username || "Guest" }));
    socket.emit("room-peers", peers);
    members.add(socket.id);
    socket.data.room = room;
    socket.data.username = username;
    socket.to(room).emit("peer-joined", { id: socket.id, username });
    io.to(room).emit("system-message", `${username} joined the meeting`);
  });
  socket.on("leave-room", () => leave(socket));
  socket.on("signal", ({ to, data }) => {
    if (typeof to === "string" && socket.data.room && io.sockets.sockets.get(to)?.data.room === socket.data.room)
      io.to(to).emit("signal", { from: socket.id, data });
  });
  socket.on("chat-message", message => {
    if (!socket.data.room || typeof message !== "string") return;
    const clean = message.trim().slice(0,1000);
    if (clean) io.to(socket.data.room).emit("chat-message", { username, message: clean, at: new Date().toISOString() });
  });
  socket.on("whiteboard-draw", data => {
    if (socket.data.room) socket.to(socket.data.room).emit("whiteboard-draw", data);
  });
  socket.on("whiteboard-clear", () => {
    if (socket.data.room) socket.to(socket.data.room).emit("whiteboard-clear");
  });
  socket.on("disconnect", () => leave(socket));
});
function leave(socket) {
  const room = socket.data.room;
  if (!room) return;
  const members = roomMembers.get(room);
  if (members) {
    members.delete(socket.id);
    socket.to(room).emit("peer-left", socket.id);
    if (!members.size) roomMembers.delete(room);
  }
  socket.data.room = null;
}
server.listen(PORT, () => console.log(`ConnectLive running at http://localhost:${PORT}`));
