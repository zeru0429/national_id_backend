// detectionService.js - Fixed Version (Background Removal Fix)
const path = require("path");
const crypto = require("crypto");
const fs = require("fs").promises;
const sharp = require("sharp");
const { pipeline } = require("@xenova/transformers");
const { prisma } = require("../../../config/db");
const { OUTPUT_DIR } = require("../../../config/paths");
const backgroundRemovalService = require("./backgroundRemovalService");

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

    // ✅ Create a temp file for detection
    const tempDir = path.join(process.cwd(), "temp-detection");
    await fs.mkdir(tempDir, { recursive: true });

    const tempImagePath = path.join(tempDir, `detection-${Date.now()}.jpg`);

    // Convert to JPEG if needed
    console.log("🔄 Converting image for detection...");
    await sharp(imagePath)
      .jpeg({ quality: 90, chromaSubsampling: "4:2:0" })
      .toFile(tempImagePath);

    console.log("✅ Temp file created:", tempImagePath);
    console.log("🤖 Running detection...");

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

function processResults(results, metadata, t) {
  console.log("📊 Processing detection results...");

  const detectionArray = Array.isArray(results) ? results : [results];
  console.log(`📊 Found ${detectionArray.length} total detections`);

  // Filter for persons with score > 0.5
  const personDetections = detectionArray.filter((r) => {
    if (!r || !r.label) return false;
    const label = r.label.toLowerCase();
    return label.includes("person") && r.score > 0.5;
  });

  console.log(`👥 Persons detected: ${personDetections.length}`);

  if (personDetections.length === 0) {
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

  // Get highest confidence detection
  const bestDetection = personDetections.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  console.log("🏆 Best person detection:", {
    label: bestDetection.label,
    confidence: `${(bestDetection.score * 100).toFixed(1)}%`,
  });

  // Calculate pixel coordinates
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
      score: bestDetection.score,
      pixelBox: pixelBox,
      confidence: Math.round(bestDetection.score * 100),
    },
    imageDimensions: {
      width: metadata.width,
      height: metadata.height,
    },
  };
}

// NEW: Simple but effective background removal using segmentation
const removeBackgroundSimple = async (croppedBuffer) => {
  try {
    console.log("🎭 Starting simple background removal...");

    const segmenter = await getSegmenter();

    // Save cropped buffer to temp file for segmentation
    const tempDir = path.join(process.cwd(), "temp-bg-removal");
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `seg-${Date.now()}.png`);

    await sharp(croppedBuffer).png().toFile(tempPath);

    // Run segmentation
    const results = await segmenter(tempPath);

    // Clean up temp file
    await fs.unlink(tempPath).catch(() => { });

    if (!results || results.length === 0) {
      console.log("⚠️ No segmentation results, returning original");
      return croppedBuffer;
    }

    // Get image dimensions
    const metadata = await sharp(croppedBuffer).metadata();

    // Combine masks for person-related labels
    const personLabels = [
      "person",
      "human",
      "skin",
      "hair",
      "face",
      "upper-clothes",
      "lower-clothes",
      "dress",
      "coat",
      "socks",
      "pants",
      "torso",
      "scarf",
      "skirt",
      "neck",
    ];

    // Create a blank mask
    const maskWidth = metadata.width;
    const maskHeight = metadata.height;
    const maskData = new Uint8Array(maskWidth * maskHeight).fill(0);

    // Process each segmentation result
    for (const result of results) {
      if (!result.mask) continue;

      const label = result.label.toLowerCase();
      const isPersonRelated = personLabels.some((l) => label.includes(l));

      if (isPersonRelated) {
        const mask = result.mask;

        // Rescale mask to match original dimensions if needed
        let scaledMaskData;
        if (mask.width !== maskWidth || mask.height !== maskHeight) {
          const tempMaskBuffer = await sharp(Buffer.from(mask.data), {
            raw: { width: mask.width, height: mask.height, channels: 1 },
          })
            .resize(maskWidth, maskHeight, { fit: "fill" })
            .raw()
            .toBuffer();

          scaledMaskData = new Uint8Array(tempMaskBuffer);
        } else {
          scaledMaskData = new Uint8Array(mask.data);
        }

        // Combine with existing mask (OR operation)
        for (let i = 0; i < maskData.length; i++) {
          if (i < scaledMaskData.length && scaledMaskData[i] > 128) {
            maskData[i] = 255;
          }
        }
      }
    }

    // If no person-related masks found, use the first mask
    if (maskData.every((v) => v === 0) && results[0].mask) {
      console.log("⚠️ No person masks found, using first mask");
      const mask = results[0].mask;
      const maskBuffer = Buffer.from(mask.data);

      if (mask.width !== maskWidth || mask.height !== maskHeight) {
        const resizedMask = await sharp(maskBuffer, {
          raw: { width: mask.width, height: mask.height, channels: 1 },
        })
          .resize(maskWidth, maskHeight, { fit: "fill" })
          .raw()
          .toBuffer();

        return await applyMask(
          croppedBuffer,
          Buffer.from(resizedMask),
          maskWidth,
          maskHeight
        );
      } else {
        return await applyMask(
          croppedBuffer,
          maskBuffer,
          maskWidth,
          maskHeight
        );
      }
    }

    // Apply the combined mask
    return await applyMask(
      croppedBuffer,
      Buffer.from(maskData),
      maskWidth,
      maskHeight
    );
  } catch (error) {
    console.error("❌ Background removal error:", error.message);
    console.log("⚠️ Returning original image due to error");
    return croppedBuffer;
  }
};

// Helper function to apply mask
const applyMask = async (imageBuffer, maskBuffer, width, height) => {
  // Convert mask to PNG
  const maskPng = await sharp(maskBuffer, {
    raw: { width, height, channels: 1 },
  })
    .blur(1) // Smooth edges slightly
    .threshold(128)
    .png()
    .toBuffer();

  // Apply mask to image
  const result = await sharp(imageBuffer)
    .composite([{ input: maskPng, blend: "dest-in" }])
    .png()
    .toBuffer();

  console.log("✅ Background removal successful");
  return result;
};

// Main service function
const detectAndCrop = async (file, options, req, t) => {
  const {
    outputWidth = 512,
    outputHeight = 512,
    removeBackground = false,
    format = "png",
  } = options;

  console.log("📁 Processing file:", file.path);
  console.log("⚙️ Options:", { ...options, removeBackground });

  // 1. Detect persons
  const detectionResult = await detectPersons(file.path, t);
  console.log("✅ Detection result:", detectionResult.detection);

  const { pixelBox } = detectionResult.detection;
  const imgWidth = detectionResult.imageDimensions.width;
  const imgHeight = detectionResult.imageDimensions.height;

  // 2. Add padding
  const horizontalPadding = Math.round(pixelBox.width * 0.15);
  const verticalPadding = Math.round(pixelBox.height * 0.15);

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


  // In detectAndCrop function, replace the background removal section:
  if (removeBackground) {
    console.log("🎭 Removing background...");
    try {
      croppedBuffer = await backgroundRemovalService.removeBackgroundFromBuffer(
        croppedBuffer
      );
      console.log("✅ Background removal successful");
    } catch (bgError) {
      console.error("❌ Background removal failed:", bgError.message);
      console.log("🔄 Trying simple background removal...");
      try {
        croppedBuffer = await backgroundRemovalService.simpleBackgroundRemoval(
          croppedBuffer
        );
        console.log("✅ Simple background removal successful");
      } catch (simpleError) {
        console.error(
          "❌ All background removal methods failed, keeping original"
        );
        // Keep the cropped image without background removal
      }
    }
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

  // 8. Cleanup
  await fs.unlink(file.path).catch(console.error);

  // 9. Log usage
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
            backgroundRemoved: removeBackground,
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
      backgroundRemoved: removeBackground,
    },
    imageInfo: detectionResult.imageDimensions,
    cropBox,
  };
};

// Other functions remain the same...
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

module.exports = {
  detectAndCrop,
  detectOnly,
  processBase64,
  healthCheck,
  getDetector,
  getSegmenter,
};
