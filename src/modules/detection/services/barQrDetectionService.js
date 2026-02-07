const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const {
    BrowserMultiFormatReader,
    BarcodeFormat,
    DecodeHintType,
} = require("@zxing/library");
const QRCode = require("qrcode");

// Generic Top Code Detection
const detectTopCode = async (filePath, formats = [BarcodeFormat.QR_CODE]) => {
    const reader = new BrowserMultiFormatReader(
        new Map([
            [DecodeHintType.POSSIBLE_FORMATS, formats],
            [DecodeHintType.TRY_HARDER, true],
        ]),
    );

    // Load the image using canvas's loadImage
    const img = await loadImage(filePath);

    const scanRegions = [
        { yStart: 0, heightPercent: 0.35 },
        { yStart: 0, heightPercent: 0.5 },
        { yStart: 0, heightPercent: 0.7 },
        { yStart: 0, heightPercent: 1.0 },
    ];

    for (const region of scanRegions) {
        try {
            const canvas = createCanvas(img.width, img.height * region.heightPercent);
            const ctx = canvas.getContext("2d");

            // Draw only the top portion
            ctx.drawImage(
                img,
                0,
                region.yStart,
                img.width,
                canvas.height,
                0,
                0,
                img.width,
                canvas.height,
            );

            // Convert canvas to image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // Create a temporary canvas for zxing
            const tempCanvas = createCanvas(canvas.width, canvas.height);
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.putImageData(imageData, 0, 0);

            // Create image buffer
            const buffer = tempCanvas.toBuffer("image/png");

            // Create image element object for zxing
            const tempImg = {
                src: `data:image/png;base64,${buffer.toString("base64")}`,
                width: canvas.width,
                height: canvas.height,
                complete: true,
            };

            // Decode using the reader
            const result = await reader.decodeFromImage(tempImg);

            return {
                success: true,
                text: result.getText(),
                format: BarcodeFormat[result.getBarcodeFormat()],
                region: `${region.heightPercent * 100}%`,
            };
        } catch (err) {
            console.log(`Region ${region.heightPercent * 100}% failed:`, err.message);
            continue;
        }
    }

    throw new Error("No code found in top area.");
};

// Generate QR Code file
const generateQRFile = async (
    text,
    filename = `qr-${Date.now()}.png`,
    width = 320,
) => {
    const outputDir = path.join(__dirname, "../../uploads/qr-codes");

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, filename);
    await QRCode.toFile(outputPath, text, { width: width, margin: 2 });

    // Return relative path for API response
    return `/uploads/qr-codes/${filename}`;
};

// ------------------
// QR Detection
// ------------------
const detectQR = async (filePath, outputWidth = 320) => {
    try {
        const result = await detectTopCode(filePath, [BarcodeFormat.QR_CODE]);

        const qrFile = await generateQRFile(
            result.text,
            `qr-${Date.now()}.png`,
            outputWidth,
        );

        return {
            success: true,
            ...result,
            qrFile: qrFile,
            message: "QR code detected and generated",
        };
    } catch (error) {
        return {
            success: false,
            message: error.message || "QR code detection failed",
            errors: [error.message],
        };
    }
};

// ------------------
// Barcode Detection
// ------------------
const detectBarcode = async (filePath) => {
    try {
        const barcodeFormats = [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.PDF_417,
        ];

        const result = await detectTopCode(filePath, barcodeFormats);

        return {
            success: true,
            ...result,
            message: "Barcode detected",
        };
    } catch (error) {
        return {
            success: false,
            message: error.message || "Barcode detection failed",
            errors: [error.message],
        };
    }
};

module.exports = {
    detectQR,
    detectBarcode,
};
