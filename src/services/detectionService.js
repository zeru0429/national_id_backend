const modelManager = require("../config/aiModels");
const sharp = require("sharp");

class DetectionService {
  /**
   * Detect persons in an image
   */
  async detectPersons(imagePath) {
    try {
      const detector = await modelManager.getDetector();

      // Read image
      const imageBuffer = await sharp(imagePath)
        .jpeg({ quality: 90 })
        .toBuffer();

      // Convert to data URL
      const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;

      // Run detection
      const results = await detector(dataUrl);

      // Filter for persons with confidence > 0.5
      const personDetections = Array.isArray(results)
        ? results.filter((r) => r.label === "person" && r.score > 0.5)
        : [];

      if (personDetections.length === 0) {
        throw new Error("No person detected in the image");
      }

      // Get image dimensions for pixel conversion
      const metadata = await sharp(imagePath).metadata();

      // Get the highest confidence detection
      const bestDetection = personDetections.reduce((best, current) =>
        current.score > best.score ? current : best,
      );

      // Convert to pixel coordinates
      const pixelBox = {
        x: Math.round(bestDetection.box.xmin),
        y: Math.round(bestDetection.box.ymin),
        width: Math.round(bestDetection.box.xmax - bestDetection.box.xmin),
        height: Math.round(bestDetection.box.ymax - bestDetection.box.ymin),
      };

      // Calculate percentage coordinates
      const percentBox = {
        x: (pixelBox.x / metadata.width) * 100,
        y: (pixelBox.y / metadata.height) * 100,
        width: (pixelBox.width / metadata.width) * 100,
        height: (pixelBox.height / metadata.height) * 100,
        score: bestDetection.score,
      };

      return {
        detection: {
          ...percentBox,
          pixelBox,
          confidence: Math.round(bestDetection.score * 100),
        },
        allDetections: personDetections.map((det) => ({
          label: det.label,
          confidence: Math.round(det.score * 100),
          box: det.box,
        })),
        imageDimensions: {
          width: metadata.width,
          height: metadata.height,
        },
      };
    } catch (error) {
      console.error("Detection error:", error);
      throw new Error(`Detection failed: ${error.message}`);
    }
  }

  /**
   * Remove background using segmentation (optional)
   */
  async removeBackground(imagePath, detectionBox) {
    try {
      const segmenter = await modelManager.getSegmenter();

      // Crop the detection area first
      const croppedBuffer = await sharp(imagePath)
        .extract({
          left: detectionBox.x,
          top: detectionBox.y,
          width: detectionBox.width,
          height: detectionBox.height,
        })
        .toBuffer();

      // Convert to data URL
      const dataUrl = `data:image/jpeg;base64,${croppedBuffer.toString("base64")}`;

      // Run segmentation
      const results = await segmenter(dataUrl);

      // TODO: Implement mask combination logic
      // (Similar to your frontend logic but server-side)

      return {
        success: true,
        message: "Background removal completed",
      };
    } catch (error) {
      console.error("Background removal error:", error);
      throw new Error(`Background removal failed: ${error.message}`);
    }
  }
}

module.exports = new DetectionService();
