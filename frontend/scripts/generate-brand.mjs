import { chromium } from "playwright"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = join(root, "public")
const palette = JSON.parse(readFileSync(join(root, "brand/palette.json"), "utf8"))
const master = readFileSync(join(root, "brand/roo.svg"), "utf8")
const mark = master.match(/<path[^>]+\/>/)[0]
const font = readFileSync(join(publicDir, "fonts/vazirmatn/Vazirmatn.woff2")).toString("base64")
const convert = process.env.IMAGEMAGICK_BINARY || "convert"
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${body}</svg>\n`
const recolor = (color) => mark.replace(palette.plum, color)
const title = `<title>${palette.name} — Roo</title>`
const vector = (name, content) => writeFileSync(join(publicDir, name), content)
const raster = (source, destination, size) => execFileSync(convert, ["-background", "none", "-density", "384", join(publicDir, source), "-resize", `${size}x${size}`, "-strip", "-depth", "8", join(publicDir, destination)])
const tile = svg(`<rect width="128" height="128" rx="28" fill="${palette.plum}"/><g transform="translate(9 9) scale(.86)">${recolor(palette.lilac)}</g>`)
const maskable = svg(`<rect width="128" height="128" fill="${palette.plum}"/><g transform="translate(19.2 19.2) scale(.7)">${recolor(palette.lilac)}</g>`)

let browser
async function screenshot(name, html, width, height) {
  browser ??= await chromium.launch({ executablePath: process.env.CHROMIUM_BINARY || undefined })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
    @font-face{font-family:Vazirmatn;src:url(data:font/woff2;base64,${font});font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;font-family:Vazirmatn,sans-serif;-webkit-font-smoothing:antialiased}svg{display:block;width:100%;height:100%}
    ${html.style}</style></head><body>${html.body}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(publicDir, name) })
  await page.close()
}

try {
  vector("logo.svg", svg(title + mark))
  vector("logo-light.svg", svg(title + recolor(palette.lilac)))
  vector("logo-mono.svg", svg(title + recolor("#000000")))
  // Opaque lilac field keeps the smallest browser icons visible on either tab theme.
  vector("favicon.svg", svg(title + `<rect width="128" height="128" rx="28" fill="${palette.lilac}"/>` + mark))
  vector("app-icon.svg", tile)
  vector("maskable-icon.svg", maskable)
  raster("logo.svg", "logo-mark.png", 512)
  raster("logo-light.svg", "logo-mark-light.png", 512)
  for (const size of [16, 32, 48]) raster("favicon.svg", `favicon-${size}x${size}.png`, size)
  execFileSync(convert, [16, 32, 48].map(size => join(publicDir, `favicon-${size}x${size}.png`)).concat(join(publicDir, "favicon.ico")))
  for (const size of [192, 512]) raster("app-icon.svg", `icon-${size}.png`, size)
  raster("maskable-icon.svg", "icon-maskable-512.png", 512)
  raster("maskable-icon.svg", "apple-touch-icon.png", 180)

  await screenshot("og.png", {
    style: `body{width:1200px;height:630px;background:${palette.paper};color:${palette.ink};padding:52px;display:grid;grid-template-columns:1.15fr 1fr;gap:52px;align-items:stretch}.copy{display:flex;flex-direction:column;justify-content:center;align-items:flex-start}.lockup{display:flex;align-items:center;gap:12px;color:${palette.plum};font-size:34px;font-weight:850}.lockup i{display:block;width:52px;height:52px}h1{font-size:51px;font-weight:850;line-height:1.65;margin:30px 0 14px}p{font-size:21px;color:${palette.muted};margin:0}footer{margin-top:38px;font-size:17px;color:${palette.plum}}.poster{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;background:${palette.plum};border-radius:4px 4px 74px 4px;color:${palette.lilac};padding:30px}.poster i{display:block;width:310px;height:310px}.poster strong{font-size:25px;font-weight:550}`,
    body: `<div class="copy"><div class="lockup"><i>${svg(mark)}</i><span>${palette.name}</span></div><h1>تماس تصویری<br>و جلسه آنلاین</h1><p>در مرورگر، بدون نصب و ثبت‌نام</p><footer dir="ltr">roobro.ir</footer></div><div class="poster"><i>${svg(recolor(palette.lilac))}</i><strong>فاصله کمتر. گفت‌وگوی بیشتر.</strong></div>`,
  }, 1200, 630)
  const manifest = JSON.parse(readFileSync(join(publicDir, "site.webmanifest"), "utf8"))
  manifest.name = palette.name
  manifest.short_name = palette.name
  manifest.background_color = palette.paper
  manifest.theme_color = palette.plum
  manifest.icons = [192, 512].map(size => ({ src: `/icon-${size}.png?v=roo-1`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" }))
  manifest.icons.push({ src: "/icon-maskable-512.png?v=roo-1", sizes: "512x512", type: "image/png", purpose: "maskable" })
  writeFileSync(join(publicDir, "site.webmanifest"), JSON.stringify(manifest, null, 2) + "\n")
  console.log("Generated Roo logos, favicons, app icons, maskable icon, social card and manifest.")
} finally {
  await browser?.close()
}
