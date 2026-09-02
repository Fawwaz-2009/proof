import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
  server: {
    watch: {
      ignored: ["**/.alchemy/**"],
    },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
