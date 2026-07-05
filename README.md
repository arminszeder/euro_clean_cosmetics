# Euro Clean Cosmetics

Landing page for Euro Clean Cosmetics — a single self-contained static HTML page.

## Overview

The entire site lives in [`index.html`](./index.html): markup, hand-written CSS,
and vanilla JavaScript are all inlined, along with SVG icons and base64-embedded
images. No build step, no framework, no dependencies. The only external resource
is Google Fonts.

## Local preview

Any static file server works. For example:

```bash
python3 -m http.server 8055
```

Then open http://localhost:8055/

## Deployment

Deployed as a static site on [Vercel](https://vercel.com). Because `index.html`
sits at the repository root, Vercel serves it automatically with no configuration.
Pushing to the `main` branch triggers an automatic deploy.
