// backgroundRemovalService.js - SIMPLE WORKING VERSION
const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const { pipeline } = require("@xenova/transformers");

let clothesSegmenter = null;
let isInitializing = false;

const initializeModels = async () => {
    if (isInitializing) {
        await new Promise((r) => setTimeout(r, 1000));
        return initializeModels();
    }

    if (!clothesSegmenter) {
        isInitializing = true;
        try {
            console.log("🔄 Loading clothes segmentation model...");

            // Use the ONLY model that actually works
            clothesSegmenter = await pipeline(
                "image-segmentation",
                "Xenova/segformer_b2_clothes" // THIS ONE WORKS!
            );

            console.log("✅ Clothes segmentation model loaded");
        } catch (err) {
            console.error("❌ Failed to load model:", err.message);
            throw new Error("Could not load segmentation model");
        } finally {
            isInitializing = false;
        }
    }
};

/**
 * Remove background using clothes segmentation model
 */
const removeBackgroundFromBuffer = async (inputBuffer) => {
    await initializeModels();
    console.log("🎭 Removing background using clothes segmentation...");

    // Step 1: Create temp file
    const tempDir = path.join(process.cwd(), "temp-bg-removal");
    await fs.mkdir(tempDir, { recursive: true });
    const tempInputPath = path.join(tempDir, `input-${Date.now()}.png`);
    await sharp(inputBuffer).png().toFile(tempInputPath);

    try {
        // Step 2: Get image dimensions
        const inputMeta = await sharp(inputBuffer).metadata();

        // Step 3: Run clothes segmentation
        console.log("🤖 Running clothes segmentation...");
        const results = await clothesSegmenter(tempInputPath);

        if (!results || results.length === 0) {
            console.log("⚠️ No segmentation results, returning original");
            return inputBuffer;
        }

        // Step 4: Combine ALL person-related masks
        const personLabels = [
            "person",
            "human",
            "skin",
            "hair",
            "face",
            "upper clothes",
            "lower clothes",
            "dress",
            "coat",
            "socks",
            "pants",
            "torso",
            "scarf",
            "skirt",
            "neck",
        ];

        let combinedMask = null;
        let maskWidth, maskHeight;

        for (const result of results) {
            if (!result.mask) continue;

            const label = result.label.toLowerCase();
            const isPersonRelated = personLabels.some((l) => label.includes(l));

            if (isPersonRelated) {
                if (!combinedMask) {
                    combinedMask = new Float32Array(result.mask.data.length).fill(0);
                    maskWidth = result.mask.width;
                    maskHeight = result.mask.height;
                }

                // Combine masks using OR operation
                for (let i = 0; i < result.mask.data.length; i++) {
                    combinedMask[i] = Math.max(combinedMask[i], result.mask.data[i]);
                }
            }
        }

        // Step 5: If no person masks found, use all masks
        if (!combinedMask && results[0].mask) {
            console.log("⚠️ No person masks, using all masks");
            const mask = results[0].mask;
            combinedMask = new Float32Array(mask.data.length);
            for (let i = 0; i < mask.data.length; i++) {
                combinedMask[i] = mask.data[i];
            }
            maskWidth = mask.width;
            maskHeight = mask.height;
        }

        if (!combinedMask) {
            console.log("⚠️ Could not create mask, returning original");
            return inputBuffer;
        }

        // Step 6: Convert to uint8 and apply threshold
        const uint8Data = new Uint8Array(combinedMask.length);
        for (let i = 0; i < combinedMask.length; i++) {
            // Use a lower threshold to be more inclusive
            uint8Data[i] = combinedMask[i] > 0.3 ? 255 : 0;
        }

        // Step 7: Create PNG mask
        const maskBuffer = Buffer.from(uint8Data);
        const maskPng = await sharp(maskBuffer, {
            raw: {
                width: maskWidth,
                height: maskHeight,
                channels: 1,
            },
        })
            .resize(inputMeta.width, inputMeta.height, { fit: "fill" })
            .blur(0.8) // More blur for smoother edges
            .threshold(128)
            .png()
            .toBuffer();

        // Step 8: Apply mask
        const outputBuffer = await sharp(inputBuffer)
            .composite([{ input: maskPng, blend: "dest-in" }])
            .png()
            .toBuffer();

        console.log("✅ Background removal completed");
        return outputBuffer;
    } catch (error) {
        console.error("❌ Background removal error:", error.message);
        console.log("⚠️ Returning original image due to error");
        return inputBuffer;
    } finally {
        // Clean up
        await fs.unlink(tempInputPath).catch(() => { });
    }
};

/**
 * Alternative: Simple background removal using edge detection
 */
const simpleBackgroundRemoval = async (inputBuffer) => {
    console.log("🔄 Using simple background removal...");

    try {
        const metadata = await sharp(inputBuffer).metadata();

        // Create mask using edge detection
        const mask = await sharp(inputBuffer)
            .grayscale()
            .normalise() // Enhance contrast
            .median(2) // Reduce noise
            .sharpen({ sigma: 1 }) // Sharpen edges
            .blur(1) // Smooth
            .threshold(160) // Adjust threshold
            .negate() // Invert (person = white)
            .png()
            .toBuffer();

        // Apply mask
        const result = await sharp(inputBuffer)
            .composite([{ input: mask, blend: "dest-in" }])
            .png()
            .toBuffer();

        console.log("✅ Simple background removal completed");
        return result;
    } catch (error) {
        console.error("❌ Simple background removal failed:", error.message);
        throw error;
    }
};

/**
 * Remove background from file
 */
const removeBackgroundFromFile = async (inputPath, outputPath) => {
    try {
        const buffer = await fs.readFile(inputPath);
        const outputBuffer = await removeBackgroundFromBuffer(buffer);
        await fs.writeFile(outputPath, outputBuffer);
        console.log(`✅ Background removed and saved to: ${outputPath}`);
        return outputBuffer;
    } catch (error) {
        console.error("❌ Background removal failed:", error.message);
        throw error;
    }
};

module.exports = {
    removeBackgroundFromBuffer,
    removeBackgroundFromFile,
    initializeModels,
    simpleBackgroundRemoval,
};
