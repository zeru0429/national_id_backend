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
const {
  extractIDCardData,
  processMultipleImages,
  testDeepSeekConnection,
} = require("./services/ocr-service");
const { extractWithGrok } = require("./services/grokOCRService");
const { extractIdContent } = require("./services/googleAiService");
const app = express();
// Trust proxy configuration
app.set("trust proxy", 1);
// authorize(["org.manage"], { platformOnly: true }),

// Ensure directories exist
const fs = require("fs");
const { uploadImage } = require("./middleware/uploadMiddleware");
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
app.use("/api/v1/detection", routeIndex.detection.detectionRoutes);

app.post(
  "/api/v1/extract",
  uploadImage.fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
  ]),
  async (req, res) => {
    const startTime = Date.now();

    try {
      const frontFile = req.files.front?.[0];
      const backFile = req.files.back?.[0];

      if (!frontFile || !backFile) {
        return res.status(400).json({
          success: false,
          error: "Both front and back images must be provided",
        });
      }

      // We send a single detailed prompt for both images
      const prompt = `
        Analyze the front and back of this Ethiopian Digital ID.
        Return a JSON object with these EXACT keys:
        name_am, name_en, date_of_birth_am, date_of_birth_en, sex_am, sex_en, 
        issueDate_am, issueDate_en, expireDate_am, expireDate_en,
        nationality_am, nationality_en, phone_number, region_am, region_en, 
        zone_am, zone_en, woreda_am, woreda_en, fcn, fin, sn.
        If a value is not found, use null.
      `;

      // Pass both files in one array
      const result = await extractIdContent([frontFile, backFile], prompt);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || "Gemini extraction failed",
        });
      }

      res.json({
        success: true,
        message: "Processed ID images with Gemini 1.5 Flash",
        timestamp: new Date().toISOString(),
        data: result.data,
        metadata: {
          ...result.metadata,
          processing_time_ms: Date.now() - startTime,
        },
      });
    } catch (err) {
      console.error("Endpoint error:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error during extraction",
        message: err.message,
        processing_time_ms: Date.now() - startTime,
      });
    }
  },
);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

// // Grrok Main OCR endpoint
// app.post(
//   "/api/v1/extract",
//   uploadImage.fields([
//     { name: "front", maxCount: 1 },
//     { name: "back", maxCount: 1 },
//   ]),
//   async (req, res) => {
//     const startTime = Date.now();

//     try {
//       const frontFile = req.files.front?.[0];
//       const backFile = req.files.back?.[0];

//       if (!frontFile || !backFile) {
//         return res.status(400).json({
//           success: false,
//           error: "Both front and back images must be provided",
//         });
//       }

//       // Process front image
//       const frontResult = await extractWithGrok([frontFile]);
//       if (!frontResult.success) {
//         return res.status(500).json({
//           success: false,
//           error: frontResult.error || "Front image extraction failed",
//           metadata: frontResult.metadata,
//         });
//       }

//       // Keep only front-relevant fields
//       const frontData = {
//         name_am: frontResult.data.name_am,
//         name_en: frontResult.data.name_en,
//         date_of_birth_am: frontResult.data.date_of_birth_am,
//         date_of_birth_en: frontResult.data.date_of_birth_en,
//         sex_am: frontResult.data.sex_am,
//         sex_en: frontResult.data.sex_en,
//         issueDate_am: frontResult.data.issueDate_am,
//         issueDate_en: frontResult.data.issueDate_en,
//         expireDate_am: frontResult.data.expireDate_am,
//         expireDate_en: frontResult.data.expireDate_en,
//       };

//       // Process back image
//       const backResult = await extractWithGrok([backFile]);
//       if (!backResult.success) {
//         return res.status(500).json({
//           success: false,
//           error: backResult.error || "Back image extraction failed",
//           metadata: backResult.metadata,
//         });
//       }

//       // Keep only back-relevant fields
//       const backData = {
//         nationality_am: backResult.data.nationality_am,
//         nationality_en: backResult.data.nationality_en,
//         phone_number: backResult.data.phone_number,
//         region_am: backResult.data.region_am,
//         region_en: backResult.data.region_en,
//         zone_am: backResult.data.zone_am,
//         zone_en: backResult.data.zone_en,
//         woreda_am: backResult.data.woreda_am,
//         woreda_en: backResult.data.woreda_en,
//         fcn: backResult.data.fcn,
//         fin: backResult.data.fin,
//         sn: backResult.data.sn,
//       };

//       // Combine both
//       const combinedData = { ...frontData, ...backData };

//       res.json({
//         success: true,
//         message: "Processed front and back images with Grok",
//         timestamp: new Date().toISOString(),
//         data: combinedData,
//         metadata: {
//           front: frontResult.metadata,
//           back: backResult.metadata,
//           processing_time_ms: Date.now() - startTime,
//         },
//       });
//     } catch (err) {
//       console.error("Endpoint error:", err);
//       res.status(500).json({
//         success: false,
//         error: "Internal server error during extraction",
//         message: err.message,
//         processing_time_ms: Date.now() - startTime,
//       });
//     }
//   },
// );

// // Main OCR extraction endpoint with OBS upload
// app.post(
//   "/api/v1/extract",
//   uploadImage.array("images", 5),
//   async (req, res) => {
//     req.startTime = Date.now();

//     try {
//       // Check if API key is configured
//       if (!process.env.DEEPSEEK_API_KEY) {
//         return res.status(500).json({
//           success: false,
//           error: "DeepSeek API key not configured",
//           suggestion: "Set DEEPSEEK_API_KEY in your .env file",
//         });
//       }

//       // Check if OBS credentials are configured
//       if (!process.env.OBS_ACCESS_KEY || !process.env.OBS_SECRET_KEY) {
//         return res.status(500).json({
//           success: false,
//           error: "OBS storage credentials not configured",
//           suggestion:
//             "Set OBS_ACCESS_KEY, OBS_SECRET_KEY, OBS_ENDPOINT, and OBS_BUCKET_NAME in your .env file",
//         });
//       }

//       // Check if files were uploaded
//       if (!req.files || req.files.length === 0) {
//         return res.status(400).json({
//           success: false,
//           error: "No images uploaded",
//           suggestion: "Upload at least one image file",
//         });
//       }

//       console.log(`\n=== Starting OCR Processing ===`);
//       console.log(`Number of images: ${req.files.length}`);

//       // Test API connection first
//       const apiTest = await testDeepSeekConnection();
//       if (!apiTest) {
//         return res.status(500).json({
//           success: false,
//           error: "DeepSeek API connection failed",
//           suggestion: "Check your API key and internet connection",
//         });
//       }

//       // Prepare image data
//       const imageBuffers = [];
//       const imageTypes = [];
//       const originalNames = [];
//       const filePaths = [];

//       for (const file of req.files) {
//         console.log(`Processing file: ${file.originalname}`);
//         const buffer = fs.readFileSync(file.path);
//         imageBuffers.push(buffer);
//         imageTypes.push(file.mimetype);
//         originalNames.push(file.originalname);
//         filePaths.push(file.path);
//       }

//       // Process images with OBS upload
//       let result;
//       try {
//         result = await processMultipleImages(
//           imageBuffers,
//           imageTypes,
//           originalNames,
//         );
//       } catch (processingError) {
//         console.error("Processing error:", processingError);
//         result = {
//           success: false,
//           error: "Processing failed: " + processingError.message,
//         };
//       }

//       // Clean up uploaded files from local storage
//       filePaths.forEach((filePath) => {
//         if (fs.existsSync(filePath)) {
//           try {
//             fs.unlinkSync(filePath);
//             console.log(`Cleaned up local file: ${filePath}`);
//           } catch (unlinkError) {
//             console.error(
//               "Failed to delete local file:",
//               filePath,
//               unlinkError,
//             );
//           }
//         }
//       });

//       // Calculate processing time
//       const processingTime = Date.now() - req.startTime;

//       // Return result
//       if (result && result.success) {
//         console.log(`Processing completed in ${processingTime}ms`);
//         console.log(
//           `Images uploaded to OBS: ${result.uploaded_urls?.length || 0}`,
//         );

//         const responseData = {
//           success: true,
//           message: `Processed ${req.files.length} image(s)`,
//           timestamp: new Date().toISOString(),
//           data: result.data,
//           metadata: {
//             images_processed: req.files.length,
//             successful_extractions: result.successful_extractions,
//             processing_time_ms: processingTime,
//             extraction_method: result.data.extraction_method || "obs-url-based",
//             obs_images_uploaded: result.uploaded_urls?.length || 0,
//             obs_image_urls: result.uploaded_urls || [],
//           },
//         };

//         // If you want to store the result in your database
//         if (req.user?.id) {
//           try {
//             // Store extraction result in your database
//             await prisma.extractionResult.create({
//               data: {
//                 userId: req.user.id,
//                 originalFilename: originalNames.join(", "),
//                 extractedData: result.data,
//                 imageUrls: result.uploaded_urls,
//                 processingTime: processingTime,
//                 extractionMethod: result.data.extraction_method,
//                 confidence: result.data.extraction_confidence,
//               },
//             });
//             console.log("Extraction result stored in database");
//           } catch (dbError) {
//             console.error("Failed to store in database:", dbError.message);
//             // Don't fail the request if DB storage fails
//           }
//         }

//         res.json(responseData);
//       } else {
//         console.error("Extraction failed:", result?.error);

//         res.status(500).json({
//           success: false,
//           error: result?.error || "Extraction failed",
//           details: result?.details || null,
//           timestamp: new Date().toISOString(),
//           suggestion: "Try with clearer images or check the image format",
//           processing_time_ms: processingTime,
//         });
//       }
//     } catch (error) {
//       console.error("Server Error:", error);

//       // Clean up files on error
//       if (req.files) {
//         req.files.forEach((file) => {
//           if (fs.existsSync(file.path)) {
//             fs.unlinkSync(file.path);
//           }
//         });
//       }

//       res.status(500).json({
//         success: false,
//         error: "Internal server error",
//         message: error.message,
//         timestamp: new Date().toISOString(),
//       });
//     }
//   },
// );
