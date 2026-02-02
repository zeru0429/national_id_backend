function withMeta(payload) {
  return { ...payload, timestamp: new Date() };
}

function emitToTicket(ticketId, event, payload = {}, toPublic = false) {
  try {
    const { getIO } = require("./socket");
    const io = getIO();
    io.to(`ticket:${ticketId}:room`).emit(event, withMeta(payload));
    if (toPublic) {
      io.to("public:global:display:room").emit(
        "public:announcement",
        withMeta(payload),
      );
    }
    console.log(`[Bus] Emitted ${event} to ticket:${ticketId}:room`);
  } catch (err) {
    console.warn(
      `[Bus] Could not emit ${event} to ticket:${ticketId}:`,
      err.message,
    );
  }
}

function emitToRole(roleId, event, payload = {}) {
  try {
    const { getIO } = require("./socket");
    const io = getIO();
    io.to(`role:${roleId}:queue:room`).emit(event, withMeta(payload));
    console.log(`[Bus] Emitted ${event} to role:${roleId}:queue:room`);
  } catch (err) {
    console.warn(
      `[Bus] Could not emit ${event} to role:${roleId}:`,
      err.message,
    );
  }
}

function emitToPublic(event, payload = {}) {
  try {
    const { getIO } = require("./socket");
    const io = getIO();
    io.to("public:global:display:room").emit(event, withMeta(payload));
    console.log(`[Bus] Emitted ${event} to public:global:display:room`);
  } catch (err) {
    console.warn(
      `[Bus] Could not emit ${event} to public display:`,
      err.message,
    );
  }
}

module.exports = { emitToTicket, emitToRole, emitToPublic };
