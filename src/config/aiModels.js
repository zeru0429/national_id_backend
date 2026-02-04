const { pipeline } = require("@xenova/transformers");

class AIModelManager {
  constructor() {
    this.detector = null;
    this.segmenter = null;
    this.initializing = false;
  }

  async getDetector() {
    if (!this.detector && !this.initializing) {
      this.initializing = true;
      console.log("Loading detection model...");
      this.detector = await pipeline(
        "object-detection",
        "Xenova/detr-resnet-50",
      );
      this.initializing = false;
    }
    return this.detector;
  }

  async getSegmenter() {
    if (!this.segmenter && !this.initializing) {
      this.initializing = true;
      console.log("Loading segmentation model...");
      this.segmenter = await pipeline(
        "image-segmentation",
        "Xenova/segformer_b2_clothes",
      );
      this.initializing = false;
    }
    return this.segmenter;
  }
}

module.exports = new AIModelManager();
