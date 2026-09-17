import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<string>();

// Runs `fn` with the given Postgres schema attached to every downstream
// async operation in its call chain (no need to pass it as a parameter
// anywhere) — this is what lets Sandbox mode point every existing service
// file's unqualified `FROM products` style queries at the "sandbox" schema
// instead of "public", with none of those files needing to know sandbox
// mode exists (see database.ts's query()/transaction()).
export const runInSchema = <T>(schemaName: string, fn: () => T): T => {
  return storage.run(schemaName, fn);
};

// Returns undefined when no schema override is active (the normal case —
// every query resolves against the default "public" schema) — only set
// while a Sandbox-mode request is in flight (see middleware/auth.ts).
export const getCurrentSchema = (): string | undefined => {
  return storage.getStore();
};
