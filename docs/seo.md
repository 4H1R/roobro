# Search and social previews

The production build pre-renders the Persian homepage from the existing React
route. `dist/index.html` contains its headings, copy and links before JavaScript
runs. The interactive app mounts over this content in the browser, including
the visitor's saved theme preference. No browser or rendering server is needed
during a production build or at runtime.

The build also creates `dist/app.html`, an empty app shell with `noindex` and
without the homepage canonical or structured data. Caddy serves this shell for
`/new` and `/meet/*`, with an `X-Robots-Tag: noindex` response header. The app
updates robots and canonical metadata during client-side navigation too.
Unknown URLs return HTTP 404. Keep the Caddy route matcher in sync when adding
new app routes.

`robots.txt` allows crawling so search engines can read the `noindex` directives.
This is an indexing preference, not access control. The sitemap lists only the
public homepage; never add individual meetings. Add future public pages only
after giving them real HTML content and their own canonical URLs.

## Validate locally

From `frontend`, run `bun run seo:check`. This builds the site and checks the
generated public HTML, private shell, metadata, sitemap, robots and social-image
dimensions. Use the production Caddy configuration when checking HTTP routing;
Vite's preview server does not implement Caddy's headers or route rules.

The 1200×630 social card is generated from the brand's HTML/CSS template with
the local Persian font. See `frontend/brand/README.md` for regeneration. When
changing it, increment its version in both Open Graph and Twitter image URLs
in `frontend/index.html` so platforms can fetch the new image.

## After deployment

1. Verify the `roobro.ir` domain property in Google Search Console using its DNS
   verification record.
2. Submit `https://roobro.ir/sitemap.xml` under Sitemaps.
3. Inspect `https://roobro.ir/`, run the live test, confirm that the rendered page
   contains the Persian homepage, and request indexing.
4. Inspect a meeting URL and confirm that it is excluded by `noindex`.
5. Share the homepage in your social apps to check its card. Platforms may cache
   earlier previews; use their refresh/debug tools where available.
6. Monitor the Page indexing report and Performance queries for `رو به رو`,
   `رو‌به‌رو` and `Roobro`. Indexing and rankings are Google's decisions and can
   take time after deployment.

Use the same name and homepage URL on your public profiles and relevant project
listings. Search Console setup and publishing external profiles are account-owner
tasks; the repository does not automate them.
