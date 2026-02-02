// idGenerationRoutes code
const router = require("express").Router();
const idGenController = require("../controllers/idGenerationController");
const validate = require("../../../middleware/validatorMiddleware");
const idGenValidation = require("../validations/idGenerationValidation");
const authenticate = require("../../../middleware/authMiddleware");

// All routes are protected
router.use(authenticate);

// Generate new ID
router.post(
  "/generate",
  validate(idGenValidation.generate),
  idGenController.generateID,
);

// Regenerate an existing ID (use FIN/FCN)
router.post("/regenerate/:generationId", idGenController.regenerateID);

// Get all generations of the current user
router.get("/", idGenController.getUserGenerations);

// Get a single generation by ID
router.get("/:generationId", idGenController.getGenerationById);

module.exports = router;
