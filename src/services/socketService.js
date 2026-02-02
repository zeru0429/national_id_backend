// backend/src/config/socket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const chatService = require("../modules/chat/services/chatService");
let io;
const userSockets = new Map(); // userId -> socketId
const userRooms = new Map(); // userId -> Set of roomIds
const roomOnlineUsers = new Map(); // roomId -> Set of userIds
const typingUsers = new Map(); // roomId -> Set of userIds

const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  console.log("✅ Socket.IO initialized");

  io.on("connection", async (socket) => {
    console.log("🔌 New socket connected:", socket.id);

    // ✅ Authenticate user from token
    const token = socket.handshake.auth?.token;
    const user = await validateToken(token);

    if (!user) {
      console.log("❌ Unauthorized socket - disconnecting");
      return socket.disconnect();
    }

    const userId = user.id;
    userSockets.set(userId, socket.id);
    userRooms.set(userId, new Set());

    console.log(`✅ User connected: ${userId} -> ${socket.id}`);

    // ✅ Join user to their personal room
    socket.join(`user_${userId}`);

    // ✅ Load and join user's chat rooms
    await joinUserRooms(socket, userId);

    // ✅ Listen for chat message events
    socket.on("send_message", async (data) => {
      console.log("📩 send_message received:", data);
      await handleSendMessage(socket, userId, data);
    });

    // ✅ Typing Indicators - ROOM SPECIFIC
    socket.on("typing_start", (data) => {
      const { roomId } = data;
      handleTypingStart(socket, userId, roomId);
    });

    socket.on("typing_stop", (data) => {
      const { roomId } = data;
      handleTypingStop(socket, userId, roomId);
    });

    // ✅ Message Status Updates - ROOM SPECIFIC
    socket.on("message_delivered", (data) => {
      const { messageId, roomId } = data;
      handleMessageStatus(socket, userId, messageId, roomId, "delivered");
    });

    socket.on("message_read", (data) => {
      const { messageId, roomId } = data;
      handleMessageStatus(socket, userId, messageId, roomId, "read");
    });

    // ✅ File Upload Events - ROOM SPECIFIC
    socket.on("file_upload_start", (data) => {
      const { roomId, fileName, fileSize } = data;
      handleFileUploadStart(socket, userId, roomId, fileName, fileSize);
    });

    socket.on("file_upload_progress", (data) => {
      const { roomId, fileName, progress } = data;
      handleFileUploadProgress(socket, userId, roomId, fileName, progress);
    });

    socket.on("file_upload_complete", (data) => {
      const { roomId, fileName, fileUrl } = data;
      handleFileUploadComplete(socket, userId, roomId, fileName, fileUrl);
    });

    // ✅ Call Events (for future voice/video calls) - ROOM SPECIFIC
    socket.on("call_initiate", (data) => {
      const { roomId, callType = "voice" } = data;
      handleCallInitiate(socket, userId, roomId, callType);
    });

    socket.on("call_accept", (data) => {
      const { roomId, callId } = data;
      handleCallAccept(socket, userId, roomId, callId);
    });

    socket.on("call_reject", (data) => {
      const { roomId, callId } = data;
      handleCallReject(socket, userId, roomId, callId);
    });

    socket.on("call_end", (data) => {
      const { roomId, callId, duration } = data;
      handleCallEnd(socket, userId, roomId, callId, duration);
    });

    // ✅ Presence Events - GLOBAL
    socket.on("presence_update", (data) => {
      const { status, customStatus } = data;
      handlePresenceUpdate(socket, userId, status, customStatus);
    });

    // ✅ Handle Cleanup on Disconnect
    socket.on("disconnect", () => {
      handleDisconnect(userId);
    });

    // ✅ Error handling
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  });
};

// ✅ Token validator with database check
async function validateToken(token) {
  try {
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        status: true,
      },
    });

    if (!user || user.status !== "active") return null;

    return user;
  } catch (err) {
    return null;
  }
}

// ✅ Join user to all their chat rooms and track room membership
async function joinUserRooms(socket, userId) {
  try {
    const prisma = getPrisma();
    const participants = await prisma.chatRoomParticipant.findMany({
      where: { user_id: userId },
      select: { room_id: true },
    });

    participants.forEach((participant) => {
      const roomId = participant.room_id;

      // Join socket room
      socket.join(`room_${roomId}`);

      // Track user's rooms
      userRooms.get(userId).add(roomId);

      // Track online users per room
      if (!roomOnlineUsers.has(roomId)) {
        roomOnlineUsers.set(roomId, new Set());
      }
      roomOnlineUsers.get(roomId).add(userId);
    });

    console.log(`🏠 User ${userId} joined ${participants.length} rooms`);

    // Notify room participants about user coming online
    participants.forEach((participant) => {
      const roomId = participant.room_id;
      socket.to(`room_${roomId}`).emit("user_online_in_room", {
        roomId,
        userId,
        userInfo: {
          id: userId,
          firstName: socket.user?.first_name,
          lastName: socket.user?.last_name,
        },
      });
    });
  } catch (error) {
    console.error("Error joining rooms:", error);
  }
}

// ✅ Handle sending messages - ROOM SPECIFIC
async function handleSendMessage(socket, userId, data) {
  try {
    const { roomId, message, type = "text", fileUrl, replyTo } = data;

    // Validate user is in this room
    if (!userRooms.get(userId)?.has(roomId)) {
      socket.emit("error", { error: "You are not a participant of this room" });
      return;
    }

    // Save message to database

    const newMessage = await chatService.sendMessage({
      roomId,
      senderId: userId,
      text: message,
      type,
      metadata: { fileUrl, replyTo },
    });

    // Emit to all participants in the room ONLY
    io.to(`room_${roomId}`).emit("new_message", {
      id: newMessage.id,
      roomId,
      message: newMessage.message_text,
      type: newMessage.message_type,
      senderId: userId,
      fileUrl: fileUrl,
      replyTo: replyTo,
      createdAt: newMessage.createdAt,
      status: "sent",
    });

    // Send delivery receipts to online users in this room ONLY
    const prisma = getPrisma();
    const participants = await prisma.chatRoomParticipant.findMany({
      where: { room_id: roomId, user_id: { not: userId } },
      select: { user_id: true },
    });

    participants.forEach((participant) => {
      if (isUserOnline(participant.user_id)) {
        // User is online, message is delivered - notify only the recipient
        io.to(`user_${participant.user_id}`).emit("message_delivered", {
          messageId: newMessage.id,
          roomId,
        });
      }
    });
  } catch (error) {
    console.error("Error handling message:", error);
    socket.emit("message_error", { error: error.message });
  }
}

// ✅ Typing indicators - ROOM SPECIFIC
function handleTypingStart(socket, userId, roomId) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  if (!typingUsers.has(roomId)) {
    typingUsers.set(roomId, new Set());
  }
  typingUsers.get(roomId).add(userId);

  // Notify only other users in the same room
  socket.to(`room_${roomId}`).emit("user_typing", {
    roomId,
    userId,
    typingUsers: Array.from(typingUsers.get(roomId)),
  });
}

function handleTypingStop(socket, userId, roomId) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  if (typingUsers.has(roomId)) {
    typingUsers.get(roomId).delete(userId);

    // Notify only other users in the same room
    socket.to(`room_${roomId}`).emit("user_stop_typing", {
      roomId,
      userId,
      typingUsers: Array.from(typingUsers.get(roomId)),
    });

    if (typingUsers.get(roomId).size === 0) {
      typingUsers.delete(roomId);
    }
  }
}

// ✅ Message status updates - ROOM SPECIFIC
async function handleMessageStatus(socket, userId, messageId, roomId, status) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  try {
    const prisma = getPrisma();
    await prisma.message.update({
      where: { id: messageId },
      data: { status: status },
    });

    // Notify sender that message was delivered/read - only if sender is different
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { sender_id: true },
    });

    if (message && message.sender_id !== userId) {
      // Notify only the sender
      io.to(`user_${message.sender_id}`).emit(`message_${status}`, {
        messageId,
        roomId,
        userId,
      });
    }
  } catch (error) {
    console.error(`Error updating message status to ${status}:`, error);
  }
}

// ✅ File upload handlers - ROOM SPECIFIC
function handleFileUploadStart(socket, userId, roomId, fileName, fileSize) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify only other users in the same room
  socket.to(`room_${roomId}`).emit("file_upload_start", {
    roomId,
    userId,
    fileName,
    fileSize,
    progress: 0,
  });
}

function handleFileUploadProgress(socket, userId, roomId, fileName, progress) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify only other users in the same room
  socket.to(`room_${roomId}`).emit("file_upload_progress", {
    roomId,
    userId,
    fileName,
    progress,
  });
}

function handleFileUploadComplete(socket, userId, roomId, fileName, fileUrl) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify only other users in the same room
  socket.to(`room_${roomId}`).emit("file_upload_complete", {
    roomId,
    userId,
    fileName,
    fileUrl,
  });
}

// ✅ Call handlers (for future implementation) - ROOM SPECIFIC
function handleCallInitiate(socket, userId, roomId, callType) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify only other users in the same room
  socket.to(`room_${roomId}`).emit("call_initiated", {
    roomId,
    callerId: userId,
    callType,
    timestamp: new Date(),
  });
}

function handleCallAccept(socket, userId, roomId, callId) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify all users in the room
  io.to(`room_${roomId}`).emit("call_accepted", {
    roomId,
    userId,
    callId,
  });
}

function handleCallReject(socket, userId, roomId, callId) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify all users in the room
  io.to(`room_${roomId}`).emit("call_rejected", {
    roomId,
    userId,
    callId,
  });
}

function handleCallEnd(socket, userId, roomId, callId, duration) {
  // Validate user is in this room
  if (!userRooms.get(userId)?.has(roomId)) return;

  // Notify all users in the room
  io.to(`room_${roomId}`).emit("call_ended", {
    roomId,
    userId,
    callId,
    duration,
  });
}

// ✅ Presence updates - GLOBAL (not room-specific)
function handlePresenceUpdate(socket, userId, status, customStatus) {
  // Notify all users who share rooms with this user
  const userRoomIds = userRooms.get(userId) || new Set();

  userRoomIds.forEach((roomId) => {
    socket.to(`room_${roomId}`).emit("presence_updated", {
      roomId,
      userId,
      status,
      customStatus,
      lastSeen: new Date(),
    });
  });
}

// ✅ Handle disconnect - Clean up room memberships
function handleDisconnect(userId) {
  const userRoomIds = userRooms.get(userId) || new Set();

  // Notify room participants about user going offline
  userRoomIds.forEach((roomId) => {
    if (roomOnlineUsers.has(roomId)) {
      roomOnlineUsers.get(roomId).delete(userId);

      // Notify other users in the room
      io.to(`room_${roomId}`).emit("user_offline_in_room", {
        roomId,
        userId,
        lastSeen: new Date(),
      });

      // Clean up empty room sets
      if (roomOnlineUsers.get(roomId).size === 0) {
        roomOnlineUsers.delete(roomId);
      }
    }
  });

  // Clean up typing indicators
  for (const [roomId, users] of typingUsers.entries()) {
    if (users.has(userId)) {
      users.delete(userId);
      if (users.size === 0) {
        typingUsers.delete(roomId);
      } else {
        io.to(`room_${roomId}`).emit("user_stop_typing", {
          roomId,
          userId,
          typingUsers: Array.from(users),
        });
      }
    }
  }

  userSockets.delete(userId);
  userRooms.delete(userId);

  console.log(`🔌 User disconnected: ${userId}`);
}

// ✅ Utility functions
function isUserOnline(userId) {
  return userSockets.has(userId);
}

function getOnlineUsers() {
  return Array.from(userSockets.keys());
}

function getOnlineUsersInRoom(roomId) {
  if (roomOnlineUsers.has(roomId)) {
    return Array.from(roomOnlineUsers.get(roomId));
  }
  return [];
}

function getUserRooms(userId) {
  if (userRooms.has(userId)) {
    return Array.from(userRooms.get(userId));
  }
  return [];
}

const getIO = () => io;
const getUserSocket = (userId) => userSockets.get(userId);

module.exports = {
  init,
  getIO,
  getUserSocket,
  isUserOnline,
  getOnlineUsers,
  getOnlineUsersInRoom,
  getUserRooms,
};
