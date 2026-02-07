const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const MAX_RETRIES = 3;

// Load keys from environment variable
const keys = process.env.GOOGLE_API_KEY
    ? process.env.GOOGLE_API_KEY.split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];
console.log("keys: ", keys);

if (!keys.length)
    throw new Error("No API keys found in GOOGLE_API_KEY env variable");

let currentKeyIndex = 0;

// Function to get next key in round-robin fashion
const getNextApiKey = () => {
    const key = keys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    console.log(currentKeyIndex, key);
    return key;
};

const extractIdContent = async (files, prompt) => {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const apiKey = getNextApiKey();
        console.log(
            `🔁 Gemini attempt ${attempt}/${MAX_RETRIES} using key:`,
            apiKey,
        );

        try {
            const genAI = new GoogleGenerativeAI(apiKey);

            const model = genAI.getGenerativeModel({
                model: "gemini-flash-latest",
                generationConfig: { responseMimeType: "application/json" },
            });

            const imageParts = files.map((file) => {
                let base64Data;

                if (file.buffer) {
                    base64Data = file.buffer.toString("base64");
                } else if (file.path) {
                    base64Data = fs.readFileSync(file.path).toString("base64");
                } else {
                    throw new Error("Invalid image input");
                }

                return {
                    inlineData: {
                        data: base64Data,
                        mimeType: file.mimeType || "image/png",
                    },
                };
            });

            const result = await model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = response.text();

            return {
                success: true,
                data: JSON.parse(text),
                metadata: {
                    model: "gemini-1.5-flash",
                    apiKeyUsed: apiKey,
                    attempt,
                    usage: response.usageMetadata,
                },
            };
        } catch (error) {
            console.error(
                `❌ Gemini attempt ${attempt} failed with key ${apiKey}:`,
                error.message,
            );

            lastError = error;

            // If not retryable, fail immediately
            if (!isRetryableError(error)) {
                break;
            }

            // Small backoff before retrying
            await new Promise((r) => setTimeout(r, 500 * attempt));
        }
    }

    return {
        success: false,
        error: lastError?.message || "Gemini extraction failed after retries",
    };
};

module.exports = { extractIdContent };
