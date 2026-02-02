// seeders/faceSeeder.js

require("dotenv").config();
const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");
const { generateMockEmbedding } = require("./data/faceData");

const logger = {
  info: (msg) => console.log(`ℹ️ ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

// Generate 100 fake users with consistent data
const generateUsersData = () => {
  const users = [];
  const roles = ['User', 'Moderator', 'Admin']; // Adjust based on your roles
  
  for (let i = 1; i <= 100; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}`;
    const email = faker.internet.email({ firstName, lastName });
    const phone = faker.phone.number('091#######');
    const roleName = roles[Math.floor(Math.random() * roles.length)];
    
    // Generate password that meets your criteria (like "Password@1234")
    const password = `${firstName}@${i}${Math.floor(Math.random() * 1000)}`;
    
    users.push({
      firstName,
      lastName,
      username,
      phone,
      email,
      password,
      roleName,
      customPermissions: [],
      isActive: true,
      // Face data will be added separately
    });
  }
  
  // Add your existing users from usersData.js
  const existingUsers = require("./data/usersData");
  return [...existingUsers, ...users];
};

// Generate face data for users
const generateFaceDataForUsers = (usersFromDB) => {
  const faceData = [];
  
  for (const user of usersFromDB) {
    // Skip if already has face data (optional check)
    const hasFaceData = Math.random() > 0.2; // 80% of users get face data
    
    if (hasFaceData) {
      faceData.push({
        userId: user.id, // Use actual user ID from database
        embedding: generateMockEmbedding(),
        createdAt: faker.date.recent({ days: 30 }),
        updatedAt: faker.date.recent({ days: 7 })
      });
    }
  }
  
  return faceData;
};

// Clear existing face data
const clearFaceData = async (prisma) => {
  try {
    await prisma.userFace.deleteMany({});
    logger.success("Cleared all face data");
  } catch (err) {
    logger.warn(`Could not clear face data: ${err.message}`);
  }
};

// Seed face data
const seedFaceData = async (prisma, users) => {
  let seededCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    try {
      // Check if user already has face data
      const existingFace = await prisma.userFace.findUnique({
        where: { userId: user.id }
      });
      
      if (existingFace) {
        skippedCount++;
        continue;
      }
      
      // Generate mock embedding
      const embedding = generateMockEmbedding();
      
      // Create face record
      await prisma.userFace.create({
        data: {
          userId: user.id,
          embedding,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      seededCount++;
      
      // Progress indicator
      if (seededCount % 10 === 0) {
        logger.info(`Seeded ${seededCount} faces...`);
      }
    } catch (err) {
      logger.error(`Error seeding face for user ${user.email}: ${err.message}`);
    }
  }
  
  logger.success(`Seeded ${seededCount} user faces (skipped ${skippedCount} existing)`);
  return seededCount;
};

// Alternative: Seed face data for specific users
const seedFaceDataForExistingUsers = async (prisma) => {
  try {
    // Get all users from database
    const users = await prisma.user.findMany({
      where: {
        status: 'active',
        is_verified: true
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true
      }
    });
    
    logger.info(`Found ${users.length} active users for face seeding`);
    
    // Generate face data for a percentage of users
    const usersToSeed = users.slice(0, Math.min(users.length, 100)); // Limit to 100 users
    
    return await seedFaceData(prisma, usersToSeed);
  } catch (err) {
    logger.error(`Error in seedFaceDataForExistingUsers: ${err.message}`);
    throw err;
  }
};

// Generate mock faces for testing recognition
const generateTestFaces = (count = 10) => {
  const testFaces = [];
  
  for (let i = 0; i < count; i++) {
    testFaces.push({
      id: `test_face_${i + 1}`,
      embedding: generateMockEmbedding(),
      label: `Test Person ${i + 1}`,
      confidence: Math.random()
    });
  }
  
  return testFaces;
};

module.exports = {
  generateUsersData,
  generateFaceDataForUsers,
  clearFaceData,
  seedFaceData,
  seedFaceDataForExistingUsers,
  generateTestFaces,
  generateMockEmbedding
};