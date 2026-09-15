import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Served under https://pierrebeaucoral.github.io/on-se-retrouve/ ; override with VITE_BASE for other hosts.
export default defineConfig(({ command }) => ({
  base: command === "build" ? process.env.VITE_BASE ?? "/on-se-retrouve/" : "/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: { outDir: "dist", sourcemap: false },
}));
