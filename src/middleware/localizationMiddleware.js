const path = require("path");
const Backend = require("i18next-fs-backend");
const i18next = require("i18next");
const middleware = require("i18next-http-middleware");

// Initialize i18next
i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "am",],
    preload: ["am", "en"],
    backend: {
      loadPath: path.join(__dirname, "../locales/common/{{lng}}.json"),
    },
    detection: {
      order: ["querystring", "header"],
      lookupQuerystring: "lng",
      caches: false,
    },
    debug: process.env.NODE_ENV === "development",
  });

// Export the middleware and i18next instance
module.exports = {
  i18nMiddleware: middleware.handle(i18next),
  i18next,
  t: i18next.t.bind(i18next),
};
