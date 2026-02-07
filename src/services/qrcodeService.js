const { createCanvas, loadImage, ImageData } = require("canvas");
const jsQR = require("jsqr");
const QRCode = require("qrcode");
const bwipjs = require("bwip-js");
const Quagga = require("@ericblade/quagga2");
const fs = require("fs").promises;

/**
 * Scan barcode from image using Quagga2 with preprocessing
 * Returns barcode data string if found
 */
const scanBarcode = async (filePath) => {
    console.log("🔍 Scanning barcode from:", filePath);

    try {
        const img = await loadImage(filePath);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, img.width, img.height);

        // Convert to grayscale for better detection
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const gray =
                imageData.data[i] * 0.299 +
                imageData.data[i + 1] * 0.587 +
                imageData.data[i + 2] * 0.114;
            imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);

        // Export canvas to temporary PNG buffer for Quagga
        const tempPath = filePath + "_tmp.png";
        const buffer = canvas.toBuffer("image/png");
        await fs.writeFile(tempPath, buffer);

        const result = await new Promise((resolve) => {
            Quagga.decodeSingle(
                {
                    src: tempPath,
                    numOfWorkers: 0,
                    locate: true,
                    inputStream: { size: 800 },
                    locator: { patchSize: "medium", halfSample: false },
                    decoder: {
                        readers: [
                            "code_128_reader",
                            "code_39_reader",
                            "ean_reader",
                            "ean_8_reader",
                            "upc_reader",
                            "upc_e_reader",
                            "codabar_reader",
                            "i2of5_reader",
                        ],
                    },
                    multiple: false,
                },
                (res) => {
                    if (res && res.codeResult && res.codeResult.code) {
                        console.log("✅ Barcode FOUND:", res.codeResult.code);
                        resolve(res.codeResult.code);
                    } else {
                        console.log("❌ No barcode detected");
                        resolve(null);
                    }
                },
            );
        });

        // Cleanup temporary PNG
        try {
            await fs.unlink(tempPath);
        } catch { }

        return result;
    } catch (err) {
        console.error("❌ Error scanning barcode:", err);
        return null;
    }
};

/**
 * Generate barcode as PNG buffer from string using bwip-js
 */

const generateBarcode = async (text, options = {}) => {
    const targetRatio = 240 / 83; // width / height ratio
    const height = options.height || 30; // vertical height of the barcode area
    const width = Math.round(height * targetRatio); // auto-calculate width
    const textSize = options.textsize || 12; // font size for the text

    try {
        const buffer = await bwipjs.toBuffer({
            bcid: options.type || "code128", // barcode type
            text,
            scale: options.scale || 3, // horizontal scaling factor
            height,
            width,
            includetext: true, // include human-readable text
            textxalign: "center", // center the text horizontally
            textyalign: "above", // place text above the bars
            textsize: textSize, // font size for text
            textxoffset: options.textxoffset || 0, // horizontal text offset
            textyoffset: options.textyoffset || 5, // vertical offset from top
            backgroundcolor: options.backgroundcolor || "FFFFFF", // background color
            barcolor: options.barcolor || "000000", // barcode color
            paddingwidth: options.paddingwidth || 10, // padding around the barcode
            paddingheight: options.paddingheight || 10,
        });

        return buffer;
    } catch (err) {
        console.error("❌ Error generating barcode:", err);
        return null;
    }
};

/**
 * Progressive QR Scanner for Node.js (unchanged)
 */
const scanQRCode = async (filePath) => {
    try {
        const img = await loadImage(filePath);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, img.width, img.height);

        const enhanceContrast = (imageData) => {
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i],
                    g = data[i + 1],
                    b = data[i + 2];
                const gray = r * 0.299 + g * 0.587 + b * 0.114;
                const factor = gray > 128 ? 1.2 : 0.8;
                data[i] = Math.min(255, r * factor);
                data[i + 1] = Math.min(255, g * factor);
                data[i + 2] = Math.min(255, b * factor);
            }
            return imageData;
        };

        const toGrayscale = (imageData) => {
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const gray =
                    data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                data[i] = data[i + 1] = data[i + 2] = gray;
            }
            return imageData;
        };

        const scanSection = async (imageData) => {
            let result = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
            });
            if (result) return result;
            result = jsQR(
                enhanceContrast(
                    new ImageData(
                        new Uint8ClampedArray(imageData.data),
                        imageData.width,
                        imageData.height,
                    ),
                ).data,
                imageData.width,
                imageData.height,
                { inversionAttempts: "attemptBoth" },
            );
            if (result) return result;
            result = jsQR(
                toGrayscale(
                    new ImageData(
                        new Uint8ClampedArray(imageData.data),
                        imageData.width,
                        imageData.height,
                    ),
                ).data,
                imageData.width,
                imageData.height,
                { inversionAttempts: "attemptBoth" },
            );
            return result || null;
        };

        const sections = [0.25, 0.5, 0.75, 1];
        let qrResult = null;
        for (const pct of sections) {
            if (qrResult) break;
            const h = Math.round(canvas.height * pct);
            const data = ctx.getImageData(0, 0, canvas.width, h);
            qrResult = await scanSection(data);
        }

        return qrResult ? qrResult.data : null;
    } catch (err) {
        console.error("❌ Error scanning QR code:", err);
        return null;
    }
};

/**
 * Generate QR code as PNG buffer from string
 */
const generateQRCode = async (text) => {
    try {
        return await QRCode.toBuffer(text, {
            errorCorrectionLevel: "H",
            type: "png",
            width: 600,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
        });
    } catch (err) {
        console.error("❌ Error generating QR code:", err);
        return null;
    }
};

module.exports = { scanQRCode, generateQRCode, scanBarcode, generateBarcode };

// const { createCanvas, loadImage, ImageData } = require("canvas");
// const jsQR = require("jsqr");
// const QRCode = require("qrcode");
// const bwipjs = require("bwip-js");
// const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = require("@zxing/library");

// /**
//  * Scan barcode from image using canvas + ZXing
//  * Returns barcode data string if found
//  */
// const scanBarcode = async (filePath) => {
//     console.log("🔍 Scanning barcode from:", filePath);

//     try {
//         const img = await loadImage(filePath);
//         const canvas = createCanvas(img.width, img.height);
//         const ctx = canvas.getContext("2d");
//         ctx.drawImage(img, 0, 0, img.width, img.height);

//         // Create ZXing reader
//         const hints = new Map();
//         hints.set(DecodeHintType.POSSIBLE_FORMATS, [
//             BarcodeFormat.CODE_128,
//             BarcodeFormat.CODE_39,
//             BarcodeFormat.EAN_13,
//             BarcodeFormat.EAN_8,
//             BarcodeFormat.UPC_A,
//             BarcodeFormat.UPC_E,
//             BarcodeFormat.CODABAR,
//         ]);
//         hints.set(DecodeHintType.TRY_HARDER, true);
//         const reader = new BrowserMultiFormatReader(hints);

//         // Progressive scan: top 25%, 50%, 75%, full
//         const sections = [0.25, 0.5, 0.75, 1.0];
//         for (const percent of sections) {
//             const tempCanvas = createCanvas(canvas.width, canvas.height * percent);
//             const tempCtx = tempCanvas.getContext("2d");
//             tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height * percent, 0, 0, canvas.width, canvas.height * percent);

//             const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

//             try {
//                 const result = reader.decodeBitmap(imageData);
//                 if (result) {
//                     console.log("✅ Barcode FOUND:", result.getText());
//                     return result.getText();
//                 }
//             } catch {
//                 // continue scanning next section
//             }
//         }

//         console.log("❌ No barcode detected after progressive scanning");
//         return null;

//     } catch (err) {
//         console.error("❌ Error scanning barcode:", err);
//         return null;
//     }
// };

// /**
//  * Generate barcode as PNG buffer from string using bwip-js
//  * @param {string} text - data to encode
//  */
// const generateBarcode = async (text, options = {}) => {
//     try {
//         const buffer = await bwipjs.toBuffer({
//             bcid: options.type || "code128", // Barcode type
//             text: text,
//             scale: options.scale || 3,
//             height: options.height || 60,
//             includetext: true,
//             textxalign: "center",
//             backgroundcolor: "FFFFFF",
//         });
//         return buffer; // can be sent directly as image/png
//     } catch (err) {
//         console.error("❌ Error generating barcode:", err);
//         return null;
//     }
// };

// /**
//  * Progressive QR Scanner for Node.js (like React version)
//  */
// const scanQRCode = async (filePath) => {
//     console.log("🔍 Scanning QR code from:", filePath);

//     try {
//         const img = await loadImage(filePath);
//         const canvas = createCanvas(img.width, img.height);
//         const ctx = canvas.getContext("2d");

//         ctx.drawImage(img, 0, 0, img.width, img.height);

//         // Helper: contrast enhancement
//         const enhanceContrast = (imageData) => {
//             const data = imageData.data;
//             for (let i = 0; i < data.length; i += 4) {
//                 const r = data[i];
//                 const g = data[i + 1];
//                 const b = data[i + 2];
//                 const gray = r * 0.299 + g * 0.587 + b * 0.114;
//                 const factor = gray > 128 ? 1.2 : 0.8;
//                 data[i] = Math.min(255, r * factor);
//                 data[i + 1] = Math.min(255, g * factor);
//                 data[i + 2] = Math.min(255, b * factor);
//             }
//             return imageData;
//         };

//         // Helper: grayscale
//         const toGrayscale = (imageData) => {
//             const data = imageData.data;
//             for (let i = 0; i < data.length; i += 4) {
//                 const gray =
//                     data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
//                 data[i] = data[i + 1] = data[i + 2] = gray;
//             }
//             return imageData;
//         };

//         // Helper: scan section with multiple preprocessing approaches
//         const scanSection = async (imageData, section) => {
//             let result = jsQR(imageData.data, imageData.width, imageData.height, {
//                 inversionAttempts: "attemptBoth",
//             });
//             if (result) {
//                 console.log(`[v0] QR found in ${section} (raw scan)`);
//                 return result;
//             }

//             // Contrast-enhanced
//             const enhanced = new ImageData(
//                 new Uint8ClampedArray(imageData.data),
//                 imageData.width,
//                 imageData.height,
//             );
//             result = jsQR(
//                 enhanceContrast(enhanced).data,
//                 enhanced.width,
//                 enhanced.height,
//                 { inversionAttempts: "attemptBoth" },
//             );
//             if (result) {
//                 console.log(`[v0] QR found in ${section} (contrast)`);
//                 return result;
//             }

//             // Grayscale
//             const grayscale = new ImageData(
//                 new Uint8ClampedArray(imageData.data),
//                 imageData.width,
//                 imageData.height,
//             );
//             result = jsQR(
//                 toGrayscale(grayscale).data,
//                 grayscale.width,
//                 grayscale.height,
//                 { inversionAttempts: "attemptBoth" },
//             );
//             if (result) {
//                 console.log(`[v0] QR found in ${section} (grayscale)`);
//                 return result;
//             }

//             // Scaling if small
//             if (imageData.width < 400 || imageData.height < 400) {
//                 const scale = Math.max(
//                     400 / imageData.width,
//                     400 / imageData.height,
//                     1.5,
//                 );
//                 const scaledCanvas = createCanvas(
//                     Math.round(imageData.width * scale),
//                     Math.round(imageData.height * scale),
//                 );
//                 const scaledCtx = scaledCanvas.getContext("2d");
//                 const tempCanvas = createCanvas(imageData.width, imageData.height);
//                 const tempCtx = tempCanvas.getContext("2d");
//                 tempCtx.putImageData(imageData, 0, 0);
//                 scaledCtx.drawImage(
//                     tempCanvas,
//                     0,
//                     0,
//                     scaledCanvas.width,
//                     scaledCanvas.height,
//                 );
//                 const scaledData = scaledCtx.getImageData(
//                     0,
//                     0,
//                     scaledCanvas.width,
//                     scaledCanvas.height,
//                 );
//                 result = jsQR(scaledData.data, scaledData.width, scaledData.height, {
//                     inversionAttempts: "attemptBoth",
//                 });
//                 if (result) {
//                     console.log(`[v0] QR found in ${section} (scaled)`);
//                     return result;
//                 }
//             }

//             return null;
//         };

//         // Progressive scan: top 25%, 50%, 75%, full
//         const progressiveSections = [
//             { percent: 25, label: "top 25%" },
//             { percent: 50, label: "top 50%" },
//             { percent: 75, label: "top 75%" },
//             { percent: 100, label: "full image" },
//         ];

//         let qrResult = null;

//         for (const section of progressiveSections) {
//             if (qrResult) break;

//             const height = Math.round(canvas.height * (section.percent / 100));
//             console.log(`[v0] Scanning ${section.label} (height: ${height})`);

//             const sectionData = ctx.getImageData(0, 0, canvas.width, height);
//             qrResult = await scanSection(sectionData, section.label);

//             // Prevent blocking
//             await new Promise((resolve) => setTimeout(resolve, 0));
//         }

//         if (qrResult) {
//             console.log("✅ QR FOUND:", qrResult.data);
//             return qrResult.data;
//         } else {
//             console.log("❌ No QR code detected after progressive scanning");
//             return null;
//         }
//     } catch (err) {
//         console.error("❌ Error scanning QR code:", err);
//         return null;
//     }
// };
// /**
//  * Generate QR code as PNG buffer from string
//  * @param {string} text - data to encode
//  */
// const generateQRCode = async (text) => {
//     try {
//         const buffer = await QRCode.toBuffer(text, {
//             errorCorrectionLevel: "H",
//             type: "png",
//             width: 600, // <-- increase size here
//             margin: 2,
//             color: {
//                 dark: "#000000",
//                 light: "#FFFFFF",
//             },
//         });
//         return buffer; // can be sent directly as image/png
//     } catch (err) {
//         console.error("❌ Error generating QR code:", err);
//         return null;
//     }
// };

// module.exports = { scanQRCode, generateQRCode, scanBarcode, generateBarcode };
