// detectionService.js - Fixed Version
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const { pipeline } = require("@xenova/transformers");
const { prisma } = require("../../../config/db");
const { OUTPUT_DIR } = require("../../../config/paths");

// Cache for AI models
let detector = null;
let segmenter = null;
let isInitializing = false;

const initializeModels = async () => {
  if (isInitializing) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return initializeModels();
  }

  if (!detector) {
    isInitializing = true;
    try {
      console.log("🔄 Initializing AI models...");

      detector = await pipeline("object-detection", "Xenova/detr-resnet-50");
      console.log("✅ Detector model loaded");

      segmenter = await pipeline(
        "image-segmentation",
        "Xenova/segformer_b2_clothes"
      );
      console.log("✅ Segmenter model loaded");

      console.log("🎉 AI models initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize AI models:", error.message);
      throw new Error("detection.models_failed");
    } finally {
      isInitializing = false;
    }
  }
};

const getDetector = async () => {
  await initializeModels();
  return detector;
};

const getSegmenter = async () => {
  await initializeModels();
  return segmenter;
};

const detectPersons = async (imagePath, t) => {
  try {
    console.log("🔍 Starting detection for:", imagePath);

    const detector = await getDetector();
    console.log("✅ Detector loaded");

    // Get original metadata
    const originalMetadata = await sharp(imagePath).metadata();
    console.log("📐 Original image:", {
      width: originalMetadata.width,
      height: originalMetadata.height,
      format: originalMetadata.format,
    });

    // ✅ Create a temp file for detection (Xenova works with file paths)
    const tempDir = path.join(process.cwd(), "temp-detection");
    await fs.mkdir(tempDir, { recursive: true });

    const tempImagePath = path.join(tempDir, `detection-${Date.now()}.jpg`);

    // Convert to JPEG if needed (Xenova works better with JPEG)
    console.log("🔄 Converting image for detection...");
    await sharp(imagePath)
      .jpeg({
        quality: 90,
        chromaSubsampling: "4:2:0",
      })
      .toFile(tempImagePath);

    console.log("✅ Temp file created:", tempImagePath);
    console.log("🤖 Running detection...");

    // ✅ Use file path directly (Xenova handles this properly)
    const results = await detector(tempImagePath);

    // Clean up temp file
    await fs.unlink(tempImagePath).catch(() => {
      console.log("⚠️ Could not delete temp file");
    });

    console.log("✅ Detection completed");

    // Process results
    return processResults(results, originalMetadata, t);
  } catch (error) {
    console.error("❌ Detection error:", error.message);
    console.error("Stack:", error.stack);
    throw new Error(error.message || t("detection.detection_failed"));
  }
};

// ✅ Match React's processing exactly
function processResults(results, metadata, t) {
  console.log("📊 Processing detection results...");

  const detectionArray = Array.isArray(results) ? results : [results];
  console.log(`📊 Found ${detectionArray.length} total detections`);

  // Filter for persons with score > 0.5 (matching React)
  const personDetections = detectionArray.filter((r) => {
    if (!r || !r.label) return false;
    const label = r.label.toLowerCase();
    return label.includes("person") && r.score > 0.5;
  });

  console.log(`👥 Persons detected: ${personDetections.length}`);

  if (personDetections.length === 0) {
    // Log all detections for debugging
    console.log("All detections:");
    detectionArray.slice(0, 5).forEach((det, i) => {
      if (det && det.label && det.score) {
        console.log(
          `  ${i + 1}. ${det.label}: ${(det.score * 100).toFixed(1)}%`
        );
      }
    });

    throw new Error(t("detection.no_person_detected"));
  }

  // Get highest confidence detection (matching React)
  const bestDetection = personDetections.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  console.log("🏆 Best person detection:", {
    label: bestDetection.label,
    confidence: `${(bestDetection.score * 100).toFixed(1)}%`,
  });

  // Calculate pixel coordinates exactly like React
  const pixelBox = {
    x: Math.round(bestDetection.box.xmin),
    y: Math.round(bestDetection.box.ymin),
    width: Math.round(bestDetection.box.xmax - bestDetection.box.xmin),
    height: Math.round(bestDetection.box.ymax - bestDetection.box.ymin),
  };

  // Calculate percentage coordinates
  const percentageBox = {
    x: (pixelBox.x / metadata.width) * 100,
    y: (pixelBox.y / metadata.height) * 100,
    width: (pixelBox.width / metadata.width) * 100,
    height: (pixelBox.height / metadata.height) * 100,
  };

  console.log("📏 Final boxes:", { pixelBox, percentageBox });

  return {
    detection: {
      x: percentageBox.x,
      y: percentageBox.y,
      width: percentageBox.width,
      height: percentageBox.height,
      score: bestDetection.score, // Keep 'score' field
      pixelBox: pixelBox,
      confidence: Math.round(bestDetection.score * 100),
    },
    imageDimensions: {
      width: metadata.width,
      height: metadata.height,
    },
  };
}

// Main service function
const detectAndCrop = async (file, options, req, t) => {
  const {
    outputWidth = 512,
    outputHeight = 512,
    removeBackground = false,
    format = "png",
  } = options;

  console.log("📁 Processing file:", file.path);
  console.log("⚙️ Options:", options);

  // 1. Detect persons
  const detectionResult = await detectPersons(file.path, t);
  console.log("✅ Detection result:", detectionResult.detection);

  const { pixelBox } = detectionResult.detection;
  const imgWidth = detectionResult.imageDimensions.width;
  const imgHeight = detectionResult.imageDimensions.height;

  // 2. Add padding
  const horizontalPadding = Math.round(pixelBox.width * 0.5); // 5% left/right
  const verticalPadding = Math.round(pixelBox.height * 0.05); // 15% top/bottom

  // 3. Extend vertically: include extra frame above and below
  let left = Math.max(0, pixelBox.x - horizontalPadding);
  let top = Math.max(0, pixelBox.y - verticalPadding);
  let right = Math.min(
    imgWidth,
    pixelBox.x + pixelBox.width + horizontalPadding
  );
  let bottom = Math.min(
    imgHeight,
    pixelBox.y + pixelBox.height + verticalPadding
  );

  const cropBox = {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };

  if (cropBox.width <= 0 || cropBox.height <= 0) {
    throw new Error("extract_area: bad extract area");
  }

  console.log("📏 Extended crop box:", cropBox);

  // 4. Prepare output path
  const outputDir = path.join(OUTPUT_DIR, "detection");
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `cropped-${Date.now()}.${format}`;
  const outputPath = path.join(outputDir, filename);

  // 5. Crop first into buffer
  console.log("✂️ Cropping person first...");

  let croppedBuffer = await sharp(file.path).extract(cropBox).toBuffer();

  // 6. Remove background if enabled
  if (removeBackground) {
    console.log("🎭 Background removal enabled...");

    croppedBuffer = await removeBackgroundFromBuffer(croppedBuffer);
  }

  // 7. Resize + Export
  let imageProcessor = sharp(croppedBuffer).resize(
    parseInt(outputWidth),
    parseInt(outputHeight),
    { fit: "cover" }
  );

  switch (format.toLowerCase()) {
    case "jpg":
    case "jpeg":
      imageProcessor = imageProcessor.jpeg({ quality: 90 });
      break;
    case "webp":
      imageProcessor = imageProcessor.webp({ quality: 90 });
      break;
    default:
      imageProcessor = imageProcessor.png();
  }

  await imageProcessor.toFile(outputPath);

  console.log("✅ Cropped image saved:", outputPath);

  // 6. Cleanup
  await fs.unlink(file.path).catch(console.error);

  // 7. Log usage
  if (req && req.user) {
    try {
      await prisma.usageLog.create({
        data: {
          userId: req.user.id,
          service: "DETECTION_AND_CROP",
          inputType: "IMAGE",
          outputType: format.toUpperCase(),
          metadata: {
            detection: detectionResult.detection,
            options,
            cropBox,
          },
        },
      });
    } catch (err) {
      console.error("⚠️ Failed to log usage:", err.message);
    }
  }

  return {
    detection: detectionResult.detection,
    processedImage: {
      url: `/output/detection/${filename}`,
      filename,
      dimensions: {
        width: parseInt(outputWidth),
        height: parseInt(outputHeight),
      },
      format,
    },
    imageInfo: detectionResult.imageDimensions,
    cropBox,
  };
};

const removeBackgroundFromBuffer = async (inputBuffer) => {
  const segmenter = await getSegmenter();

  console.log("🤖 Running segmentation...");

  // ✅ Save buffer to temp file
  const tempDir = path.join(process.cwd(), "temp-segmentation");
  await fs.mkdir(tempDir, { recursive: true });

  const tempInputPath = path.join(tempDir, `segment-${Date.now()}.png`);

  await sharp(inputBuffer).png().toFile(tempInputPath);

  console.log("✅ Temp segmentation file created:", tempInputPath);

  // ✅ Xenova only supports file path input
  const result = await segmenter(tempInputPath);

  // Cleanup temp file
  await fs.unlink(tempInputPath).catch(() => { });

  if (!result || result.length === 0) {
    throw new Error("No segmentation result found");
  }

  const mask = result[0].mask;

  console.log("🎭 Mask loaded:", {
    width: mask.width,
    height: mask.height,
  });

  // Mask channels detection
  const channels = mask.data.length / (mask.width * mask.height);

  let maskBuffer;

  if (channels === 4) {
    maskBuffer = await sharp(Buffer.from(mask.data), {
      raw: {
        width: mask.width,
        height: mask.height,
        channels: 4,
      },
    })
      .extractChannel(3)
      .toBuffer();
  } else {
    maskBuffer = Buffer.from(mask.data);
  }

  // Convert mask into PNG
  const maskPNG = await sharp(maskBuffer, {
    raw: {
      width: mask.width,
      height: mask.height,
      channels: 1,
    },
  })
    .png()
    .toBuffer();

  console.log("✅ Applying alpha mask...");

  // Apply mask
  const outputBuffer = await sharp(inputBuffer)
    .composite([
      {
        input: maskPNG,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  return outputBuffer;
};

const detectOnly = async (file, req, t) => {
  console.log("🔍 Detect only for file:", file.path);

  const detectionResult = await detectPersons(file.path, t);

  // Clean up uploaded file
  await fs.unlink(file.path).catch((err) => {
    console.error("⚠️ Could not delete uploaded file:", err.message);
  });

  // Log usage
  if (req && req.user) {
    try {
      await prisma.usageLog.create({
        data: {
          userId: req.user.id,
          service: "DETECTION_ONLY",
          inputType: "IMAGE",
          metadata: {
            detection: detectionResult.detection,
          },
        },
      });
    } catch (error) {
      console.error("⚠️ Failed to log usage:", error);
    }
  }

  return detectionResult;
};

const processBase64 = async (body, req, t) => {
  const { image: base64Image, ...options } = body;

  console.log("🔄 Processing base64 image...");

  // Parse base64
  const matches = base64Image.match(
    /^data:image\/([A-Za-z-+\/]+);base64,(.+)$/
  );
  if (!matches || matches.length !== 3) {
    throw new Error(t("detection.invalid_base64"));
  }

  // Save to temp file
  const tempDir = path.join(__dirname, "../../../uploads/temp");
  await fs.mkdir(tempDir, { recursive: true });

  const extension = matches[1].split("/").pop() || "jpg";
  const buffer = Buffer.from(matches[2], "base64");
  const tempFilename = `temp-${Date.now()}.${extension}`;
  const tempPath = path.join(tempDir, tempFilename);

  await fs.writeFile(tempPath, buffer);

  try {
    // Process as regular file
    const result = await detectAndCrop({ path: tempPath }, options, req, t);
    return result;
  } finally {
    // Clean up temp file
    await fs.unlink(tempPath).catch((err) => {
      console.error("⚠️ Could not delete temp file:", err.message);
    });
  }
};

const healthCheck = async () => {
  try {
    console.log("🩺 Running health check...");
    await initializeModels();

    return {
      status: "healthy",
      models: {
        detector: detector ? "loaded" : "not_loaded",
        segmenter: segmenter ? "loaded" : "not_loaded",
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Health check failed:", error.message);
    return {
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

const removeBackgroundFromImage = async (inputPath, outputPath) => {
  console.log("🎭 Removing background...");

  const segmenter = await getSegmenter();

  // Run segmentation
  const result = await segmenter(inputPath);

  if (!result || result.length === 0) {
    throw new Error("No segmentation result found");
  }

  // Take best mask
  const mask = result[0].mask;

  // Convert mask to PNG buffer
  const maskBuffer = Buffer.from(mask.data);

  // Apply mask with sharp
  await sharp(inputPath)
    .composite([
      {
        input: maskBuffer,
        blend: "dest-in", // keeps only foreground
      },
    ])
    .png()
    .toFile(outputPath);

  console.log("✅ Background removed:", outputPath);
};

module.exports = {
  detectAndCrop,
  detectOnly,
  processBase64,
  healthCheck,
  getDetector,
  getSegmenter,
  removeBackgroundFromImage,
};
