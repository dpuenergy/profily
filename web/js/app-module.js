// web/js/app-module.js
import {
  fetchAIParams,
  buildProfileFromParams,
} from "./ai-params-generator.js";

// --- DOM refs + util ---
const mediumEl = document.getElementById("medium");
const objectEl = document.getElementById("object_type");
const promptEl = document.getElementById("prompt");
const outParams = document.getElementById("outParams");
const outProfile = document.getElementById("outProfile");

let lastParams = window.lastParams || null;
let lastProfile = null;

// Všechny listenery navěsíme JEDNOU
if (false) {
  // disabled early stub
  window.__aiBindingsDone = true;

  // Získat AI parametry
  document.getElementById("btnParams")?.addEventListener("click", async () => {
    try {
      outParams.textContent = "Načítám…";
      const payload = {
        model: "gpt-4o-mini",
        medium: mediumEl.value,
        object_type: objectEl.value,
        units: unitsFor(mediumEl.value),
        user_prompt_text: promptEl.value,
      };
      lastParams = await fetchAIParams(payload);
      window.lastParams = lastParams;
      outParams.textContent = JSON.stringify(lastParams, null, 2);
    } catch (e) {
      outParams.textContent = "Chyba: " + (e?.message || e);
    }
  });

  // Generovat výchozí profil
  document.getElementById("btnBuild")?.addEventListener("click", async () => {
    try {
      if (!lastParams) {
        const payload = {
          model: "gpt-4o-mini",
          medium: mediumEl.value,
          object_type: objectEl.value,
          units: unitsFor(mediumEl.value),
          user_prompt_text: promptEl.value,
        };
        lastParams = await fetchAIParams(payload);
        window.lastParams = lastParams;
        outParams.textContent = JSON.stringify(lastParams, null, 2);
      }
      rebuildAndRender(); // tvá existující funkce níž v souboru
    } catch (e) {
      outProfile.textContent = "Chyba: " + (e?.message || e);
    }
  });

  // Test (mock)
  document
    .getElementById("btnParamsMock")
    ?.addEventListener("click", async () => {
      try {
        outParams.textContent = "Načítám…";
        const payload = {
          model: "gpt-4o-mini",
          medium: mediumEl.value,
          object_type: objectEl.value,
          units: unitsFor(mediumEl.value),
          user_prompt_text: "ping", // mock fast-path
        };
        const res = await fetch(
          "http://localhost:3000/ai/profiles/params?mock=1",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
        lastParams = await res.json();
        window.lastParams = lastParams;
        outParams.textContent = JSON.stringify(lastParams, null, 2);
      } catch (e) {
        outParams.textContent = "Chyba: " + (e?.message || e);
      }
    });
}

/* Svislé značky začátků měsíců (plugin) */
const monthMarkersPlugin = {
  id: "monthMarkers",
  afterDraw(chart, args, opts) {
    const markers = opts?.markers || [];
    if (!markers.length) return;
    const {
      ctx,
      chartArea,
      scales: { x },
    } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    for (const m of markers) {
      const px = x.getPixelForValue(m.idx);
      if (Number.isFinite(px)) {
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};
Chart.register(monthMarkersPlugin);

/* Paleta */
const COLORS = {
  c1: "#282560",
  c2: "#C7D6EA",
  c3: "#9FBADF",
  c4: "#5551A6",
  c5: "#94A3B8",
};
const hexToRgba = (hex, a = 1) => {
  const m = hex.replace("#", "");
  const bigint = parseInt(m, 16);
  const r = m.length === 3 ? ((bigint >> 8) & 0xf) * 17 : (bigint >> 16) & 255;
  const g = m.length === 3 ? ((bigint >> 4) & 0xf) * 17 : (bigint >> 8) & 255;
  const b = m.length === 3 ? (bigint & 0xf) * 17 : bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
};

/* Chart.js defaults */
Chart.defaults.font.family =
  "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#111";
Chart.defaults.elements.line.borderWidth = 1.6;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = hexToRgba(COLORS.c1, 0.92);
Chart.defaults.plugins.tooltip.titleColor = "#fff";
Chart.defaults.plugins.tooltip.bodyColor = "#fff";

/* DOM refs */
const annualEl = document.getElementById("annual");

// Jednoduché writer funkce – pokud už nejsou definované, nastavíme je.
if (!window.writeOutParams) {
  window.writeOutParams = (data) => {
    try {
      outParams.textContent = JSON.stringify(data ?? {}, null, 2);
    } catch {
      outParams.textContent = String(data);
    }
  };
}
if (!window.writeOutProfile) {
  window.writeOutProfile = (data) => {
    try {
      outProfile.textContent = JSON.stringify(data ?? {}, null, 2);
    } catch {}
  };
}
/* startovní refresh */
refreshUnits();
refreshHeadings();

/* Ovladače, co mají „hodnoty“ vedle */
const T = {
  baseload: byId("p_baseload", "v_baseload"),
  open_start: byId("p_open_start"),
  open_end: byId("p_open_end"),
  peak1_t: byId("p_peak1_t"),
  peak1_amp: byId("p_peak1_amp"),
  peak2_t: byId("p_peak2_t"),
  peak2_amp: byId("p_peak2_amp"),
  night_setback: byId("p_night_setback", "v_night_setback"),
  weekend_var: byId("p_weekend_var", "v_weekend_var"),
  ramp_up: byId("p_ramp_up", "v_ramp_up"),
  ramp_down: byId("p_ramp_down", "v_ramp_down"),
  weekend_floor: byId("p_weekend_floor", "v_weekend_floor"),
  vacation_dip: byId("p_vacation_dip", "v_vacation_dip"),
  holidays_drop: byId("p_holidays_drop", "v_holidays_drop"),
  mon_drop: byId("p_drop_mon", "v_drop_mon"),
  tue_drop: byId("p_drop_tue", "v_drop_tue"),
  wed_drop: byId("p_drop_wed", "v_drop_wed"),
  thu_drop: byId("p_drop_thu", "v_drop_thu"),
  fri_drop: byId("p_drop_fri", "v_drop_fri"),
  sat_drop: byId("p_drop_sat", "v_drop_sat"),
  sun_drop: byId("p_drop_sun", "v_drop_sun"),
};

function hhmmToHourDec(hhmm) {
  const [h, m] = String(hhmm || "0:0")
    .split(":")
    .map((n) => parseInt(n || "0", 10));
  return Math.max(0, Math.min(23.9833, h + (isFinite(m) ? m / 60 : 0)));
}
function makePeakRow(idx, timeVal = "07:00", ampVal = "0.18") {
  return `
        <div class="row peak-item" data-idx="${idx}">
          <label>Čas
            <input type="time" id="p_peak_time_${idx}" value="${timeVal}">
          </label>
          <label>Amp
            <input type="number" id="p_peak_amp_${idx}" min="0" max="1" step="0.01" value="${ampVal}">
          </label>
        </div>`;
}
function makeDipRow(idx, timeVal = "12:00", ampVal = "0.10") {
  return `
        <div class="row dip-item" data-idx="${idx}">
          <label>Čas
            <input type="time" id="p_dip_time_${idx}" value="${timeVal}">
          </label>
          <label>Drop
            <input type="number" id="p_dip_amp_${idx}" min="0" max="1" step="0.01" value="${ampVal}">
          </label>
        </div>`;
}

/* Y-lock stav */
let updateYLock = true;
const Y_LOCK_PAD = 1.15; // +15 %

const yLocks = {
  monthly: null,
  week: null,
  monthDays: null,
  dayHours: null,
  yearHours: null,
};
const yStepLocks = {
  monthly: null,
  week: null,
  monthDays: null,
  dayHours: null,
  yearHours: null,
};

function currentMaxOf(data) {
  return Math.max(0, ...(Array.isArray(data) ? data : [0])) || 0;
}
function niceStepFor(maxValue, approxTicks = 6) {
  if (!(maxValue > 0)) return 1;
  const raw = maxValue / Math.max(1, approxTicks);
  const pow = Math.floor(Math.log10(raw));
  const base = raw / Math.pow(10, pow);
  let niceBase;
  if (base <= 1) niceBase = 1;
  else if (base <= 2) niceBase = 2;
  else if (base <= 2.5) niceBase = 2.5;
  else if (base <= 5) niceBase = 5;
  else niceBase = 10;
  return niceBase * Math.pow(10, pow);
}
function niceCeil(value, approxTicks = 6) {
  const step = niceStepFor(value, approxTicks);
  return Math.ceil(value / step) * step;
}
function approxTicksFor(key) {
  switch (key) {
    case "monthly":
    case "week":
      return 5;
    case "monthDays":
      return 6;
    case "dayHours":
    case "yearHours":
      return 7;
    default:
      return 6;
  }
}
function initYAxis(chart, key, dataArr) {
  const rawMax = currentMaxOf(dataArr);
  const paddedMax = Math.max(0, rawMax * Y_LOCK_PAD);
  const ticks = approxTicksFor(key);
  const snapMax = niceCeil(paddedMax, ticks);

  yLocks[key] = snapMax > 0 ? snapMax : 1;
  yStepLocks[key] = null;

  const y = chart.options.scales.y || (chart.options.scales.y = {});
  y.beginAtZero = true;
  y.min = 0;
  y.max = yLocks[key];
  y.ticks = y.ticks || {};
  delete y.ticks.stepSize;
}
function applyYMaxOption(chart, key, dataArr, shouldUpdateLock) {
  const y = chart.options.scales.y || (chart.options.scales.y = {});
  if (yLocks[key] == null) {
    initYAxis(chart, key, dataArr);
  } else if (shouldUpdateLock) {
    const rawMax = currentMaxOf(dataArr);
    const paddedMax = Math.max(0, rawMax * Y_LOCK_PAD);
    const snapMax = niceCeil(paddedMax, approxTicksFor(key));
    yLocks[key] = snapMax > 0 ? snapMax : 1;
  }
  y.beginAtZero = true;
  y.min = 0;
  y.max = yLocks[key];
  y.ticks = y.ticks || {};
  delete y.ticks.stepSize;
}

function byId(inputId, valId) {
  const el = document.getElementById(inputId);
  const val = valId ? document.getElementById(valId) : null;
  return { el, val };
}
function setValDisplay(t, fmt = (x) => Number(x).toFixed(2)) {
  if (t.val) t.val.textContent = fmt(t.el.value);
}

/* === Normalizace AI parametrů (doplnění chybějících polí z UI a ořez do rozsahů) === */
function normalizeAIParams(p, useUI = true) {
  const clamp = (v, a, b) =>
    Math.max(a, Math.min(b, Number.isFinite(+v) ? +v : a));
  p = p || {};

  // --- Helpery pro čtení UI jako fallback ---
  const getEl = (id) => document.getElementById(id);
  const getNum = (id, def = 0) => {
    const el = getEl(id);
    const v = el && "value" in el ? parseFloat(el.value) : NaN;
    return Number.isFinite(v) ? v : def;
  };
  const getInt = (id, def = 0) => {
    const el = getEl(id);
    const v = el && "value" in el ? parseInt(el.value, 10) : NaN;
    return Number.isFinite(v) ? v : def;
  };
  const getChk = (id, def = false) => {
    const el = getEl(id);
    return el && "checked" in el ? !!el.checked : def;
  };
  const readPeaks = () => {
    const n = clamp(getInt("p_peaks_count", 0), 0, 6);
    const arr = [];
    for (let i = 0; i < n; i++) {
      const tStr = getEl(`p_peak_time_${i}`)?.value || "07:00";
      const [hh, mm] = String(tStr)
        .split(":")
        .map((x) => parseInt(x || "0", 10));
      const t =
        (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm / 60 : 0);
      const amp = getNum(`p_peak_amp_${i}`, 0.1);
      arr.push({ t: clamp(t, 0, 23.9833), amp: clamp(amp, 0, 1) });
    }
    return arr;
  };
  const readDips = () => {
    const n = clamp(getInt("p_dips_count", 0), 0, 6);
    const arr = [];
    for (let i = 0; i < n; i++) {
      const tStr = getEl(`p_dip_time_${i}`)?.value || "12:00";
      const [hh, mm] = String(tStr)
        .split(":")
        .map((x) => parseInt(x || "0", 10));
      const t =
        (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm / 60 : 0);
      const amp = getNum(`p_dip_amp_${i}`, 0.1);
      arr.push({ t: clamp(t, 0, 23.9833), amp: clamp(amp, 0, 1) });
    }
    return arr;
  };

  // --- Defaults z UI (pokud useUI=true), jinak useUI=false použije tvrdé defaulty ---
  const ui = !!useUI;
  const uiDefaults = {
    season_params: {
      winter_bias: 0.15,
      summer_uplift: 0,
      vacation_dip: 0.6,
      xmas_spike: 0,
    },
    dow_params: {
      weekend_floor: ui ? clamp(getNum("p_weekend_floor", 0.5), 0, 1) : 0.5,
      day_drops: {
        Mon: ui ? clamp(getNum("p_drop_mon", 0.0), 0, 0.2) : 0.0,
        Tue: ui ? clamp(getNum("p_drop_tue", 0.0), 0, 0.2) : 0.0,
        Wed: ui ? clamp(getNum("p_drop_wed", 0.0), 0, 0.2) : 0.0,
        Thu: ui ? clamp(getNum("p_drop_thu", 0.0), 0, 0.2) : 0.0,
        Fri: ui ? clamp(getNum("p_drop_fri", 0.0), 0, 0.2) : 0.0,
        Sat: ui ? clamp(getNum("p_drop_sat", 0.0), 0, 0.2) : 0.0,
        Sun: ui ? clamp(getNum("p_drop_sun", 0.0), 0, 0.2) : 0.0,
      },
    },
    hour_params: {
      baseload: ui ? clamp(getNum("p_baseload", 0.3), 0, 0.8) : 0.3,
      night_setback: ui ? clamp(getNum("p_night_setback", 0.3), 0, 1) : 0.3,
      weekend_variation: ui
        ? clamp(getNum("p_weekend_var", -0.2), -1, 1)
        : -0.2,
      ramp_up_rate: ui ? clamp(getNum("p_ramp_up", 0.08), 0, 1) : 0.08,
      ramp_down_rate: ui ? clamp(getNum("p_ramp_down", 0.06), 0, 1) : 0.06,
      peaks: ui ? readPeaks() : [],
      dips: ui ? readDips() : [],
    },
    events: { holidays_drop: 0.3, vacation_drop: 0.6 },
    constraints: { max_hourly_slope: 0.15, min_weekend_share: 0.03 },
    tuning_defaults: {
      smoothWindow: ui
        ? Math.round(clamp(getNum("smoothWindow", 5), 1, 15))
        : 5,
      anchorBlend: ui ? clamp(getNum("anchorBlend", 0.5), 0, 1) : 0.5,
      holidayBaseload: ui ? clamp(getNum("holidayBaseload", 0), -0.5, 0.5) : 0,
      holidayLikeSunday: ui ? !!getChk("holidayLikeSunday", false) : false,
    },
    meta: { notes: "" },
  };

  // --- Merge: AI hodnoty > UI defaulty ---
  const out = {};
  out.meta = Object.assign({}, uiDefaults.meta, p.meta || {});

  out.season_params = Object.assign(
    {},
    uiDefaults.season_params,
    p.season_params || {},
  );

  out.dow_params = Object.assign({}, uiDefaults.dow_params, p.dow_params || {});
  out.dow_params.weekend_floor = clamp(out.dow_params.weekend_floor, 0, 1);
  const ddMerged = Object.assign(
    {},
    uiDefaults.dow_params.day_drops,
    (p.dow_params && p.dow_params.day_drops) || {},
  );
  for (const k of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    ddMerged[k] = clamp(ddMerged[k], 0, 0.2);
  out.dow_params.day_drops = ddMerged;

  out.hour_params = Object.assign(
    {},
    uiDefaults.hour_params,
    p.hour_params || {},
  );
  const hp = out.hour_params;
  hp.baseload = clamp(hp.baseload, 0, 0.8);
  hp.night_setback = clamp(hp.night_setback, 0, 1);
  hp.weekend_variation = clamp(hp.weekend_variation, -1, 1);
  hp.ramp_up_rate = clamp(hp.ramp_up_rate, 0, 1);
  hp.ramp_down_rate = clamp(hp.ramp_down_rate, 0, 1);
  const normPD = (arr) =>
    (Array.isArray(arr) ? arr : []).slice(0, 6).map((x) => ({
      t: clamp(+x.t || 0, 0, 23.9833),
      amp: clamp(+x.amp || 0, 0, 1),
    }));
  hp.peaks = normPD(hp.peaks);
  hp.dips = normPD(hp.dips);

  out.events = Object.assign({}, uiDefaults.events, p.events || {});
  out.constraints = Object.assign(
    {},
    uiDefaults.constraints,
    p.constraints || {},
  );

  out.tuning_defaults = Object.assign(
    {},
    uiDefaults.tuning_defaults,
    p.tuning_defaults || {},
  );
  out.tuning_defaults.smoothWindow = Math.round(
    clamp(out.tuning_defaults.smoothWindow, 1, 15),
  );
  out.tuning_defaults.anchorBlend = clamp(
    out.tuning_defaults.anchorBlend,
    0,
    1,
  );
  out.tuning_defaults.holidayBaseload = clamp(
    out.tuning_defaults.holidayBaseload,
    -0.5,
    0.5,
  );
  out.tuning_defaults.holidayLikeSunday =
    !!out.tuning_defaults.holidayLikeSunday;

  return out;
}
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* CZ popisky */
function mediumGenitive(m) {
  switch (m) {
    case "electricity":
      return "elektřiny";
    case "gas":
      return "zemního plynu";
    case "heat":
      return "tepla";
    case "water":
      return "vody";
    default:
      return "energie";
  }
}
function czMonthName(m1) {
  const n = [
    "leden",
    "únor",
    "březen",
    "duben",
    "květen",
    "červen",
    "červenec",
    "srpen",
    "září",
    "říjen",
    "listopad",
    "prosinec",
  ];
  return n[(m1 - 1 + 12) % 12];
}
function czDayName(dow) {
  const map = [
    "neděle",
    "pondělí",
    "úterý",
    "středa",
    "čtvrtek",
    "pátek",
    "sobota",
  ];
  return map[dow];
}
function formatDateCZ(dt) {
  return dt.toLocaleDateString("cs-CZ");
}
function refreshUnits() {
  const unitsLabel = document.getElementById("unitsLabel");
  if (unitsLabel) unitsLabel.textContent = `(${unitsFor(mediumEl.value)})`;
}
function refreshHeadings() {
  const mGen = mediumGenitive(mediumEl.value);
  const hMonthly = document.getElementById("hMonthly");
  if (hMonthly)
    hMonthly.textContent = `Spotřeba ${mGen} v jednotlivých měsících v roce`;

  const hWeek = document.getElementById("hWeek");
  if (hWeek) {
    const base = new Date(
      document.getElementById("weekDate")?.value || "2025-01-06",
    );
    const days = isoWeekRange(base);
    const from = days[0],
      to = days[6];
    hWeek.textContent = `Spotřeba ${mGen} v jednotlivých dnech v týdnu ${formatDateCZ(from)} – ${formatDateCZ(to)}`;
  }

  const hMonthDays = document.getElementById("hMonthDays");
  if (hMonthDays) {
    const m1 = Math.max(
      1,
      Math.min(12, Number(document.getElementById("monthIndex")?.value) || 1),
    );
    hMonthDays.textContent = `Spotřeba ${mGen} v jednotlivých dnech měsíce ${czMonthName(m1)}`;
  }

  const hDayHours = document.getElementById("hDayHours");
  if (hDayHours) {
    const isoDay = document.getElementById("dayDate")?.value || "2025-01-15";
    const dt = new Date(isoDay);
    const dn = czDayName(dt.getDay());
    hDayHours.textContent = `Spotřeba ${mGen} v jednotlivých hodinách dne ${formatDateCZ(dt)} (${dn})`;
  }

  const hYearHours = document.getElementById("hYearHours");
  if (hYearHours)
    hYearHours.textContent = `Spotřeba ${mGen} v jednotlivých hodinách v roce`;
}

/* Pomocné getter funkce */
function getEl(id) {
  return document.getElementById(id) || null;
}
function getVal(id, fallback = "") {
  const el = getEl(id);
  return el && "value" in el ? el.value : fallback;
}
function getNum(id, fallback = 0) {
  const v = parseFloat(getVal(id, ""));
  return Number.isFinite(v) ? v : fallback;
}
function getInt(id, fallback = 0) {
  const v = parseInt(getVal(id, ""), 10);
  return Number.isFinite(v) ? v : fallback;
}

function unitsFor(medium) {
  switch (medium) {
    case "electricity":
      return "MWh";
    case "gas":
      return "MWh";
    case "heat":
      return "GJ";
    case "water":
      return "m3";
    default:
      return "";
  }
}
function monthlyAbsolute(annual, monthly_share) {
  if (!annual || annual <= 0) return Array(12).fill(0);
  return monthly_share.map((s) => s * annual);
}

/* Renderers */
let chartMonthly = null,
  chartWeek = null,
  chartMonthDays = null,
  chartDayHours = null,
  chartYearHours = null;
let peakDipEditorsWired = false;

function renderPeakDipEditors() {
  const pC = document.getElementById("peaksContainer");
  const dC = document.getElementById("dipsContainer");
  if (!pC || !dC) return;

  const nPeaks = Math.max(
    0,
    Math.min(
      6,
      parseInt(document.getElementById("p_peaks_count")?.value || "0", 10),
    ),
  );
  const nDips = Math.max(
    0,
    Math.min(
      6,
      parseInt(document.getElementById("p_dips_count")?.value || "0", 10),
    ),
  );
  const fromParamsPeaks = (lastParams?.hour_params?.peaks || []).slice(
    0,
    nPeaks,
  );
  const fromParamsDips = (lastParams?.hour_params?.dips || []).slice(0, nDips);

  pC.innerHTML = Array.from({ length: nPeaks }, (_, i) => {
    const def = fromParamsPeaks[i] || {
      t: i === 0 ? 7 : i === 1 ? 13 : 8,
      amp: i === 0 ? 0.18 : i === 1 ? 0.12 : 0.1,
    };
    const hh = String(Math.floor(def.t)).padStart(2, "0");
    const mm = String(Math.round((def.t - Math.floor(def.t)) * 60)).padStart(
      2,
      "0",
    );
    return makePeakRow(i, `${hh}:${mm}`, String(def.amp));
  }).join("");

  dC.innerHTML = Array.from({ length: nDips }, (_, i) => {
    const def = fromParamsDips[i] || { t: 12, amp: 0.1 };
    const hh = String(Math.floor(def.t)).padStart(2, "0");
    const mm = String(Math.round((def.t - Math.floor(def.t)) * 60)).padStart(
      2,
      "0",
    );
    return makeDipRow(i, `${hh}:${mm}`, String(def.amp));
  }).join("");

  if (!peakDipEditorsWired) {
    pC.addEventListener("input", () => debRebuildLock());
    dC.addEventListener("input", () => debRebuildLock());
    peakDipEditorsWired = true;
  }
}
document.getElementById("p_peaks_count")?.addEventListener("input", () => {
  renderPeakDipEditors();
  debRebuildLock();
});
document.getElementById("p_dips_count")?.addEventListener("input", () => {
  renderPeakDipEditors();
  debRebuildLock();
});

function renderMonthlyChart(values) {
  const labels = [
    "Led",
    "Úno",
    "Bře",
    "Dub",
    "Kvě",
    "Čvn",
    "Čvc",
    "Srp",
    "Zář",
    "Říj",
    "Lis",
    "Pro",
  ];
  const ctx = document.getElementById("chartMonthly").getContext("2d");
  if (chartMonthly) {
    chartMonthly.data.datasets[0].data = values;
    applyYMaxOption(chartMonthly, "monthly", values, updateYLock);
    chartMonthly.update();
  } else {
    chartMonthly = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels || [],
        datasets: [
          {
            label: "Měsíční",
            data: values,
            borderColor: COLORS.c1,
            backgroundColor: hexToRgba(COLORS.c1, 0.25),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: {}, x: { grid: { color: hexToRgba(COLORS.c5, 0.2) } } },
      },
    });
    initYAxis(chartMonthly, "monthly", values);
    chartMonthly.update();
  }
}
function renderWeekChart(values, labels) {
  const ctx = document.getElementById("chartWeek").getContext("2d");

  if (window._weekChart) {
    try {
      window._weekChart.destroy();
    } catch (e) {}
  }
  if (chartWeek) {
    chartWeek.data.datasets[0].data = values;
    applyYMaxOption(chartWeek, "week", values, updateYLock);
    chartWeek.update();
  } else {
    chartWeek = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels || [],
        datasets: [
          {
            label: "Týden",
            data: values,
            borderColor: COLORS.c1,
            backgroundColor: hexToRgba(COLORS.c1, 0.25),
          },
        ],
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => {
                try {
                  const i = items[0].dataIndex;
                  const d = (window._wdays || [])[i];
                  if (!d) return items[0].label || "";
                  const dn = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"][
                    (d.getDay() + 6) % 7
                  ];
                  const dd = String(d.getDate()).padStart(2, "0");
                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                  const yyyy = d.getFullYear();
                  return `${dn} ${dd}.${mm}.${yyyy}`;
                } catch (e) {
                  return items[0].label || "";
                }
              },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: {}, x: { grid: { color: hexToRgba(COLORS.c5, 0.2) } } },
      },
    });
    initYAxis(chartWeek, "week", values);
    chartWeek.update();
  }
}
function renderMonthDaysChart(values) {
  const ctx = document.getElementById("chartMonthDays").getContext("2d");
  const labels = values.map((_, i) => String(i + 1));
  if (chartMonthDays) {
    chartMonthDays.data.labels = labels;
    chartMonthDays.data.datasets[0].data = values;
    applyYMaxOption(chartMonthDays, "monthDays", values, updateYLock);
    chartMonthDays.update();
  } else {
    chartMonthDays = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Měsíc – dny",
            data: values,
            fill: false,
            tension: 0.25,
            borderColor: COLORS.c1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        elements: { point: { radius: 0 } },
        scales: { y: {}, x: { grid: { color: hexToRgba(COLORS.c5, 0.2) } } },
      },
    });
    initYAxis(chartMonthDays, "monthDays", values);
    chartMonthDays.update();
  }
}
function renderDayHoursChart(values) {
  const ctx = document.getElementById("chartDayHours").getContext("2d");
  const labels = Array.from(
    { length: 24 },
    (_, h) => (h < 10 ? "0" : "") + h + ":00",
  );
  if (chartDayHours) {
    chartDayHours.data.labels = labels;
    chartDayHours.data.datasets[0].data = values;
    applyYMaxOption(chartDayHours, "dayHours", values, updateYLock);
    chartDayHours.update();
  } else {
    chartDayHours = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Den – hodiny",
            data: values,
            fill: false,
            tension: 0.25,
            borderColor: COLORS.c1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        elements: { point: { radius: 0 } },
        scales: { y: {}, x: { grid: { color: hexToRgba(COLORS.c5, 0.2) } } },
      },
    });
    initYAxis(chartDayHours, "dayHours", values);
    chartDayHours.update();
  }
}
function renderYearHoursChart(values, labels, markers) {
  const ctx = document.getElementById("chartYearHours").getContext("2d");
  if (chartYearHours) {
    chartYearHours.data.labels = labels;
    chartYearHours.data.datasets[0].data = values;
    applyYMaxOption(chartYearHours, "yearHours", values, updateYLock);
    chartYearHours.update();
    return;
  }
  const labelByIdx = new Map(markers.map((m) => [m.idx, m.label]));
  chartYearHours = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Hodinový (rok)",
          data: values,
          fill: false,
          tension: 0.05,
          pointRadius: 0,
          borderWidth: 2,
          borderColor: COLORS.c1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      elements: { point: { radius: 0 } },
      scales: {
        y: { grid: { color: hexToRgba(COLORS.c5, 0.35) } },
        x: {
          grid: { color: hexToRgba(COLORS.c5, 0.2) },
          ticks: {
            autoSkip: false,
            maxTicksLimit: markers.length,
            callback: (value) => labelByIdx.get(value) ?? "",
          },
        },
      },
      plugins: {
        legend: { display: false },
        monthMarkers: { markers },
      },
    },
  });
  initYAxis(chartYearHours, "yearHours", values);
  chartYearHours.update();
}

/* Svátky / prázdniny */
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}
function iso(d) {
  return (
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
  );
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function easterSunday(year) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function czechPublicHolidaysISO(year) {
  const s = new Set();
  [
    [1, 1],
    [5, 1],
    [5, 8],
    [7, 5],
    [7, 6],
    [9, 28],
    [10, 28],
    [11, 17],
    [12, 24],
    [12, 25],
    [12, 26],
  ].forEach(([m, d]) => s.add(`${year}-${pad2(m)}-${pad2(d)}`));
  const easter = easterSunday(year);
  s.add(iso(addDays(easter, -2))); // Velký pátek
  s.add(iso(addDays(easter, +1))); // Velikonoční pondělí
  return s;
}
function isSummerVacation(date) {
  const m = date.getMonth();
  return m === 6 || m === 7;
}

/* === Smooth-year helpers (anti-"zuby") === */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}
function daysInYear(y) {
  const d = new Date(y, 11, 31);
  return dayOfYear(new Date(y, 11, 31)) + 1; // 365 nebo 366
}
function linInterp(x, x0, y0, x1, y1) {
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}
function cosineBlend(t) {
  // t v <0,1>
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function buildYearDailySeries(year, profile, annual, tuning) {
  // --- "Lite" verze: žádná umělá roční sezóna.
  // Vezmeme měsíční denní řady (už reflektují DOW/svátky/část sezónnosti dle profilu)
  // a jen vyhladíme přechody mezi měsíci pomocí cosine crossfadu.
  const months = [];
  for (let m1 = 1; m1 <= 12; m1++) {
    months.push(buildDailyForMonth(year, m1, annual, profile).slice());
  }
  // crossfade na hranách
  const W = Math.max(0, Math.min(10, tuning?.edgeWindow ?? 5)); // počet dnů pro hladký přechod
  for (let m = 0; m < 12; m++) {
    const next = (m + 1) % 12;
    const a = months[m];
    const b = months[next];
    const na = a.length,
      nb = b.length;
    const k = Math.min(W, na, nb);
    for (let t = 0; t < k; t++) {
      const u = 0.5 - 0.5 * Math.cos((Math.PI * (t + 1)) / (k + 1)); // 0→1
      const ai = na - k + t; // posledních k dnů v a
      const bi = t; // prvních k dnů v b
      const blendedAend = a[ai] * (1 - u) + (a[ai] ? 0 : 0); // jen pro čitelnost
      const blendedBstart = b[bi] * u + (b[bi] ? 0 : 0);
      // Abychom zachovali lokální tvary a nesnižovali součet, blendni symetricky:
      const v = a[ai] * (1 - u) + b[bi] * u;
      a[ai] = v;
      b[bi] = v;
    }
  }
  // poskládej rok (v pořadí měsíců)
  const daily = [].concat(...months);

  // volitelný lehký roční anchor blend (0..1)
  const aBlend = Math.max(0, Math.min(1, tuning?.anchorBlend ?? 0));
  if (aBlend > 0) {
    // postav sezónní křivku přes středy měsíců jako dřív
    const N = daily.length;
    const monthDays = Array.from({ length: 12 }, (_, i) =>
      daysInMonth(year, i + 1),
    );
    const monthMid = monthDays.map((d, i) =>
      dayOfYear(new Date(year, i, Math.round(d / 2))),
    );
    const _absEff = getEffectiveMonthlyAbsolute(annual);
    const _absSum = _absEff.reduce((a, b) => a + b, 0) || 1;
    const monthlyShare = _absEff.map((v) => v / _absSum);
    const anchorVals = monthlyShare.map(
      (s, i) => s / Math.max(1, monthDays[i]),
    );
    const anchorsX = [monthMid[11] - N, ...monthMid, monthMid[0] + N];
    const anchorsY = [anchorVals[11], ...anchorVals, anchorVals[0]];
    const season = new Array(N);
    for (let d = 0; d < N; d++) {
      let k = 0;
      while (!(anchorsX[k] <= d && d <= anchorsX[k + 1])) k++;
      season[d] = linInterp(
        d,
        anchorsX[k],
        anchorsY[k],
        anchorsX[k + 1],
        anchorsY[k + 1],
      );
    }
    const sSum = season.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < N; i++) season[i] /= sSum;
    const dSum = daily.reduce((a, b) => a + b, 0) || 1;
    const seasonScaled = season.map((x) => x * dSum);
    for (let i = 0; i < N; i++)
      daily[i] = daily[i] * (1 - aBlend) + seasonScaled[i] * aBlend;
  }
  // normalizace na 'annual' (měsíční cíle už drží buildDailyForMonth)
  const sum = daily.reduce((p, c) => p + c, 0) || 1;
  const K = annual && annual > 0 ? annual / sum : 1;
  const dailyAbs = daily.map((v) => v * K);
  return dailyAbs; // 365/366
}

// Tuning options from UI
function readTuning() {
  const W = Math.max(
    0,
    Math.min(10, Number(document.getElementById("smoothWindow")?.value || 5)),
  );
  const anchorBlend = Math.max(
    0,
    Math.min(1, Number(document.getElementById("anchorBlend")?.value || 0)),
  );
  const holidayBaseload = Math.max(
    -0.5,
    Math.min(
      0.5,
      Number(document.getElementById("holidayBaseload")?.value || 0),
    ),
  );
  const holidayLikeSunday =
    !!document.getElementById("holidayLikeSunday")?.checked;
  return {
    edgeWindow: W,
    anchorBlend: anchorBlend,
    holidayBaseload: holidayBaseload,
    holidayLikeSunday,
  };
}

/* ISO týdny */
function dateToISOWeek(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { year: d.getUTCFullYear(), week };
}
function isoWeekRange(date) {
  const d = new Date(date);
  const jsDow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - jsDow);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const di = new Date(monday);
    di.setDate(monday.getDate() + i);
    days.push(di);
  }
  return days;
}

/* Výpočty */
function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}
function buildDailyForMonth(year, month1to12, annual, profile) {
  const nDays = daysInMonth(year, month1to12);
  const monthIdx0 = month1to12 - 1;
  const monthlyAbs = profile.monthly_share.map((s) => (annual || 0) * s);
  const monthTotal = monthlyAbs[monthIdx0] || 0;

  const dowOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dowWeights = dowOrder.map((k) => Number(profile.dow_share?.[k] || 0));
  const dowSum = dowWeights.reduce((a, b) => a + b, 0) || 1;

  const holidayPct = Number(profile.holiday_corrections?.holiday_pct ?? -0.3);
  const vacationPct = Number(profile.holiday_corrections?.vacation_pct ?? -0.2);
  const holidays = czechPublicHolidaysISO(year);

  const dailyRel = [],
    dayDates = [];
  for (let d = 1; d <= nDays; d++) {
    const dt = new Date(year, monthIdx0, d);
    dayDates.push(dt);
    const jsDow = dt.getDay();
    const idx = jsDow === 0 ? 6 : jsDow - 1;
    dailyRel.push(dowWeights[idx] / dowSum);
  }

  let days = [];
  const relSum = dailyRel.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < nDays; i++) {
    const dt = dayDates[i];
    let val = (dailyRel[i] / relSum) * monthTotal;
    if (isSummerVacation(dt)) val *= 1 + vacationPct;
    if (holidays.has(iso(dt))) val *= 1 + holidayPct;
    days.push(Math.max(0, val));
  }

  const after = days.reduce((a, b) => a + b, 0);
  if (after > 0 && monthTotal >= 0) {
    const scale = monthTotal / after;
    days = days.map((v) => v * scale);
  }
  return days;
}

function buildHourlyForDate(isoDay, profile, dayAbs, tuning) {
  const dt = new Date(isoDay);
  let jsDow = dt.getDay();
  // Holiday detection
  let isHoliday = false;
  try {
    const holidays = czechPublicHolidaysISO(dt.getFullYear());
    isHoliday = holidays.has(iso(dt));
  } catch (e) {
    /* ignore */
  }

  // If holiday and "same as Sunday" => force weekend template
  const sameAsSunday = !!(tuning && tuning.holidayLikeSunday);
  const useWeekend =
    sameAsSunday && isHoliday ? true : jsDow === 0 || jsDow === 6;

  const templ = useWeekend
    ? profile.hourly_template.weekend
    : profile.hourly_template.workday;
  const sum = templ.reduce((a, b) => a + b, 0) || 1;
  const baseHours = templ.map((x) => (x / sum) * (dayAbs || 0));

  // If holiday and baseload > 0 => apply floor and renormalize
  if (isHoliday && tuning && typeof tuning.holidayBaseload === "number") {
    const p = Math.max(-0.5, Math.min(0.5, tuning.holidayBaseload));
    if (p !== 0) {
      const avg = (dayAbs || 0) / 24;
      const delta = p * avg;
      for (let i = 0; i < 24; i++)
        baseHours[i] = Math.max(0, baseHours[i] + delta);
    }
  }

  return baseHours;
}

function buildYearHourlySeries(year, profile, annual) {
  if (!(annual && annual > 0))
    return { labels: [], values: [], markers: [] };
  const yearDaily = buildYearDailySeries(year, profile, annual);
  const values = [];
  const labels = [];
  const markers = [];
  const monthNames = [
    "Led",
    "Úno",
    "Bře",
    "Dub",
    "Kvě",
    "Čvn",
    "Čvc",
    "Srp",
    "Zář",
    "Říj",
    "Lis",
    "Pro",
  ];
  let idx = 0;
  for (let m1 = 1; m1 <= 12; m1++) {
    markers.push({ idx, label: monthNames[m1 - 1] });
    const nDays = daysInMonth(year, m1);
    for (let d = 1; d <= nDays; d++) {
      const isoStr = `${year}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayAbs = yearDaily[dayOfYear(new Date(year, m1 - 1, d))] || 0;
      const hours = buildHourlyForDate(isoStr, profile, dayAbs, readTuning());
      for (let h = 0; h < 24; h++) {
        values.push(hours[h] || 0);
        labels.push(
          `${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:00`,
        );
        idx++;
      }
    }
  }
  return { labels, values, markers };
}

async function generateCSV() {
  // vstupy
  const name =
    (document.getElementById("object_name")?.value || "").trim() || "profil";
  const year = Math.max(
    1900,
    Math.min(2500, Number(document.getElementById("yearIndex")?.value) || 2025),
  );
  const annual = Number(annualEl.value) || 0;

  if (!(annual > 0)) {
    alert("Pro export CSV nastav Roční spotřebu (> 0).");
    return;
  }

  // jistota, že máme parametry/profil
  ensureParams();
  if (!lastProfile) {
    lastProfile = buildProfileFromParams(lastParams, annual);
  }

  // vyrob hodinová data pro zvolený rok
  const { values } = buildYearHourlySeries(year, lastProfile, annual);

  // pokud bys chtěl přesný kalendářní postup po hodinách (včetně přestupných let / DST),
  // jedeme od 1.1. 00:00 a posouváme se po hodinách:
  let dt = new Date(year, 0, 1, 0, 0, 0, 0);

  const lines = [];
  lines.push(""); // 1. řádek prázdný
  lines.push(name); // 2. řádek název objektu
  // od 3. řádku už data bez hlavičky: date,time,cons

  for (let i = 0; i < values.length; i++) {
    const yyyy = dt.getFullYear();
    const mm = pad2(dt.getMonth() + 1);
    const dd = pad2(dt.getDate());
    const hh = pad2(dt.getHours());
    const mi = pad2(dt.getMinutes()); // bude "00" pro každou hodinu

    // čísla s tečkou – JS default je ".", takže stačí toFixed nebo String
    const cons = values[i];
    // zvolíme rozumnou přesnost; uprav dle potřeby
    const consStr = Number(cons).toFixed(6);

    lines.push(`${yyyy}-${mm}-${dd},${hh}:${mi},${consStr}`);

    // +1 hodina
    dt.setHours(dt.getHours() + 1);
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugFileName(name)}_${year}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/* AI fetch & build */
window.__aiBindingsDone = true;

document.getElementById("btnParams").addEventListener("click", async () => {
  try {
    if (window.writeOutParams) {
      window.writeOutParams({ status: "Načítám…" }, { force: true });
    } else {
      outParams.textContent = "Načítám…";
    }
    outParams.textContent = "Načítám…";
    const payload = {
      model: "gpt-4o-mini",
      medium: mediumEl.value,
      object_type: objectEl.value,
      units: unitsFor(mediumEl.value),
      user_prompt_text: promptEl.value,
    };

    // Vynucený výpis pro jistotu vždy:
    if (window.writeOutParams) {
      window.writeOutParams(lastParams || getUIParams(), null, 2, { force: true });
    }
    await fetchAIParams(payload);
    lastParams = window.lastParams; // fetchAIParams to nastavil a zapsal i do UI
  } catch (e) {
    const msg = "Chyba: " + (e?.message || e);
    if (window.writeOutParams) {
      window.writeOutParams({ error: msg }, { force: true });
    }
    outParams.textContent = msg;
  }
});

document.getElementById("btnBuild").addEventListener("click", async () => {
  try {
    if (!lastParams) {
      const payload = {
        model: "gpt-4o-mini",
        medium: mediumEl.value,
        object_type: objectEl.value,
        units: unitsFor(mediumEl.value),
        user_prompt_text: promptEl.value,
      };
      lastParams = await fetchAIParams(payload);
      if (window.writeOutParams) {
        window.writeOutParams(lastParams, null, 2, { force: true });
      } else {
        outParams.textContent = JSON.stringify(lastParams, null, 2);
      }
    }
    rebuildAndRender();
  } catch (e) {
    outProfile.textContent = "Chyba: " + (e?.message || e);
  }
});

document.getElementById("btnParamsMock").addEventListener("click", async () => {
  try {
    if (window.writeOutParams) {
      window.writeOutParams({ status: "Načítám…" }, null, 2, {
        force: true,
      });
    }
    const payload = {
      model: "gpt-4o-mini",
      medium: mediumEl.value,
      object_type: objectEl.value,
      units: unitsFor(mediumEl.value),
      user_prompt_text: "ping", // aktivuje mock fast-path na serveru
    };
    const res = await fetch("http://localhost:3000/ai/profiles/params?mock=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const params = await res.json();
    lastParams = params;
    if (window.writeOutParams) {
      window.writeOutParams(lastParams || getUIParams(), null, 2, { force: true });
    }
  } catch (e) {
    if (window.writeOutParams) {
      window.writeOutParams({ error: String(e?.message || e) }, null, 2, {
        force: true,
      });
    }
  }
});
/* konec guardu __aiBindingsDone */

/* Bezpečný default parametrů, když AI ještě neproběhla */
function ensureParams() {
  if (!lastParams) {
    lastParams = {
      meta: {},
      season_params: {
        winter_bias: 0.15,
        summer_uplift: 0,
        vacation_dip: 0.6,
        xmas_spike: 0,
      },
      dow_params: {
        weekend_floor: 0.05,
        day_drops: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 },
      },
      hour_params: {
        baseload: 0.3,
        open_hours: [8, 18],
        peaks: [
          { t: 7, amp: 0.18 },
          { t: 13, amp: 0.12 },
        ],
        dips: [],
        night_setback: 0.3,
        ramp_up_rate: 0.08,
        ramp_down_rate: 0.06,
        weekend_variation: -0.2,
      },
      events: { holidays_drop: 0.3, vacation_drop: 0.6 },
      constraints: { max_hourly_slope: 0.15, min_weekend_share: 0.03 },
      notes: "",
    };
  }
}

/* UI → params */
function getUIParams() {
  ensureParams();
  const hp = lastParams.hour_params;
  const dp = lastParams.dow_params;
  const sp = lastParams.season_params;
  const ev = lastParams.events;

  hp.baseload = clamp(getNum("p_baseload", 0.3), 0, 0.8);
  hp.night_setback = clamp(getNum("p_night_setback", 0.3), 0, 1);
  hp.weekend_variation = clamp(getNum("p_weekend_var", -0.2), -1, 1);

  const nPeaks = Math.max(0, Math.min(6, getInt("p_peaks_count", 0)));
  hp.peaks = [];
  for (let i = 0; i < nPeaks; i++) {
    const tStr = getVal(`p_peak_time_${i}`, "07:00");
    const [hh, mm] = tStr.split(":").map((x) => parseInt(x || "0", 10));
    const t =
      (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm / 60 : 0);
    const amp = clamp(getNum(`p_peak_amp_${i}`, 0.1), 0, 1);
    hp.peaks.push({ t: clamp(t, 0, 23.9833), amp });
  }
  const nDips = Math.max(0, Math.min(6, getInt("p_dips_count", 0)));
  hp.dips = [];
  for (let i = 0; i < nDips; i++) {
    const tStr = getVal(`p_dip_time_${i}`, "12:00");
    const [hh, mm] = tStr.split(":").map((x) => parseInt(x || "0", 10));
    const t =
      (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm / 60 : 0);
    const amp = clamp(getNum(`p_dip_amp_${i}`, 0.1), 0, 1);
    hp.dips.push({ t: clamp(t, 0, 23.9833), amp });
  }

  if (lastParams?.dow_params) {
    const dpLocal = lastParams.dow_params;
    if (getEl("p_weekend_floor")) {
      dpLocal.weekend_floor = clamp(
        getNum("p_weekend_floor", dpLocal.weekend_floor ?? -0.5),
        -1,
        1,
      );
      if (T.weekend_floor?.val)
        T.weekend_floor.val.textContent = `${Math.round(dpLocal.weekend_floor * 100)}%`;
    }

    if (
      getEl("p_drop_mon") ||
      getEl("p_drop_tue") ||
      getEl("p_drop_wed") ||
      getEl("p_drop_thu") ||
      getEl("p_drop_fri") ||
      getEl("p_drop_sat") ||
      getEl("p_drop_sun")
    ) {
      dpLocal.day_drops = {
        Mon: clamp(getNum("p_drop_mon", dpLocal.day_drops?.Mon ?? 0), 0, 0.95),
        Tue: clamp(getNum("p_drop_tue", dpLocal.day_drops?.Tue ?? 0), 0, 0.95),
        Wed: clamp(getNum("p_drop_wed", dpLocal.day_drops?.Wed ?? 0), 0, 0.95),
        Thu: clamp(getNum("p_drop_thu", dpLocal.day_drops?.Thu ?? 0), 0, 0.95),
        Fri: clamp(getNum("p_drop_fri", dpLocal.day_drops?.Fri ?? 0), 0, 0.95),
        Sat: clamp(getNum("p_drop_sat", dpLocal.day_drops?.Sat ?? 0), 0, 0.95),
        Sun: clamp(getNum("p_drop_sun", dpLocal.day_drops?.Sun ?? 0), 0, 0.95),
      };

      const pct = (x) => `${Math.round(Number(x) * 100)}%`;
      if (T.mon_drop?.val) setValDisplay(T.mon_drop, pct);
      if (T.tue_drop?.val) setValDisplay(T.tue_drop, pct);
      if (T.wed_drop?.val) setValDisplay(T.wed_drop, pct);
      if (T.thu_drop?.val) setValDisplay(T.thu_drop, pct);
      if (T.fri_drop?.val) setValDisplay(T.fri_drop, pct);
      if (T.sat_drop?.val) setValDisplay(T.sat_drop, pct);
      if (T.sun_drop?.val) setValDisplay(T.sun_drop, pct);
    }
  }

  sp.vacation_dip = clamp(
    getNum("p_vacation_dip", sp.vacation_dip ?? 0.6),
    0,
    1,
  );
  ev.vacation_drop = sp.vacation_dip;
  ev.holidays_drop = clamp(
    getNum("p_holidays_drop", ev.holidays_drop ?? 0.3),
    0,
    1,
  );

  if (T.baseload?.val) setValDisplay(T.baseload);
  if (T.night_setback?.val) setValDisplay(T.night_setback);
  if (T.weekend_var?.val) setValDisplay(T.weekend_var);
  if (T.vacation_dip?.val) setValDisplay(T.vacation_dip);
  if (T.holidays_drop?.val) setValDisplay(T.holidays_drop);

  return lastParams;
}

function rebuildAndRender(source) {
  // expose for inline handlers
  window.rebuildAndRender = rebuildAndRender;
  // Sync module-local lastParams from window pokud ještě není nastaven (volání z fetchAIParams)
  if (!lastParams && window.lastParams && typeof window.lastParams === 'object') {
    lastParams = window.lastParams;
  }
  // Vždy prochází getUIParams – aktualizuje display hodnot sliderů a aplikuje UI overrides
  const useParams = getUIParams();
  const annual = Number(annualEl.value) || null;

  lastProfile = buildProfileFromParams(useParams, annual);
  // Only update outParams if building from UI (no AI params) and no explicit caller
  if (!lastParams && !source) {
    if (window.writeOutParams) {
      window.writeOutParams(useParams, null, 2, { force: true });
    } else {
      outParams.textContent = JSON.stringify(useParams, null, 2);
    }
  }
  // Always update profile output
  outProfile.textContent = JSON.stringify(lastProfile, null, 2);
  try { outProfile.style.outline = '2px solid #22c55e'; setTimeout(()=>{ outProfile.style.outline=''; }, 800);} catch(_) {}


  if (annual && annual > 0) {
    (function () {
      let _arr = [];
      let ok = true;
      for (let i = 1; i <= 12; i++) {
        const el = document.getElementById("mval_" + i);
        if (!el) {
          ok = false;
          break;
        }
        const v = Number(el.value);
        if (!isFinite(v)) {
          ok = false;
          break;
        }
        _arr.push(Math.max(0, v));
      }
      if (ok) {
        const s = _arr.reduce((a, b) => a + b, 0);
        if (s > 0) {
          renderMonthlyChart(_arr);
          return;
        }
      }
      renderMonthlyChart(getEffectiveMonthlyAbsolute(annual));
    })();
  } else {
    renderMonthlyChart(Array(12).fill(0));
  }
  if (!(annual && annual > 0)) return;

  const base = new Date(
    document.getElementById("weekDate").value || "2025-01-06",
  );

  const wdays = isoWeekRange(base);
  // cache daily arrays per year (week may span years)
  const yearsInWeek = Array.from(new Set(wdays.map((d) => d.getFullYear())));
  const yearDailyCache = {};
  for (const y of yearsInWeek) {
    yearDailyCache[y] = buildYearDailySeries(
      y,
      lastProfile,
      annual,
      readTuning(),
    );
  }
  // compute daily sums; for holidays, sum hours with holiday baseload (no renorm)
  const dailyAbs = wdays.map((dt) => {
    const y = dt.getFullYear();
    const idx = dayOfYear(dt);
    const baseDay = yearDailyCache[y][idx] || 0;
    const isHol = czechPublicHolidaysISO(y).has(iso(dt));
    if (!isHol) return baseDay;
    const hours = buildHourlyForDate(
      iso(dt),
      lastProfile,
      baseDay,
      readTuning(),
    );
    return hours.reduce((a, b) => a + b, 0);
  });
  // store dates for tooltip

  const weekLabels = wdays.map((d) => {
    const dn = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"][(d.getDay() + 6) % 7];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dn} ${dd}.${mm}.`;
  });
  window._wdays = wdays;
  renderWeekChart(dailyAbs, weekLabels);

  const { year, week } = dateToISOWeek(base);
  const span = `rok ${year}, týden č. ${String(week)} (${wdays[0].toLocaleDateString("cs-CZ")} – ${wdays[6].toLocaleDateString("cs-CZ")})`;
  const weekLabelEl = document.getElementById("weekLabel");
  if (weekLabelEl) weekLabelEl.textContent = span;

  const mInput = document.getElementById("monthIndex");
  if (mInput) {
    const m1 = Math.max(1, Math.min(12, Number(mInput.value) || 1));
    const y = 2025; // lze nahradit hodnotou z UI, pokud ji máš
    const yearDaily = buildYearDailySeries(
      y,
      lastProfile,
      annual,
      readTuning(),
    );
    const daysIn = daysInMonth(y, m1);
    const arr = [];
    for (let d = 1; d <= daysIn; d++) {
      arr.push(yearDaily[dayOfYear(new Date(y, m1 - 1, d))] || 0);
    }
    renderMonthDaysChart(arr);
  }

  const dayInput = document.getElementById("dayDate");
  if (dayInput) {
    const iso = dayInput.value || "2025-01-15";
    const dt = new Date(iso);
    const y = dt.getFullYear();
    const yearDaily = buildYearDailySeries(
      y,
      lastProfile,
      annual,
      readTuning(),
    );
    const dayAbs = yearDaily[dayOfYear(dt)] || 0;
    const hours = buildHourlyForDate(iso, lastProfile, dayAbs, readTuning());
    renderDayHoursChart(hours);
  }

  const yInput = document.getElementById("yearIndex");
  if (yInput) {
    const y = Math.max(2000, Math.min(2100, Number(yInput.value) || 2025));
    const yearDaily = buildYearDailySeries(
      y,
      lastProfile,
      annual,
      readTuning(),
    );
    const labels = [],
      values = [];
    for (let m = 0; m < 12; m++) {
      const days = daysInMonth(y, m + 1);
      for (let d = 1; d <= days; d++) {
        const isoStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayAbs = yearDaily[dayOfYear(new Date(y, m, d))] || 0;
        const hours = buildHourlyForDate(
          isoStr,
          lastProfile,
          dayAbs,
          readTuning(),
        );
        for (let h = 0; h < 24; h++) {
          values.push(hours[h] || 0);
          labels.push(
            `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:00`,
          );
        }
      }
    }
    const markers = (() => {
      let idx = 0,
        arr = [];
      for (let m = 0; m < 12; m++) {
        arr.push({
          idx,
          label: [
            "Led",
            "Úno",
            "Bře",
            "Dub",
            "Kvě",
            "Čvn",
            "Čvc",
            "Srp",
            "Zář",
            "Říj",
            "Lis",
            "Pro",
          ][m],
        });
        idx += daysInMonth(y, m + 1) * 24;
      }
      return arr;
    })();
    renderYearHoursChart(values, labels, markers);
    refreshHeadings();
  }
}

/* Debounce */
const debounce = (fn, ms) => {
  let t = null;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const debRebuildLock = debounce(() => {
  updateYLock = true;
  rebuildAndRender();
}, 80);
const debRebuildNoLock = debounce(() => {
  updateYLock = false;
  rebuildAndRender();
}, 80);

/* Live posluchače */
Object.values(T).forEach((ctrl) => {
  if (!ctrl || !ctrl.el) return;
  ctrl.el.addEventListener("input", debRebuildLock);
  if (ctrl.el.tagName === "INPUT" && ctrl.el.type === "number") {
    ctrl.el.addEventListener("change", debRebuildLock);
  }
});
annualEl.addEventListener(
  "input",
  debounce(() => {
    updateYLock = true;
    rebuildAndRender();
  }, 300),
);
annualEl.addEventListener("change", () => {
  updateYLock = true;
  rebuildAndRender();
});
mediumEl.addEventListener("change", () => {
  refreshUnits();
  refreshHeadings();
  updateYLock = true;
  rebuildAndRender();
});

["weekDate", "monthIndex", "dayDate", "yearIndex"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    refreshHeadings();
    debRebuildNoLock();
  });
  el.addEventListener("change", () => {
    refreshHeadings();
    debRebuildNoLock();
  });
});

/* První vykreslení */
renderPeakDipEditors();

function slugFileName(s) {
  return (
    String(s || "profil")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // pryč diakritika
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "profil"
  );
}

document.getElementById("btnCSV")?.addEventListener("click", () => {
  // Před exportem si ještě jednou přepočteme profil, aby CSV odpovídalo aktuálnímu UI
  try {
    updateYLock = false; // při exportu nechceme rozvlnit osy, jen data
    rebuildAndRender();
  } catch {
    /* ignore */
  }
  generateCSV();
});
