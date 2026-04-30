# Yellowfone — marketing site

A bold, maximalist, downloadable multi-page marketing site for Yellowfone,
the AI voice agent for restaurants.

## What's here

```
yellowfone-site/
├── index.html              ← Home (hero + problem + features + quote + CTA)
├── product.html            ← 7 capabilities, full detail
├── how-it-works.html       ← 4-step flow + architecture + what we need
├── pricing.html            ← 3 tiers + FAQ
├── resources.html          ← Coming-soon blog grid + newsletter
├── contact.html            ← Book-a-demo form
├── css/styles.css          ← Shared design system (single file)
└── js/site.js              ← Nav/footer injection, FAQ toggles
```

## Preview

Just open `index.html` in any browser, or serve the folder:

```bash
cd yellowfone-site
python3 -m http.server 8080
# then open http://localhost:8080
```

No build step. No dependencies. Pure HTML/CSS/JS — host it on Netlify,
Vercel, Cloudflare Pages, S3, anything that serves static files.

## Design system

**Palette**
- `--cream` `#FFF8E1` — primary background
- `--yellow` `#FFD60A` — primary brand
- `--coral` `#FF4F3A` — accent + alarm
- `--teal` `#00B5A0` — secondary accent
- `--pink` `#FFB5D8` — tertiary accent
- `--ink` `#0F0F0F` — text + borders

**Typography**
- **Bricolage Grotesque** (display, 800 weight) — headlines
- **Instrument Serif** (italic) — accent words inside headlines
- **JetBrains Mono** — labels, tags, monospace details

**Hallmarks**
- 3px black borders + hard offset shadows on every card (no fuzzy shadows)
- Slight rotations on stickers, tiers, and step cards (~1–2 degrees)
- Cream background with a subtle dot grid texture
- Animated brand mark dot (pulse rings)
- Phone illustration in hero/product pages with chat bubbles popping in
- Marquee stat bar and pulsing live-call dot

## What still needs real content

- Replace placeholder integration mentions with real SVG logos.
- Replace the testimonial pull-quote on the home page with a real customer
  quote when you have one approved.
- Wire the contact form to a real backend (Formspree, your own endpoint,
  HubSpot, etc.). It currently shows a success state client-side only.
- Resources page articles are placeholders — write the real posts and link
  them up.
- Drop a real favicon and OG/Twitter image into an `assets/` directory.
- Update copyright year and footer tagline if needed.

## Tech notes

- Nav and footer are injected by `js/site.js` so they stay in sync — edit
  them in one place.
- Active page highlighting works off `data-page` on the `<body>` tag.
- FAQ toggles are pure CSS-driven (`.open` class added by JS click).
- Live-call timer ticks during the page session.
- Marquee uses a CSS `translateX` infinite animation.
- All animations are CSS keyframes — no animation libraries.
- Fully responsive down to 360px wide.
