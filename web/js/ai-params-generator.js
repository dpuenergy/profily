// web/js/ai-params-generator.js
// Jednoduchá, robustní verze – helpery nahoře a export i na window (pro DevTools).

// ---- Pomocné normalizace (globálně, ať jsou vždy k dispozici) ----
function normMedium(raw) {
  if (!raw) return null;
  const x = String(raw).trim().toLowerCase();
  const map = {
    electricity: "electricity",
    elektřina: "electricity",
    elektrina: "electricity",
    el: "electricity",
    gas: "gas",
    plyn: "gas",
    heat: "heat",
    teplo: "heat",
    czt: "heat",
    water: "water",
    voda: "water",
    w: "water",
  };
  return map[x] || null;
}

function normObjectType(raw) {
  if (!raw) return null;
  const x = String(raw).trim().toLowerCase();
  const map = {
    skola: "skola",
    škola: "skola",
    zš: "skola",
    zs: "skola",
    ms: "skola",
    kancelar: "kancelar",
    kancelář: "kancelar",
    office: "kancelar",
    bytovy_dum: "bytovy_dum",
    "bytový dům": "bytovy_dum",
    panelak: "bytovy_dum",
    panelák: "bytovy_dum",
    prumysl: "prumysl",
    průmysl: "prumysl",
    vyroba: "prumysl",
    výroba: "prumysl",
    obchod: "obchod",
    retail: "obchod",
    market: "obchod",
    bazen: "bazen",
    bazén: "bazen",
    pool: "bazen",
  };
  return map[x] || null;
}

// ---- POST helper s retry   timeout ----
async function postJSON(url, body, { tries = 2, timeoutMs = 60000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await resp.text();
      clearTimeout(t);
      if (!resp.ok) throw new Error(text || "HTTP " + resp.status);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (attempt === tries) break;
      await new Promise((r) => setTimeout(r, 400 * attempt)); // jednoduchý backoff
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error("Neznámá chyba při POSTu na " + url);
}

function getEndpoint(opts) {
  const fromOpts =
    (opts && typeof opts.endpoint === "string" && opts.endpoint.trim()) || null;
  const fromInput =
    document.getElementById("apiParamsEndpoint")?.value?.trim() || null;
  const fromFn =
    (typeof window.getEndpoint === "function" && window.getEndpoint()) || null;
  const raw =
    fromOpts ||
    fromInput ||
    fromFn ||
    "http://localhost:3000/ai/profiles/params";
  try {
    const u = new URL(raw, window.location.origin);
    // Pokud cesta není jasně na /ai/profiles/params nebo /ai/profiles/generate, dorovnáme ji.
    if (!/\/ai\/profiles\/(params|generate)\/?$/.test(u.pathname)) {
      u.pathname = "/ai/profiles/params";
    }
    return u.toString();
  } catch {
    // Když by URL konstruktor spadl, vrať pevný fallback.
    return "http://localhost:3000/ai/profiles/params";
  }
}


// ---- Normalizace struktury outParams pro UI (globální nastavení, žádné per-den bloky) ----
function normalizeParamsForUI(params){
  const out = JSON.parse(JSON.stringify(params || {}));
  // 1) Zruš omylem vytvořené per-den bloky na kořeni (mon/tue/...)
  const dayKeys = ["mon","tue","wed","thu","fri","sat","sun","pondeli","utery","streda","ctvrtek","patek","sobota","nedele"];
  for (const k of dayKeys){
    if (out.hasOwnProperty(k) && typeof out[k] === "object") {
      // pokud tohle obsahuje "day_drops" nebo "base", ignorujeme a smažeme – má být globálně v dow_params
      delete out[k];
    }
  }
  // 2) dow_params.day_drops sjednotit na mapu {mon..sun} a clampnout 0..1
  out.dow_params = out.dow_params || {};
  const dd = out.dow_params.day_drops || out.dow_params || {};
  const keys = ["mon","tue","wed","thu","fri","sat","sun"];
  const day_drops = {};
  for (const k of keys){
    const v = dd[k];
    const num = typeof v === "number" && isFinite(v) ? v : 0;
    day_drops[k] = Math.max(0, Math.min(1, num));
  }
  out.dow_params.day_drops = day_drops;
  if (typeof out.dow_params.weekend_floor !== "number") out.dow_params.weekend_floor = 0.05;

  // 3) Hodinový tvar: aplikace pracuje s globálními vrcholy/propady, ne per-den
  const hp = out.hour_params || {};
  // Propagace do kořene (UI čte baseload/peaks/dips atd. globálně)
  if (typeof out.baseload !== "number" && typeof hp.baseload === "number") out.baseload = hp.baseload;
  if (typeof out.weekend_variation !== "number" && typeof hp.weekend_variation === "number") out.weekend_variation = hp.weekend_variation;
  if (typeof out.night_setback !== "number" && typeof hp.night_setback === "number") out.night_setback = hp.night_setback;
  if (!Array.isArray(out.peaks) && Array.isArray(hp.peaks)) out.peaks = hp.peaks;
  if (!Array.isArray(out.dips) && Array.isArray(hp.dips)) out.dips = hp.dips;

  // Základní defaulty, pokud nic nedorazilo
  if (typeof out.baseload !== "number") out.baseload = 0.28;
  if (typeof out.weekend_variation !== "number") out.weekend_variation = 0; // 0 = bez změny
  if (typeof out.night_setback !== "number") out.night_setback = 0.0;
  if (!Array.isArray(out.peaks)) out.peaks = [];
  if (!Array.isArray(out.dips)) out.dips = [];

  // 4) Udržet i hour_params pro zpětnou kompatibilitu (mirror)
  out.hour_params = {
    baseload: out.baseload,
    weekend_variation: out.weekend_variation,
    night_setback: out.night_setback,
    peaks: Array.isArray(out.peaks) ? out.peaks : [],
    dips: Array.isArray(out.dips) ? out.dips : []
  };

  return out;
}

// ---- Veřejné API ----
// Robust AI params fetcher with normalization and clear errors
export async function fetchAIParams(payloadOverride) {
  const btn =
    document.getElementById("btnParams") ||
    document.getElementById("btnFetchAI");
  const prev = btn ? btn.textContent : null;

  // malý helper: POST s timeoutem + čistý text → JSON
  async function postJSON(url, body, { tries = 2, timeoutMs = 60000 } = {}) {
    let lastErr;
    for (let a = 1; a <= tries; a++) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const txt = await r.text();
        clearTimeout(to);
        if (!r.ok) throw new Error(txt || `HTTP ${r.status}`);
        try {
          return JSON.parse(txt);
        } catch (e) {
          throw new Error(`Bad JSON: ${e.message}`);
        }
      } catch (e) {
        clearTimeout(to);
        lastErr = e;
        if (a < tries) await new Promise((r) => setTimeout(r, 800 * a));
        else throw lastErr;
      }
    }
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Volám AI…";
    }

    // ČTI SPRÁVNÁ ID Z UI
    const mediumRaw = document.getElementById("medium")?.value || "";
    const objectRaw = document.getElementById("object_type")?.value || "";
    const user_prompt_text = (
      document.getElementById("prompt")?.value ||
      document.getElementById("userPrompt")?.value ||
      ""
    ).trim();

    // normalizace
    const mediumMap = {
      electricity: "electricity",
      elektřina: "electricity",
      elektrina: "electricity",
      el: "electricity",
      gas: "gas",
      plyn: "gas",
      heat: "heat",
      teplo: "heat",
      czt: "heat",
      water: "water",
      voda: "water",
    };
    const objectMap = {
      skola: "skola",
      škola: "skola",
      zs: "skola",
      zš: "skola",
      kancelar: "kancelar",
      kancelář: "kancelar",
      bytovy_dum: "bytovy_dum",
      bytový_dům: "bytovy_dum",
      prumysl: "prumysl",
      průmysl: "prumysl",
      obchod: "obchod",
      retail: "obchod",
      bazen: "bazen",
      bazén: "bazen",
    };
    const medium = mediumMap[String(mediumRaw).toLowerCase()] || null;
    const object_type = (objectRaw || '').trim();

    if (!medium)
      throw new Error("Neplatné medium (electricity|gas|heat|water).");
    // object_type může být jakýkoliv text (mapujeme přes config); pokud prázdné, necháme prázdné a heuristiky si poradí.
    if (!user_prompt_text) throw new Error("Chybí popis (user_prompt_text).");

    const model = (
      document.getElementById("model")?.value || "gpt-4o-mini"
    ).trim();
    const units = (document.getElementById("units")?.value || "MWh").trim();
    const locale = (document.getElementById("locale")?.value || "cs-CZ").trim();
    const timezone = (
      document.getElementById("timezone")?.value || "Europe/Prague"
    ).trim();
    const climate_zone = (
      document.getElementById("climate")?.value || "Cfb"
    ).trim();
    const annual = Number(document.getElementById("annual")?.value) || null;

    const payload = payloadOverride || {
      model,
      medium,
      object_type,
      units,
      user_prompt_text,
      locale,
      timezone,
      climate_zone,
      annual,
    };
    const url =
      document.getElementById("apiParamsEndpoint")?.value ||
      "http://localhost:3000/ai/profiles/params";

    console.log("[AI] POST", url, payload);
    const aiParams = await postJSON(url, payload);
    console.log("[AI] OK, params:", aiParams);

    // promítni do UI
    window.lastParams = aiParams;
    const outParams = document.getElementById("outParams");
    if (outParams) outParams.textContent = JSON.stringify(aiParams, null, 2);

    // pokud máme annual → deterministicky slož profil
    const build = buildProfileFromParams;
    const lastProfile = build(aiParams, annual);
    window.lastProfile = lastProfile;

    const outProfile = document.getElementById("outProfile");
    if (outProfile)
      outProfile.textContent = JSON.stringify(lastProfile, null, 2);

    if (typeof window.rebuildAndRender === "function")
      window.rebuildAndRender("outParams");
    return aiParams;
  } catch (e) {
    console.warn("fetchAIParams failed:", e?.message || e);
    alert(e?.message || e);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prev) btn.textContent = prev;
    }
  }
}

export function buildProfileFromParams(params, annual) {
  const p = params || {};
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const valid = (x) => typeof x === "number" && isFinite(x);

  // ---- MONTHLY (season_params -> monthly_share) ----
  // Kosinus-křivka přes celý rok: vrchol v lednu (i=0), dno v červenci (i=6)
  // winter_bias=1 → leden ~dvojnásobek července; vacation_dip=1 → prázdniny na nulu
  const sp = p.season_params || {};

  // Fallback A: AI vrátil winter/spring/summer/autumn místo winter_bias — přepočítáme
  if (typeof sp.winter === 'number' && typeof sp.summer === 'number' && !sp.winter_bias) {
    const w = Number(sp.winter) || 1;
    const su = Number(sp.summer) || 1;
    const au = Number(sp.autumn) || 1;
    const avg = (w + (Number(sp.spring)||1) + su + au) / 4;
    if (avg > 0) {
      sp.winter_bias = Math.max(0, Math.min(1, (((w + au) / 2) - avg) / avg));
      sp.summer_uplift = Math.max(-1, Math.min(1, (su - avg) / avg));
    }
  }

  // Fallback B: AI vrátil nuly pro klíčová pole → doplníme typické hodnoty podle object_type
  const spFallback = !((typeof sp.winter_bias === 'number' && sp.winter_bias > 0.01)
    || (typeof sp.vacation_dip === 'number' && sp.vacation_dip > 0.01));
  if (spFallback) {
    const ot = String(p.meta?.object_type || '').toLowerCase();
    if (ot.includes('skola') || ot.includes('škola') || ot.includes('school') || ot.includes('zs') || ot.includes('zš') || ot.includes('ms') || ot.includes('gymn')) {
      sp.winter_bias   = sp.winter_bias   || 0.45;
      sp.vacation_dip  = sp.vacation_dip  || 0.85;
      sp.summer_uplift = sp.summer_uplift || -0.3;
    } else if (ot.includes('kancelar') || ot.includes('kancelář') || ot.includes('office') || ot.includes('administ') || ot.includes('munic') || ot.includes('úřad') || ot.includes('urad')) {
      sp.winter_bias   = sp.winter_bias   || 0.2;
      sp.vacation_dip  = sp.vacation_dip  || 0.25;
      sp.summer_uplift = sp.summer_uplift || -0.1;
    } else if (ot.includes('bytov') || ot.includes('panelak') || ot.includes('panelák') || ot.includes('reziden') || ot.includes('byt')) {
      sp.winter_bias   = sp.winter_bias   || 0.15;
      sp.vacation_dip  = sp.vacation_dip  || 0.1;
    } else if (ot.includes('bazen') || ot.includes('bazén') || ot.includes('pool') || ot.includes('sport') || ot.includes('fitnes')) {
      sp.winter_bias   = sp.winter_bias   || 0.15;
      sp.summer_uplift = sp.summer_uplift || 0.3;
    } else if (ot.includes('obchod') || ot.includes('nakup') || ot.includes('nákup') || ot.includes('retail') || ot.includes('market') || ot.includes('supermark')) {
      sp.winter_bias   = sp.winter_bias   || 0.05;
      sp.xmas_spike    = sp.xmas_spike    || 0.3;
      sp.summer_uplift = sp.summer_uplift || 0.1;
    } else if (ot.includes('prumysl') || ot.includes('průmysl') || ot.includes('vyrob') || ot.includes('výrob') || ot.includes('provoz') || ot.includes('smena') || ot.includes('směna')) {
      sp.winter_bias   = sp.winter_bias   || 0.1;
      sp.vacation_dip  = sp.vacation_dip  || 0.1;
    } else if (ot.includes('nemoc') || ot.includes('hospital') || ot.includes('zdravot')) {
      sp.winter_bias   = sp.winter_bias   || 0.1;
      sp.vacation_dip  = sp.vacation_dip  || 0.05;
    } else {
      // Generický fallback
      sp.winter_bias   = sp.winter_bias   || 0.15;
      sp.vacation_dip  = sp.vacation_dip  || 0.1;
    }
  }
  const winterBias  = Math.max(0,  Math.min(1,  Number(sp.winter_bias  ?? 0) || 0));
  const summerUplift= Math.max(-1, Math.min(1,  Number(sp.summer_uplift?? 0) || 0));
  const vacDip      = Math.max(0,  Math.min(1,  Number(sp.vacation_dip ?? 0) || 0));
  const xmasSpike   = Math.max(0,  Math.min(1,  Number(sp.xmas_spike   ?? 0) || 0));

  let m = Array.from({length:12}, (_, i) => {
    // cosWinter: +1 v lednu, −1 v červenci → plynulá topná sezóna
    const cosWinter = Math.cos(2 * Math.PI * i / 12);
    // cosSummer: +1 v červenci, −1 v lednu → letní uplift (může být záporný = letní útlum)
    const cosSummer = -cosWinter;
    return 1 + winterBias * cosWinter + summerUplift * cosSummer * 0.5;
  });

  // Prázdninový útlum: červenec (6) a srpen (7) plně, červen (5) a září (8) částečně
  if (vacDip > 0) {
    m[6] *= Math.max(0.01, 1 - vacDip);
    m[7] *= Math.max(0.01, 1 - vacDip);
    m[5] *= Math.max(0.01, 1 - vacDip * 0.4);
    m[8] *= Math.max(0.01, 1 - vacDip * 0.25);
  }

  // Vánoční špička v prosinci (11)
  m[11] *= 1 + xmasSpike;

  let sumM = m.reduce((a,b)=>a+b,0) || 1;
  let monthly = m.map(v => v / sumM);

  // ---- DOW (dow_params -> dow_share) ----
  const dd = (p.dow_params && p.dow_params.day_drops) ? p.dow_params.day_drops : {};
  let dow = { Mon:1, Tue:1, Wed:1, Thu:1, Fri:1, Sat:1, Sun:1 };
  const map = { mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat", sun:"Sun" };
  const longNames = { mon:"monday", tue:"tuesday", wed:"wednesday", thu:"thursday", fri:"friday", sat:"saturday", sun:"sunday" };

  // 1) Per-den základní váhy z AI
  // Podporuje: mon/tue/... i monday/tuesday/..., .base, .peak.amp, přímé číslo
  // Také group klíče: weekday/weekend (AI někdy vrací souhrnné hodnoty)
  if (p.dow_params) {
    const extractBase = (v) => {
      if (typeof v === "number" && isFinite(v)) return Math.max(0.001, v);
      if (v && typeof v === "object") {
        if (typeof v.base === "number") return Math.max(0.001, v.base);
        if (v.peak && typeof v.peak.amp === "number") return Math.max(0.001, v.peak.amp);
      }
      return null;
    };
    // Group fallback: weekday / weekend (číslo nebo objekt)
    const wdBase = extractBase(p.dow_params.weekday);
    const weBase = extractBase(p.dow_params.weekend);
    if (wdBase !== null) ["Mon","Tue","Wed","Thu","Fri"].forEach(d => { dow[d] = wdBase; });
    if (weBase !== null) ["Sat","Sun"].forEach(d => { dow[d] = weBase; });
    // Per-den (přepíše group hodnoty pokud existuje konkrétní den)
    for (const k in map) {
      const dayObj = p.dow_params[k] ?? p.dow_params[longNames[k]];
      const base = extractBase(dayObj);
      if (base !== null) dow[map[k]] = base;
    }
  }

  // 2) weekend_floor jako základ pro sobotu/neděli (před day_drops, aby slidery mohly upravit navrch)
  const wfRaw = p.dow_params?.weekend_floor ?? 0;
  const wf = Math.max(-1, Math.min(1, Number(wfRaw) || 0));
  if (wf < 0) {
    // Záporná hodnota: nastaví základ víkendu jako frakci průměrného pracovního dne
    // -1 = víkend na 0, -0.5 = víkend na 50 % průměrného pracovního dne, 0 = beze změny
    const wdAvg = (dow.Mon + dow.Tue + dow.Wed + dow.Thu + dow.Fri) / 5;
    dow.Sat = Math.max(0.001, wdAvg * (1 + wf));
    dow.Sun = Math.max(0.001, wdAvg * (1 + wf));
  } else if (wf > 0) {
    // Kladná hodnota: floor enforcement (zvedni víkendy na minimálně wf podíl týdne)
    const sumD0 = Object.values(dow).reduce((a,b)=>a+b,0) || 1;
    const wSum = dow.Sat + dow.Sun; const wdSum = sumD0 - wSum;
    const shareWeekend = wSum / sumD0;
    if (shareWeekend < wf) {
      const need = wf*sumD0 - wSum;
      const ratio = need / wdSum;
      ["Mon","Tue","Wed","Thu","Fri"].forEach(k => dow[k] *= (1 - ratio));
      ["Sat","Sun"].forEach(k => dow[k] *= (1 + need/wSum/2 || 0));
    }
  }

  // 3) day_drops jako korekce navrchu (UI slidery) – klíče jsou uppercase (Mon, Tue…)
  for (const k in map) {
    const v = dd[map[k]];
    if (typeof v === "number" && v > 0) {
      dow[map[k]] *= Math.max(0.01, 1 - clamp01(v));
    }
  }
  const sumD = Object.values(dow).reduce((a,b)=>a+b,0) || 1;
  const dow_share = Object.fromEntries(Object.entries(dow).map(([k,v])=>[k, v/sumD]));

  // ---- HOURLY (globální baseload + peaks/dips -> hourly_template) ----
  // Minimální baseload 0.05 — každá budova má nějakou základní spotřebu (pohotovost, chlazení, ostraha)
  const baseload = Math.max(0.05, valid(p.baseload) ? clamp01(p.baseload) : clamp01(p.hour_params?.baseload ?? 0.28));
  const weekend_variation = valid(p.weekend_variation) ? p.weekend_variation : (p.hour_params?.weekend_variation ?? 0);
  const night_setback = clamp01(valid(p.night_setback) ? p.night_setback : (p.hour_params?.night_setback ?? 0));
  const peaks = Array.isArray(p.peaks) ? p.peaks : (Array.isArray(p.hour_params?.peaks) ? p.hour_params.peaks : []);
  const dips = Array.isArray(p.dips) ? p.dips : (Array.isArray(p.hour_params?.dips) ? p.hour_params.dips : []);

  // Fallback: server mohl uložit _hourly pole z číselných klíčů
  let hourlyFallback = null;
  if (Array.isArray(p.hour_params?._hourly) && p.hour_params._hourly.length === 24) {
    hourlyFallback = p.hour_params._hourly;
  }
  // Fallback: pokud peaks/dips jsou prázdné, zkus číselné klíče 0-23 v hour_params
  // AI vrací buď čísla {"0": 0.1} nebo objekty {"0": {amp: 0.7}}
  if (!hourlyFallback && peaks.length === 0 && dips.length === 0 && p.hour_params) {
    const arr = [];
    for (let h = 0; h < 24; h++) {
      const v = p.hour_params[String(h)];
      if (typeof v === "number" && isFinite(v)) {
        arr.push(Math.max(0, v));
      } else if (v && typeof v === "object") {
        const n = Number(v.amp ?? v.base ?? v.value);
        if (isFinite(n)) { arr.push(Math.max(0, n)); continue; }
        break;
      } else {
        break;
      }
    }
    if (arr.length === 24) hourlyFallback = arr;
  }

  // start with baseload
  const buildDay = () => {
    if (hourlyFallback) {
      const s = hourlyFallback.reduce((a, b) => a + b, 0) || 1;
      return hourlyFallback.map(v => v / s);
    }
    let arr = Array(24).fill(baseload);
    const gauss = (t, mu, amp) => amp * Math.exp(-0.5 * Math.pow((t-mu)/1.2, 2));
    (peaks||[]).forEach(pv => {
      const mu = Number(pv.t)||0, amp = clamp01(pv.amp||0);
      for (let h=0; h<24; h++) arr[h] += gauss(h, mu, amp);
    });
    (dips||[]).forEach(pv => {
      const mu = Number(pv.t)||0, amp = clamp01(pv.amp||0);
      for (let h=0; h<24; h++) arr[h] -= gauss(h, mu, amp)*0.8;
    });
    // night setback
    for (let h=0; h<24; h++) if (h<6 || h>=22) arr[h] *= (1 - night_setback);
    // smooth & clamp >= 0
    const smooth = (a,w=2)=>a.map((_,i)=>{
      let s=0,c=0; for (let k=-w;k<=w;k++){ const j=i+k; if (j>=0&&j<a.length){ s+=a[j]; c++; } } return s/c;
    });
    arr = smooth(arr,2).map(v => Math.max(0, v));
    // normalize
    const s = arr.reduce((a,b)=>a+b,0) || 1;
    return arr.map(v => v/s);
  };

  const wdArr = buildDay();
  const weArr = buildDay().map(v => Math.max(0, v * (1 + (valid(weekend_variation)? weekend_variation : 0))));
  const norm = (a)=>{ const s=a.reduce((x,y)=>x+y,0)||1; return a.map(v=>v/s); };
  const hourly_template = { workday: norm(wdArr), weekend: norm(weArr) };

  const out = { monthly_share: monthly, dow_share, hourly_template };
  if (valid(annual)) out.annual = annual;
  return out;

}

// Pro pohodlí v DevTools