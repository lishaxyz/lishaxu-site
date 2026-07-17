# lishaxu.com

Personal artist website for Lisha Xu, plus two free tools: the Gallery Wall
Planner and the Colour Mixer. Plain static site — no build step. Built from
the Claude Design handoffs (`../design_handoff_lishaxu_site/`; the Tools page
and Colour Mixer from the "Color mixing playground tool" handoff).

## Structure

```
index.html            Home
artwork/index.html    Artwork
about/index.html      About
tools/index.html      Tools index (cards linking the two tools)
planner/              Gallery Wall Planner (React app, no build step)
  index.html
  planner.js          ← the shop catalog lives in seedShop() in this file
colourmix/            Colour Mixer (React app, no build step)
  index.html
  colourmix.js        UI + state (ported from the design prototype)
  color-mixing.js     Colour science (Kubelka-Munk mixing, recipe search)
  paint-data.js       Paint catalogues (oil/acrylic/watercolour) + defaults
  assets/             Default reference photo (EXIF-stripped webp)
css/site.css          Shared site styles (incl. tools-page card styles)
site-assets/          Paintings + portrait + tool preview cards (webp)
prints/               Print images (site + planner catalog)
vendor/               React 18.3.1 + htm 3.1.1 (served locally; planner + colourmix)
  tesseract/          Tesseract.js 5.1.1 OCR (colourmix "Photograph tubes";
                      loaded on demand, runs fully in the browser)
CNAME                 Custom domain for GitHub Pages (lishaxu.com)
```

## Local preview

```sh
cd site
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening index.html directly via file:// also mostly works, but use a server
for the planner.)

## Deploy (GitHub Pages)

1. Create a GitHub repo (e.g. `lishaxu-site`) and push the contents of this
   `site/` folder to the `main` branch.
2. Repo Settings → Pages → Deploy from branch → `main` / root.
3. Settings → Pages → Custom domain: `lishaxu.com` (the `CNAME` file here
   keeps it set). Enable "Enforce HTTPS" once the certificate is issued.
4. At your domain registrar, add DNS records:
   - `A` records for the apex `lishaxu.com` → `185.199.108.153`,
     `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `<your-github-username>.github.io`

Netlify/Vercel also work: point them at this folder, no build command,
publish directory = this folder, then attach the domain.

## Analytics (Umami Cloud) — live

Each page's `<head>` carries the Umami Cloud snippet (website id
`c67a9788-…`, `data-domains="lishaxu.com"` so localhost/preview visits are
never recorded). Cookieless — no consent banner needed. Events appear in the
Umami dashboard automatically (no goal setup required, unlike Plausible):

- Page views per page (traffic).
- **CTR on buttons**: every Purchase / Inquire / Open-Planner /
  Open-Colour-Mixer button is tagged with `data-umami-event` (plus a
  `data-umami-event-piece` property naming the artwork).
- **Planner Buy Click**: the planner's Etsy Buy links (tagged in
  `planner/planner.js`) with the piece title as a property.
- **Colour Mixer events** (fired from `colourmix/colourmix.js` via the
  `track()` helper; all carry a `medium` property):
  - `Mixer Colour Picked` — `source` (photo/dab/wheel/hex); drags are
    debounced so one gesture = one event
  - `Mixer Photo Uploaded`
  - `Mixer Medium Switched`
  - `Mixer Paints Added` — `method` (photograph/list/custom), `pigment`
    (list adds), `tubes` (photograph batch size)
  - `Mixer OCR Scan` — `outcome` (found/nothing/error), `tubes`
  - `Mixer Shopping List Add` / `Mixer Tube Got It` — `pigment`, `brand`
    (what people want to buy vs. actually got)
  - `Mixer Shelf Cleared` — `tubes`

(The site used Plausible until 2026-07 — historical data lives in a CSV
export, not in Umami.)

## Affiliate links / shop catalog

The planner's shop catalog is code-defined in `planner/planner.js` →
`seedShop()` (documented inline). Each item has a `buyUrl` — paste full
affiliate URLs (including your ref/affiliate ID) there. Prices, sale prices,
sizes, and images are all managed in that one list; there is no in-app editor,
so visitors can't change it.

For affiliate links on the site pages (Home collection cards, Artwork page),
just replace the `href` of the Purchase buttons in the HTML.

**Note (from the design handoff):** the catalog currently includes three
third-party demo items (Sandhill Cranes, Sardines, Four Kings) — decide
whether to keep them before launch; remove by deleting their lines from
`seedShop()`.
