/**
 * Extract token from cookies or headers
 */
function extractToken(req) {
  return (
    req.cookies?.token ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.headers["x-access-token"] ||
    null
  );
}
/**
 * Extract token from Socket.IO handshake
 */
function extractSocketToken(socket) {
  let token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    socket.handshake.headers?.authorization ||
    socket.handshake.headers?.["x-access-token"] ||
    null;

  if (!token) return null;

  // Remove "Bearer " if present
  if (token.startsWith("Bearer ")) {
    token = token.slice(7);
  }

  return token;
}

module.exports = {
  extractToken,
  extractSocketToken,
};
