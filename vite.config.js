import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // Обеспечивает корректную работу путей на GitHub Pages
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 22995,
    host: "0.0.0.0"
  }
});