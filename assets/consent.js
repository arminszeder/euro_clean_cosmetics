/* ---------------------------------------------------------------------------
   Süti hozzájárulás, és a Meta pixel betöltése.

   Ez az egyetlen hely, ahol a pixel betöltődik. A HTML-ekben nincs pixel kód:
   ha ott lenne, a kérés még a döntés előtt elmenne, és a sáv díszlet volna.

   Három állapot:
     nincs döntés  ->  a sáv látszik, pixel nincs
     "granted"     ->  pixel betöltve, sáv nincs
     "denied"      ->  pixel nincs, sáv nincs

   Az elutasítás nem viszi el a lead mérését: a Lead eseményt a szerver küldi
   az api/lead.js-ből, a Conversions API-n, süti nélkül. Aki elutasít, arról
   csak a PageView és a remarketing esik ki.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'ec_consent';
  var PIXEL = '28552921374340337';
  var bar = null;

  function read() {
    // Privát ablakban a localStorage elérése dobhat, nem csak üresen térhet vissza.
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* ilyenkor csak erre a látogatásra szól */ }
  }

  /** A Meta alap kódja, szó szerint, csak akkor lefuttatva, ha van hozzájárulás. */
  function loadPixel() {
    if (window.fbq) return;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL);
    window.fbq('track', 'PageView');
  }

  function build() {
    var el = document.createElement('div');
    el.className = 'eck';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Süti beállítások');
    el.innerHTML =
      '<div class="eck-box">' +
        '<p class="eck-text"><b>Sütik.</b> A hirdetéseink méréséhez a Meta pixelét ' +
        'használnánk, ami sütit helyez el a böngészőjében. Enélkül az oldal minden ' +
        'funkciója ugyanúgy működik. ' +
        '<a href="/adatvedelem#suti">Részletek</a></p>' +
        '<div class="eck-actions">' +
          '<button type="button" class="eck-btn eck-no">Elutasítom</button>' +
          '<button type="button" class="eck-btn eck-yes">Elfogadom</button>' +
        '</div>' +
      '</div>';
    el.querySelector('.eck-yes').addEventListener('click', function () { decide('granted'); });
    el.querySelector('.eck-no').addEventListener('click', function () { decide('denied'); });
    document.body.appendChild(el);
    return el;
  }

  function show() {
    if (!bar) bar = build();
    bar.hidden = false;
    // Egy képkocka kell, hogy a display:none-ból kikerült elem animálódjon.
    requestAnimationFrame(function () { bar.classList.add('eck-in'); });
  }

  function hide() {
    if (!bar) return;
    bar.classList.remove('eck-in');
    setTimeout(function () { if (bar) bar.hidden = true; }, 260);
  }

  function decide(value) {
    write(value);
    hide();
    if (value === 'granted') loadPixel();
    // Elutasításkor nem töltünk be semmit. A már betöltött pixelt nem lehet
    // visszavonni ezen az oldalbetöltésen; a következőn nem fog elindulni.
  }

  var choice = read();
  if (choice === 'granted') loadPixel();
  else if (choice !== 'denied') show();

  /** A tájékoztató ígéri, hogy a döntés megváltoztatható. Ez az a hivatkozás. */
  function reopen(e) {
    if (e) e.preventDefault();
    if (!bar) bar = build();
    show();
  }
  window.ecCookieSettings = reopen;
  Array.prototype.forEach.call(
    document.querySelectorAll('[data-cookie-settings]'),
    function (link) { link.addEventListener('click', reopen); }
  );
})();
