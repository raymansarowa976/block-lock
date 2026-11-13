import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "path"
import { cpSync, readFileSync, writeFileSync } from "fs"
import { manifestForMode } from "./scripts/manifest-for-mode.mjs"
import { outDirForMode } from "./scripts/build-paths.mjs"

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
          resolve(outDirForMode(mode), "manifest.json"),
          JSON.stringify(manifestForMode(manifest, mode), null, 2) + "\n",
        )
        cpSync(resolve(__dirname, "icons"), resolve(outDirForMode(mode), "icons"), {
          recursive: true,
        })
      },
    },
  ],
  build: {
    // Store builds go to dist-store/, dev builds to dist/ (see build-paths.mjs).
    outDir: outDirForMode(mode),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        blocked: resolve(__dirname, "blocked.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        // background entry goes to <outDir>/src/background.js to match the
        // manifest's service_worker path when the folder is loaded as an extension
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "src/[name].js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
}))