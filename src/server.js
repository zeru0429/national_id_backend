// server.js
const http = require("http");
const app = require("./app");
require("./bot/index");
const { connectDB, checkConnection, disconnectDB } = require("./config/db");
const server = http.createServer(app);

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  try {
    // Stop accepting new connections
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log("✅ HTTP server closed.");

    // Disconnect from database
    await disconnectDB();
    console.log("✅ Database disconnected.");

    console.log("💤 Graceful shutdown completed.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    console.log("🔗 Connecting to database...");
    await connectDB();
    console.log("✅ Database connected");

    const health = await checkConnection();
    if (!health.connected) {
      throw new Error(`Database health check failed: ${health.error}`);
    }
    console.log("✅ Database health check passed");

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    server.on("error", (error) => {
      console.error("❌ Server failed to start:", error);
      process.exit(1);
    });

    // Handle termination signals
    ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
      process.on(signal, () => gracefulShutdown(signal));
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);

    if (err.message.includes("did not initialize yet")) {
      console.log("\n💡 Possible Prisma solution:");
      console.log("1. npx prisma generate");
      console.log("2. npx prisma migrate dev --name init");
      console.log("3. npm run dev\n");
    }

    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = server;
