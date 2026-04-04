# frontend

⚡ **FluxStack Application** - Modern full-stack TypeScript framework

## 🚀 Getting Started

```bash
# Start development
bun run dev

# Build for production  
bun run build

# Start production server
bun run start
```

## 📁 Project Structure

```
frontend/
├── core/          # FluxStack framework (don't modify)
├── app/           # Your application code
│   ├── server/    # Backend API routes
│   ├── client/    # Frontend React app
│   └── shared/    # Shared types and utilities
└── package.json
```

## 🔥 Features

- **⚡ Bun Runtime** - 3x faster than Node.js
- **🔒 Full Type Safety** - Eden Treaty + TypeScript
- **🎨 Modern UI** - React 19 + Tailwind CSS v4
- **📋 Auto Documentation** - Swagger UI generated
- **🔄 Hot Reload** - Backend + Frontend
- **🔌 Plugin System** - Extensible with custom plugins

## 🔌 Adding Plugins

### Built-in Plugins
FluxStack includes several built-in plugins that are ready to use:

```typescript
// app/server/index.ts
import { loggerPlugin, swaggerPlugin, staticPlugin } from "@core/server"

// Add built-in plugins
app.use(loggerPlugin)
app.use(swaggerPlugin)
```

### Custom Plugin Example

```typescript
// app/server/plugins/auth.ts
import { Elysia } from 'elysia'

export const authPlugin = new Elysia({ name: 'auth' })
  .derive(({ headers }) => ({
    user: getUserFromToken(headers.authorization)
  }))
  .guard({
    beforeHandle({ user, set }) {
      if (!user) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
    }
  })

// Use in app/server/index.ts
import { authPlugin } from './plugins/auth'
app.use(authPlugin)
```

### Available Plugin Hooks
- `setup` - Initialize plugin resources
- `onServerStart` - Run when server starts
- `onRequest` - Process incoming requests
- `onResponse` - Process outgoing responses
- `onError` - Handle errors

## 📖 Learn More

- **LLM Documentation**: Check `LLMD/INDEX.md` for AI-optimized docs
- **Plugin Guide**: Check `LLMD/resources/plugins-external.md`
- **FluxStack Docs**: Visit the [FluxStack Repository](https://github.com/MarcosBrendonDePaula/FluxStack)

---

Built with ❤️ using FluxStack
