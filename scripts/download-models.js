// download-models.js - Corrected BRIA path
const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Set cache directory
const CACHE_DIR = path.join(__dirname, "../ai-models-cache");
process.env.XENOVA_CACHE_DIR = CACHE_DIR;

const PIPELINE_OPTIONS = {
  use_auth_token: process.env.HUGGINGFACEHUB_API_TOKEN,
};

console.log("🚀 Starting model download...");
console.log(`📁 Cache directory: ${CACHE_DIR}`);

// Track progress
let lastProgress = {
  detector: 0,
  segmenter: 0,
  background: 0,
};

async function downloadModels() {
  try {
    const startTime = Date.now();

    // 1️⃣ Download detection model (DETR)
    console.log("📦 Downloading detection model (DETR)...");
    await pipeline("object-detection", "Xenova/detr-resnet-50", {
      ...PIPELINE_OPTIONS,
      progress_callback: (progress) => {
        if (progress && progress.progress !== undefined) {
          const percent = Math.round(progress.progress);
          if (percent > lastProgress.detector) {
            lastProgress.detector = percent;
            console.log(`🔍 Detection: ${getProgressBar(percent)} ${percent}%`);
          }
        }
      },
    });
    console.log("✅ Detection model downloaded!\n");

    // 2️⃣ Download clothes segmentation model
    console.log("📦 Downloading clothes segmentation model...");
    lastProgress.segmenter = 0;
    await pipeline("image-segmentation", "Xenova/segformer_b2_clothes", {
      ...PIPELINE_OPTIONS,
      progress_callback: (progress) => {
        if (progress && progress.progress !== undefined) {
          const percent = Math.round(progress.progress);
          if (percent > lastProgress.segmenter) {
            lastProgress.segmenter = percent;
            console.log(
              `👕 Clothes Segmentation: ${getProgressBar(percent)} ${percent}%`
            );
          }
        }
      },
    });
    console.log("✅ Clothes segmentation model downloaded!\n");

    // 3️⃣ Download background removal model
    console.log("📦 Downloading background removal model...");
    lastProgress.background = 0;

    let bgModelName = "";

    // Try BRIA first (correct path)
    try {
      console.log("🔄 Trying BRIA RMBG model...");
      await pipeline("image-segmentation", "briaai/RMBG-1.4", {
        ...PIPELINE_OPTIONS,
        progress_callback: (progress) => {
          if (progress && progress.progress !== undefined) {
            const percent = Math.round(progress.progress);
            if (percent > lastProgress.background) {
              lastProgress.background = percent;
              console.log(
                `🎭 Background Removal: ${getProgressBar(percent)} ${percent}%`
              );
            }
          }
        },
      });
      bgModelName = "RMBG-1.4";
      console.log("✅ Background removal model (BRIA RMBG) downloaded!");
    } catch (briaError) {
      console.warn("⚠️ BRIA RMBG failed:", briaError.message);

      // Fallback: U2Net-cloth
      try {
        console.log("🔄 Trying U2Net-cloth model...");
        await pipeline(
          "image-segmentation",
          "Xenova/u2net_cloth_segmentation",
          {
            ...PIPELINE_OPTIONS,
            progress_callback: (progress) => {
              if (progress && progress.progress !== undefined) {
                const percent = Math.round(progress.progress);
                if (percent > lastProgress.background) {
                  lastProgress.background = percent;
                  console.log(
                    `🎭 Background Removal: ${getProgressBar(
                      percent
                    )} ${percent}%`
                  );
                }
              }
            },
          }
        );
        bgModelName = "u2net_cloth_segmentation";
        console.log("✅ U2Net-cloth model downloaded!");
      } catch (u2netError) {
        console.warn("⚠️ U2Net-cloth failed:", u2netError.message);

        // Fallback: U2Net-human
        try {
          console.log("🔄 Trying simple U2Net model...");
          await pipeline("image-segmentation", "Xenova/u2net-human-seg", {
            ...PIPELINE_OPTIONS,
            progress_callback: (progress) => {
              if (progress && progress.progress !== undefined) {
                const percent = Math.round(progress.progress);
                if (percent > lastProgress.background) {
                  lastProgress.background = percent;
                  console.log(
                    `🎭 Background Removal: ${getProgressBar(
                      percent
                    )} ${percent}%`
                  );
                }
              }
            },
          });
          bgModelName = "u2net-human-seg";
          console.log("✅ U2Net-human-seg model downloaded!");
        } catch (simpleError) {
          console.warn(
            "⚠️ All background models failed, using clothes segmentation as fallback"
          );
          bgModelName = "segformer_b2_clothes (fallback)";
        }
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ All models downloaded in ${elapsed} seconds!`);
    console.log(`📁 Models cached at: ${CACHE_DIR}`);

    console.log("\n📋 Downloaded models summary:");
    console.log("   ✅ Xenova/detr-resnet-50 - Person detection");
    console.log("   ✅ Xenova/segformer_b2_clothes - Clothes segmentation");
    if (bgModelName) console.log(`   ✅ ${bgModelName} - Background removal`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Download failed:", error.message);
    process.exit(1);
  }
}

function getProgressBar(percent) {
  const barLength = 20;
  const filled = Math.round((percent / 100) * barLength);
  return "█".repeat(filled) + "░".repeat(barLength - filled);
}

process.on("SIGINT", () => {
  console.log("\n\n⚠️ Download interrupted");
  process.exit(0);
});

downloadModels();
