// smoketest-ai.mjs — ověří AI větev /ai/profiles/params (bez ?mock=1)
// - vezme base URL z AI_PROXY_URL nebo http://localhost:3000
// - healthcheck /
// - POST na /ai/profiles/params (bez "ping")
// - tolerantní validace parametrického tvaru odpovědi

const base = process.env.AI_PROXY_URL || 'http://localhost:3000';
const url = `${base}/ai/profiles/params`;
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const isNum = (x) => Number.isFinite(Number(x));
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

async function ensureFetch() {
  if (typeof fetch === 'function') return;
  try {
    const u = await import('node:undici');
    if (u?.fetch) {
      globalThis.fetch = u.fetch;
      return;
    }
  } catch {}
  try {
    const nf = await import('node-fetch');
    const f = nf?.default || nf;
    if (f) {
      globalThis.fetch = f;
      return;
    }
  } catch {}
  throw new Error('fetch-not-available');
}

(async () => {
  await ensureFetch();
  // Healthcheck
  const hc = await fetch(`${base}/`);
  if (!hc.ok) throw new Error(`Healthcheck ${base}/ → HTTP ${hc.status}`);

  // AI request (pozor: žádný "ping", to by byl mock)
  const body = {
    model: 'gpt-4o-mini',
    medium: 'electricity',
    object_type: 'skola',
    units: 'MWh',
    locale: 'cs-CZ',
    timezone: 'Europe/Prague',
    user_prompt_text:
      'Profil základní školy: provoz 8–15, víkend nižší, prázdniny v červenci/srpnu slabší.',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Jemně ošetříme běžné situace (bez pádu CI)
  if (res.status === 401 || res.status === 403) {
    console.log('ℹ️  AI Smoketest přeskočen (401/403 – API klíč?).');
    return;
  }
  if (res.status === 429) {
    console.log('ℹ️  AI Smoketest přeskočen (429 – rate limit).');
    return;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t}`.trim());
  }

  const data = await res.json();
  // Očekáváme parametrický tvar (season_params/dow_params/hour_params)
  assert(data?.season_params && typeof data.season_params === 'object', 'season_params chybí');
  assert(data?.dow_params && typeof data.dow_params === 'object', 'dow_params chybí');
  assert(data?.hour_params && typeof data.hour_params === 'object', 'hour_params chybí');
  // Pár sanity kontrol
  const sp = data.season_params;
  for (const k of Object.keys(sp))
    assert(Number.isFinite(Number(sp[k])), `season_params.${k} není číslo`);
  const dp = data.dow_params;
  for (const k of ['weekend_floor', 'friday_drop', 'saturday_boost', 'sunday_boost']) {
    if (k in dp) assert(Number.isFinite(Number(dp[k])), `dow_params.${k} není číslo`);
  }
  const dd = dp.day_drops || { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  for (const d of days)
    assert(Number.isFinite(Number(dd[d])), `dow_params.day_drops.${d} není číslo`);
  const hp = data.hour_params;
  assert(Number.isFinite(Number(hp.baseload)), 'hour_params.baseload není číslo');
  assert(Array.isArray(hp.open_hours) && hp.open_hours.length === 2, 'open_hours != [start,end]');
  console.log('✅ AI Smoketest OK');
})().catch((e) => {
  console.error('❌ AI Smoketest FAIL:', e.message);
  process.exit(1);
});
