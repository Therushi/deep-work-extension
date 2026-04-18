// vite.config.ts
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: ["src/blocked/blocked.html"],
      browser: "chrome",
      webExtConfig: {
        target: "chromium",
        chromiumBinary:
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
  },
});
