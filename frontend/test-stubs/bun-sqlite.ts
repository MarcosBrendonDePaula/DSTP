// Stub for bun:sqlite under the vitest (node) runner. Pure-logic tests that
// transitively import @server/db never actually touch the DB; this just keeps
// the module graph loadable.
export class Database {
  constructor(_path?: string) {}
  run() {}
  query() { return { all: () => [], get: () => undefined, run: () => {} } }
  prepare() { return { all: () => [], get: () => undefined, run: () => {} } }
  close() {}
  exec() {}
}
export default Database
