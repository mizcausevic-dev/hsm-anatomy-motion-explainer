import { defineConfig } from "vite";

// Relative base so the same build works on GitHub Pages project URLs and locally.
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 43127, strictPort: true },
  preview: { host: "0.0.0.0", port: 43128, strictPort: true },
});
