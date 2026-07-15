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

## Analytics (Plausible) — live

Each page's `<head>` carries the account snippet for the plausible.io site
`lishaxu.com` (the `pa-….js` script). It provides:

- Page views per page (traffic).
- **CTR on buttons**: every Purchase / Inquire / Open-the-Planner button is
  tagged with `plausible-event-name=...` classes (with a
  `plausible-event-piece` property naming the artwork). Add goals named
  `Purchase`, `Inquire`, and `Open Planner` in the Plausible dashboard to see
  conversion rates; add the custom property `piece` for per-artwork breakdowns.
- Outbound link clicks (e.g. Etsy Buy links inside the planner) — enable
  "Outbound links" in the site's Plausible installation settings.
- **Colour Mixer events** (fired from `colourmix/colourmix.js` via the
  `track()` helper; also tagged: the tools page's `Open Colour Mixer`
  button). Add each as a custom-event goal in the dashboard to see it:
  - `Mixer Colour Picked` — props `source` (photo/dab/wheel/hex), `medium`;
    drags are debounced so one gesture = one event
  - `Mixer Photo Uploaded` — props `medium`
  - `Mixer Medium Switched` — props `medium`
  - `Mixer Paints Added` — props `method` (photograph/list/custom),
    `pigment` (list adds), `tubes` (photograph batch size), `medium`
  - `Mixer OCR Scan` — props `outcome` (found/nothing/error), `tubes`, `medium`
  - `Mixer Shopping List Add` / `Mixer Tube Got It` — props `pigment`,
    `brand`, `medium` (what people want to buy vs. actually got)
  - `Mixer Shelf Cleared` — props `tubes`, `medium`

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
