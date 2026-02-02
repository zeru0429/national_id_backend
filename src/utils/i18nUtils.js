const fs = require("fs");
const path = require("path");

const MODULES_DIR = path.join(__dirname, "../modules");
const GLOBAL_LOCALES_DIR = path.join(__dirname, "../locales");
const MERGED_LOCALES_DIR = path.join(__dirname, "../locales/merged");

// Ensure merged directory exists
if (!fs.existsSync(MERGED_LOCALES_DIR)) {
  fs.mkdirSync(MERGED_LOCALES_DIR, { recursive: true });
}

/**
 * Get all modules that have a 'locales' folder
 * @returns {string[]} List of module names
 */
function getModulesWithLocales() {
  if (!fs.existsSync(MODULES_DIR)) {
    console.warn(`Modules directory not found: ${MODULES_DIR}`);
    return [];
  }

  const modules = fs.readdirSync(MODULES_DIR).filter((folder) => {
    const localesPath = path.join(MODULES_DIR, folder, "locales");
    return fs.existsSync(localesPath) && fs.statSync(localesPath).isDirectory();
  });

  console.log(`Found ${modules.length} modules: ${modules.join(", ")}`);
  return modules;
}

/**
 * Merge all module locales into one big JSON file for each language
 * @param {string} language - Language code (en, am, etc.)
 */
function mergeAllLocales(language) {
  const modules = getModulesWithLocales();
  const mergedData = {};

  // Start with global common translations
  const commonPath = path.join(
    GLOBAL_LOCALES_DIR,
    "common",
    `${language}.json`
  );
  if (fs.existsSync(commonPath)) {
    try {
      const commonData = JSON.parse(fs.readFileSync(commonPath, "utf8"));
      Object.assign(mergedData, commonData);
      console.log(`✓ Loaded common translations for ${language}`);
    } catch (error) {
      console.error(`Error loading common/${language}.json:`, error.message);
    }
  }

  // Add each module's translations
  modules.forEach((moduleName) => {
    const modulePath = path.join(
      MODULES_DIR,
      moduleName,
      "locales",
      `${language}.json`
    );
    if (fs.existsSync(modulePath)) {
      try {
        const moduleData = JSON.parse(fs.readFileSync(modulePath, "utf8"));

        // If the JSON already has the module name as a key, use it as-is
        // Otherwise, wrap the content with module name as key
        if (moduleData[moduleName]) {
          // Already formatted with module name as key
          mergedData[moduleName] = moduleData[moduleName];
        } else {
          // Wrap the entire content with module name as key
          mergedData[moduleName] = moduleData;
        }

        console.log(`✓ Merged ${moduleName} translations for ${language}`);
      } catch (error) {
        console.error(
          `Error loading ${moduleName}/${language}.json:`,
          error.message
        );
      }
    } else {
      console.log(`✗ No ${language} translations found for ${moduleName}`);
    }
  });

  // Save the merged file
  const outputPath = path.join(MERGED_LOCALES_DIR, `${language}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2), "utf8");
  console.log(`✓ Saved merged ${language}.json to ${outputPath}`);

  return outputPath;
}

/**
 * Get all available languages from modules and common
 * @returns {string[]} Array of language codes
 */
function getAllLanguages() {
  const languages = new Set();
  const modules = getModulesWithLocales();

  // Check common languages
  const commonDir = path.join(GLOBAL_LOCALES_DIR, "common");
  if (fs.existsSync(commonDir)) {
    const files = fs.readdirSync(commonDir);
    files.forEach((file) => {
      if (file.endsWith(".json")) {
        languages.add(file.replace(".json", ""));
      }
    });
  }

  // Check module languages
  modules.forEach((moduleName) => {
    const moduleLocalesDir = path.join(MODULES_DIR, moduleName, "locales");
    if (fs.existsSync(moduleLocalesDir)) {
      const files = fs.readdirSync(moduleLocalesDir);
      files.forEach((file) => {
        if (file.endsWith(".json")) {
          languages.add(file.replace(".json", ""));
        }
      });
    }
  });

  return Array.from(languages);
}

/**
 * Get the merged locale file path for a language
 * Creates/updates the merged file if needed
 * @param {string} lng - Language code
 * @returns {string} Path to merged JSON file
 */
function getMergedLocalePath(lng) {
  const mergedPath = path.join(MERGED_LOCALES_DIR, `${lng}.json`);

  // Check if merged file exists and is recent
  if (fs.existsSync(mergedPath)) {
    const stats = fs.statSync(mergedPath);
    const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

    // Regenerate if file is older than 1 hour (or in development)
    if (process.env.NODE_ENV === "development" || ageInHours > 1) {
      console.log(
        `Regenerating merged ${lng}.json (age: ${ageInHours.toFixed(1)} hours)`
      );
      mergeAllLocales(lng);
    }
  } else {
    // Generate if doesn't exist
    console.log(`Generating merged ${lng}.json for the first time`);
    mergeAllLocales(lng);
  }

  return mergedPath;
}

/**
 * Initialize all merged locales (call this at startup)
 */
function initializeAllMergedLocales() {
  const languages = getAllLanguages();
  console.log(
    `Initializing merged locales for languages: ${languages.join(", ")}`
  );

  languages.forEach((language) => {
    mergeAllLocales(language);
  });

  console.log("✓ All merged locales initialized");
}

module.exports = {
  getModulesWithLocales,
  getAllLanguages,
  getMergedLocalePath,
  initializeAllMergedLocales,
  mergeAllLocales,
};
