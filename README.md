# Euro Clean Cosmetics

Adatvédelmi tájékoztató (GDPR privacy notice) for Euro Clean Cosmetics Kft., published as a
single self-contained static HTML page. Linked from the company's Facebook and Instagram pages.

## Overview

Everything lives in [`index.html`](./index.html): markup and hand-written CSS, no build step,
no framework, no dependencies. The only external resource is Google Fonts.

## Company data

The adatkezelő section carries the registry data from the Nemzeti Cégtár listing: seat
9200 Mosonmagyaróvár, Liget sor 58., adószám 33044435-2-08, ügyvezető Tercz Erik Balázs,
e-mail eurocleancosmetics@gmail.com, phone +36 70 882 4314. No placeholders remain.

Two things to revisit later: the cégjegyzékszám is not stated on the page (it is optional
in a privacy notice, the tax number identifies the company), and the bookkeeper appears as
an unnamed processor in section 6, to be named on request.

## Local preview

```bash
python3 -m http.server 8055
```

Then open http://localhost:8055/

## Deployment

Deployed as a static site on [Vercel](https://vercel.com). Because `index.html` sits at the
repository root, Vercel serves it automatically with no configuration. Pushing to the `main`
branch triggers an automatic deploy.
