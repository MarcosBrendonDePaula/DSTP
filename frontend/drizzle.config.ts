import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './app/server/db/schema.ts',
  out: './app/server/db/migrations',
  dialect: 'sqlite',
})
