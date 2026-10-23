import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Keep dependencies (notably @lydell/node-pty's native binding) external
  // to the main/preload bundles — they resolve from node_modules at runtime.
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: "src/preload/index.ts", pet: "src/preload/pet.ts", petNotice: "src/preload/pet-notice.ts" } } },
  },
  renderer: {
    plugins: [react()],
    build: { rollupOptions: { input: { index: "src/renderer/index.html", pet: "src/renderer/pet.html", petNotice: "src/renderer/pet-notice.html" } } },
    server: process.env.UNBIASED_DEV_PORT
      ? { port: Number(process.env.UNBIASED_DEV_PORT), strictPort: true }
      : undefined,
  },
});
