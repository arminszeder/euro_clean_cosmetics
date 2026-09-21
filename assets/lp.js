/* ---------------------------------------------------------------------------
   Euro Clean landing oldalak, közös viselkedés.

   Három dolgot csinál: kinyitja az űrlapot, pontozza a karusszelt, és
   elküldi a leadet a /api/lead végpontra. Nincs függősége.

   Az oldal a `data-page` attribútumból tudja, melyik ő; ez megy a CRM
   "Source" oszlopába, hogy látszódjon, melyik hirdetéssorozat hozta.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var sheet = document.getElementById('sheet');
  var form = document.getElementById('lead');
  var errBox = document.getElementById('err');
  var doneBox = document.getElementById('done');
  var page = document.body.dataset.page || '';
  var lastFocus = null;

  /* ── űrlap kinyitása és bezárása ─────────────────────────────────────── */

  function open() {
    lastFocus = document.activeElement;
    sheet.hidden = false;
    // Egy képkocka kell, hogy a display:none-ból kikerült elem animálódjon.
    requestAnimationFrame(function () {
      sheet.classList.add('open');
      var first = sheet.querySelector('input:not([type=hidden]):not(.hp input)');
      if (first && window.innerWidth >= 720) first.focus();
    });
    document.body.style.overflow = 'hidden';
  }

  function close() {
    sheet.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { sheet.hidden = true; }, 200);
    if (lastFocus) lastFocus.focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); open(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (el) {
    el.addEventListener('click', close);
  });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheet.hidden) close();
  });

  /* ── szolgáltatás választó ───────────────────────────────────────────── */

  // A :has() elvégezné, de a kiválasztott gomb kinézete nem függhet attól,
  // hogy a Meta appon belüli böngésző melyik WebKit verzión fut.
  var opts = form.querySelectorAll('.opts label');
  Array.prototype.forEach.call(opts, function (label) {
    label.querySelector('input').addEventListener('change', function () {
      Array.prototype.forEach.call(opts, function (other) { other.classList.remove('on'); });
      label.classList.add('on');
    });
  });

  /* ── karusszel pontok ────────────────────────────────────────────────── */

  var rail = document.querySelector('.rail');
  var dots = document.querySelector('.dots');
  if (rail && dots) {
    var cards = rail.children;
    for (var i = 0; i < cards.length; i++) {
      var d = document.createElement('span');
      if (i === 0) d.className = 'on';
      dots.appendChild(d);
    }
    var ticking = false;
    rail.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        // Melyik kártya bal széle van legközelebb a sáv bal széléhez.
        var left = rail.scrollLeft;
        var best = 0, bestGap = Infinity;
        for (var j = 0; j < cards.length; j++) {
          var gap = Math.abs(cards[j].offsetLeft - rail.offsetLeft - left);
          if (gap < bestGap) { bestGap = gap; best = j; }
        }
        for (var k = 0; k < dots.children.length; k++) {
          dots.children[k].className = k === best ? 'on' : '';
        }
      });
    }, { passive: true });
  }

  /* ── beküldés ────────────────────────────────────────────────────────── */

  // Amit a hirdetésről hozunk magunkkal. A CRM üzenet mezőjébe megy.
  function trackingBits() {
    var q = new URLSearchParams(location.search);
    var keep = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
    var out = [];
    keep.forEach(function (k) {
      var v = q.get(k);
      if (v) out.push(k.replace('utm_', '') + '=' + v.slice(0, 60));
    });
    return out.join(' ');
  }

  function fail(html) {
    errBox.innerHTML = html;
    errBox.hidden = false;
    errBox.scrollIntoView({ block: 'nearest' });
  }

  var sending = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    errBox.hidden = true;

    var data = new FormData(form);
    var payload = {
      service: (data.get('service') || '').toString(),
      name: (data.get('name') || '').toString(),
      phone: (data.get('phone') || '').toString(),
      city: (data.get('city') || '').toString(),
      website: (data.get('website') || '').toString(),  // mézesbödön
      page: page,
      tracking: trackingBits()
    };

    if (!payload.service) return fail('Válassza ki, mire kér ajánlatot.');
    if (payload.name.trim().length < 2) return fail('Kérjük, írja be a nevét.');
    // Csak a nyilvánvaló elgépelést fogjuk meg. Egy valódi szám, amit elutasítunk, egy elvesztett ügyfél.
    if (payload.phone.replace(/[^0-9]/g, '').length < 7) return fail('A telefonszám hiányzik vagy túl rövid.');
    if (payload.city.trim().length < 2) return fail('Kérjük, írja be a települést.');

    sending = true;
    var btn = form.querySelector('button[type=submit]');
    var label = btn.innerHTML;
    btn.innerHTML = 'Küldés…';
    btn.disabled = true;

    fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (r) {
        if (!r || !r.ok) throw new Error('nem ment');
        form.hidden = true;
        doneBox.hidden = false;
        doneBox.scrollIntoView({ block: 'nearest' });
        if (window.fbq) window.fbq('track', 'Lead');
      })
      .catch(function () {
        // A mezőket szándékosan nem ürítjük: egy lead se vesszen el némán.
        sending = false;
        btn.innerHTML = label;
        btn.disabled = false;
        fail('A küldés nem sikerült. Próbálja újra, vagy hívjon minket: ' +
          '<a href="tel:+36708824314">+36 70 882 4314</a>');
      });
  });
})();
