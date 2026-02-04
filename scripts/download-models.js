const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

// Set cache directory
const CACHE_DIR = path.join(__dirname, "../ai-models-cache");
process.env.XENOVA_CACHE_DIR = CACHE_DIR;

console.log("🚀 Starting model download...");
console.log(`📁 Cache directory: ${CACHE_DIR}`);

// Track progress with better formatting
let lastProgress = {
  detector: 0,
  segmenter: 0,
};

async function downloadModels() {
  try {
    console.log("📦 Downloading detection model (DETR)...");
    const startTime = Date.now();

    // Download detection model
    const detector = await pipeline(
      "object-detection",
      "Xenova/detr-resnet-50",
      {
        progress_callback: (progress) => {
          if (progress && progress.progress !== undefined) {
            const percent = Math.round(progress.progress); // Already a percentage!

            // Only log when progress increases by at least 1%
            if (percent > lastProgress.detector) {
              lastProgress.detector = percent;

              // Create progress bar
              const barLength = 20;
              const filled = Math.round((percent / 100) * barLength);
              const empty = barLength - filled;
              const bar = "█".repeat(filled) + "░".repeat(empty);

              console.log(`🔍 Detection: ${bar} ${percent}%`);
            }
          }
        },
      },
    );

    console.log("✅ Detection model downloaded!");
    console.log("\n📦 Downloading segmentation model (SegFormer)...");

    // Reset progress tracking
    lastProgress.segmenter = 0;

    // Download segmentation model
    const segmenter = await pipeline(
      "image-segmentation",
      "Xenova/segformer_b2_clothes",
      {
        progress_callback: (progress) => {
          if (progress && progress.progress !== undefined) {
            const percent = Math.round(progress.progress); // Already a percentage!

            // Only log when progress increases by at least 1%
            if (percent > lastProgress.segmenter) {
              lastProgress.segmenter = percent;

              // Create progress bar
              const barLength = 20;
              const filled = Math.round((percent / 100) * barLength);
              const empty = barLength - filled;
              const bar = "█".repeat(filled) + "░".repeat(empty);

              console.log(`🎭 Segmentation: ${bar} ${percent}%`);
            }
          }
        },
      },
    );

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `\n✅ All models downloaded successfully in ${elapsed} seconds!`,
    );
    console.log(`📁 Models cached at: ${CACHE_DIR}`);

    // Show file sizes
    try {
      const modelPaths = [
        path.join(CACHE_DIR, "Xenova/detr-resnet-50/model.onnx"),
        path.join(CACHE_DIR, "Xenova/segformer_b2_clothes/model.onnx"),
      ];

      let totalSize = 0;
      modelPaths.forEach((modelPath) => {
        if (fs.existsSync(modelPath)) {
          const stats = fs.statSync(modelPath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
          totalSize += parseFloat(sizeMB);
          const modelName = path.basename(path.dirname(modelPath));
          console.log(`   ${modelName}: ${sizeMB} MB`);
        }
      });

      console.log(`   Total: ${totalSize.toFixed(1)} MB`);
    } catch (sizeError) {
      // Ignore size errors
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Download failed:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Handle process signals
process.on("SIGINT", () => {
  console.log("\n\n⚠️ Download interrupted by user");
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled rejection:", error);
  process.exit(1);
});

downloadModels();
