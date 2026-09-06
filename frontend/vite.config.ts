import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const isBuild = process.argv.includes("build")

export default defineConfig({
  plugins: [tailwindcss(), isBuild && nitro({ preset: "bun" }), tanstackStart(), react()],
  publicDir: path.resolve(__dirname, "./public"),
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false },
      "/rtc": { target: "http://localhost:7880", changeOrigin: true, ws: true }
    }
  }
})
