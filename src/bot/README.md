# Telegram ID Generation Bot

A **Telegram bot** for generating ID cards from PDFs, managing past generations, searching IDs, and tracking user subscriptions.

## Architecture

### Folder Structure

```
bot/
├── index.js                 # Entry point
├── config/
│   └── constants.js         # Bot constants (costs, limits)
├── middleware/
│   ├── auth.middleware.js   # User authentication
│   └── admin.middleware.js  # Admin authorization
├── services/                # Bot orchestration (uses module services only)
│   ├── telegramUser.service.js
│   ├── idGeneration.service.js
│   └── admin.service.js
├── ui/                      # Messages and keyboards
│   ├── messages.js          # All message templates
│   ├── keyboards.js         # Inline keyboard definitions
│   └── formatters.js        # escapeMarkdown, formatDate
├── handlers/
│   ├── start.handler.js
│   ├── registration.handler.js
│   ├── idGeneration.handler.js
│   └── admin.handler.js
├── dispatchers/
│   ├── message.dispatcher.js    # Routes messages
│   └── callback.dispatcher.js   # Routes callback queries
└── utils/
    ├── stateManager.js      # Per-user conversation state
    └── validators.js        # Input validation
```

### Design Principles

- **No direct DB in handlers**: All database access goes through module services
- **Separated concerns**: UI (messages/keyboards), business logic (services), routing (dispatchers)
- **Middleware**: Auth and admin authorization for protected actions
- **Consistent naming**: `*.handler.js`, `*.service.js`, `*.middleware.js`

### Extending the Bot

- **New menu options**: Add callback data in `ui/keyboards.js`, handle in `callback.dispatcher.js`
- **New features**: Add service method in `services/`, call from handler
- **New validation**: Add to `utils/validators.js`
