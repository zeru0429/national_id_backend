// storedFileService code
const { prisma } = require("../../../config/db");

const getFilesByGeneration = async (generationId) => {
  return prisma.storedFile.findMany({
    where: { generationId },
  });
};

const deleteFile = async (id) => {
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) throw new Error("files.not_found");
  return prisma.storedFile.delete({ where: { id } });
};

module.exports = {
  getFilesByGeneration,
  deleteFile,
};
