// smoketest.mjs — robustní verze
// - vezme base URL z AI_PROXY_URL nebo http://localhost:3000
// - nejdřív zkontroluje healthcheck /
// - POSTne na /ai/profiles/params?mock=1
// - unese dva tvary odpovědi: hotový profil NEBO parametrický tvar

const base = process.env.AI_PROXY_URL || 'http://localhost:3000';
const url = `${base}/ai/profiles/params?mock=1`;

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const isNum = (x) => Number.isFinite(Number(x));
const approxEqual = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
const sum = (arr) => arr.reduce((s, x) => s + Number(x || 0), 0);
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function ensureFetch() {
  if (typeof fetch === 'function') return;
  // 1) vestavěný undici (bez instalace)
  try {
    const undici = await import('node:undici');
    if (typeof undici.fetch === 'function') {
      globalThis.fetch = undici.fetch;
      return;
    }
  } catch {}
  // 2) fallback na node-fetch (pokud je v node_modules)
  try {
    const nf = await import('node-fetch');
    const f = nf && (nf.default || nf);
    if (typeof f === 'function') {
      globalThis.fetch = f;
      return;
    }
  } catch {}
  throw new Error('fetch-not-available');
}

(async () => {
  await ensureFetch();

  // Healthcheck
  let hc;
  try {
    hc = await fetch(`${base}/`, { method: 'GET' });
  } catch (e) {
    const code = e?.cause?.code || e?.code || 'fetch failed';
    throw new Error(`Nejde se připojit na ${base} (${code}). Běží server v jiném okně?`);
  }
  if (!hc.ok) throw new Error(`Healthcheck ${base}/ vrátil HTTP ${hc.status}`);

  // POST mock params
  const body = {
    model: 'gpt-4o-mini',
    medium: 'electricity',
    object_type: 'skola',
    units: 'MWh',
    user_prompt_text: 'ping',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t || ''}`.trim());
  }
  const data = await res.json();

  // === Varianta A: hotový profil ===
  if (data && (data.monthly_share || data.dow_share || data.hourly_template)) {
    assert(
      Array.isArray(data.monthly_share) && data.monthly_share.length === 12,
      'monthly_share chybí/!=12'
    );
    assert(
      data.monthly_share.every((x) => isNum(x) && x >= 0),
      'monthly_share záporné/NaN'
    );
    assert(data.dow_share && typeof data.dow_share === 'object', 'dow_share chybí/není objekt');
    for (const d of days)
      assert(isNum(data.dow_share[d]) && data.dow_share[d] >= 0, `dow_share.${d} chybí/negativní`);
    assert(data.hourly_template && Array.isArray(data.hourly_template.workday), 'workday chybí');
    assert(Array.isArray(data.hourly_template.weekend), 'weekend chybí');
    assert(data.hourly_template.workday.length === 24, 'workday != 24h');
    assert(data.hourly_template.weekend.length === 24, 'weekend != 24h');
    assert(
      data.hourly_template.workday.every((x) => isNum(x) && x >= 0),
      'workday záporné/NaN'
    );
    assert(
      data.hourly_template.weekend.every((x) => isNum(x) && x >= 0),
      'weekend záporné/NaN'
    );
    const mSum = sum(data.monthly_share);
    assert(approxEqual(mSum, 1), `součet monthly_share != 1 (${mSum})`);
    const wdSum = sum(data.hourly_template.workday);
    const weSum = sum(data.hourly_template.weekend);
    assert(approxEqual(wdSum, 1), `součet workday != 1 (${wdSum})`);
    assert(approxEqual(weSum, 1), `součet weekend != 1 (${weSum})`);
    console.log('✅ Smoketest OK (profil)');
    return;
  }

  // === Varianta B: parametry (aktuální mock/AI) ===
  assert(data.meta && typeof data.meta === 'object', 'meta chybí');
  assert(data.season_params && typeof data.season_params === 'object', 'season_params chybí');
  for (const [k, v] of Object.entries(data.season_params)) {
    assert(isNum(v), `season_params.${k} není číslo`);
    assert(v >= -1 && v <= 1, `season_params.${k} mimo [-1,1]: ${v}`);
  }
  const dp = data.dow_params;
  assert(dp && typeof dp === 'object', 'dow_params chybí');
  for (const k of ['weekend_floor', 'friday_drop', 'saturday_boost', 'sunday_boost']) {
    assert(isNum(dp[k]), `dow_params.${k} není číslo`);
    assert(dp[k] >= 0 && dp[k] <= 1, `dow_params.${k} mimo [0,1]: ${dp[k]}`);
  }
  let dayDrops = dp.day_drops;
  if (!dayDrops || typeof dayDrops !== 'object') {
    // toleruj chybějící, použij nuly (server by to dnes už měl doplňovat)
    dayDrops = Object.fromEntries(days.map((d) => [d, 0]));
  }
  for (const d of days) {
    const v = dayDrops[d];
    assert(isNum(v), `dow_params.day_drops.${d} není číslo`);
    assert(v >= 0 && v <= 1, `dow_params.day_drops.${d} mimo [0,1]: ${v}`);
  }
  const hp = data.hour_params;
  assert(hp && typeof hp === 'object', 'hour_params chybí');
  assert(isNum(hp.baseload) && hp.baseload >= 0 && hp.baseload <= 1, 'baseload mimo [0,1]');
  assert(Array.isArray(hp.open_hours) && hp.open_hours.length === 2, 'open_hours != [start,end]');
  assert(
    Number.isInteger(hp.open_hours[0]) && Number.isInteger(hp.open_hours[1]),
    'open_hours musí být celá čísla'
  );
  assert(
    hp.open_hours[0] >= 0 && hp.open_hours[1] <= 24 && hp.open_hours[0] < hp.open_hours[1],
    'open_hours mimo rozsah/pořadí'
  );
  const checkBumps = (arr, label) => {
    (arr || []).forEach((o, i) => {
      assert(o && isNum(o.t) && o.t >= 0 && o.t <= 24, `${label}[${i}].t mimo [0,24]`);
      assert(isNum(o.amp) && o.amp >= 0 && o.amp <= 1, `${label}[${i}].amp mimo [0,1]`);
    });
  };
  checkBumps(hp.peaks, 'peaks');
  checkBumps(hp.dips, 'dips');
  for (const k of ['night_setback', 'ramp_up_rate', 'ramp_down_rate']) {
    assert(isNum(hp[k]) && hp[k] >= 0 && hp[k] <= 1, `hour_params.${k} mimo [0,1]`);
  }
  if ('weekend_variation' in hp) {
    assert(
      isNum(hp.weekend_variation) && hp.weekend_variation >= -1 && hp.weekend_variation <= 1,
      'weekend_variation mimo [-1,1]'
    );
  }
  console.log('✅ Smoketest OK (parametry)');
})().catch((e) => {
  const code = e?.cause?.code || e?.code || '';
  const addr = e?.cause?.address ? `${e.cause.address}:${e.cause.port}` : '';
  console.error('❌ Smoketest FAIL:', e.message, code, addr);
  process.exit(1);
});
