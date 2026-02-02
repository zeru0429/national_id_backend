// idGenerationController code
const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const idGenService = require("../services/idGenerationService");
const { StatusCodes } = require("http-status-codes");

// Generate new ID
const generateID = catchAsync(async (req, res) => {
  const generation = await idGenService.generateID(req.user.id, req.body);
  res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        generation,
        req.t("id_generation.generated"),
      ),
    );
});

// Regenerate existing ID
const regenerateID = catchAsync(async (req, res) => {
  const generation = await idGenService.regenerateID(
    req.user.id,
    req.params.generationId,
  );
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        generation,
        req.t("id_generation.regenerated"),
      ),
    );
});

// Get all generations for user
const getUserGenerations = catchAsync(async (req, res) => {
  const generations = await idGenService.getUserGenerations(req.user.id);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        generations,
        req.t("id_generation.listed"),
      ),
    );
});

// Get a single generation by ID
const getGenerationById = catchAsync(async (req, res) => {
  const generation = await idGenService.getGenerationById(
    req.user.id,
    req.params.generationId,
  );
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        generation,
        req.t("id_generation.retrieved"),
      ),
    );
});

module.exports = {
  generateID,
  regenerateID,
  getUserGenerations,
  getGenerationById,
};
