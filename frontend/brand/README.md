# Roo identity

The approved Roo concept uses one undotted Persian-inspired monogram in plum,
with lilac on dark surfaces. The product name remains **رو‌به‌رو / Roobro**.

`roo.svg` is the canonical drawing. The UI imports it through `BrandMark`; the
landing artwork, header, meeting-room header, creation guide, and loading state
all reuse that component. Do not duplicate its path in a page.

`palette.json` defines export colors. The corresponding light and dark UI tokens
live at the top of `src/styles.css`. Keep browser theme colors in `index.html`
and `src/components/theme-toggle.tsx` aligned when changing the page backgrounds.
Semantic success, warning, and destructive-action colors remain separate.

## Regenerate exports

Install frontend dependencies, ImageMagick (`convert`), and Playwright Chromium:

```sh
bun install
bunx playwright install chromium
bun run brand:generate
```

Run these commands from `frontend`. An existing browser executable can be supplied
with `CHROMIUM_BINARY`; ImageMagick can be supplied with `IMAGEMAGICK_BINARY`.
The generator uses the local Vazirmatn font for correct Persian shaping, with no
remote fonts or image-generation service needed.

Exports in `public/`:

- Plum, lilac, and monochrome SVG marks; transparent 512px PNG marks.
- SVG favicon, 16/32/48px PNG favicons, and a multi-resolution ICO.
- 192/512px app icons, a 512px maskable icon, and a 180px Apple touch icon.
- A 1200×630 Persian Open Graph/Twitter card.
- Updated manifest icons and colors.

The maskable asset has a full-bleed background and extra clearance for launcher
masks. The favicon has a lilac field so it stays visible on light and dark tabs.
The social card uses `v=roo-2`; the other asset URLs use `v=roo-1`. Increment the
corresponding version when replacing cached assets in a future release.
