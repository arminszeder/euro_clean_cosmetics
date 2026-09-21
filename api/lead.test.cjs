const handler = require('./lead.js');
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE = 'svc-key';

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
const req = (body, extra = {}) => ({ method: 'POST', headers: { host: 'euroclean.hu', ...(extra.headers || {}) }, body });

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

  console.log(fails ? `\n${fails} HIBA` : '\nminden teszt jó');
  process.exit(fails ? 1 : 0);
})();
