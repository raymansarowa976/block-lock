import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "path"
import { cpSync, readFileSync, writeFileSync } from "fs"
import { manifestForMode } from "./scripts/manifest-for-mode.mjs"

export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-manifest",
      closeBundle() {
        const manifest = JSON.parse(readFileSync(resolve(__dirname, "manifest.json"), "utf-8"))
        writeFileSync(
          resolve(__dirname, "dist/manifest.json"),
          JSON.stringify(manifestForMode(manifest, mode), null, 2) + "\n",
        )
        cpSync(resolve(__dirname, "icons"), resolve(__dirname, "dist/icons"), {
          recursive: true,
        })
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        blocked: resolve(__dirname, "blocked.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        // background entry goes to dist/src/background.js to match the
        // manifest's service_worker path when dist/ is loaded as an extension
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "src/[name].js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
}))