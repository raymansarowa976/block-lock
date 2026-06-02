import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "path"
import { copyFileSync, mkdirSync } from "fs"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-extension-files",
      closeBundle() {
        mkdirSync(resolve(__dirname, "dist/src"), { recursive: true })
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(__dirname, "dist/manifest.json"),
        )
        // Copy the compiled background service worker into dist so the
        // manifest's "src/background.js" path resolves correctly when
        // loading dist/ as an unpacked extension.
        copyFileSync(
          resolve(__dirname, "src/background.js"),
          resolve(__dirname, "dist/src/background.js"),
        )
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
      },
    },
  },
})