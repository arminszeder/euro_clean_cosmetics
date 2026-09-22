const handler = require('./lead.js');
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE = 'svc-key';
process.env.META_PIXEL_ID = '28552921374340337';
process.env.META_CAPI_TOKEN = 'capi-token';

let calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
  if (String(url).includes('select=')) return { ok: true, json: async () => [] };
  return { ok: true, text: async () => '' };
};

function res() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
const req = (body, extra = {}) => ({
  method: 'POST',
  headers: {
    host: 'euroclean.hu',
    'user-agent': 'Mozilla/5.0 (iPhone) FBAV/450',
    'x-forwarded-for': '85.66.1.2, 10.0.0.1',
    ...(extra.headers || {})
  },
  body
});

const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
const capiCall = () => calls.find(c => c.url.includes('graph.facebook.com'));

(async () => {
  let fails = 0;
  const check = (name, cond, got) => { if (!cond) { fails++; console.log('FAIL', name, JSON.stringify(got)); } else console.log('ok  ', name); };

  // 1. jó beküldés
  calls = [];
  let r = res();
  await handler(req({ service: 'Homlokzat, tűzfal', name: 'Kovács Anna', phone: '+36 30 123 4567', city: 'Mosonmagyaróvár', page: 'lp-tisztitas', tracking: 'campaign=probatisztitas' }), r);
  check('200 a jó beküldésre', r.code === 200 && r.body.ok === true, r);
  const insert = calls.find(c => c.method === 'POST');
  const row = JSON.parse(insert.body);
  check('client_id', row.client_id === 'euroclean', row);
  check('message = szolgáltatás · város · tracking',
    row.message === 'Homlokzat, tűzfal · Mosonmagyaróvár · campaign=probatisztitas', row.message);
  check('source a lap', row.source === 'lp-tisztitas', row.source);
  check('status New', row.status === 'New', row.status);
  check('email üres', row.email === '', row.email);

  // 2. mézesbödön
  calls = []; r = res();
  await handler(req({ service: 'x', name: 'Bot', phone: '123456789', city: 'X', website: 'http://spam' }), r);
  check('mézesbödön: 200, de nem ír', r.code === 200 && calls.length === 0, { code: r.code, calls: calls.length });

  // 3. hiányzó mezők
  r = res();
  await handler(req({ name: 'A', phone: '12', city: '' }), r);
  check('422 hiányzó mezőkre', r.code === 422 && r.body.fields.length === 4, r.body);

  // 4. idegen origin
  r = res();
  await handler(req({ service: 'a', name: 'Anna', phone: '301234567', city: 'Győr' }, { headers: { origin: 'https://evil.example' } }), r);
  check('403 idegen originre', r.code === 403, r.code);

  // 5. saját origin átmegy
  calls = []; r = res();
  await handler(req({ service: 'a', name: 'Anna', phone: '301234567', city: 'Győr' }, { headers: { origin: 'https://euroclean.hu' } }), r);
  check('saját origin átmegy', r.code === 200, r.code);

  // 6. dedupe: egy órán belül ugyanaz a szám
  calls = []; r = res();
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (String(url).includes('select=')) return { ok: true, json: async () => [{ id: 'abc', submissions: 2 }] };
    return { ok: true, text: async () => '' };
  };
  await handler(req({ service: 'a', name: 'Anna', phone: '301234567', city: 'Győr' }), r);
  const patch = calls.find(c => c.method === 'PATCH');
  check('dedupe: PATCH és nem INSERT', r.body.duplicate === true && patch && JSON.parse(patch.body).submissions === 3,
    { body: r.body, patch: patch && patch.body });

  // 7. GET
  r = res();
  await handler({ method: 'GET', headers: {} }, r);
  check('405 GET-re', r.code === 405, r.code);

  // ── Conversions API ─────────────────────────────────────────────────────
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (String(url).includes('select=')) return { ok: true, json: async () => [] };
    return { ok: true, text: async () => '' };
  };

  calls = []; r = res();
  await handler(req({
    service: 'Homlokzat, tűzfal', name: 'Kovács Anna', phone: '+36 30 123 4567',
    city: 'Mosonmagyaróvár', page: 'lp-tisztitas',
    fbc: 'fb.1.1758500000000.IwAR123', event_id: 'evt-abc',
    event_source_url: 'https://euroclean.hu/tisztitas?fbclid=IwAR123'
  }), r);

  const capi = capiCall();
  check('a Meta kapott eseményt', !!capi && capi.method === 'POST', capi && capi.url);
  check('a válasz jelzi a mérést', r.body.measured === true, r.body);
  const ev = capi && JSON.parse(capi.body).data[0];
  check('event_name Lead', ev.event_name === 'Lead', ev.event_name);
  check('action_source website', ev.action_source === 'website', ev.action_source);
  check('event_id átmegy', ev.event_id === 'evt-abc', ev.event_id);
  check('telefonszám hash-elve, 36-os alakban',
    ev.user_data.ph[0] === sha('36301234567'), ev.user_data.ph[0]);
  check('nyers telefonszám nem megy ki', !capi.body.includes('301234567'), 'leaked');
  check('a név egyáltalán nem megy ki',
    !capi.body.includes('Kovács') && !ev.user_data.fn && !ev.user_data.ln, ev.user_data);
  check('település ékezet nélkül hash-elve',
    ev.user_data.ct[0] === sha('mosonmagyarovar'), ev.user_data.ct[0]);
  check('ország hu', ev.user_data.country[0] === sha('hu'), ev.user_data.country[0]);
  check('fbc változatlanul', ev.user_data.fbc === 'fb.1.1758500000000.IwAR123', ev.user_data.fbc);
  check('csak az első IP a láncból', ev.user_data.client_ip_address === '85.66.1.2', ev.user_data.client_ip_address);

  // 06-os és helyi alak
  calls = []; r = res();
  await handler(req({ service: 'a', name: 'Bea', phone: '06 30 123 4567', city: 'Győr' }), r);
  check('06-os szám is 36-ra normalizálódik',
    JSON.parse(capiCall().body).data[0].user_data.ph[0] === sha('36301234567'), 'nope');

  // token nélkül a lead ugyanúgy megy, csak mérés nincs
  delete process.env.META_CAPI_TOKEN;
  calls = []; r = res();
  await handler(req({ service: 'a', name: 'Bea', phone: '301234567', city: 'Győr' }), r);
  check('token nélkül is elmenti a leadet', r.code === 200 && r.body.ok === true, r.body);
  check('token nélkül nincs Meta hívás', !capiCall(), 'hívott');
  check('measured=false', r.body.measured === false, r.body);
  process.env.META_CAPI_TOKEN = 'capi-token';

  // a Meta hibája nem viheti el a leadet
  calls = []; r = res();
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (String(url).includes('graph.facebook.com')) throw new Error('network down');
    if (String(url).includes('select=')) return { ok: true, json: async () => [] };
    return { ok: true, text: async () => '' };
  };
  await handler(req({ service: 'a', name: 'Bea', phone: '301234567', city: 'Győr' }), r);
  check('a Meta elhasalása nem viszi el a leadet', r.code === 200 && r.body.ok === true, r.body);

  console.log(fails ? `\n${fails} HIBA` : '\nminden teszt jó');
  process.exit(fails ? 1 : 0);
})();
