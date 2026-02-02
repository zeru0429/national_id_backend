const { Server } = require("socket.io");
const jwtUtil = require("../../utils/jwtToken");
const authService = require("../../modules/auth/services/authService");
const ticketStepService = require("../../modules/ticketStep/services/ticketStepService");
let io;
const connections = new Map();

function init(server) {
  const allowedOrigins = process.env.FRONTEND_URL_CORS?.split(",").map((o) =>
    o.trim(),
  );

  io = new Server(server, {
    cors: {
      origin: allowedOrigins || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // --- Middleware: Auth ---
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake?.auth?.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null;

      if (!token) {
        socket.account = null;
        return next();
      }

      const decoded = jwtUtil.verifyAccessToken(token);
      const profile = await authService.getProfile(decoded.id);
      socket.account = profile;
      return next();
    } catch (err) {
      console.error("Socket auth error:", err.message);
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.account) {
      const { role } = socket.account;
      connections.set(socket.id, socket.account);

      // Join role room if role exists
      if (role?.id) socket.join(`role:${role.id}:queue:room`);

      // Update public display
      broadcastOnlineEmployees();
    }

    // Always update public display
    broadcastPublicDisplay();

    // --- Ticket Room ---
    socket.on("join_ticket", async ({ ticketId }) => {
      if (!ticketId) return;
      const ticketService = require("../../modules/ticket/services/ticketService");
      const ticketEvents = require("./event/ticketEvents");

      let ticket;
      try {
        ticket = await ticketService.getTicket(ticketId);
      } catch {
        socket.emit("ticket:not_found", { ticketId });
        return;
      }

      socket.join(`ticket:${ticket.id}:room`);
      console.log(`🟢 Socket ${socket.id} joined ticket:${ticket.id}:room`);
      ticketEvents.ticketRoomJoined(ticket);
    });

    // --- Role Room ---
    socket.on("join_role", async ({ roleId }) => {
      if (!roleId) return;
      socket.join(`role:${roleId}:queue:room`);
      const ticketEvents = require("./event/ticketEvents");
      ticketEvents.roleRoomJoined(socket.account);
      console.log(`🟢 Socket ${socket.id} joined role:${roleId}:queue:room`);
    });

    // --- Public Display Room ---
    socket.on("join_public_display", () => {
      socket.join("public:global:display:room");
      console.log(`📺 Socket ${socket.id} joined public:global:display:room`);
      broadcastOnlineEmployees();
      broadcastPublicDisplay();
    });

    // --- Disconnect ---
    socket.on("disconnect", () => {
      if (socket.account) connections.delete(socket.id);
      broadcastOnlineEmployees();
      broadcastPublicDisplay();

      const ticketEvents = require("./event/ticketEvents");
      ticketEvents.roleRoomLeft(socket.account);

      console.log(`🔌 Disconnected: ${socket.id}`);
    });
  });

  return io;
}

// --- Broadcast Online Employees to Public Display ---
function broadcastOnlineEmployees() {
  const employees = Array.from(connections.values())
    .filter((u) => u.role?.id && u.window?.id) // role and employee
    .map((u) => ({ ...u }));
  io?.to("public:global:display:room").emit("public:windows:update", employees);
}

// --- Broadcast Public Display Data ---
async function broadcastPublicDisplay() {
  const publicData = await ticketStepService.getPublicDisplayData();
  io?.to("public:global:display:room").emit("public:state", publicData);
}

// --- Getter ---
function getIO() {
  if (!io) throw new Error("Socket.io not initialized yet");
  return io;
}

module.exports = {
  init,
  getIO,
  connections,
  broadcastPublicDisplay,
  broadcastOnlineEmployees,
};
