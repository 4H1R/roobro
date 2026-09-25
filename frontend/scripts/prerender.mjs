import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = fileURLToPath(new URL("../", import.meta.url))
const output = new URL("../dist/", import.meta.url)
const template = await readFile(new URL("index.html", output), "utf8")
const placeholder = '<div id="app"></div>'
if (!template.includes(placeholder)) throw new Error("Missing prerender placeholder")

// Keep private routes separate from the indexable, pre-rendered homepage.
const appShell = template
  .replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex" />')
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "")
await writeFile(new URL("app.html", output), appShell)

const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
})
try {
  const { renderHomePage } = await vite.ssrLoadModule("/src/prerender.tsx")
  const html = await renderHomePage()
  if (!html.includes("<h1>") || !html.includes("تماس تصویری")) {
    throw new Error("Homepage prerender did not produce the public Persian content")
  }
  await writeFile(new URL("index.html", output), template.replace(placeholder, () => `<div id="app">${html}</div>`))
  console.log("Pre-rendered Persian homepage and created noindex app shell.")
} finally {
  await vite.close()
}
