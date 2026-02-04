const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

class ImageProcessingService {
  constructor() {
    this.OUTPUT_DIR = path.join(__dirname, "../../public/output");
    this.TEMP_DIR = path.join(__dirname, "../../uploads/temp");

    // Ensure directories exist
    [this.OUTPUT_DIR, this.TEMP_DIR].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Process and crop image
   */
  async processImage(inputPath, detectionBox, options = {}) {
    const {
      outputWidth = 512,
      outputHeight = 512,
      removeBackground = false,
      format = "png",
      quality = 90,
    } = options;

    const timestamp = Date.now();
    const outputFilename = `cropped_${timestamp}.${format}`;
    const outputPath = path.join(this.OUTPUT_DIR, outputFilename);

    // Add padding to detection box
    const padding = Math.min(detectionBox.width, detectionBox.height) * 0.05;
    const paddedBox = {
      left: Math.max(0, detectionBox.x - padding),
      top: Math.max(0, detectionBox.y - padding),
      width: detectionBox.width + padding * 2,
      height: detectionBox.height + padding * 2,
    };

    // Process with Sharp
    let pipeline = sharp(inputPath)
      .extract(paddedBox)
      .resize(outputWidth, outputHeight, {
        fit: "cover",
        withoutEnlargement: false,
      });

    // Set output format and quality
    switch (format) {
      case "jpg":
        pipeline = pipeline.jpeg({ quality });
        break;
      case "webp":
        pipeline = pipeline.webp({ quality });
        break;
      default: // png
        pipeline = pipeline.png({ quality: Math.min(100, quality + 20) });
    }

    await pipeline.toFile(outputPath);

    // Clean up temp file
    await this.cleanupTempFile(inputPath);

    return {
      filename: outputFilename,
      path: outputPath,
      url: `/output/${outputFilename}`,
      dimensions: { width: outputWidth, height: outputHeight },
      format,
    };
  }

  /**
   * Convert base64 to image file
   */
  async base64ToFile(base64String) {
    const matches = base64String.match(
      /^data:image\/([A-Za-z-+\/]+);base64,(.+)$/,
    );

    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image string");
    }

    const extension = matches[1].split("/").pop();
    const buffer = Buffer.from(matches[2], "base64");
    const filename = `temp_${Date.now()}.${extension}`;
    const filepath = path.join(this.TEMP_DIR, filename);

    await fs.promises.writeFile(filepath, buffer);

    return filepath;
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFile(filepath) {
    try {
      if (filepath && fs.existsSync(filepath)) {
        await fs.promises.unlink(filepath);
      }
    } catch (error) {
      console.error("Error cleaning up temp file:", error);
    }
  }

  /**
   * Get image metadata
   */
  async getImageMetadata(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: fs.statSync(imagePath).size,
      };
    } catch (error) {
      throw new Error(`Failed to read image metadata: ${error.message}`);
    }
  }
}

module.exports = new ImageProcessingService();
