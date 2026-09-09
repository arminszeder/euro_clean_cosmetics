# Euro Clean Cosmetics

Adatvédelmi tájékoztató (GDPR privacy notice) for Euro Clean Cosmetics Kft., published as a
single self-contained static HTML page. Linked from the company's Facebook and Instagram pages.

## Overview

Everything lives in [`index.html`](./index.html): markup and hand-written CSS, no build step,
no framework, no dependencies. The only external resource is Google Fonts.

## Placeholders

Before the page goes live, replace the bracketed values in `index.html` (rendered with the
`.fill` style so they stand out):

- Cégjegyzékszám (not public in the free registry listing; it starts with `08-09-`,
  Győr-Moson-Sopron county, and is on the cégkivonat)
- Contact e-mail and phone number
- The bookkeeper named as adatfeldolgozó in section 6

Company data already filled in from the Nemzeti Cégtár listing: seat 9200 Mosonmagyaróvár,
Liget sor 58., adószám 33044435-2-08, ügyvezető Tercz Erik Balázs.

## Local preview

```bash
python3 -m http.server 8055
```

Then open http://localhost:8055/

## Deployment

Deployed as a static site on [Vercel](https://vercel.com). Because `index.html` sits at the
repository root, Vercel serves it automatically with no configuration. Pushing to the `main`
branch triggers an automatic deploy.
