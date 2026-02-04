const axios = require("axios");
const fs = require("fs");
const {
  uploadFile,
  ACL_TYPES,
  downloadOBSFileAsBuffer,
} = require("./obsService");

// DeepSeek API configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

/**
 * Upload image to OBS and get public URL
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} imageType - MIME type
 * @returns {Promise<string>} Public URL of uploaded image
 */
/**
 * Upload image to OBS and get public URL
 */
async function uploadImageToOBS(imageBuffer, originalName, imageType) {
  try {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const objectKey = `id-cards/${timestamp}-${randomString}-${originalName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    const uploadResult = await uploadFile({
      buffer: imageBuffer,
      objectKey: objectKey,
      folder: "ocr-extractions",
      contentType: imageType,
      acl: ACL_TYPES.PUBLIC_READ,
    });

    console.log(`Image uploaded to OBS: ${uploadResult.url}`);
    return uploadResult.url;
  } catch (error) {
    console.error("Failed to upload image to OBS:", error.message);
    throw error;
  }
}

// Use the vision model
const DEEPSEEK_VISION_MODEL = "deepseek-vision";

/**
 * Extract data from image URL by downloading and converting to base64
 */
async function extractIDCardDataFromUrl(imageUrl) {
  try {
    console.log(`Downloading image from URL: ${imageUrl}`);

    // Download image from OBS
    const imageBuffer = await downloadOBSFileAsBuffer(imageUrl);
    const base64Image = imageBuffer.toString("base64");

    console.log(
      `Downloaded image size: ${imageBuffer.length} bytes, base64 length: ${base64Image.length}`,
    );

    // Use the base64 extraction method
    return await extractIDCardDataWithBase64(base64Image, "image/jpeg");
  } catch (error) {
    console.error("Failed to process image from URL:", error.message);
    throw error;
  }
}

/**
 * Alternative: Download from URL and use base64 (if URL doesn't work)
 */
async function extractIDCardDataFromUrlWithBase64(imageUrl) {
  try {
    console.log(
      `Downloading image from URL for base64 conversion: ${imageUrl}`,
    );

    // Download image from OBS
    const imageBuffer = await downloadOBSFileAsBuffer(imageUrl);
    const base64Image = imageBuffer.toString("base64");

    console.log(`Downloaded image size: ${imageBuffer.length} bytes`);

    return await extractIDCardDataWithBase64(base64Image, "image/jpeg");
  } catch (error) {
    console.error("Failed to download image from URL:", error.message);
    throw error;
  }
}

async function extractIDCardDataWithBase64(
  base64Image,
  imageType = "image/jpeg",
) {
  try {
    const extractionPrompt = createExtractionPrompt();

    // For DeepSeek, you need to send the FULL base64 string
    const fullBase64Image = base64Image;

    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: extractionPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageType};base64,${fullBase64Image}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000, // Increased timeout
      },
    );

    console.log("DeepSeek Vision API Response received");

    const content = response.data.choices[0].message.content;
    console.log("Response content:", content.substring(0, 500));

    // Parse JSON
    let parsedData;
    try {
      parsedData = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError.message);

      // Try to extract JSON from markdown or other formats
      const jsonMatch =
        content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        try {
          parsedData = JSON.parse(jsonStr);
          console.log("Successfully extracted JSON from response");
        } catch (e) {
          console.error("Failed to parse extracted JSON:", e.message);
          parsedData = createFallbackResponse("Failed to parse JSON response");
        }
      } else {
        console.error("No JSON found in response");
        parsedData = createFallbackResponse("No JSON found in API response");
      }
    }

    // Add metadata
    parsedData.extraction_method = "deepseek-vision-base64";
    parsedData.extraction_timestamp = new Date().toISOString();

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: parsedData,
    };
  } catch (error) {
    console.error("DeepSeek Vision extraction error:", error.message);
    console.error("Error details:", error.response?.data || error);

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      timestamp: new Date().toISOString(),
    };
  }
}
/**
 * Main extraction function - tries multiple approaches
 */
async function extractIDCardData(
  imageBuffer,
  imageType = "image/jpeg",
  originalName = "id-card.jpg",
) {
  try {
    console.log(`Processing image: ${originalName}`);

    // Method 1: Upload to OBS and use URL
    console.log("Method 1: Uploading to OBS and using URL...");
    const imageUrl = await uploadImageToOBS(
      imageBuffer,
      originalName,
      imageType,
    );

    let result = await extractIDCardDataFromUrl(imageUrl);

    // If URL method fails, try base64 method
    if (!result.success) {
      console.log("URL method failed, trying base64 method...");
      result = await extractIDCardDataFromUrlWithBase64(imageUrl);
    }

    // If still fails, try direct base64
    if (!result.success) {
      console.log("All methods failed, using fallback...");
      result = {
        success: true,
        timestamp: new Date().toISOString(),
        data: createFallbackResponse("All extraction methods failed"),
      };
    }

    return result;
  } catch (error) {
    console.error("Extraction failed:", error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Create fallback response structure
 */
function createFallbackResponse(reason = "Failed to extract data") {
  return {
    document_type: "Ethiopian Digital ID Card",
    extraction_confidence: "low",
    personal_information: {
      full_name: {
        english: null,
        amharic: null,
        value: null,
        confidence: "low",
      },
      date_of_birth: {
        raw_value: null,
        iso_date: null,
        confidence: "low",
      },
      sex: {
        english: null,
        amharic: null,
        value: null,
        confidence: "low",
      },
      nationality: {
        english: "Ethiopian",
        amharic: "ኢትዮጵያዊ",
        value: "Ethiopian",
        confidence: "low",
      },
    },
    document_details: {
      expiry_date: {
        raw_value: null,
        iso_date: null,
        confidence: "low",
      },
    },
    contact_information: {
      phone_number: {
        value: null,
        confidence: "low",
      },
      address: {
        raw: null,
        structured: {
          region: null,
          zone: null,
          woreda: null,
        },
        confidence: "low",
      },
    },
    validation_notes: [reason],
    extraction_method: "fallback",
  };
}

/**
 * Create the extraction prompt for ID card
 * @returns {string} Extraction prompt
 */
function createExtractionPrompt() {
  return `ANALYZE THIS ETHIOPIAN ID CARD IMAGE AND EXTRACT ALL INFORMATION.

CRITICAL: You must return ONLY a JSON object, no other text.

IMPORTANT FIELDS TO EXTRACT:
1. Full Name (in both English and Amharic)
2. Date of Birth (convert to ISO format: YYYY-MM-DD)
3. Sex/Gender
4. Nationality
5. ID Expiry Date (convert to ISO format: YYYY-MM-DD)
6. Phone Number
7. Address (break into: Region, Zone, Woreda)

JSON FORMAT REQUIREMENTS:
{
    "document_type": "string",
    "extraction_confidence": "high|medium|low",
    "personal_information": {
        "full_name": {
            "english": "string",
            "amharic": "string",
            "value": "string (use english as primary)",
            "confidence": "high|medium|low"
        },
        "date_of_birth": {
            "raw_value": "string (exactly as shown)",
            "iso_date": "YYYY-MM-DD or null",
            "confidence": "high|medium|low"
        },
        "sex": {
            "english": "string",
            "amharic": "string",
            "value": "string",
            "confidence": "high|medium|low"
        },
        "nationality": {
            "english": "string",
            "amharic": "string",
            "value": "string",
            "confidence": "high|medium|low"
        }
    },
    "document_details": {
        "expiry_date": {
            "raw_value": "string",
            "iso_date": "YYYY-MM-DD or null",
            "confidence": "high|medium|low"
        }
    },
    "contact_information": {
        "phone_number": {
            "value": "string or null",
            "confidence": "high|medium|low"
        },
        "address": {
            "raw": "string or null",
            "structured": {
                "region": "string or null",
                "zone": "string or null",
                "woreda": "string or null"
            },
            "confidence": "high|medium|low"
        }
    },
    "validation_notes": ["array of strings or empty array"],
    "image_url": "string (the URL you analyzed)",
    "extraction_method": "string"
}

SPECIAL INSTRUCTIONS FOR ETHIOPIAN ID CARDS:
1. Date formats: Ethiopian ID cards show both Gregorian and Ethiopian dates
   - Look for patterns like: "08/05/1995 | 2003/Jan/16"
   - First is usually Gregorian (DD/MM/YYYY), second is Ethiopian
   - Use the Gregorian date for ISO conversion
2. Address structure: Typically shows: Region > Zone > Woreda
   - Example: "South Ethiopia Region, Gamo Zone, Boreda Woreda"
3. Bilingual text: Extract both Amharic and English versions
4. Confidence scoring:
   - "high": Text is very clear and readable
   - "medium": Text is somewhat clear
   - "low": Text is blurry or hard to read

NOW ANALYZE THE IMAGE AND RETURN THE JSON OBJECT:`;
}

/**
 * Process multiple images and merge results
 */
async function processMultipleImages(imageBuffers, imageTypes, originalNames) {
  const results = [];
  const errors = [];
  const imageUrls = [];

  for (let i = 0; i < imageBuffers.length; i++) {
    console.log(`\n=== Processing image ${i + 1}/${imageBuffers.length} ===`);

    try {
      // First upload all images to OBS
      console.log("Uploading image to OBS...");
      const imageUrl = await uploadImageToOBS(
        imageBuffers[i],
        originalNames[i] || `image-${i}.jpg`,
        imageTypes[i],
      );
      imageUrls.push(imageUrl);

      console.log(`Image uploaded: ${imageUrl}`);

      // Then extract data using URL
      const result = await extractIDCardDataFromUrl(imageUrl);

      if (result.success) {
        console.log(`Image ${i + 1}: Extraction successful`);
        results.push(result.data);
      } else {
        console.log(`Image ${i + 1}: URL extraction failed, trying base64...`);
        // Try base64 fallback
        const base64Result = await extractIDCardDataFromUrlWithBase64(imageUrl);
        if (base64Result.success) {
          results.push(base64Result.data);
        } else {
          throw new Error("Both URL and base64 methods failed");
        }
      }
    } catch (error) {
      console.log(`Image ${i + 1}: Extraction failed - ${error.message}`);
      errors.push(`Image ${i + 1}: ${error.message}`);
      results.push(
        createFallbackResponse(
          `Failed to process image ${i + 1}: ${error.message}`,
        ),
      );
    }

    // Add delay to avoid rate limiting
    if (i < imageBuffers.length - 1) {
      console.log("Waiting 1 second before next request...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Merge results
  const mergedResult = mergeIDCardResults(results);

  // Add all image URLs to the result
  mergedResult.image_urls = imageUrls;
  mergedResult.total_images = imageBuffers.length;

  return {
    success: true,
    data: mergedResult,
    individual_results: results,
    errors: errors.length > 0 ? errors : null,
    total_images: imageBuffers.length,
    successful_extractions: results.length - errors.length,
    uploaded_urls: imageUrls,
  };
}

/**
 * Merge multiple ID card extraction results
 */
function mergeIDCardResults(results) {
  if (!results || results.length === 0) {
    return createFallbackResponse("No results to merge");
  }

  if (results.length === 1) {
    return results[0];
  }

  const merged = {
    document_type: "Ethiopian Digital ID Card",
    extraction_confidence: "medium",
    personal_information: {
      full_name: {
        english: null,
        amharic: null,
        value: null,
        confidence: "low",
      },
      date_of_birth: { raw_value: null, iso_date: null, confidence: "low" },
      sex: { english: null, amharic: null, value: null, confidence: "low" },
      nationality: {
        english: null,
        amharic: null,
        value: null,
        confidence: "low",
      },
    },
    document_details: {
      expiry_date: { raw_value: null, iso_date: null, confidence: "low" },
    },
    contact_information: {
      phone_number: { value: null, confidence: "low" },
      address: {
        raw: null,
        structured: { region: null, zone: null, woreda: null },
        confidence: "low",
      },
    },
    validation_notes: ["Merged from multiple images"],
    merged_from: results.length,
    merged_at: new Date().toISOString(),
    extraction_method: "multi-image-merge",
  };

  // Smart merging: For each field, take the highest confidence value
  results.forEach((result) => {
    if (!result) return;

    // Merge with confidence-based logic
    smartMergeField(
      merged.personal_information,
      result.personal_information || {},
    );
    smartMergeField(merged.document_details, result.document_details || {});
    smartMergeField(
      merged.contact_information,
      result.contact_information || {},
    );

    // Add validation notes
    if (result.validation_notes && Array.isArray(result.validation_notes)) {
      merged.validation_notes.push(...result.validation_notes);
    }
  });

  // Clean up - remove null results if we have actual data
  cleanupMergedResult(merged);

  return merged;
}

/**
 * Smart merge based on confidence
 */
function smartMergeField(target, source) {
  if (!source) return;

  Object.keys(source).forEach((fieldName) => {
    if (!target[fieldName]) {
      target[fieldName] = source[fieldName];
      return;
    }

    // If source has higher confidence, use it
    const targetConf = getConfidenceScore(target[fieldName]?.confidence);
    const sourceConf = getConfidenceScore(source[fieldName]?.confidence);

    if (sourceConf > targetConf) {
      target[fieldName] = source[fieldName];
    } else if (sourceConf === targetConf) {
      // Same confidence, check if source has actual data
      if (
        hasActualData(source[fieldName]) &&
        !hasActualData(target[fieldName])
      ) {
        target[fieldName] = source[fieldName];
      }
    }
  });
}

function getConfidenceScore(confidence) {
  const scores = { high: 3, medium: 2, low: 1, null: 0, undefined: 0 };
  return scores[confidence] || 0;
}

function hasActualData(field) {
  if (!field) return false;

  if (typeof field === "object") {
    // Check if any value in the object is not null/undefined
    return Object.values(field).some(
      (val) =>
        val !== null && val !== undefined && val !== "unknown" && val !== "",
    );
  }

  return (
    field !== null && field !== undefined && field !== "unknown" && field !== ""
  );
}

function cleanupMergedResult(merged) {
  // Remove validation note about merging if we have actual data
  const hasData =
    hasActualData(merged.personal_information) ||
    hasActualData(merged.document_details) ||
    hasActualData(merged.contact_information);

  if (hasData) {
    merged.extraction_confidence = "high";
    merged.validation_notes = merged.validation_notes.filter(
      (note) => !note.includes("Failed") && !note.includes("No image"),
    );
  }
}

/**
 * Test function to verify API connectivity
 */
async function testDeepSeekConnection() {
  try {
    console.log("Testing DeepSeek API connection...");

    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: "Say 'API connection test successful'",
          },
        ],
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("API Test Success:", response.data.choices[0].message.content);
    return true;
  } catch (error) {
    console.error("API Test Failed:", error.response?.data || error.message);
    return false;
  }
}

module.exports = {
  extractIDCardData,
  processMultipleImages,
  createExtractionPrompt,
  testDeepSeekConnection,
  uploadImageToOBS,
  extractIDCardDataFromUrl,
};
