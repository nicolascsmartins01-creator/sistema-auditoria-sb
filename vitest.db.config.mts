import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes do banco (permissões/RLS, trilha, importação). Precisam de um
// Postgres local — veja test/db/README.md.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["test/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
  },
});
