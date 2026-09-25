import assert from "node:assert/strict"
import { readFile, access } from "node:fs/promises"
import { JSDOM } from "jsdom"

const output = new URL("../dist/", import.meta.url)
const home = new JSDOM(await readFile(new URL("index.html", output), "utf8")).window.document
const shell = new JSDOM(await readFile(new URL("app.html", output), "utf8")).window.document
const origin = "https://roobro.ir/"

assert.equal(home.documentElement.lang, "fa")
assert.equal(home.documentElement.dir, "rtl")
assert.equal(home.querySelectorAll("h1").length, 1)
assert.match(home.querySelector("#app").textContent, /تماس تصویری و جلسه آنلاین/)
assert.match(home.querySelector("#app").textContent, /صفحه‌تان را به اشتراک بگذارید/)
assert.equal(home.querySelector('link[rel="canonical"]').href, origin)
assert.doesNotMatch(home.querySelector('meta[name="robots"]')?.content ?? "", /noindex/)
assert.match(home.title, /رو به رو/)
const site = JSON.parse(home.querySelector('script[type="application/ld+json"]').textContent)
assert.equal(site["@type"], "WebSite")
assert.equal(site.url, origin)
assert.ok(site.alternateName.includes("Roobro"))

assert.equal(shell.querySelector('meta[name="robots"]').content, "noindex")
assert.equal(shell.querySelector('link[rel="canonical"]'), null)
assert.equal(shell.querySelector('script[type="application/ld+json"]'), null)
assert.equal(shell.querySelector("#app").textContent, "")

const image = new URL(home.querySelector('meta[property="og:image"]').content)
assert.equal(image.origin, new URL(origin).origin)
assert.equal(home.querySelector('meta[name="twitter:image"]').content, image.href)
const png = await readFile(new URL(`.${image.pathname}`, output))
assert.equal(png.readUInt32BE(16), 1200)
assert.equal(png.readUInt32BE(20), 630)
for (const script of home.querySelectorAll('script[src]')) {
  await access(new URL(`.${script.getAttribute("src")}`, output))
}

const robots = await readFile(new URL("robots.txt", output), "utf8")
assert.match(robots, /Sitemap: https:\/\/roobro\.ir\/sitemap\.xml/)
assert.doesNotMatch(robots, /Disallow:\s*\/(?:\s|meet)/)
const sitemap = new JSDOM(await readFile(new URL("sitemap.xml", output), "utf8"), { contentType: "text/xml" }).window.document
assert.deepEqual([...sitemap.querySelectorAll("loc")].map((node) => node.textContent), [origin])
console.log("SEO checks passed: public HTML, private shell, metadata, social image, robots and sitemap.")
