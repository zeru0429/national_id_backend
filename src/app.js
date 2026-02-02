require("dotenv").config();
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const helmet = require("helmet");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const routeIndex = require("./index");
const { errorHandler, notFoundHandler } = require("./utils/errorHandler");
const { i18nMiddleware } = require("./middleware/localizationMiddleware");
const { prisma } = require("./config/db");
const { StatusCodes } = require("http-status-codes");
const ApiResponse = require("./utils/apiResponse");
const { BASE_PUBLIC, OUTPUT_DIR } = require("./config/paths");

const app = express();
// Trust proxy configuration
app.set("trust proxy", 1);
// authorize(["org.manage"], { platformOnly: true }),

// Ensure directories exist
const fs = require("fs");
[BASE_PUBLIC, OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Serve static folders safely
app.use("/output", express.static(OUTPUT_DIR));
app.use(express.static(BASE_PUBLIC));
// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000 * 200,
  max: process.env.NODE_ENV === "production" ? 10000 : 2000000,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// ===== 🌐 CORS Middleware Setup =====
const allowedOrigins = process.env.FRONTEND_URL_CORS?.split(",").map((origin) =>
  origin.trim(),
);

app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: ["Content-Language", "X-Content-Language"],
  }),
);

// ===== Middlewares =====
const allMiddlewares = [
  morgan(process.env.LOGGER_LEVEL !== "development" ? "dev" : "combined"),
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "*.cloudinary.com"],
        connectSrc: ["'self'"],
      },
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: "same-origin" },
  }),
  limiter,
  cookieParser({
    secret: process.env.COOKIE_SECRET || process.env.ACCESS_TOKEN_SECRET,
  }),
  express.json({ limit: "1mb" }),
  express.urlencoded({ extended: true, limit: "1mb" }),
];

// Use middlewares for all other routes
app.use(allMiddlewares);
app.use(i18nMiddleware); // Use the imported middleware

// Optional: Add language header middleware
app.use((req, res, next) => {
  // Set Content-Language header for client-side detection
  res.setHeader("Content-Language", req.i18n?.language || "en");
  next();
});

// Public folder for static contents
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/v1/time", async (req, res) => {
  // Host header
  const hostHeader = req.headers.host;

  // Client IP
  const clientIp = req.ip; // Express automatically detects this
  // If behind proxy (like Nginx), enable trust proxy:
  // app.set('trust proxy', true);

  // User-Agent
  const userAgent = req.headers["user-agent"] || "unknown";

  // Protocol & URL
  const protocol = req.protocol;
  const fullUrl = `${protocol}://${hostHeader}${req.originalUrl}`;

  // Timestamps
  const server_time = new Date();
  const db_time = await prisma.$queryRaw`SELECT NOW() as db_time`;
  const diffMs = new Date(db_time[0].db_time).getTime() - server_time.getTime();
  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        server_time,
        db_sev_time: db_time[0].db_time,
        diff_ms: diffMs,
        host: hostHeader,
        full_url: fullUrl,
        client_ip: clientIp,
        user_agent: userAgent,
      },
      req.t("auth.login_successful"),
    ),
  );
});

app.get("/test", (req, res) => {
  const lang = req.i18n?.language || "en";
  const languages = req.i18n?.languages || ["en"];

  res.json({
    sample: req.t("auth.login_successful"),
    message: req.t("welcome_message"),
    current_language: lang,
    available_languages: languages,
    status: "Success✅",
    server_status: `Working🆙`,
    restart_working: "true",
    server_time: `${new Date().toLocaleString()} ⌛`,
  });
});

app.use("/api/v1/auth", routeIndex.auth.authRoutes);
app.use("/api/v1/users", routeIndex.users.usersRoutes);
app.use("/api/v1/subscription", routeIndex.subscription.subscriptionRoutes);
app.use("/api/v1/id-generation", routeIndex.idGeneration.idGenerationRoutes);
app.use("/api/v1/usage-log", routeIndex.usageLog.usageLogRoutes);
app.use("/api/v1/files", routeIndex.storedFile.storedFileRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
