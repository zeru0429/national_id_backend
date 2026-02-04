// src/services/grok-ocr.service.js
const { OpenAI } = require("openai");
const fs = require("fs");

// Initialize xAI Grok client (OpenAI-compatible)
const grok = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1",
});

// Use the most appropriate vision model at the time
const VISION_MODEL = "grok-2-vision-1212";

// Strict system prompt
const SYSTEM_PROMPT = `
You are an expert at extracting structured information from Ethiopian Digital ID Cards (Fayda or similar national IDs).
Follow these rules strictly:

1. Extract all visible fields accurately from the images (front and back if multiple).
2. Handle Amharic (አማርኛ) and English text correctly:
   - *_am fields: only valid Amharic characters (Unicode U+1200–U+137F, U+1380–U+139F). Remove any other character like Tamil, Latin, numbers, or symbols.
   - *_en fields: only English letters, numbers, and standard date formats.
3. Dates:
   - *_am: Ethiopian calendar date (or as shown)
   - *_en: Gregorian date
   - Include both issueDate_am/issueDate_en and expireDate_am/expireDate_en strictly.
4. Addresses: Break into region, zone, woreda as visible.
5. ID numbers: Extract fcn, fin, sn exactly as formatted.
6. Phone: Extract exactly.
7. If a field is missing → use empty string "".
8. Output ONLY valid JSON — no extra text, no markdown, no comments.
9. Use exactly this structure — do not add/remove/rename keys:

{
  "name_am": "",
  "name_en": "",
  "date_of_birth_am": "",
  "date_of_birth_en": "",
  "sex_am": "",
  "sex_en": "",
  "nationality_am": "",
  "nationality_en": "",
  "phone_number": "",
  "region_am": "",
  "region_en": "",
  "zone_am": "",
  "zone_en": "",
  "woreda_am": "",
  "woreda_en": "",
  "fcn": "",
  "fin": "",
  "issueDate_am": "",
  "issueDate_en": "",
  "expireDate_am": "",
  "expireDate_en": "",
  "sn": ""
}

Important:
- *_am: remove any character outside Amharic Unicode block (1200–137F, 1380–139F)
- *_en: remove any non-English/number character
- If multiple images, combine logically (front for name/sex, back for address/fin/issue/expiry)
- Output must be parseable JSON only.
`;

// Helper functions to clean text
function cleanAmharic(text) {
    if (!text) return "";
    return text.replace(/[^\u1200-\u137F\u1380-\u139F\s]/g, "").trim();
}

function cleanEnglish(text) {
    if (!text) return "";
    return text.replace(/[^A-Za-z0-9\/\-\s]/g, "").trim();
}

/**
 * Extracts structured data from one or more images using Grok Vision API
 * @param {Array} files - Array of multer file objects
 * @returns {Promise<Object>} - { success: boolean, data?: any, error?: string, metadata: {...} }
 */
async function extractWithGrok(files) {
    const startTime = Date.now();

    try {
        if (!process.env.GROK_API_KEY) {
            throw new Error(
                "GROK_API_KEY is not configured in environment variables",
            );
        }

        if (!files || files.length === 0) {
            throw new Error("No images provided");
        }

        console.log(`[Grok OCR] Processing ${files.length} image(s)`);

        const originalNames = [];
        const filePathsToClean = [];
        const content = [{ type: "text", text: SYSTEM_PROMPT }];

        for (const file of files) {
            console.log(`[Grok OCR] Reading file: ${file.originalname}`);
            const buffer = fs.readFileSync(file.path);
            const base64 = buffer.toString("base64");
            const mimeType = file.mimetype || "image/jpeg";

            content.push({
                type: "image_url",
                image_url: {
                    url: `data:${mimeType};base64,${base64}`,
                },
            });

            originalNames.push(file.originalname);
            filePathsToClean.push(file.path);
        }

        // Call Grok API
        const completion = await grok.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content },
            ],
            max_tokens: 2048,
            temperature: 0.1,
        });

        let rawResponse = completion.choices?.[0]?.message?.content?.trim() || "";

        // Remove code fences like ```json ... ``` if Grok includes them
        rawResponse = rawResponse
            .replace(/```json\s*/g, "")
            .replace(/```/g, "")
            .trim();

        let extractedData;
        try {
            extractedData = JSON.parse(rawResponse);
        } catch (parseErr) {
            console.error("[Grok OCR] JSON parse failed:", parseErr.message);
            console.error(
                "[Grok OCR] Raw response snippet:",
                rawResponse.substring(0, 800),
            );
            throw new Error("Failed to parse structured JSON from Grok response");
        }

        // Clean Amharic and English fields
        extractedData.name_am = cleanAmharic(extractedData.name_am);
        extractedData.name_en = cleanEnglish(extractedData.name_en);
        extractedData.sex_am = cleanAmharic(extractedData.sex_am);
        extractedData.sex_en = cleanEnglish(extractedData.sex_en);
        extractedData.nationality_am = cleanAmharic(extractedData.nationality_am);
        extractedData.nationality_en = cleanEnglish(extractedData.nationality_en);
        extractedData.region_am = cleanAmharic(extractedData.region_am);
        extractedData.region_en = cleanEnglish(extractedData.region_en);
        extractedData.zone_am = cleanAmharic(extractedData.zone_am);
        extractedData.zone_en = cleanEnglish(extractedData.zone_en);
        extractedData.woreda_am = cleanAmharic(extractedData.woreda_am);
        extractedData.woreda_en = cleanEnglish(extractedData.woreda_en);
        extractedData.issueDate_am = cleanAmharic(extractedData.issueDate_am);
        extractedData.issueDate_en = cleanEnglish(extractedData.issueDate_en);
        extractedData.expireDate_am = cleanAmharic(extractedData.expireDate_am);
        extractedData.expireDate_en = cleanEnglish(extractedData.expireDate_en);
        extractedData.fcn = cleanEnglish(extractedData.fcn);
        extractedData.fin = cleanEnglish(extractedData.fin);
        extractedData.sn = cleanEnglish(extractedData.sn);

        // Clean up temporary files
        filePathsToClean.forEach((path) => {
            if (fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    console.log(`[Grok OCR] Cleaned up: ${path}`);
                } catch (e) {
                    console.warn(`[Grok OCR] Failed to delete temp file: ${path}`, e);
                }
            }
        });

        const processingTimeMs = Date.now() - startTime;

        return {
            success: true,
            data: extractedData,
            metadata: {
                images_processed: files.length,
                processing_time_ms: processingTimeMs,
                model: VISION_MODEL,
                original_filenames: originalNames,
                extraction_method: "grok-vision-api",
            },
        };
    } catch (error) {
        // Clean up on error
        if (files) {
            files.forEach((file) => {
                if (fs.existsSync(file.path)) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch { }
                }
            });
        }

        console.error("[Grok OCR] Error:", error.message);

        return {
            success: false,
            error: error.message,
            metadata: {
                processing_time_ms: Date.now() - startTime,
            },
        };
    }
}

module.exports = {
    extractWithGrok,
    VISION_MODEL,
};
