module.exports = async ({ prisma, logger }) => {
  logger.info("Seeding ID generations...");

  const users = await prisma.user.findMany({ where: { role: "USER" } });

  for (const user of users) {
    // Example extracted data
    const extractedData = {
      name_am: "አማርኛ ስም", // You can customize per user if needed
      name_en: user.fullName || "English Name",
      date_of_birth_am: "1990/01/01",
      date_of_birth_en: "1990-01-01",
      sex_am: "ሴት",
      sex_en: "Female",
      nationality_am: "ኢትዮጵያዊ",
      nationality_en: "Ethiopian",
      phone_number: user.phoneNumber || "0900000000",
      region_am: "አማርኛ ክልል",
      region_en: "English Region",
      zone_am: "አማርኛ ዞን",
      zone_en: "English Zone",
      woreda_am: "አማርኛ ወረዳ",
      woreda_en: "English Woreda",
      fcn: "FCN" + Math.floor(Math.random() * 1000000), // random example
      fin: "FIN" + Math.floor(Math.random() * 1000000), // random example
      issueDate_am: "2018/05/20",
      issueDate_en: "2026/01/28",
      sn: Math.floor(Math.random() * 1000000),
    };

    const generation = await prisma.iDGeneration.create({
      data: {
        userId: user.id,
        status: "COMPLETED",
        fin: extractedData.fin,
        fcn: extractedData.fcn,
        phoneNumber: extractedData.phone_number,
        extractedData,
        cost: 1, // example cost
      },
    });

    // Seed files for this generation
    await prisma.storedFile.createMany({
      data: [
        {
          generationId: generation.id,
          role: "SOURCE_PDF",
          fileUrl: "https://example.com/source.pdf",
          fileName: "source.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
        },
        {
          generationId: generation.id,
          role: "FRONT_ID",
          fileUrl: "https://example.com/front.jpg",
          fileName: "front.jpg",
          mimeType: "image/jpeg",
          fileSize: 512,
        },
        {
          generationId: generation.id,
          role: "BACK_ID",
          fileUrl: "https://example.com/back.jpg",
          fileName: "back.jpg",
          mimeType: "image/jpeg",
          fileSize: 512,
        },
      ],
    });

    logger.info(`✅ ID generation created for: ${user.email}`);
  }

  logger.success("🎉 ID Generations seeded successfully");
};
