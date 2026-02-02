// dev/scripts/seeders/chatSeeder.js

const logger = {
  info: (msg) => console.log(`ℹ️ ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

// --- Clear Chat Data ---
const clearChatData = async (prisma) => {
  const tables = [
    "messageReaction",
    "messageAttachment",
    "message",
    "chatRoomParticipant",
    "blockedUser",
    "userChatVisibilityRule",
    "chatRoom",
    "chatVisibilityRule",
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}" CASCADE;`);
      logger.info(`Cleared ${table} table`);
    } catch (err) {
      logger.warn(`Could not clear ${table}: ${err.message}`);
    }
  }
  logger.success("Chat data cleared");
};

// --- Seed Chat Data ---
const seedChatData = async (prisma) => {
  logger.info("Starting chat data seeding...");

  try {
    // Get some users to use in chat data
    const users = await prisma.user.findMany({
      take: 6,
      select: { id: true, first_name: true, last_name: true, email: true },
    });

    logger.info(`Found ${users.length} users for chat seeding`);

    if (users.length < 2) {
      logger.warn("Need at least 2 users to seed chat data");
      return;
    }

    // Use only the available users
    const [user1, user2, user3, user4] = users;

    // 1. Seed Chat Visibility Rules
    logger.info("Seeding chat visibility rules...");
    await prisma.chatVisibilityRule.createMany({
      data: [
        {
          rule_name: "Default User Rule",
          visible_fields: JSON.stringify([
            "first_name",
            "last_name",
            "gender",
            "religion",
          ]),
          controlled_by: "admin_only",
          is_active: true,
        },
        {
          rule_name: "Premium User Rule",
          visible_fields: JSON.stringify([
            "first_name",
            "last_name",
            "gender",
            "religion",
            "height",
            "country",
            "city",
          ]),
          controlled_by: "admin_only",
          is_active: true,
        },
        {
          rule_name: "Verified User Rule",
          visible_fields: JSON.stringify([
            "first_name",
            "last_name",
            "gender",
            "religion",
            "height",
            "bio",
          ]),
          controlled_by: "admin_only",
          is_active: true,
        },
      ],
      skipDuplicates: true,
    });

    // Assign default visibility rule to all users
    const defaultRule = await prisma.chatVisibilityRule.findFirst({
      where: { rule_name: "Default User Rule" },
    });

    if (defaultRule) {
      await prisma.userChatVisibilityRule.createMany({
        data: users.map((user) => ({
          user_id: user.id,
          rule_id: defaultRule.id,
        })),
        skipDuplicates: true,
      });
    }

    // 2. Seed Chat Rooms - Use upsert to handle duplicates
    logger.info("Seeding chat rooms...");

    // Generate unique room codes with timestamp to avoid conflicts
    const timestamp = Date.now();

    const chatRoomsData = [
      // Private chat between user1 and user2
      {
        room_code: `private_${user1.id}_${user2.id}_${timestamp}`,
        created_by: user1.id,
        is_group_chat: false,
      },
    ];

    // Add second private chat if we have at least 4 users
    if (users.length >= 4) {
      chatRoomsData.push({
        room_code: `private_${user3.id}_${user4.id}_${timestamp}`,
        created_by: user3.id,
        is_group_chat: false,
      });
    }

    // Add group chat if we have at least 3 users
    if (users.length >= 3) {
      chatRoomsData.push({
        room_code: `group_friends_${timestamp}`,
        created_by: user1.id,
        is_group_chat: true,
      });
    }

    // Create chat rooms using createMany with skipDuplicates
    await prisma.chatRoom.createMany({
      data: chatRoomsData,
      skipDuplicates: true,
    });

    // Get the created chat rooms
    const chatRooms = await prisma.chatRoom.findMany({
      where: {
        room_code: {
          in: chatRoomsData.map((room) => room.room_code),
        },
      },
    });

    const privateChat1 = chatRooms.find(
      (room) => room.is_group_chat === false && room.created_by === user1.id
    );
    const privateChat2 = chatRooms.find(
      (room) => room.is_group_chat === false && room.created_by === user3.id
    );
    const groupChat = chatRooms.find((room) => room.is_group_chat === true);

    // 3. Seed Chat Room Participants
    logger.info("Seeding chat participants...");
    const participantsData = [];

    if (privateChat1) {
      participantsData.push(
        { room_id: privateChat1.id, user_id: user1.id },
        { room_id: privateChat1.id, user_id: user2.id }
      );
    }

    // Add participants for second private chat if it exists
    if (privateChat2) {
      participantsData.push(
        { room_id: privateChat2.id, user_id: user3.id },
        { room_id: privateChat2.id, user_id: user4.id }
      );
    }

    // Add participants for group chat if it exists
    if (groupChat) {
      // Add all available users to the group chat
      users.forEach((user) => {
        participantsData.push({
          room_id: groupChat.id,
          user_id: user.id,
        });
      });
    }

    if (participantsData.length > 0) {
      await prisma.chatRoomParticipant.createMany({
        data: participantsData,
        skipDuplicates: true,
      });
    }

    // 4. Seed Messages
    logger.info("Seeding messages...");
    const messagesData = [];

    // Messages in private chat 1
    if (privateChat1) {
      messagesData.push(
        prisma.message.create({
          data: {
            room_id: privateChat1.id,
            sender_id: user1.id,
            message_type: "text",
            message_text: `Hi ${user2.first_name}! How are you doing today?`,
            status: "read",
          },
        }),
        prisma.message.create({
          data: {
            room_id: privateChat1.id,
            sender_id: user2.id,
            message_type: "text",
            message_text: `Hello ${user1.first_name}! I'm doing great, thanks for asking. How about you?`,
            status: "read",
          },
        }),
        prisma.message.create({
          data: {
            room_id: privateChat1.id,
            sender_id: user1.id,
            message_type: "text",
            message_text:
              "I'm good too! Would you like to meet up this weekend?",
            status: "delivered",
          },
        })
      );
    }

    // Add messages to second private chat if it exists
    if (privateChat2) {
      messagesData.push(
        prisma.message.create({
          data: {
            room_id: privateChat2.id,
            sender_id: user3.id,
            message_type: "text",
            message_text: `Hey ${user4.first_name}, I saw we have similar interests in hiking!`,
            status: "read",
          },
        })
      );
    }

    // Add messages to group chat if it exists
    if (groupChat) {
      messagesData.push(
        prisma.message.create({
          data: {
            room_id: groupChat.id,
            sender_id: user1.id,
            message_type: "text",
            message_text: "Welcome to our friend group chat everyone! 👋",
            status: "read",
          },
        }),
        prisma.message.create({
          data: {
            room_id: groupChat.id,
            sender_id: user2.id,
            message_type: "text",
            message_text:
              "Thanks for creating the group! Looking forward to chatting with everyone.",
            status: "read",
          },
        })
      );

      // Add third user message if available
      if (user3) {
        messagesData.push(
          prisma.message.create({
            data: {
              room_id: groupChat.id,
              sender_id: user3.id,
              message_type: "text",
              message_text: "Hello everyone! Nice to meet you all. 😊",
              status: "delivered",
            },
          })
        );
      }
    }

    let messages = [];
    if (messagesData.length > 0) {
      messages = await Promise.all(messagesData);
    }

    // 5. Seed Message Attachments
    logger.info("Seeding message attachments...");
    const mediaMessage = messages.find((m) => m.message_type === "media");
    if (mediaMessage) {
      await prisma.messageAttachment.create({
        data: {
          message_id: mediaMessage.id,
          attachment_type: "image",
          file_url: "https://example.com/images/sunset-hike.jpg",
          file_size: 2048,
          mime_type: "image/jpeg",
        },
      });
    }

    // 6. Seed Message Reactions - only if we have messages
    logger.info("Seeding message reactions...");
    if (messages.length > 0) {
      const reactionsData = [];

      if (messages[0]) {
        reactionsData.push({
          message_id: messages[0].id,
          user_id: user2.id,
          reaction_type: "👍",
        });
      }

      // Add more reactions if we have group chat messages
      if (messages.length > 3 && messages[3]) {
        reactionsData.push({
          message_id: messages[3].id, // First group message
          user_id: user2.id,
          reaction_type: "❤️",
        });

        if (user3) {
          reactionsData.push({
            message_id: messages[3].id,
            user_id: user3.id,
            reaction_type: "😊",
          });
        }
      }

      if (reactionsData.length > 0) {
        await prisma.messageReaction.createMany({
          data: reactionsData,
          skipDuplicates: true,
        });
      }
    }

    // 7. Seed Blocked Users - only if we have at least 2 users
    logger.info("Seeding blocked users...");
    if (users.length >= 2) {
      await prisma.blockedUser.create({
        data: {
          blocker_id: user1.id,
          blocked_user_id: user2.id,
          reason: "Inappropriate behavior",
        },
      });
    }

    // Update last_seen_at for some participants
    logger.info("Updating participant last seen...");
    if (privateChat1) {
      await prisma.chatRoomParticipant.updateMany({
        where: {
          room_id: privateChat1.id,
          user_id: { in: [user1.id, user2.id] },
        },
        data: {
          last_seen_at: new Date(),
        },
      });
    }

    // Log statistics
    const stats = {
      visibilityRules: await prisma.chatVisibilityRule.count(),
      chatRooms: await prisma.chatRoom.count(),
      participants: await prisma.chatRoomParticipant.count(),
      messages: await prisma.message.count(),
      attachments: await prisma.messageAttachment.count(),
      reactions: await prisma.messageReaction.count(),
      blockedUsers: await prisma.blockedUser.count(),
    };

    logger.success(`Chat data seeding completed!`);
    logger.info(`📊 Seeded:
   - ${stats.visibilityRules} visibility rules
   - ${stats.chatRooms} chat rooms  
   - ${stats.participants} participants
   - ${stats.messages} messages
   - ${stats.attachments} attachments
   - ${stats.reactions} reactions
   - ${stats.blockedUsers} blocked users`);
  } catch (error) {
    logger.error("Error seeding chat data:");
    logger.error(error.message);
    logger.error(error.stack);
    throw error;
  }
};

module.exports = {
  seedChatData,
  clearChatData,
};
