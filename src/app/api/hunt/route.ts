// src/app/api/hunt/route.ts
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ContactDetails {
  email: string | null;
  twitter: string | null;
  linkedin: string | null;
  portfolio: string | null;
}

interface CommitDay { date: string; count: number; }
interface LanguageBar { name: string; percentage: number; bytes: number; }
interface ScoreBreakdown {
  relevance: number; activityRecency: number;
  codeQuality: number; profileSignal: number;
  locationMatch?: number;
  semanticMatch?: number;
}

interface RepoSummary {
  name: string; description: string | null;
  stars: number; language: string | null; topics: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY INTENT DETECTION
// Three modes:
//  "technical" — has a role keyword we can map to languages (kernel, rust, ml…)
//  "person"    — looking for a specific person/founder/company (no lang constraints)
//  "open"      — generic skill/domain search, use AI for queries with light constraints
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_CONSTRAINTS: Record<string, { must: string[]; negative: string[] }> = {
  kernel:            { must: ['C','C++','Assembly','Rust'],                   negative: ['JavaScript','TypeScript','Python','Java','PHP','Ruby','Go','Swift','Kotlin','Dart','HTML','CSS'] },
  firmware:          { must: ['C','C++','Assembly','Rust','Zig'],             negative: ['JavaScript','TypeScript','Python','Java','PHP','Ruby','Go','Swift','Kotlin','HTML','CSS'] },
  embedded:          { must: ['C','C++','Assembly','Rust','Zig'],             negative: ['JavaScript','TypeScript','Java','PHP','Ruby','Go','Swift','Kotlin','Dart','HTML','CSS'] },
  systems:           { must: ['C','C++','Rust','Assembly','Zig'],             negative: ['JavaScript','TypeScript','PHP','Ruby','Dart','HTML','CSS'] },
  'low-level':       { must: ['C','C++','Assembly','Rust','Zig'],             negative: ['JavaScript','TypeScript','Python','PHP','Ruby','Dart','HTML','CSS'] },
  rust:              { must: ['Rust'],                                         negative: ['JavaScript','TypeScript','PHP','Ruby','Dart'] },
  golang:            { must: ['Go'],                                           negative: ['PHP','Ruby','Dart','Assembly'] },
  backend:           { must: ['Go','Rust','Python','Java','C++','C#','Ruby'], negative: ['HTML','CSS'] },
  frontend:          { must: ['TypeScript','JavaScript','HTML','CSS'],        negative: ['C','C++','Assembly','Zig'] },
  fullstack:         { must: ['TypeScript','JavaScript','Python','Go','Ruby'],negative: ['Assembly','Zig','Fortran'] },
  'full stack':      { must: ['TypeScript','JavaScript','Python','Go','Ruby'],negative: ['Assembly','Zig','Fortran'] },
  'machine learning':{ must: ['Python','Julia','C++'],                        negative: ['PHP','Ruby','Dart','Assembly'] },
  ml:                { must: ['Python','Julia','C++'],                        negative: ['PHP','Ruby','Dart','Assembly'] },
  ai:                { must: ['Python','Julia','C++'],                        negative: ['PHP','Ruby','Dart','Assembly'] },
  'data engineer':   { must: ['Python','Scala','SQL','Go'],                   negative: ['Assembly','Zig','Fortran'] },
  'data scientist':  { must: ['Python','R','Julia'],                          negative: ['Assembly','Zig','Fortran'] },
  data:              { must: ['Python','R','Scala','Julia'],                  negative: ['Assembly','Zig','Fortran'] },
  devops:            { must: ['Go','Python','Shell','HCL'],                   negative: ['Assembly'] },
  sre:               { must: ['Go','Python','Shell','Rust'],                  negative: ['Assembly','PHP'] },
  platform:          { must: ['Go','Python','Shell','Rust'],                  negative: ['Assembly','PHP'] },
  security:          { must: ['Python','C','C++','Rust','Go'],               negative: ['HTML','CSS','PHP','Ruby'] },
  'qa':              { must: ['Python','Java','TypeScript','JavaScript'],     negative: ['Assembly','Zig','Fortran','C','C++'] },
  'quality assurance':{ must: ['Python','Java','TypeScript','JavaScript'],   negative: ['Assembly','Zig','Fortran'] },
  testing:           { must: ['Python','Java','TypeScript','JavaScript'],     negative: ['Assembly','Zig','Fortran'] },
  mobile:            { must: ['Swift','Kotlin','Dart'],                       negative: ['Assembly'] },
  android:           { must: ['Kotlin','Java'],                               negative: ['Swift','Assembly'] },
  ios:               { must: ['Swift','Objective-C'],                         negative: ['Kotlin','Assembly'] },
  blockchain:        { must: ['Solidity','Rust','TypeScript'],               negative: ['Assembly','Fortran'] },
  web3:              { must: ['Solidity','Rust','TypeScript'],               negative: ['Assembly','Fortran'] },
  game:              { must: ['C++','C#','Lua','Rust'],                       negative: ['PHP','Ruby','Dart'] },
  graphics:          { must: ['C++','Rust','GLSL','HLSL'],                   negative: ['PHP','Ruby','Dart'] },
};

// Person-search triggers: these mean "find this human", not "find devs with skill"
const PERSON_TRIGGERS = ['founder','cto','ceo','creator','author','maintainer','lead','head of','director','built','made','who made','who created','who is','person'];

// Company/employer signal words — detects "worked at Nasdaq", "working at Vercel", "ex-Google"
const COMPANY_TRIGGERS = [
  'worked at','works at','working at','currently at','currently working at',
  'ex-','former','from company','at company','employed at','employed by',
  'previously at','previously worked','joined at','from the team at',
  'who work at','who works at',
];

// Implied company — catches "Vercel developers", "Google engineers in Delhi"
// Pattern: ProperNoun + [role word], at start or after preposition
const ROLE_NOUNS = ['developer','developers','engineer','engineers','dev','devs','programmer','coder','analyst','employee','team'];
function extractImpliedCompany(query: string): string | null {
  for (const role of ROLE_NOUNS) {
    // Match: "Vercel developers", "Google engineers", "Stripe backend devs"
    const re = new RegExp(`\\b([A-Z][a-zA-Z0-9]{2,20})\\s+(?:[a-z]+\\s+)?${role}\\b`, 'g');
    const m = re.exec(query);
    if (m) return m[1];
  }
  return null;
}

// Extract company name from query — "QA analyst who worked at Nasdaq" → "Nasdaq"
function extractCompany(query: string): string | null {
  const lower = query.toLowerCase();
  for (const trigger of COMPANY_TRIGGERS) {
    const idx = lower.indexOf(trigger);
    if (idx !== -1) {
      const after = query.slice(idx + trigger.length).trim();
      // grab next 1-3 words as company name
      const match = after.match(/^([A-Za-z0-9][\w&.\- ]{1,40}?)(?=\s*(?:,|\.|and|or|who|that|$))/i);
      if (match) return match[1].trim();
    }
  }
  // Also match patterns like "ex-Google", "ex-Nasdaq"
  const exMatch = query.match(/\bex[-–]([A-Z][\w&]+)/i);
  if (exMatch) return exMatch[1];
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC LOCATION EXTRACTOR
// Extracts city/country from query BEFORE the LLM sees it, so the LLM can't
// misidentify the location. Handles "in Delhi", "from Mumbai", "delhi based" etc.
// ─────────────────────────────────────────────────────────────────────────────

// Known cities and their common alternate spellings / nearby regions
const LOCATION_ALIASES: Record<string, string[]> = {
  delhi:     ['delhi', 'new delhi', 'ncr', 'noida', 'gurgaon', 'gurugram', 'faridabad'],
  bangalore: ['bangalore', 'bengaluru', 'blr', 'karnataka'],
  mumbai:    ['mumbai', 'bombay', 'pune', 'maharashtra'],
  hyderabad: ['hyderabad', 'hyd', 'telangana', 'secunderabad'],
  chennai:   ['chennai', 'madras', 'tamil nadu'],
  kolkata:   ['kolkata', 'calcutta', 'west bengal'],
  berlin:    ['berlin', 'germany', 'munich', 'hamburg', 'frankfurt'],
  london:    ['london', 'uk', 'england', 'manchester', 'birmingham'],
  'new york':['new york', 'nyc', 'ny', 'brooklyn', 'manhattan'],
  'san francisco':['san francisco', 'sf', 'bay area', 'silicon valley', 'san jose', 'palo alto'],
  seattle:   ['seattle', 'wa', 'washington state'],
  toronto:   ['toronto', 'canada', 'ontario', 'vancouver'],
  singapore: ['singapore', 'sg'],
  tokyo:     ['tokyo', 'japan', 'osaka'],
  paris:     ['paris', 'france'],
  amsterdam: ['amsterdam', 'netherlands', 'holland'],
  stockholm: ['stockholm', 'sweden'],
  zurich:    ['zurich', 'switzerland'],
  dubai:     ['dubai', 'uae', 'abu dhabi'],
  austin:    ['austin', 'texas', 'tx'],
  boston:    ['boston', 'massachusetts', 'ma'],
  chicago:   ['chicago', 'illinois'],
};

function extractLocation(query: string): { canonical: string; variants: string[]; isKnown: boolean } | null {
  const lower = query.toLowerCase();

  // 1. Check known city aliases first (fast path with pre-built variants)
  for (const [canonical, aliases] of Object.entries(LOCATION_ALIASES)) {
    for (const alias of aliases) {
      const pattern = new RegExp('\\b' + alias.replace(/\s+/g, '\\s+') + '\\b', 'i');
      if (pattern.test(lower)) {
        return { canonical, variants: aliases, isKnown: true };
      }
    }
  }

  // 2. Universal fallback — extract ANY location from natural language patterns.
  // Covers: "in mangalore", "from nairobi", "based in kochi", "lagos developers"
  // Strategy: try multiple patterns in order of specificity.

  // Pattern A: explicit preposition — "in X", "from X", "at X", "based in X"
  const prepMatch = lower.match(/\b(?:in|from|at|based in|located in|near)\s+([a-z][a-z\s]{1,25}?)(?=\s*(?:who|with|and|or|that|,|$))/i);
  if (prepMatch) {
    const loc = prepMatch[1].trim().replace(/\s+$/, '');
    if (loc.length >= 3 && !['the','a','an','some','any','all'].includes(loc)) {
      // Capitalize properly for GitHub (GitHub location search is case-insensitive but looks cleaner)
      const canonical = loc.replace(/\b\w/g, c => c.toUpperCase());
      return {
        canonical,
        // Generate variants: exact, with surrounding state/country context left to AI
        variants: [loc, canonical],
        isKnown: false,
      };
    }
  }

  // Pattern B: "X developers", "X based", "X engineers" — location before role word
  const prefixMatch = lower.match(/^([a-z][a-z\s]{1,20}?)\s+(?:developer|engineer|dev|programmer|coder|designer)/i);
  if (prefixMatch) {
    const loc = prefixMatch[1].trim();
    if (loc.length >= 3) {
      const canonical = loc.replace(/\b\w/g, c => c.toUpperCase());
      return { canonical, variants: [loc, canonical], isKnown: false };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC MULTI-LANGUAGE EXTRACTOR
// "rust developers who know C as well" → primaryLang=Rust, secondaryLangs=[C]
// The LLM was applying Rust as the only filter and dropping C mentions entirely.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_LANGUAGES = [
  'TypeScript','JavaScript','Python','Rust','Go','C++','C#','C','Java','Kotlin',
  'Swift','Ruby','PHP','Zig','Haskell','Elixir','Lua','Dart','Scala','Shell',
  'HTML','CSS','Assembly','Objective-C','Fortran','Julia','Solidity','R','MATLAB',
];

function extractLanguages(query: string): { primary: string | null; secondary: string[] } {
  const lower = query.toLowerCase();
  const found: string[] = [];
  
  for (const lang of ALL_LANGUAGES) {
    const pattern = new RegExp('\\b' + lang.toLowerCase().replace('+', '\\+').replace('#', '\\#') + '\\b', 'i');
    if (pattern.test(lower)) found.push(lang);
  }

  if (!found.length) return { primary: null, secondary: [] };
  // First mentioned is primary, rest are secondary skills
  return { primary: found[0], secondary: found.slice(1) };
}

function detectQueryMode(query: string): { mode: 'technical'|'person'|'open'; constraints: { must: string[]; negative: string[] } | null } {
  const lower = query.toLowerCase();

  // Check person-search triggers first
  if (PERSON_TRIGGERS.some(t => lower.includes(t))) {
    return { mode: 'person', constraints: null };
  }

  // Check technical role constraints (longest match first)
  const keys = Object.keys(ROLE_CONSTRAINTS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) return { mode: 'technical', constraints: ROLE_CONSTRAINTS[key] };
  }

  // If explicit languages found but no role keyword, still treat as technical
  const { primary } = extractLanguages(query);
  if (primary) return { mode: 'technical', constraints: null };

  return { mode: 'open', constraints: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ADAPTERS
// ─────────────────────────────────────────────────────────────────────────────

async function callGemini(prompt: string, key: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gemini: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callClaude(prompt: string, key: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 4096, messages: [{ role: 'user', content: prompt }], temperature: 0.1 })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Claude: ${data.error.message}`);
  return data.content?.[0]?.text;
}

async function callUniversal(prompt: string, key: string, baseUrl: string, modelName: string) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: modelName || 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: 'json_object' } })
  });
  const data = await res.json();
  if (data.error) throw new Error(`API: ${data.error.message || JSON.stringify(data.error)}`);
  return data.choices?.[0]?.message?.content;
}

async function callAI(prompt: string, provider: string, key: string, baseUrl?: string, modelName?: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let raw = '';
      if (provider === 'gemini') raw = await callGemini(prompt, key);
      else if (provider === 'anthropic') raw = await callClaude(prompt, key);
      else {
        const url = provider === 'openai' ? 'https://api.openai.com/v1' : (baseUrl || '');
        const model = provider === 'openai' ? 'gpt-4o-mini' : (modelName || '');
        if (!url) throw new Error('Custom provider needs Base URL.');
        raw = await callUniversal(prompt, key, url, model);
      }
      if (!raw) throw new Error('Empty AI output');
      const s = raw.search(/\{|\[/), e = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
      if (s === -1 || e === -1) throw new Error('No JSON in AI output');
      return JSON.parse(raw.substring(s, e + 1));
    } catch (err: any) {
      if (attempt >= 2) throw err;
      await delay((attempt + 1) * 2000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAM ENCODER
// ─────────────────────────────────────────────────────────────────────────────

function makeEncoder() {
  const enc = new TextEncoder();
  return (obj: object) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function extractContactDetails(user: any): ContactDetails {
  const blog = (user.blog || '').trim();
  const linkedinMatch = blog.match(/linkedin\.com\/(in|pub)\/[\w\-]+/i);
  const linkedin = linkedinMatch ? `https://${linkedinMatch[0]}` : null;
  const portfolio = (!linkedinMatch && blog && !blog.includes('twitter.com') && !blog.includes('x.com'))
    ? (blog.startsWith('http') ? blog : `https://${blog}`) : null;
  let twitter = user.twitter_username || null;
  if (!twitter) { const m = blog.match(/(?:twitter|x)\.com\/@?([\w]+)/i); if (m) twitter = m[1]; }
  return { email: user.email || null, twitter, linkedin, portfolio };
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL-YEAR CONTRIBUTION CALENDAR
// GitHub's public events API only goes ~90 days. For the full year heatmap
// we use the GitHub GraphQL API (contributions collection) which is public
// and available with a PAT — no special scopes needed.
// ─────────────────────────────────────────────────────────────────────────────

async function getYearContributions(login: string, token: string): Promise<CommitDay[]> {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          login,
          from: yearAgo.toISOString(),
          to: now.toISOString(),
        }
      })
    });

    if (!res.ok) throw new Error('GraphQL failed');
    const data = await res.json();
    const weeks = data?.data?.user?.contributionsCollection?.contributionCalendar?.weeks || [];

    const days: CommitDay[] = [];
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        days.push({ date: day.date, count: day.contributionCount });
      }
    }
    return days;
  } catch {
    // Fallback: return empty year
    const days: CommitDay[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days.push({ date: d.toISOString().split('T')[0], count: 0 });
    }
    return days;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE PROFICIENCY
// ─────────────────────────────────────────────────────────────────────────────

async function getLanguageProficiency(login: string, repos: any[], gHeaders: HeadersInit, selectedLangs: string[]): Promise<LanguageBar[]> {
  const selLower = selectedLangs.map(l => l.toLowerCase());
  
  const targets = repos.filter(r => !r.fork).sort((a, b) => {
    // Prioritize repos whose primary language matches the search criteria
    const aMatch = a.language && selLower.includes(a.language.toLowerCase()) ? 1 : 0;
    const bMatch = b.language && selLower.includes(b.language.toLowerCase()) ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    // Fallback to stars
    return b.stargazers_count - a.stargazers_count;
  }).slice(0, 15);
  const langBytes: Record<string, number> = {};
  await Promise.all(targets.map(async (repo) => {
    try {
      const res = await fetch(`https://api.github.com/repos/${login}/${repo.name}/languages`, { headers: gHeaders });
      if (!res.ok) return;
      const data: Record<string, number> = await res.json();
      for (const [lang, bytes] of Object.entries(data)) langBytes[lang] = (langBytes[lang] || 0) + bytes;
    } catch { /* skip */ }
  }));
  const total = Object.values(langBytes).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, bytes]) => ({ name, bytes, percentage: Math.round((bytes / total) * 1000) / 10 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

// Exact language name comparison — never fuzzy-substring.
// "C" !== "C++", "C" !== "Objective-C". Case-insensitive exact match only.
function langExact(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function computeScore(
  user: any, langBars: LanguageBar[], events: any[], queryTerms: string[],
  repos: any[], constraints: { must: string[]; negative: string[] } | null, mode: string,
  locationInfo?: { canonical: string; variants: string[]; isKnown: boolean } | null,
  companySignal?: string | null,
  semanticEval?: { score: number, assessment: string }
): { total: number; breakdown: ScoreBreakdown & { locationMatch: number, semanticMatch: number } } {
  const bd: ScoreBreakdown & { locationMatch: number, semanticMatch: number } = { relevance: 0, activityRecency: 0, codeQuality: 0, profileSignal: 0, locationMatch: 0, semanticMatch: 0 };
  const topLangs = langBars.map(l => l.name.toLowerCase());
  const bioText = (user.bio || '').toLowerCase();
  const nameText = (user.name || user.login || '').toLowerCase();

  // RELEVANCE
  const langNameSet = new Set(langBars.map(l => l.name.toLowerCase()));
  const top3Langs = topLangs.slice(0, 3);

  if (mode === 'person') {
    const allText = bioText + ' ' + nameText + ' ' + (user.company || '').toLowerCase();
    const hits = queryTerms.filter(t => allText.includes(t)).length;
    bd.relevance = Math.min(40, (hits / Math.max(queryTerms.length, 1)) * 40);

  } else if (constraints) {
    // Technical mode — exact language matching, no substring fuzzing
    const mustL = constraints.must.map(l => l.toLowerCase());
    const negL  = constraints.negative.map(l => l.toLowerCase());
    const primaryLang = topLangs[0] || '';

    // Negative language penalty: if their TOP language is explicitly negative, penalise hard
    const primaryIsNeg = negL.some(n => langExact(primaryLang, n));
    const negPct = langBars.filter(l => negL.some(n => langExact(l.name, n))).reduce((a, l) => a + l.percentage, 0);
    if (primaryIsNeg && negPct > 40) {
      bd.relevance = Math.max(0, 5 - Math.floor(negPct / 15));
    } else {
      // Score by how much of their codebase is in required languages (percentage-weighted)
      let mustPct = 0;
      for (const m of mustL) {
        const bar = langBars.find(l => langExact(l.name, m));
        mustPct += bar?.percentage || 0;
      }
      // Primary match: is their #1 language one of the must-list?
      const primaryInMust = mustL.some(m => langExact(primaryLang, m));
      const top3InMust = top3Langs.some(l => mustL.some(m => langExact(l, m)));

      if (primaryInMust)       bd.relevance = Math.min(40, 28 + Math.min(12, mustPct / 10));
      else if (top3InMust)     bd.relevance = Math.min(40, 16 + Math.min(12, mustPct / 10));
      else                     bd.relevance = Math.min(12, mustPct / 5);

      // Bio keyword bonus — only role words, not language names (already scored above)
      const roleTerms = queryTerms.filter(t => !mustL.includes(t) && !negL.includes(t));
      bd.relevance = Math.min(40, bd.relevance + roleTerms.filter(t => bioText.includes(t)).length * 2);
    }

  } else {
    // Open / multi-language mode
    // Use EXACT language name matching — never substring
    const langTerms = queryTerms.filter(t => langNameSet.has(t));
    const roleTerms = queryTerms.filter(t => !langTerms.includes(t));
    const primaryLangTerm = langTerms[0] || '';
    const secondaryLangTerms = langTerms.slice(1);

    // Primary: percentage-weighted score (40 → 0)
    const primaryBar = langBars.find(l => langExact(l.name, primaryLangTerm));
    const primaryPct = primaryBar?.percentage || 0;
    const primaryRank = primaryBar ? langBars.indexOf(primaryBar) : 99;
    const primaryScore = !primaryLangTerm ? 20  // no lang specified → open query
      : primaryPct >= 30 ? 32
      : primaryPct >= 15 ? 26
      : primaryPct >= 5  ? 18
      : primaryPct >= 1  ? 8
      : 0;

    // Rank bonus: if it's their #1 or #2 language
    const rankBonus = primaryRank === 0 ? 8 : primaryRank === 1 ? 4 : 0;

    // Secondary: 4 pts each, capped at 8
    const secondaryScore = Math.min(8, secondaryLangTerms.filter(t => {
      const bar = langBars.find(l => langExact(l.name, t));
      return bar && bar.percentage >= 1;
    }).length * 4);

    const bioScore = Math.min(4, roleTerms.filter(t => bioText.includes(t)).length * 2);
    bd.relevance = Math.min(40, Math.max(0, primaryScore + rankBonus + secondaryScore + bioScore));
  }

  // COMPANY MATCH BONUS
  if (companySignal && mode !== 'person') {
    const cLower = companySignal.toLowerCase();
    const profileText = [(user.company || ''), (user.bio || ''), (user.login || '')].join(' ').toLowerCase();
    if (profileText.includes(cLower)) bd.relevance = Math.min(40, bd.relevance + 12);
  }

  // ACTIVITY RECENCY (30 pts)
  const now = Date.now();
  const ev90 = events.filter(e => ['PushEvent','PullRequestEvent','CreateEvent'].includes(e.type) && new Date(e.created_at).getTime() > now - 90*86400000);
  const ev180 = events.filter(e => ['PushEvent','PullRequestEvent'].includes(e.type) && new Date(e.created_at).getTime() > now - 180*86400000);
  const cnt90 = ev90.reduce((a, e) => a + (e.type === 'PushEvent' ? (e.payload?.commits?.length ?? 1) : 1), 0);
  const repos365 = repos.filter(r => !r.fork && new Date(r.pushed_at).getTime() > now - 365*86400000).length;
  bd.activityRecency = Math.min(30, Math.min(20, Math.log10(Math.max(cnt90,1)+1)*10) + Math.min(7, repos365*1.2) + (ev180.length > ev90.length*1.2 ? 3 : 0));

  // CODE QUALITY (20 pts)
  const own = repos.filter(r => !r.fork);
  const stars = own.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const forks = own.reduce((a, r) => a + (r.forks_count || 0), 0);
  bd.codeQuality = Math.min(20, Math.min(15, Math.log10(Math.max(stars,1))*5) + Math.min(5, Math.log10(Math.max(forks,1))*3));

  // PROFILE SIGNAL (10 pts)
  let pts = 0;
  if (user.email) pts += 3;
  if (user.bio?.length > 20) pts += 2;
  if (user.blog) pts += 2;
  if (user.twitter_username) pts += 1;
  if (user.name && user.name !== user.login) pts += 1;
  bd.profileSignal = Math.min(10, pts);

  // LOCATION: pure filter — no points up or down in score
  bd.locationMatch = 0;

  // SEMANTIC MATCH (NEW)
  if (semanticEval) {
    bd.semanticMatch = (semanticEval.score / 100) * 30; // 30 pts for pure semantic repo match
    bd.relevance = bd.relevance * 0.25; // max 10 pts for basic keyword relevance
  } else {
    bd.semanticMatch = bd.relevance; // fallback if AI fails
    bd.relevance = 0;
  }

  const rawTotal = bd.relevance + bd.semanticMatch + bd.activityRecency + bd.codeQuality + bd.profileSignal;
  return { total: Math.max(0, Math.round(rawTotal)), breakdown: bd };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPO SUMMARIZER — used for rich AI assessment
// ─────────────────────────────────────────────────────────────────────────────

function getTopRepoSummaries(repos: any[]): RepoSummary[] {
  return repos
    .filter(r => !r.fork && r.description)
    .sort((a, b) => (b.stargazers_count + b.forks_count) - (a.stargazers_count + a.forks_count))
    .slice(0, 5)
    .map(r => ({
      name: r.name,
      description: r.description,
      stars: r.stargazers_count,
      language: r.language,
      topics: r.topics?.slice(0, 4) || [],
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC SEARCH EVALUATOR
// Reverse-engineers advanced semantic algorithms by using LLM to score how well
// a developer's actual project repositories align with the deeply parsed query intent.
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateSemanticMatch(
  query: string, 
  candidates: any[], 
  provider: string, 
  key: string, 
  baseUrl?: string, 
  modelName?: string,
  mode?: string
): Promise<{ evals: Record<string, {score: number, assessment: string}>, orderedHandles?: string[] }> {
  if (!candidates.length) return { evals: {} };
  
  const personRerankNote = mode === 'person'
          ? `\nIMPORTANT: The user is searching for a specific person ("${query}"). Rank the exact matched person first in orderedHandles.`
          : '';

  const prompt = `You are an elite technical recruiter AI (a semantic search engine).
Your goal is to evaluate developers based on their actual project experience, repositories, and technical background.
We need to find candidates who have deep, niche expertise aligning with this search intent: "${query}"${personRerankNote}

For each developer, rate their semantic alignment to the intent on a scale of 0 to 100.
- 85-100: Built projects directly related to the niche (e.g., asked for 'blockchain indexing' and they have an open source indexer).
- 60-84: Has highly relevant skills and adjacent projects.
- 30-59: Uses the required languages but projects are generic.
- 0-29: Unrelated projects or insufficient data.

Provide a 2-3 sentence 'assessment' for each:
1. Describe what they have actually BUILT (reference specific repo names and what they do).
2. Assess their technical depth and fit for the search query.
Do NOT be generic. Mention actual project names.

Candidates:
${JSON.stringify(candidates.map(c => ({
  handle: c.user.login,
  name: c.user.name,
  bio: c.user.bio,
  company: c.user.company,
  topRepos: getTopRepoSummaries(c.repos).map(r => r.name + ': ' + r.description + ' [' + (r.topics || []).join(',') + ']')
}))).slice(0, 30000)}

Return ONLY JSON:
{"evaluations": [{"handle": "username", "score": 85, "assessment": "Built X..."}]${mode === 'person' ? ',"orderedHandles":["handle1","handle2"]' : ''}}`;

  try {
    const result = await callAI(prompt, provider, key, baseUrl, modelName);
    const evals: Record<string, {score: number, assessment: string}> = {};
    for (const e of (result?.evaluations || [])) evals[e.handle] = { score: e.score, assessment: e.assessment };
    return { evals, orderedHandles: result?.orderedHandles };
  } catch (err) {
    console.warn('Semantic evaluation failed:', err);
    return { evals: {} };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HUNT ROUTE — Server-Sent Events
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC SEARCH — structured inputs bypass the LLM for query building.
// Accepts: jobProfile, languages (array), country, state, city
// Builds multiple targeted GitHub search queries directly without LLM guessing.
// ─────────────────────────────────────────────────────────────────────────────

// Maps UI job profile labels → ROLE_CONSTRAINTS keys
const PROFILE_TO_ROLE: Record<string, string> = {
  'Systems / Kernel': 'systems',
  'Kernel / Low-Level': 'kernel',
  'Firmware / Embedded': 'embedded',
  'Frontend': 'frontend',
  'Backend': 'backend',
  'Full Stack': 'fullstack',
  'Machine Learning / AI': 'machine learning',
  'Data Engineer': 'data engineer',
  'Data Scientist': 'data scientist',
  'DevOps / SRE': 'devops',
  'Mobile (iOS/Android)': 'mobile',
  'iOS': 'ios',
  'Android': 'android',
  'Security': 'security',
  'QA / Testing': 'qa',
  'Blockchain / Web3': 'blockchain',
  'Game / Graphics': 'game',
};

function buildDeterministicQueries(params: {
  jobProfile: string;
  languages: string[];
  country: string;
  state: string;
  city: string;
}): { queries: string[]; queryTerms: string[]; constraints: { must: string[]; negative: string[] } | null; locationInfo: { canonical: string; variants: string[]; isKnown: boolean } | null } {
  const { jobProfile, languages, country, state, city } = params;

  // Resolve role constraints
  const roleKey = PROFILE_TO_ROLE[jobProfile] || jobProfile.toLowerCase();
  const constraints = ROLE_CONSTRAINTS[roleKey] || null;

  // Determine primary language — user-selected takes precedence over role default
  const primaryLang = languages[0] || constraints?.must[0] || '';
  const secondaryLangs = languages.slice(1);
  const langFilter = primaryLang ? `language:"${primaryLang}"` : '';
  const negFilter = constraints ? constraints.negative.map(l => `-language:"${l}"`).join(' ') : '';

  // Build location strings (most specific to least specific)
  const locationParts: string[] = [];
  if (city) locationParts.push(city);
  if (state) locationParts.push(state);
  if (country) locationParts.push(country);

  const primaryLoc = locationParts[0] || '';
  const secondaryLoc = locationParts[1] || '';

  const queries: string[] = [];

  // When location is given, ONLY generate location-anchored queries.
  // Never add a skill-only fallback — that is the #1 cause of wrong-city devs appearing.
  if (locationParts.length > 0) {
    // Use Bangalore LOCATION_ALIASES if we recognise the city, else use what the user typed
    const cityVariants: string[] = [];
    for (const [, aliases] of Object.entries(LOCATION_ALIASES)) {
      if (aliases.some(a => locationParts.some(lp => lp.toLowerCase() === a || a.includes(lp.toLowerCase())))) {
        cityVariants.push(...aliases.slice(0, 4));
        break;
      }
    }
    // Fallback: just use what the user typed
    if (cityVariants.length === 0) cityVariants.push(...locationParts);

    // Generate one query per (city variant × primary language), capped at 6 queries
    const locQueries: string[] = [];
    for (const locV of cityVariants.slice(0, 3)) {
      if (langFilter) locQueries.push(`location:"${locV}" ${langFilter} type:user`.trim());
      for (const secL of secondaryLangs) {
        locQueries.push(`location:"${locV}" language:"${secL}" type:user`.trim());
      }
    }
    queries.push(...locQueries.slice(0, 8));
  } else {
    // No location — pure skill search
    if (langFilter) {
      queries.push(`${langFilter} type:user`.trim());
      for (const secL of secondaryLangs) {
        queries.push(`language:"${secL}" type:user`.trim());
      }
    }
  }
  // Ensure at least 1 query
  if (queries.length === 0) {
    queries.push(`${langFilter || 'type:user'} type:user`);
  }

  // Build locationInfo for scoring
  const canonicalLoc = city || state || country || '';
  const locVariants = locationParts.map(l => l.toLowerCase());
  const locationInfo = canonicalLoc
    ? { canonical: canonicalLoc, variants: locVariants, isKnown: true }
    : null;

  // queryTerms for scoring: all selected languages + role name words
  const queryTerms: string[] = [
    ...languages.map(l => l.toLowerCase()),
    ...(primaryLang && !languages.length ? [primaryLang.toLowerCase()] : []),
    ...(jobProfile ? jobProfile.toLowerCase().split(/[\s\/]+/) : []),
  ].filter((v, i, a) => v.length > 1 && a.indexOf(v) === i);

  return { queries, queryTerms, constraints, locationInfo };
}

export async function POST(req: Request) {
  const encode = makeEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: object) => { try { controller.enqueue(encode(msg)); } catch { /* closed */ } };

      try {
        const body = await req.json();
        const { provider, llmKey, githubToken, baseUrl, modelName } = body;
        const gHeaders: HeadersInit = { Authorization: `token ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' };
        const token = githubToken;

        // ── DETERMINISTIC MODE: bypass AI for query generation ──────────────
        if (body.searchMode === 'deterministic') {
          const { jobProfile, languages, country, state, city } = body;
          if (country === undefined && state === undefined && city === undefined) {
             send({ type: 'error', message: 'CRITICAL ERROR: Your browser is running a stale version of LibreHire. Please do a HARD REFRESH (Ctrl+Shift+R or Cmd+Shift+R).' });
             controller.close(); return;
          }
          const displayLabel = [jobProfile, city || state || country].filter(Boolean).join(' · ');
          send({ type: 'progress', step: 1, total: 6, label: `Building targeted queries for: ${displayLabel}` });

          const { queries, queryTerms, constraints, locationInfo } = buildDeterministicQueries({ jobProfile, languages: languages || [], country: country || '', state: state || '', city: city || '' });
          require('fs').writeFileSync('debug.json', JSON.stringify({ jobProfile, languages, country, state, city, queries, locationInfo }, null, 2));
          console.log('[DEBUG] deterministic request received:', { jobProfile, languages, country, state, city });
          console.log('[DEBUG] queries generated:', queries);

          // Jump directly to Stage 2 (skip AI call)
          send({ type: 'progress', step: 2, total: 6, label: `Running ${queries.length} precision searches...` });
          const searchResults = await Promise.all(
            queries.map((q: string) =>
              fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=100`, { headers: gHeaders })
                .then(r => r.json()).catch(() => ({ items: [] }))
            )
          );
          const seenIds = new Set<number>();
          const uniqueItems: any[] = [];
          for (const data of searchResults) {
            for (const item of (data.items || [])) {
              if (item.type === 'User' && !seenIds.has(item.id) && uniqueItems.length < 60) {
                seenIds.add(item.id); uniqueItems.push(item);
              }
            }
          }
          if (!uniqueItems.length) {
            send({ type: 'error', message: 'No developers found for these filters. Try broadening location or language selection.' });
            controller.close(); return;
          }
          send({ type: 'progress', step: 3, total: 6, label: `Reading ${uniqueItems.length} profiles...` });
          const enriched: any[] = [];
          for (let i = 0; i < uniqueItems.length; i += 12) {
            const batch = uniqueItems.slice(i, i + 12);
            const res = await Promise.all(batch.map(async (item) => {
              try {
                const [uRes, rRes, eRes] = await Promise.all([
                  fetch(`https://api.github.com/users/${item.login}`, { headers: gHeaders }),
                  fetch(`https://api.github.com/users/${item.login}/repos?per_page=60&sort=pushed`, { headers: gHeaders }),
                  fetch(`https://api.github.com/users/${item.login}/events/public?per_page=60`, { headers: gHeaders }),
                ]);
                const [u, repos, events] = await Promise.all([
                  uRes.ok ? uRes.json() : null,
                  rRes.ok ? rRes.json() : [],
                  eRes.ok ? eRes.json() : [],
                ]);
                if (!u || !u.public_repos) return null;
                return { user: u, repos: Array.isArray(repos) ? repos : [], events: Array.isArray(events) ? events : [] };
              } catch { return null; }
            }));
            enriched.push(...res.filter(Boolean));
          }

          // ── ULTRA-STRICT LOCATION FILTER ─────────────────────────────────────
          // If a location is requested, the developer MUST explicitly have a matching location.
          // No guessing, no falling back to "unknown" locations or other countries.
          let detPool = enriched;
          let detQuality = 'good';
          if (locationInfo) {
            const allV = locationInfo.variants.map(v => v.toLowerCase());
            const canonical = locationInfo.canonical.toLowerCase();

            detPool = enriched.filter(({ user }) => {
              const uLoc = (user.location || '').toLowerCase();
              if (!uLoc) return false; // Strict: if we want Bangalore, blank location is a NO.

              // 1. Direct match on city variants
              if (allV.some(v => uLoc.includes(v) || v.includes(uLoc))) return true;
              if (uLoc.includes(canonical)) return true;

              // 2. State/Country context matching
              // If we asked for India, it's fine if they say "Mumbai".
              // But if we asked for Bangalore, "Mumbai" is WRONG.
              const COUNTRY_MAP: Record<string, string[]> = {
                india: ['india','karnataka','maharashtra','telangana','tamil nadu','kerala',
                        'gujarat','rajasthan','delhi','ncr','bihar','uttarakhand','odisha',
                        'west bengal','punjab','haryana','assam','up','uttar pradesh',
                        'bangalore','bengaluru','mumbai','hyderabad','chennai','pune',
                        'ahmedabad','jaipur','kochi','chandigarh','noida','gurgaon','gurugram'],
                usa:   ['usa','united states','america','california','new york','texas',
                        'washington','illinois','georgia','florida','virginia','oregon','colorado',
                        'san francisco', 'sf', 'bay area', 'seattle', 'boston', 'chicago', 'austin'],
                uk:    ['uk','united kingdom','england','scotland','wales','london'],
                germany: ['germany','deutschland','berlin','munich'],
                canada:  ['canada','toronto','vancouver'],
              };

              // If the search was explicitly for a country (e.g. "India"), allow any city in that country.
              for (const [country, hints] of Object.entries(COUNTRY_MAP)) {
                const searchIsCountry = allV.includes(country);
                if (searchIsCountry) {
                  if (hints.some(h => uLoc.includes(h))) return true;
                }
              }

              return false; // Did not match requested location
            });

            if (detPool.length === 0) {
              send({ type: 'error', message: `No developers found strictly matching ${locationInfo.canonical} and your tech stack. Try expanding the location.` });
              controller.close(); return;
            }
          }

          send({ type: 'progress', step: 4, total: 5, label: `Semantic Analysis of ${detPool.length} candidates...` });
          const userQuery = [jobProfile, (languages || []).join('+'), city || state || country].filter(Boolean).join(' ');

          const [withLangs, semanticRes] = await Promise.all([
            Promise.all(
              detPool.map(async ({ user, repos, events }) => {
                const langBars = await getLanguageProficiency(user.login, repos, gHeaders, languages || []);
                return { user, repos, events, langBars };
              })
            ),
            evaluateSemanticMatch(userQuery, detPool, provider, llmKey, baseUrl, modelName, 'technical')
          ]);

          send({ type: 'progress', step: 5, total: 5, label: `Scoring ${withLangs.length} candidates...` });
          const scored = withLangs.map(({ user, repos, events, langBars }) => {
            const evalRes = semanticRes.evals[user.login];
            const { total, breakdown } = computeScore(user, langBars, events, queryTerms, repos, constraints, 'technical', locationInfo, null, evalRes);
            const own = repos.filter((r: any) => !r.fork);
            return {
              handle: user.login, name: user.name || user.login, avatar: user.avatar_url,
              bio: user.bio || '', location: user.location || null, company: user.company || null,
              followers: user.followers || 0, own_repos: own.length,
              stars: own.reduce((a: number, r: any) => a + (r.stargazers_count || 0), 0),
              contactDetails: extractContactDetails(user), languages: langBars,
              proficientLanguages: langBars.slice(0, 3).map((l: LanguageBar) => l.name),
              commitCalendar: [] as CommitDay[], topRepos: getTopRepoSummaries(repos),
              score: total, scoreBreakdown: breakdown, summary: evalRes?.assessment || '', accountCreated: user.created_at,
            };
          });

          // ── THREE-TIER LANGUAGE FILTER ────────────────────────────────────────
          // Primary language (first selected) must be ≥5% — a real primary, not a trace.
          // Secondary languages (additional selections) must be ≥2%.
          const selLangs = (languages || []).map((l: string) => l.toLowerCase());
          const mustFromConstraints = (constraints?.must || []).map((l: string) => l.toLowerCase());
          const allSel = selLangs.length > 0 ? selLangs : mustFromConstraints;

          // Exact language name match — "C" must NOT equal "C++"
          const matchPct = (langBars: LanguageBar[], lang: string, minPct: number) =>
            langBars.some(l => langExact(l.name, lang) && l.percentage >= minPct);

          const getDetTier = (p: typeof scored[0]): { tier: 'full'|'primary'|'none'; missingLangs: string[] } => {
            if (allSel.length === 0) return { tier: 'full', missingLangs: [] };
            const primary = allSel[0];
            const secondaries = allSel.slice(1);
            
            // For Systems/Kernel, they MUST have the primary language at a high percentage (e.g. >= 5%).
            const hasPrimary = matchPct(p.languages, primary, 5);
            if (!hasPrimary) return { tier: 'none', missingLangs: allSel };

            const missSec = secondaries.filter((s: string) => !matchPct(p.languages, s, 2));
            if (missSec.length === 0) return { tier: 'full', missingLangs: [] };
            return { tier: 'primary', missingLangs: missSec };
          };

          const detSorted = scored.sort((a, b) => b.score - a.score);
          const detFull    = detSorted.filter(p => getDetTier(p).tier === 'full').map(p => ({ ...p, matchTier: 'full'    as const, missingLangs: [] as string[] }));
          const detPartial = detSorted.filter(p => getDetTier(p).tier === 'primary').map(p => ({ ...p, matchTier: 'primary' as const, missingLangs: getDetTier(p).missingLangs }));
          
          // STRICT STACK ALIGNMENT: We explicitly drop tier 'none' (those who lack the primary language).
          // We'd rather return 2 highly qualified engineers than 20 frontend devs.
          const detPresorted = [...detFull, ...detPartial].slice(0, 20);
          
          if (detPresorted.length === 0) {
            send({ type: 'error', message: 'No developers found who meet the strict language requirements (≥5% primary codebase). Try removing some secondary languages.' });
            controller.close(); return;
          }

          await Promise.all(detPresorted.slice(0, 15).map(async (p) => { p.commitCalendar = await getYearContributions(p.handle, token); }));
          const topCandidates = detPresorted;

          const final = topCandidates
            .map(p => ({ ...p, summary: p.summary || `${p.proficientLanguages.join(', ')} developer with ${p.stars} stars.` }))
            .filter(p => p.score >= 3);
          send({ type: 'done', data: final, searchQuality: detQuality, locationFiltered: !!locationInfo });
          controller.close();
          return;
        }

        // ── OPEN-ENDED / PERSON SEARCH (original path) ─────────────────────
        const userQuery = body.userQuery || '';
        const { mode, constraints } = detectQueryMode(userQuery);

        // ── STAGE 1: AI QUERY GENERATION ───────────────────────────────────
        send({ type: 'progress', step: 1, total: 6, label: 'Understanding your search intent...' });

        // ── DETERMINISTIC PRE-PROCESSING ─────────────────────────────────────
        // Extract location, languages, AND company signals from query BEFORE the LLM.
        // This prevents LLM misidentification and ensures all signals are preserved.
        const locationInfo = extractLocation(userQuery);
        const langInfo = extractLanguages(userQuery);
        const companySignal = extractCompany(userQuery);

        // Build the primary language filter for GitHub search
        // Use constraint must-list if we have one, otherwise use extracted lang
        const negFilter = constraints ? constraints.negative.map(l => `-language:"${l}"`).join(' ') : '';
        const mustLangs = constraints?.must || (langInfo.primary ? [langInfo.primary] : []);
        const secondaryLangs = langInfo.secondary; // "also knows C" type skills

        let intentPrompt: string;

        if (mode === 'person') {
          intentPrompt = `You are a GitHub search expert. Someone is trying to find a specific person on GitHub.
Query: "${userQuery}"

Generate 4 GitHub search queries to find this person. Return ONLY JSON:
{"queries":["q1","q2","q3","q4"],"queryTerms":["t1","t2","t3"]}

Rules:
- Extract the person's name, project name, company, or role from the query
- q1: search by the person's name or known username in:login (e.g. "manaskamal in:login type:user")
- q2: search their project or company name as keyword (e.g. "xeneva type:user")
- q3: their role + company (e.g. "founder xeneva type:user")
- q4: their name in fullname field (e.g. "manas kamal in:name type:user")
- queryTerms: key identifying words from the query (name parts, project name, company)
- Do NOT add language filters for person searches`;
        } else {
          // Build location-aware query strings using deterministic extraction
          const locTag = locationInfo ? `location:"${locationInfo.canonical}"` : '';
          const locVariants = locationInfo ? locationInfo.variants.slice(0, 2) : [];
          const primaryLangFilter = mustLangs.length ? `language:"${mustLangs[0]}"` : '';
          // For multi-language: search primary lang, then secondary as separate queries
          const secondaryLangFilter = secondaryLangs.length ? `language:"${secondaryLangs[0]}"` : primaryLangFilter;

          // For unknown cities (isKnown=false), the AI must generate spelling variants
          // e.g. "mangalore" → also try "mangaluru", "karnataka"
          // For known cities, we already have the variants list.
          const locationInstruction = locationInfo
            ? locationInfo.isKnown
              ? `Location confirmed: "${locationInfo.canonical}". Use these variants across queries: ${locationInfo.variants.slice(0,4).join(', ')}`
              : `Location detected: "${locationInfo.canonical}" — this may be a smaller city. You MUST:
  1. Use it exactly as-is in one query (location:"${locationInfo.canonical}")
  2. Try the most common alternate spelling or local name (e.g. Mangalore→Mangaluru, Kochi→Cochin)
  3. Try the state/province/region it belongs to (e.g. Mangalore→Karnataka, Kochi→Kerala)
  4. Try a nearby major hub city that developers there might list as their location`
            : 'No specific location detected — make skill-focused queries only';

          intentPrompt = `You are a technical recruiter building GitHub search queries.
Query: "${userQuery}"
Mode: ${mode}

EXTRACTED DATA:
- ${locationInstruction}
- Primary language: ${mustLangs[0] || 'none — infer from query context'}
- Secondary languages: ${secondaryLangs.join(', ') || 'none'}
- Negative filters: ${negFilter || 'none'}
${companySignal ? `- Company/Employer signal detected: "${companySignal}" — the person may have their GitHub bio, company field, or repos referencing this employer.` : ''}

Generate 4 GitHub search queries. Return ONLY JSON:
{"queries":["q1","q2","q3","q4"],"queryTerms":["t1","t2","t3"]}

RULES:
${(companySignal && locationInfo) ? `
COMPANY + LOCATION SEARCH — company is the PRIMARY signal, location is secondary.
- q1: "${companySignal}" location:"${locationInfo.canonical}" type:user  (company keyword + city)
- q2: "${companySignal}" location:"${locationInfo.variants[1] || locationInfo.canonical}" type:user  (alt city spelling)
- q3: "${companySignal}" type:user repos:>0  (global — employer self-identifies anywhere in profile)
- q4: ${primaryLangFilter ? `location:"${locationInfo.canonical}" ${primaryLangFilter} type:user` : `location:"${locationInfo.canonical}" type:user`}  (location+skill fallback, no company filter)
` : locationInfo ? `- q1: location:"${locationInfo.canonical}" ${primaryLangFilter} type:user ${negFilter}
- q2: Use alternate spelling/local name of the city + ${primaryLangFilter} type:user ${negFilter} (e.g. if Mangalore, try "mangaluru"; if Bangalore, try "bengaluru")
- q3: location of the state/region + ${primaryLangFilter} type:user ${negFilter} (broader area)
- q4: ${primaryLangFilter} ${secondaryLangs.map(l => `language:"${l}"`).join(' ')} type:user ${negFilter} (no location, skill only)` 
: `- q1-q4: Skill-focused queries with different language and keyword combinations. Use in:bio for role keywords.`}
${companySignal && !locationInfo ? `- IMPORTANT: At least 2 queries MUST contain "${companySignal}" as a keyword to find devs who self-identify with this employer in bio/company/login.` : ''}
- NEVER use a city from a different country or region than what was asked
- queryTerms: list the primary language, secondary languages, key role words, and the company name if one was detected (NO generic location words)`;
        }

        const params = await callAI(intentPrompt, provider, llmKey, baseUrl, modelName);
        if (!params?.queries?.length) throw new Error('AI failed to build queries.');
        // Merge AI-returned queryTerms with our deterministically extracted languages
        // This ensures primary + secondary langs are always in queryTerms for scoring
        const aiTerms: string[] = params.queryTerms || [];
        const detectedLangTerms = [
          ...(langInfo.primary ? [langInfo.primary.toLowerCase()] : []),
          ...langInfo.secondary.map(l => l.toLowerCase()),
        ];
        // Merge: extracted langs first (they're authoritative), then AI terms
        const queryTerms: string[] = [
          ...detectedLangTerms,
          ...aiTerms.filter(t => !detectedLangTerms.includes(t.toLowerCase())),
        ];

        // Also try implied company ("Vercel developers") if explicit triggers didn't fire
        const effectiveCompany = companySignal || extractImpliedCompany(userQuery);

        // ── STAGE 2: GITHUB SEARCH ─────────────────────────────────────────
        send({ type: 'progress', step: 2, total: 6, label: `Running ${params.queries.length} searches on GitHub...` });

        const searchResults = await Promise.all(
          params.queries.map((q: string) =>
            fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=20&sort=repositories&order=desc`, { headers: gHeaders })
              .then(r => r.json()).catch(() => ({ items: [] }))
          )
        );

        const seenIds = new Set<number>();
        const uniqueItems: any[] = [];
        for (const data of searchResults) {
          for (const item of (data.items || [])) {
            // Cap at 35 unique users — more than enough, keeps Stage 3 fast
            if (item.type === 'User' && !seenIds.has(item.id) && uniqueItems.length < 35) {
              seenIds.add(item.id); uniqueItems.push(item);
            }
          }
        }

        if (!uniqueItems.length) {
          send({ type: 'error', message: 'No developers found. Try different keywords — e.g. use their GitHub username, project name, or company.' });
          controller.close(); return;
        }

        // ── STAGE 3: ENRICHMENT ────────────────────────────────────────────
        send({ type: 'progress', step: 3, total: 6, label: `Reading ${uniqueItems.length} profiles...` });

        const enriched: any[] = [];
        // Batch 12, no inter-batch delay — GitHub rate limit is per-minute, not per-request
        for (let i = 0; i < uniqueItems.length; i += 12) {
          const batch = uniqueItems.slice(i, i + 12);
          const res = await Promise.all(batch.map(async (item) => {
            try {
              const [uRes, rRes, eRes] = await Promise.all([
                fetch(`https://api.github.com/users/${item.login}`, { headers: gHeaders }),
                fetch(`https://api.github.com/users/${item.login}/repos?per_page=60&sort=pushed`, { headers: gHeaders }),
                fetch(`https://api.github.com/users/${item.login}/events/public?per_page=60`, { headers: gHeaders }),
              ]);
              const [u, repos, events] = await Promise.all([
                uRes.ok ? uRes.json() : null,
                rRes.ok ? rRes.json() : [],
                eRes.ok ? eRes.json() : [],
              ]);
              if (!u || !u.public_repos) return null;
              return { user: u, repos: Array.isArray(repos) ? repos : [], events: Array.isArray(events) ? events : [] };
            } catch { return null; }
          }));
          enriched.push(...res.filter(Boolean));
        }

        // ── LOCATION PRE-FILTER ──────────────────────────────────────────────
        // After enrichment we have real user.location. Filter out confirmed
        // wrong-location devs BEFORE the expensive language/calendar fetch.
        let candidatePool = enriched;
        let searchQuality = 'good';
        if (locationInfo && mode !== 'person') {
          const allVariants = locationInfo.variants.map(v => v.toLowerCase());
          const locMatches = enriched.filter(({ user }) => {
            const uLoc = (user.location || '').toLowerCase();
            if (!uLoc) return true; // unknown location → keep
            return allVariants.some(v => uLoc.includes(v) || v.includes(uLoc)) ||
                   uLoc.includes(locationInfo.canonical.toLowerCase());
          });
          if (locMatches.length >= 4) {
            candidatePool = locMatches;
          } else {
            // Not enough exact matches — use all but flag as fallback
            searchQuality = locMatches.length === 0 ? 'none' : 'partial';
          }
        }

        // ── STAGE 4: SEMANTIC PROJECT ANALYSIS & LANGUAGE PROFICIENCY ────────────────
        send({ type: 'progress', step: 4, total: 5, label: `Semantic Analysis of ${candidatePool.length} candidates...` });

        const [withLangs, semanticRes] = await Promise.all([
          Promise.all(
            candidatePool.map(async ({ user, repos, events }) => {
              const langBars = await getLanguageProficiency(user.login, repos, gHeaders, langInfo.primary ? [langInfo.primary, ...langInfo.secondary] : []);
              return { user, repos, events, langBars };
            })
          ),
          evaluateSemanticMatch(userQuery, candidatePool, provider, llmKey, baseUrl, modelName, mode)
        ]);

        // ── STAGE 5: SCORING & RANKING ───────────────────────────────────────────────
        send({ type: 'progress', step: 5, total: 5, label: `Scoring ${withLangs.length} candidates...` });

        const effectiveCompanyForScore = (companySignal || extractImpliedCompany(userQuery)) ?? null;
        const scored = withLangs.map(({ user, repos, events, langBars }) => {
          const evalRes = semanticRes.evals[user.login];
          const { total, breakdown } = computeScore(user, langBars, events, queryTerms, repos, constraints, mode, locationInfo, effectiveCompanyForScore, evalRes);
          const own = repos.filter((r: any) => !r.fork);
          return {
            handle: user.login,
            name: user.name || user.login,
            avatar: user.avatar_url,
            bio: user.bio || '',
            location: user.location || null,
            company: user.company || null,
            followers: user.followers || 0,
            own_repos: own.length,
            stars: own.reduce((a: number, r: any) => a + (r.stargazers_count || 0), 0),
            contactDetails: extractContactDetails(user),
            languages: langBars,
            proficientLanguages: langBars.slice(0, 3).map((l: LanguageBar) => l.name),
            commitCalendar: [] as CommitDay[], // populated below for top-15 only
            topRepos: getTopRepoSummaries(repos),
            score: total,
            scoreBreakdown: breakdown,
            summary: evalRes?.assessment || '',
            accountCreated: user.created_at,
          };
        });

        // ── THREE-TIER PARTITION ───────────────────────────────────────────────
        //  full    — has ALL required languages (C AND Assembly both present)
        //  primary — has PRIMARY only, missing secondary (has C, no Assembly in repos)
        //  none    — has neither (JS dev in Delhi, no C or Assembly at all)
        const primaryLangReq = langInfo.primary ? langInfo.primary.toLowerCase() : null;
        const secondaryLangReqs = langInfo.secondary.map((l: string) => l.toLowerCase());
        const allRequired = [...(primaryLangReq ? [primaryLangReq] : []), ...secondaryLangReqs];

        const getMatchTier = (p: typeof scored[0]): { tier: 'full'|'primary'|'none'; missingLangs: string[] } => {
          if (allRequired.length === 0) return { tier: 'full', missingLangs: [] };
          const devLangs = p.languages.filter(l => l.percentage > 0.5).map(l => l.name.toLowerCase());
          const matchLang = (r: string) => devLangs.some(dl =>
            dl === r || dl.replace(/[+#]/g,'') === r.replace(/[+#]/g,'')
          );
          const missing = allRequired.filter(r => !matchLang(r));
          if (missing.length === 0) return { tier: 'full', missingLangs: [] };
          // Has primary language but missing some/all secondary
          if (primaryLangReq && matchLang(primaryLangReq)) return { tier: 'primary', missingLangs: missing };
          return { tier: 'none', missingLangs: missing };
        };

        const resultCap = mode === 'person' ? 3 : 20;
        const allSorted = scored.sort((a, b) => b.score - a.score);

        const fullMatches    = allSorted.filter(p => getMatchTier(p).tier === 'full')
          .map(p => ({ ...p, matchTier: 'full'    as const, missingLangs: [] as string[] }));
        const partialMatches = allSorted.filter(p => getMatchTier(p).tier === 'primary')
          .map(p => ({ ...p, matchTier: 'primary' as const, missingLangs: getMatchTier(p).missingLangs }));
        const nearMatches    = allSorted.filter(p => getMatchTier(p).tier === 'none')
          .map(p => ({ ...p, matchTier: 'none'    as const, missingLangs: getMatchTier(p).missingLangs }));

        const presorted = [
          ...fullMatches,
          ...partialMatches,
          ...nearMatches,
        ].slice(0, resultCap);

        // Update searchQuality
        if (allRequired.length > 0 && fullMatches.length === 0 && partialMatches.length === 0) {
          searchQuality = 'none';
        } else if (allRequired.length > 0 && fullMatches.length < 3) {
          if (searchQuality === 'good') searchQuality = 'partial';
        }

        const top15 = presorted.slice(0, 15);
        await Promise.all(top15.map(async (p) => {
          p.commitCalendar = await getYearContributions(p.handle, token);
        }));
        
        let finalCandidates = presorted
          .map(p => ({ ...p, summary: p.summary || `${p.proficientLanguages.join(', ')} developer with ${p.stars} stars across ${p.own_repos} repos.` }))
          .filter(p => p.score >= 3);

        // Re-order person results by AI's identity ranking if available
        if (mode === 'person' && semanticRes.orderedHandles && semanticRes.orderedHandles.length > 0) {
          const ordered = semanticRes.orderedHandles
            .map(h => finalCandidates.find(p => p.handle === h))
            .filter(Boolean) as typeof finalCandidates;
          const rest = finalCandidates.filter(p => !semanticRes.orderedHandles!.includes(p.handle));
          finalCandidates = [...ordered, ...rest];
        }

        const final = finalCandidates;

        send({ type: 'done', data: final, searchQuality, locationFiltered: !!(locationInfo && mode !== 'person') });
        controller.close();

      } catch (err: any) {
        console.error('ENGINE ERROR:', err.message);
        send({ type: 'error', message: `ENGINE ERROR: ${err.message}` });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}
