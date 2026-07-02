# lishaxu.com

Personal artist website for Lisha Xu, plus the Gallery Wall Planner tool.
Plain static site — no build step. Built from the Claude Design handoff
(`../design_handoff_lishaxu_site/`).

## Structure

```
index.html            Home
artwork/index.html    Artwork
about/index.html      About
planner/              Gallery Wall Planner (React app, no build step)
  index.html
  planner.js          ← the shop catalog lives in seedShop() in this file
css/site.css          Shared site styles
site-assets/          Paintings + portrait (webp)
prints/               Print images (site + planner catalog)
vendor/               React 18.3.1 + htm 3.1.1 (served locally, planner only)
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

## Analytics (Plausible) — ready to switch on

Each page has a commented-out Plausible `<script>` tag in `<head>`.
To enable:

1. Create the site `lishaxu.com` at plausible.io.
2. Uncomment the script tag in `index.html`, `artwork/index.html`,
   `about/index.html`, and `planner/index.html`.

The script variant used (`script.tagged-events.outbound-links.js`) gives you:

- Page views per page (traffic).
- **CTR on buttons**: every Purchase / Inquire / Open-the-Planner button is
  already tagged with `plausible-event-name=...` classes (with a
  `plausible-event-piece` property naming the artwork), so goals named
  `Purchase`, `Inquire`, and `Open Planner` will appear under Goals once you
  add them in the Plausible dashboard.
- Outbound link clicks (e.g. Etsy Buy links inside the planner) automatically.

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
