const pdfjsLib = require("pdfjs-dist/legacy/build/pdf");
const fs = require("fs");
const path = require("path");
const {
  removeBackground: removeBackgroundPixian,
} = require("../services/bgRemover");

// Configure worker for browser use
pdfjsLib.GlobalWorkerOptions.workerSrc =
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

/**
 * Load a PDF file and extract its metadata
 */
async function loadPDFMetadata(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  return {
    totalPages: pdf.numPages,
    fileName: file.name,
  };
}

/**
 * Get the dimensions of a specific page in the PDF
 */
async function getPageDimensions(file, pageNumber, scale = 2) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const baseViewport = page.getViewport({ scale: 1 });
  const scaledViewport = page.getViewport({ scale });

  return {
    width: baseViewport.width,
    height: baseViewport.height,
    scaledWidth: scaledViewport.width,
    scaledHeight: scaledViewport.height,
    scale,
  };
}

/**
 * Convert image to black & white (grayscale)
 */
function convertToBlackAndWhite(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    // Keep alpha as-is
  }

  context.putImageData(imageData, 0, 0);
}

/**
 * Remove white/light background locally
 */
function removeWhiteBackground(context, width, height, threshold = 240) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r > threshold && g > threshold && b > threshold) {
      data[i + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);
}

/**
 * Render a PDF page to canvas, crop, optionally remove background using Pixian API
 */
async function renderAndCropPage(
  fileOrPath,
  pageNumber,
  cropCoords,
  scale = 4,
  removeWhiteBg = false,
  rotate = 0,
  isLocalBgRemoval = true,
) {
  let data;

  if (typeof fileOrPath === "string") {
    const buffer = fs.readFileSync(fileOrPath);
    data = new Uint8Array(buffer);
  } else {
    data = new Uint8Array(await fileOrPath.arrayBuffer());
  }

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const Canvas = require("canvas");
  const canvasWidth = Math.ceil(viewport.width);
  const canvasHeight = Math.ceil(viewport.height);
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext("2d");

  await page.render({ canvasContext: context, viewport }).promise;

  const scaledX = Math.round(cropCoords.x * scale);
  const scaledY = Math.round(cropCoords.y * scale);
  const scaledWidth = Math.round(cropCoords.width * scale);
  const scaledHeight = Math.round(cropCoords.height * scale);

  const croppedCanvas = Canvas.createCanvas(
    rotate % 180 === 0 ? scaledWidth : scaledHeight,
    rotate % 180 === 0 ? scaledHeight : scaledWidth,
  );
  const croppedContext = croppedCanvas.getContext("2d");

  croppedContext.imageSmoothingEnabled = false;
  croppedContext.imageSmoothingQuality = "high";

  if (rotate !== 0) {
    croppedContext.translate(croppedCanvas.width / 2, croppedCanvas.height / 2);
    croppedContext.rotate((rotate * Math.PI) / 180);
    croppedContext.drawImage(
      canvas,
      scaledX,
      scaledY,
      scaledWidth,
      scaledHeight,
      -scaledWidth / 2,
      -scaledHeight / 2,
      scaledWidth,
      scaledHeight,
    );
  } else {
    croppedContext.drawImage(
      canvas,
      scaledX,
      scaledY,
      scaledWidth,
      scaledHeight,
      0,
      0,
      scaledWidth,
      scaledHeight,
    );
  }

  // Conditional background removal
  if (removeWhiteBg) {
    const buffer = croppedCanvas.toBuffer("image/png");

    if (!isLocalBgRemoval) {
      // Use Pixian API
      const bgRemovedBuffer = await removeBackgroundPixian(buffer, {
        width: croppedCanvas.width,
        height: croppedCanvas.height,
        format: "png",
        colorMode: "rgba",
        saveFolder: path.join(__dirname, "../../output/result"),
      });

      const img = new Canvas.Image();
      img.src = bgRemovedBuffer;
      croppedContext.clearRect(0, 0, croppedCanvas.width, croppedCanvas.height);
      croppedContext.drawImage(
        img,
        0,
        0,
        croppedCanvas.width,
        croppedCanvas.height,
      );
    } else {
      // Local removal
      removeWhiteBackground(
        croppedContext,
        croppedCanvas.width,
        croppedCanvas.height,
      );
    }
  }

  // Convert to grayscale
  convertToBlackAndWhite(
    croppedContext,
    croppedCanvas.width,
    croppedCanvas.height,
  );

  return croppedCanvas.toBuffer("image/png").toString("base64");
}

/**
 * PDF and crop validation utilities
 */
function validatePDFFile(file) {
  if (!file) return { valid: false, error: "No file selected" };
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return { valid: false, error: "Please select a valid PDF file" };
  }
  return { valid: true };
}

function validatePageNumber(pageNumber, totalPages) {
  if (isNaN(pageNumber) || !Number.isInteger(pageNumber))
    return { valid: false, error: "Page number must be a whole number" };
  if (pageNumber < 1)
    return { valid: false, error: "Page number must be at least 1" };
  if (pageNumber > totalPages)
    return { valid: false, error: `Page number cannot exceed ${totalPages}` };
  return { valid: true };
}

function validateCropCoordinates(coords, pageDimensions) {
  const errors = {};
  const maxWidth = pageDimensions.width;
  const maxHeight = pageDimensions.height;

  if (isNaN(coords.x) || coords.x < 0) errors.x = "X must be positive";
  else if (coords.x >= maxWidth)
    errors.x = `X must be < ${Math.floor(maxWidth)}`;

  if (isNaN(coords.y) || coords.y < 0) errors.y = "Y must be positive";
  else if (coords.y >= maxHeight)
    errors.y = `Y must be < ${Math.floor(maxHeight)}`;

  if (isNaN(coords.width) || coords.width <= 0)
    errors.width = "Width must be positive";
  else if (coords.x + coords.width > maxWidth)
    errors.width = `Width exceeds page bounds (max: ${Math.floor(maxWidth - coords.x)})`;

  if (isNaN(coords.height) || coords.height <= 0)
    errors.height = "Height must be positive";
  else if (coords.y + coords.height > maxHeight)
    errors.height = `Height exceeds page bounds (max: ${Math.floor(maxHeight - coords.y)})`;

  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = {
  renderAndCropPage,
  removeWhiteBackground,
  validatePDFFile,
  validatePageNumber,
  validateCropCoordinates,
  convertToBlackAndWhite,
  getPageDimensions,
  loadPDFMetadata,
};
