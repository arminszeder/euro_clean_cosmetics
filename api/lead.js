/**
 * POST /api/lead
 *
 * Vercel Node Function. A landing oldalak statikusak, tehát nem tarthatnak
 * Supabase kulcsot. Ez az egyetlen dolog, ami ír az adatbázisba: a
 * service_role kulcsot környezeti változóként tartja, és ugyanúgy megkerüli
 * az RLS-t, ahogy a Marketing OS szerveroldala.
 *
 * A sor a Marketing OS `contacts` táblájába megy, tehát a beküldés a
 * /c/euroclean/crm képernyőn jelenik meg.
 *
 * Szükséges környezeti változók (Vercel → Project → Settings → Environment
 * Variables, Production és Preview is):
 *
 *   SUPABASE_URL           https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE  a service_role kulcs, soha nem az anon
 *                          (a SUPABASE_SERVICE_ROLE_KEY nevet is elfogadja,
 *                           mert a Marketing OS .env-jében így hívják)
 *
 * A kulcs soha nem kerülhet a repó statikus részébe. Ha kiszivárog, azonnal
 * forgassa a Supabase felületén.
 *
 * Opcionális, a Meta Conversions API-hoz. Nélkülük a lead mentése változatlanul
 * működik, csak a Meta nem kap eseményt:
 *
 *   META_PIXEL_ID          a pixel azonosítója
 *   META_CAPI_TOKEN        Events Manager -> Settings -> Conversions API token
 *   META_TEST_EVENT_CODE   csak teszteléshez, a Test Events fülről
 *
 * Miért szerver oldalról és miért nincs böngésző pixel: a forgalom java a Meta
 * appon belüli böngészőjéből jön, ahol a pixel a legmegbízhatatlanabb, ráadásul
 * a pixel sütit tenne le, ami előzetes hozzájárulást kívánna. Innen csak annak
 * az adata megy ki, aki az űrlapot ténylegesen elküldte, és aki erről az űrlap
 * alatt olvasott is.
 */

'use strict';

const crypto = require('crypto');

const CLIENT_ID = 'euroclean';
const MAX_BODY = 4096;

/** Amit elfogadunk, és a hossz, amit eltárolunk belőle. */
const LIMITS = {
  service: 60, name: 200, phone: 60, city: 120, page: 60, tracking: 300,
  fbc: 255, event_id: 80, event_source_url: 500
};

/** A Meta Marketing API verziója, amire a CAPI hívás megy. */
const META_API = 'v21.0';

/** Vezérlőkarakterek ki, whitespace össze, aztán vágás. */
function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}


/* ─────────────────────────────────────────────────────────────────────────────
   Meta Conversions API

   Egy Lead esemény, szerver oldalról. A Meta minden azonosítót SHA-256-tal,
   normalizált alakban kér: telefonszám országhívóval, csak számjegyek; a többi
   kisbetűsen, szóköz nélkül.
   ──────────────────────────────────────────────────────────────────────────── */

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Magyar számok normalizálása a Meta alakjára: csak számjegy, országhívóval.
 * "+36 30 123 4567", "06301234567" és "30 123 4567" mind 36301234567 lesz.
 */
function normalizePhone(raw) {
  let d = raw.replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('06')) d = '36' + d.slice(2);
  else if (d.startsWith('0')) d = '36' + d.slice(1);
  else if (!d.startsWith('36') && d.length <= 9) d = '36' + d;
  return d;
}

/** Kisbetűs, ékezet és szóköz nélküli alak, ahogy a Meta a települést várja. */
const normalizeCity = (raw) =>
  raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || '';
}

/**
 * Elküldi a Lead eseményt. Soha nem dob: a lead már el van mentve, egy elhasalt
 * méréstől nem veszhet el. Legfeljebb 2,5 másodpercig várunk rá.
 */
async function sendToMeta(req, { phone, city, fbc, eventId, sourceUrl }) {
  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) return { sent: false, reason: 'not_configured' };

  const user = {
    ph: [sha256(normalizePhone(phone))],
    country: [sha256('hu')]
  };
  const ct = normalizeCity(city);
  if (ct) user.ct = [sha256(ct)];
  if (fbc) user.fbc = fbc;

  const ip = clientIp(req);
  if (ip) user.client_ip_address = ip;
  const ua = req.headers['user-agent'];
  if (ua) user.client_user_agent = ua;

  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      // Ugyanaz az azonosító, amit a böngésző küldene. Ha egyszer visszakerül a
      // pixel, a Meta ezen a mezőn vonja össze a két eseményt, és nem számol duplán.
      event_id: eventId || undefined,
      event_source_url: sourceUrl || undefined,
      user_data: user
    }]
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API}/${pixel}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }
    );
    if (!res.ok) {
      console.error('capi: rejected', res.status, (await res.text()).slice(0, 400));
      return { sent: false, reason: 'rejected' };
    }
    return { sent: true };
  } catch (err) {
    console.warn('capi: send failed', err && err.message);
    return { sent: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Az elrontott beállítás a mi hibánk, nem a látogatóé. Naplóba a részlet,
    // a böngészőnek 500, hogy az űrlap megtartsa a beírt értékeket.
    console.error('lead: SUPABASE_URL or SUPABASE_SERVICE_ROLE is not set');
    return res.status(500).json({ ok: false, error: 'server' });
  }

  // Csak a saját oldalainkról. A Meta appon belüli böngészője normál Origin-t küld.
  const origin = req.headers.origin || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (origin) {
    try {
      if (new URL(origin).host !== host) return res.status(403).json({ ok: false, error: 'origin' });
    } catch {
      return res.status(403).json({ ok: false, error: 'origin' });
    }
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  if (JSON.stringify(body).length > MAX_BODY) return res.status(413).json({ ok: false, error: 'too_large' });

  // Mézesbödön. Valódi ember nem tölt ki mezőt, amit nem lát; a bot mindet kitölti.
  // 200-zal válaszolunk, hogy elhiggye, sikerült, és ne próbálkozzon újra.
  if (clean(body.website, 200) !== '') return res.status(200).json({ ok: true });

  const service = clean(body.service, LIMITS.service);
  const name = clean(body.name, LIMITS.name);
  const phone = clean(body.phone, LIMITS.phone);
  const city = clean(body.city, LIMITS.city);
  const page = clean(body.page, LIMITS.page) || 'lp';
  const tracking = clean(body.tracking, LIMITS.tracking);
  const fbc = clean(body.fbc, LIMITS.fbc);
  const eventId = clean(body.event_id, LIMITS.event_id);
  const sourceUrl = clean(body.event_source_url, LIMITS.event_source_url);

  const missing = [];
  if (!service) missing.push('service');
  if (name.length < 2) missing.push('name');
  // Szándékosan megengedő. Egy valódi szám, amit elutasítunk, egy elvesztett ügyfél.
  if (phone.replace(/[^0-9]/g, '').length < 7) missing.push('phone');
  if (city.length < 2) missing.push('city');
  if (missing.length) return res.status(422).json({ ok: false, error: 'invalid', fields: missing });

  // A contacts táblában nincs külön város és szolgáltatás oszlop, ezért mindkettő
  // az üzenetbe megy: a CRM a név alatt pont ezt írja ki.
  const message = [service, city, tracking].filter(Boolean).join(' · ');

  const base = url.replace(/\/+$/, '');
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json'
  };

  // Ugyanaz a szám egy órán belül ugyanaz az ember, nem egy második ügyfél.
  // E-mail nincs az űrlapon, ezért a tábla saját dedupe indexe nem fog rajta:
  // telefonszámra itt nézzük meg.
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const q =
      `${base}/rest/v1/contacts?select=id,submissions&client_id=eq.${CLIENT_ID}` +
      `&phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(since)}&limit=1`;
    const dup = await fetch(q, { headers });
    if (dup.ok) {
      const rows = await dup.json();
      if (Array.isArray(rows) && rows.length) {
        await fetch(`${base}/rest/v1/contacts?id=eq.${rows[0].id}`, {
          method: 'PATCH',
          headers: { ...headers, prefer: 'return=minimal' },
          body: JSON.stringify({
            submissions: (rows[0].submissions || 1) + 1,
            last_seen_at: new Date().toISOString()
          })
        });
        // Az ismétlést a CRM nem duplázza, de a Metának ettől még érdemes
        // elküldeni: az event_id más, tehát ez egy második beküldés ugyanattól
        // az embertől, nem ugyanannak az eseménynek a párja.
        await sendToMeta(req, { phone, city, fbc, eventId, sourceUrl });
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }
  } catch (err) {
    // Egy elhasalt dedupe ellenőrzés soha nem foghat meg egy valódi leadet.
    console.warn('lead: dedupe check failed', err);
  }

  const insert = await fetch(`${base}/rest/v1/contacts`, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      name,
      email: '',
      phone,
      message,
      source: page,
      status: 'New',
      // Az űrlap alatt ott áll, mihez járul hozzá. Ez a beküldéskori bizonyíték.
      consent: true
    })
  });

  if (!insert.ok) {
    const detail = await insert.text();
    console.error('lead: insert failed', insert.status, detail.slice(0, 500));
    return res.status(502).json({ ok: false, error: 'insert' });
  }

  // A lead már az adatbázisban van. Innentől a mérés nem befolyásolhatja a
  // választ: a sendToMeta nem dob, és legfeljebb 2,5 másodpercet vesz el.
  const meta = await sendToMeta(req, { phone, city, fbc, eventId, sourceUrl });

  return res.status(200).json({ ok: true, measured: meta.sent });
};
