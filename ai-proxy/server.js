// ai-proxy/server.js  –  v3
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Shared prompt fragments ───────────────────────────────────────────────────
const PROFILE_RULES = `\
RULES — read carefully:
• monthly  — 12 non-negative numbers that MUST SUM TO EXACTLY 1.0.
             Each is the fraction of annual consumption in that calendar month.
• dow      — 7 non-negative numbers that MUST SUM TO EXACTLY 1.0.
             Each is the fraction of weekly consumption on that day.
• hourly   — 24 non-negative numbers where the MAXIMUM value = 1.0.
             Represents the shape of a typical workday (peak hour = 1.0).`;

const EXAMPLES = `\
REALISTIC EXAMPLES (use as reference, not copy-paste):

Elementary school — electricity:
  monthly: [0.11,0.10,0.10,0.09,0.08,0.04,0.01,0.01,0.07,0.10,0.11,0.08]
  dow: {"Mon":0.19,"Tue":0.19,"Wed":0.19,"Thu":0.19,"Fri":0.17,"Sat":0.04,"Sun":0.03}
  hourly: [0.05,0.05,0.05,0.05,0.05,0.05,0.07,0.25,0.75,0.95,1.00,0.90,0.85,0.85,0.80,0.60,0.25,0.10,0.08,0.07,0.06,0.06,0.05,0.05]

Office building — electricity:
  monthly: [0.09,0.09,0.09,0.08,0.08,0.08,0.07,0.07,0.08,0.09,0.09,0.09]
  dow: {"Mon":0.19,"Tue":0.19,"Wed":0.19,"Thu":0.19,"Fri":0.17,"Sat":0.04,"Sun":0.03}
  hourly: [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.15,0.65,0.90,0.95,0.90,0.80,0.85,0.90,0.85,0.65,0.35,0.12,0.08,0.07,0.06,0.05,0.05]

Residential building — district heating:
  monthly: [0.16,0.14,0.12,0.07,0.04,0.02,0.01,0.01,0.04,0.09,0.13,0.17]
  dow: {"Mon":0.14,"Tue":0.14,"Wed":0.14,"Thu":0.14,"Fri":0.14,"Sat":0.15,"Sun":0.15}
  hourly: [0.20,0.15,0.12,0.10,0.10,0.12,0.30,0.70,0.80,0.75,0.65,0.60,0.55,0.55,0.60,0.65,0.70,0.85,1.00,0.90,0.75,0.55,0.40,0.28]

Shopping center — electricity:
  monthly: [0.09,0.08,0.08,0.08,0.08,0.08,0.09,0.09,0.08,0.08,0.09,0.10]
  dow: {"Mon":0.12,"Tue":0.12,"Wed":0.12,"Thu":0.12,"Fri":0.14,"Sat":0.19,"Sun":0.19}
  hourly: [0.15,0.12,0.10,0.10,0.10,0.10,0.15,0.40,0.75,0.90,1.00,1.00,0.98,0.95,0.98,1.00,0.95,0.85,0.70,0.50,0.40,0.30,0.22,0.18]

Industrial facility (1 shift) — electricity:
  monthly: [0.09,0.09,0.09,0.08,0.08,0.08,0.07,0.07,0.08,0.09,0.09,0.09]
  dow: {"Mon":0.20,"Tue":0.20,"Wed":0.20,"Thu":0.20,"Fri":0.18,"Sat":0.01,"Sun":0.01}
  hourly: [0.05,0.05,0.05,0.05,0.05,0.05,0.30,0.85,1.00,1.00,1.00,1.00,0.90,0.95,1.00,1.00,0.80,0.30,0.10,0.07,0.06,0.06,0.05,0.05]`;

// ─── System prompts ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `\
You are an energy consumption analyst for Czech Republic buildings.
Analyze the building description and return a realistic annual consumption profile as JSON.

Return ONLY this exact JSON structure — no markdown, no comments, no extra keys:
{
  "meta": {
    "object_type": "brief label",
    "medium": "electricity|gas|heat|water",
    "notes": "2–3 key assumptions that shaped the profile"
  },
  "monthly": [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec],
  "dow": {"Mon": x, "Tue": x, "Wed": x, "Thu": x, "Fri": x, "Sat": x, "Sun": x},
  "hourly": [h0, h1, h2, ..., h23]
}

${PROFILE_RULES}

${EXAMPLES}`;

const CHAT_SYSTEM_PROMPT = `\
You are an energy consumption analyst for Czech Republic buildings.
Guide the user through a structured questionnaire, then generate a consumption profile.

════ DOTAZNÍK — projdi v pořadí, vždy jen 1 otázka ════

Q1. TYP OBJEKTU
    Co je to za objekt nebo provoz?
    Příklady: základní škola s jídelnou, administrativní budova, výrobní hala (kolik směn?),
    supermarket, bytový dům, nemocnice, restaurace, sportovní hala, čistírna odpadních vod…

Q2. PROVOZNÍ DOBA — PRACOVNÍ DNY
    V jakou dobu je objekt v provozu v pracovní dny?
    Příklady: 7:00–16:00, 8:00–18:00, nepřetržitě 24/7, dvousměnný 6–22h, jen přes noc…

Q3. VÍKENDOVÝ A SVÁTEČNÍ PROVOZ
    Jak vypadá sobota a neděle? A státní svátky?
    Možnosti: stejný jako pracovní den / redukovaný (přibližně kolik %?) / zavřeno

Q4. SEZÓNNÍ VZOREC
    Jak se spotřeba mění v průběhu roku?
    Příklady: výrazně vyšší v zimě (vytápění), vyšší v létě (chlazení/klimatizace),
    prázdniny výrazně sníží provoz, rovnoměrná celoroční spotřeba…

Q5. PLOCHA A UŽIVATELÉ
    Jaká je přibližná podlahová plocha objektu a kolik uživatelů ho typicky využívá?
    Příklady: 2 000 m² / 150 žáků, 500 m² / 20 zaměstnanců, 8 000 m² / 300 obyvatel,
    10 000 m² / 500 zákazníků denně…
    Pokud nevíte přesně → odhad nebo rozsah stačí.

Q6. KLÍČOVÉ SPOTŘEBIČE A TECHNOLOGIE
    Jsou v objektu spotřebiče nebo technologie s výrazně vyšší spotřebou?
    Příklady: bazén, klimatizace/chlazení, server room, komerční kuchyně, výtahy,
    kompresory, svařovací nebo obráběcí stroje, tepelné čerpadlo, nabíjení elektrovozidel…
    Pokud nic neobvyklého → "standardní vybavení" stačí.

════ PRAVIDLA ════

• Klást vždy jen 1 otázku. Postupovat Q1→Q6.
• Otázku přeskočit, pokud uživatel téma již zodpověděl v jakékoliv předchozí zprávě.
• Po zodpovězení Q6 okamžitě generovat profil — žádné další otázky.
• Médium a roční spotřeba jsou zadané v UI — neptej se na ně.

════ EXTRAKCE ════

Z každé uživatelovy zprávy extrahuj tato data (pokud jsou zmíněna):

• "annual"   — číslo (roční spotřeba bez jednotky), null pokud nezmíněno
• "unit"     — "MWh" | "kWh" | "GJ" | "m3" | null
• "vacations" — pole objektů (prázdné pole [] pokud žádné nezmíněny):
  [{
    "from": "YYYY-MM-DD",   ← datum začátku (použij rok z kontextu)
    "to":   "YYYY-MM-DD",   ← datum konce
    "factor": 0.0–1.0,      ← faktor zátěže (0=úplná odstávka, 0.05=téměř prázdno, 0.15=min. provoz, 1=normál)
    "label": "popis"
  }]

  Typické faktory:
    prázdniny ZŠ/SŠ (léto)   → 0.05
    prázdniny ZŠ/SŠ (jaro/vánoce/podzim) → 0.15
    kancelářská dovolená      → 0.15
    průmyslová odstávka       → 0.0–0.05
    víkendový útlum (není třeba, pokud ho zachycuje dow profil)

  Přidávej jen pokud uživatel zmínil KONKRÉTNÍ OBDOBÍ (alespoň měsíc nebo datové rozmezí).
  Pokud zmiňuje jen "máme prázdniny" bez dat → nepřidávat.

════ FORMÁT ODPOVĚDI — vždy validní JSON ════

Otázka:
{
  "type": "question",
  "text": "Stručná otázka v češtině",
  "extracted": { "annual": null, "unit": null, "vacations": [] }
}

Profil (po Q4):
{
  "type": "profile",
  "meta": { "object_type": "...", "medium": "...", "notes": "..." },
  "monthly": [...12 čísel...],
  "dow": { "Mon":..., "Tue":..., "Wed":..., "Thu":..., "Fri":..., "Sat":..., "Sun":... },
  "hourly": [...24 čísel...],
  "extracted": { "annual": null, "unit": null, "vacations": [] }
}

Pole "extracted" je VŽDY přítomno (i jako prázdný objekt {}).

${PROFILE_RULES}

${EXAMPLES}`;

// ─── Normalization ────────────────────────────────────────────────────────────
function normSum(arr) {
  const s = arr.reduce((a, b) => a + b, 0);
  return s > 0 ? arr.map(v => v / s) : arr.map(() => 1 / arr.length);
}

function normMax(arr) {
  const m = Math.max(...arr, 0.001);
  return arr.map(v => v / m);
}

function validate(raw) {
  if (!Array.isArray(raw.monthly) || raw.monthly.length !== 12)
    throw new Error('monthly must be array[12]');
  if (!raw.dow || typeof raw.dow !== 'object')
    throw new Error('dow must be object with Mon–Sun keys');
  if (!Array.isArray(raw.hourly) || raw.hourly.length !== 24)
    throw new Error('hourly must be array[24]');

  raw.monthly = normSum(raw.monthly.map(v => Math.max(0, Number(v) || 0)));

  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dowVals = normSum(days.map(d => Math.max(0, Number(raw.dow[d]) || 0)));
  raw.dow = Object.fromEntries(days.map((d, i) => [d, dowVals[i]]));

  raw.hourly = normMax(raw.hourly.map(v => Math.max(0, Number(v) || 0)));

  return raw;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { description, annual, medium } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'description required' });

    const userMsg = [
      `Building: ${description.trim()}`,
      medium ? `Energy medium: ${medium}` : '',
      annual ? `Annual consumption: approximately ${annual}` : '',
    ].filter(Boolean).join('\n');

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMsg },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    const profile = validate(raw);
    res.json(profile);
  } catch (e) {
    console.error('[/api/generate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { history, medium, annual, year } = req.body;
    if (!Array.isArray(history) || !history.length)
      return res.status(400).json({ error: 'history required' });

    // Append context to last user message
    const messages = history.map(m => ({ ...m }));
    if (messages.at(-1).role === 'user') {
      const ctx = [
        medium ? `(Médium: ${medium})` : '',
        annual ? `(Roční spotřeba: ~${annual})` : '',
        year   ? `(Rok profilu: ${year})`       : '',
      ].filter(Boolean).join(' ');
      if (ctx) messages.at(-1).content += '\n' + ctx;
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...messages,
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    const extracted = raw.extracted || {};

    if (raw.type === 'question') {
      return res.json({ type: 'question', text: raw.text || raw.question || '', extracted });
    }

    // Profile response
    const profileData = { ...raw };
    delete profileData.type;
    delete profileData.extracted;
    const profile = validate(profileData);
    res.json({ type: 'profile', ...profile, extracted });
  } catch (e) {
    console.error('[/api/chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('AI proxy on http://localhost:3000'));
