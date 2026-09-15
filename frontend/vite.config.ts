import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), tailwindcss(), react()],
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
