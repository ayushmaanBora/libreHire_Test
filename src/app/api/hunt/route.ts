// src/app/api/hunt/route.ts
import { pipeline, env } from '@xenova/transformers';

// Skip local model checks since we are running serverless
env.allowLocalModels = false;

class PipelineSingleton {
    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
    static instance: any = null;

    static async getInstance(progress_callback: any = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

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

// Domain-specific search keywords for each role — used for bio search and repo search
// These surface people who self-identify with the role or have built relevant projects.
const ROLE_SEARCH_KEYWORDS: Record<string, string[]> = {
  kernel:            ['kernel', 'linux kernel', 'driver', 'kernel module', 'bootloader', 'operating system'],
  firmware:          ['firmware', 'RTOS', 'embedded', 'microcontroller', 'bare-metal', 'HAL'],
  embedded:          ['embedded', 'IoT', 'RTOS', 'microcontroller', 'Arduino', 'STM32'],
  systems:           ['systems programming', 'operating system', 'compiler', 'runtime', 'memory allocator'],
  'low-level':       ['low-level', 'assembly', 'bootloader', 'bare-metal', 'BIOS', 'UEFI'],
  rust:              ['rust', 'cargo', 'tokio', 'async'],
  golang:            ['golang', 'go', 'goroutine', 'gin'],
  backend:           ['backend', 'API', 'microservice', 'server', 'REST', 'GraphQL'],
  frontend:          ['frontend', 'react', 'vue', 'angular', 'next.js', 'svelte'],
  fullstack:         ['fullstack', 'full-stack', 'MERN', 'MEAN'],
  'full stack':      ['fullstack', 'full-stack', 'MERN', 'MEAN'],
  'machine learning':['machine learning', 'deep learning', 'neural network', 'tensorflow', 'pytorch'],
  ml:                ['machine learning', 'deep learning', 'neural network', 'tensorflow', 'pytorch'],
  ai:                ['artificial intelligence', 'machine learning', 'deep learning', 'LLM', 'transformer'],
  'data engineer':   ['data engineering', 'ETL', 'data pipeline', 'spark', 'airflow'],
  'data scientist':  ['data science', 'machine learning', 'statistics', 'pandas', 'jupyter'],
  data:              ['data', 'analytics', 'machine learning', 'spark'],
  devops:            ['devops', 'CI/CD', 'terraform', 'kubernetes', 'docker', 'infrastructure'],
  sre:               ['SRE', 'site reliability', 'monitoring', 'observability'],
  platform:          ['platform', 'infrastructure', 'kubernetes', 'cloud'],
  security:          ['security', 'penetration testing', 'vulnerability', 'cryptography', 'CTF'],
  qa:                ['testing', 'QA', 'test automation', 'selenium', 'cypress'],
  'quality assurance':['testing', 'QA', 'test automation', 'selenium', 'cypress'],
  testing:           ['testing', 'test automation', 'selenium', 'cypress', 'jest'],
  mobile:            ['mobile', 'iOS', 'Android', 'React Native', 'Flutter'],
  android:           ['Android', 'Kotlin', 'Jetpack Compose'],
  ios:               ['iOS', 'Swift', 'SwiftUI', 'UIKit'],
  blockchain:        ['blockchain', 'smart contract', 'solidity', 'web3', 'DeFi'],
  web3:              ['web3', 'blockchain', 'smart contract', 'DeFi', 'solidity'],
  game:              ['game', 'game engine', 'Unity', 'Unreal', 'OpenGL', 'Vulkan'],
  graphics:          ['graphics', 'rendering', 'OpenGL', 'Vulkan', 'shader', 'ray tracing'],
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

  // Role at/of Company pattern (e.g. CTO of Zerodha)
  const rolePattern = /\b(cto|ceo|founder|co-founder|creator|lead|head of|director|manager|engineer|developer|dev|designer)\s+(?:at|of)\s+([A-Za-z0-9\-_]{2,30})\b/i;
  const roleMatch = query.match(rolePattern);
  if (roleMatch) {
    const company = roleMatch[2].trim();
    const locations = ['bangalore', 'bengaluru', 'delhi', 'mumbai', 'hyderabad', 'chennai', 'pune', 'india', 'london', 'berlin', 'nyc', 'sf', 'germany', 'uk', 'usa', 'canada', 'singapore'];
    if (!locations.includes(company.toLowerCase())) {
      return company;
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
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gemini: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callClaude(prompt: string, key: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 4096, messages: [{ role: 'user', content: prompt }], temperature: 0 })
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
    body: JSON.stringify({ model: modelName || 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0, response_format: { type: 'json_object' } })
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
): { displayScore: number; relevanceScore: number; breakdown: ScoreBreakdown & { locationMatch: number, semanticMatch: number } } {
  const bd: ScoreBreakdown & { locationMatch: number, semanticMatch: number } = { relevance: 0, activityRecency: 0, codeQuality: 0, profileSignal: 0, locationMatch: 0, semanticMatch: 0 };
  const topLangs = langBars.map(l => l.name.toLowerCase());
  const bioText = (user.bio || '').toLowerCase();
  const nameText = (user.name || user.login || '').toLowerCase();

  // ── RELEVANCE (sorting only, NOT shown as score) ──────────────────────
  const langNameSet = new Set(langBars.map(l => l.name.toLowerCase()));
  const top3Langs = topLangs.slice(0, 3);
  let relevanceScore = 0;

  if (mode === 'person') {
    const allText = bioText + ' ' + nameText + ' ' + (user.company || '').toLowerCase();
    const loginLower = (user.login || '').toLowerCase();
    const hits = queryTerms.filter(t => allText.includes(t)).length;
    relevanceScore = Math.min(40, (hits / Math.max(queryTerms.length, 1)) * 40);
    const queryLower = queryTerms.join(' ');
    const loginMatch = queryTerms.some(t => loginLower === t);
    const fullNameMatch = nameText && queryLower.includes(nameText);
    const nameMatch = queryTerms.some(t => loginLower === t || nameText.includes(t));
    if (loginMatch) relevanceScore = 40;
    else if (fullNameMatch) relevanceScore = Math.max(relevanceScore, 38);
    else if (nameMatch) relevanceScore = Math.max(relevanceScore, 30);
  } else if (constraints) {
    const mustL = constraints.must.map(l => l.toLowerCase());
    const negL  = constraints.negative.map(l => l.toLowerCase());
    const primaryLang = topLangs[0] || '';
    const primaryIsNeg = negL.some(n => langExact(primaryLang, n));
    const negPct = langBars.filter(l => negL.some(n => langExact(l.name, n))).reduce((a, l) => a + l.percentage, 0);
    if (primaryIsNeg && negPct > 40) {
      relevanceScore = Math.max(0, 5 - Math.floor(negPct / 15));
    } else {
      let mustPct = 0;
      for (const m of mustL) { const bar = langBars.find(l => langExact(l.name, m)); mustPct += bar?.percentage || 0; }
      const primaryInMust = mustL.some(m => langExact(primaryLang, m));
      const top3InMust = top3Langs.some(l => mustL.some(m => langExact(l, m)));
      if (primaryInMust) relevanceScore = Math.min(40, 28 + Math.min(12, mustPct / 10));
      else if (top3InMust) relevanceScore = Math.min(40, 16 + Math.min(12, mustPct / 10));
      else relevanceScore = Math.min(12, mustPct / 5);
      const roleTerms = queryTerms.filter(t => !mustL.includes(t) && !negL.includes(t));
      relevanceScore = Math.min(40, relevanceScore + roleTerms.filter(t => bioText.includes(t)).length * 2);
    }
  } else {
    const langTerms = queryTerms.filter(t => langNameSet.has(t));
    const roleTerms = queryTerms.filter(t => !langTerms.includes(t));
    const primaryLangTerm = langTerms[0] || '';
    const secondaryLangTerms = langTerms.slice(1);
    const primaryBar = langBars.find(l => langExact(l.name, primaryLangTerm));
    const primaryPct = primaryBar?.percentage || 0;
    const primaryRank = primaryBar ? langBars.indexOf(primaryBar) : 99;
    const primaryScore = !primaryLangTerm ? 20 : primaryPct >= 30 ? 32 : primaryPct >= 15 ? 26 : primaryPct >= 5 ? 18 : primaryPct >= 1 ? 8 : 0;
    const rankBonus = primaryRank === 0 ? 8 : primaryRank === 1 ? 4 : 0;
    const secondaryScore = Math.min(8, secondaryLangTerms.filter(t => { const bar = langBars.find(l => langExact(l.name, t)); return bar && bar.percentage >= 1; }).length * 4);
    const bioScore = Math.min(4, roleTerms.filter(t => bioText.includes(t)).length * 2);
    relevanceScore = Math.min(40, Math.max(0, primaryScore + rankBonus + secondaryScore + bioScore));
  }
  if (companySignal && mode !== 'person') {
    const cLower = companySignal.toLowerCase();
    const profileText = [(user.company || ''), (user.bio || ''), (user.login || '')].join(' ').toLowerCase();
    if (profileText.includes(cLower)) relevanceScore = Math.min(40, relevanceScore + 12);
  }
  if (semanticEval) relevanceScore += (semanticEval.score / 100) * 15;

  // ── DISPLAY SCORE: pure profile quality ────────────────────────────────
  // Calibration targets: Torvalds(244K★)→93, Manas(678★,OS builder)→85, avg(50★)→50

  const now = Date.now();
  const own = repos.filter(r => !r.fork);
  const stars = own.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const forks = own.reduce((a, r) => a + (r.forks_count || 0), 0);
  const followers = user.followers || 0;
  const recentlyPushed = own.filter(r => new Date(r.pushed_at).getTime() > now - 365*86400000).length;
  const avgImpact = own.length > 0 ? Math.log10(Math.max(stars / own.length, 1)) : 0;

  // CODE IMPACT (35 pts) — stars + forks + depth bonus (stars-per-repo)
  const starPts = Math.log10(Math.max(stars, 1)) * 8;
  const forkPts = Math.log10(Math.max(forks, 1)) * 4;
  const depthBonus = own.length > 0 ? Math.min(12, Math.log10(Math.max(stars / own.length, 1)) * 5) : 0;
  bd.codeQuality = Math.min(35, starPts + forkPts + depthBonus);

  // INFLUENCE (25 pts) — followers + stars as social proof
  bd.semanticMatch = Math.min(25, Math.log10(Math.max(followers, 1)) * 6 + Math.log10(Math.max(stars, 1)) * 3);

  // ACTIVITY (25 pts) — recently pushed repos + impact intensity + repo diversity
  const repoBonus = stars > 0 ? Math.min(5, Math.log10(Math.max(user.public_repos || 1, 1)) * 3) : 0;
  bd.activityRecency = Math.min(25,
    Math.min(10, recentlyPushed * 2) +
    Math.min(12, avgImpact * 7) +
    repoBonus
  );

  // PROFILE (15 pts) — completeness + reachability
  let pts = 0;
  if (user.email) pts += 3;
  if (user.bio?.length > 20) pts += 3;
  if (user.blog) pts += 2;
  if (user.twitter_username) pts += 2;
  if (user.name && user.name !== user.login) pts += 2;
  if (user.location) pts += 2;
  if (user.company) pts += 1;
  bd.profileSignal = Math.min(15, pts);

  // Store relevance in breakdown (NOT counted in displayScore)
  bd.relevance = relevanceScore;
  bd.locationMatch = 0;

  // TOTAL: code(35) + influence(25) + activity(25) + profile(15) = max 100
  const qualityRaw = bd.codeQuality + bd.semanticMatch + bd.activityRecency + bd.profileSignal;
  const displayScore = Math.min(100, Math.round(qualityRaw));

  return { displayScore: Math.max(0, displayScore), relevanceScore: Math.max(0, relevanceScore), breakdown: bd };
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
// REPO-DOMAIN SEARCH — find devs who have BUILT relevant projects
// Instead of searching for users who happen to have a C repo, search for
// repositories matching domain keywords ("kernel", "driver", "linux") + language,
// then extract the unique owners. This is the highest-signal search strategy.
// ─────────────────────────────────────────────────────────────────────────────

async function searchByDomainRepos(
  roleKey: string,
  mustLangs: string[],
  gHeaders: HeadersInit
): Promise<Map<string, any>> {
  const keywords = ROLE_SEARCH_KEYWORDS[roleKey];
  if (!keywords || !keywords.length) return new Map();

  const primaryLang = mustLangs[0] || '';
  const repoQueries: string[] = [];

  // Build repo search queries combining different domain keywords with the primary language
  for (const kw of keywords.slice(0, 4)) {
    const langPart = primaryLang ? ` language:"${primaryLang}"` : '';
    repoQueries.push(`${kw}${langPart} stars:>0 fork:false`);
  }

  // Execute repo searches in parallel
  const repoResults = await Promise.all(
    repoQueries.map(q =>
      fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=40&sort=stars&order=desc`, { headers: gHeaders })
        .then(r => r.json()).catch(() => ({ items: [] }))
    )
  );

  // Extract unique owners (Users only, not Organizations)
  const ownerMap = new Map<string, any>();
  for (const data of repoResults) {
    for (const repo of (data.items || [])) {
      if (repo.owner && repo.owner.type === 'User' && !ownerMap.has(repo.owner.login)) {
        ownerMap.set(repo.owner.login, repo.owner);
      }
    }
  }
  return ownerMap;
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
          ? `\nIMPORTANT: The user is searching for a specific person ("${query}"). Return ONLY the handle of the exact person they are looking for in orderedHandles. If you are not completely certain, or if a candidate just has a similar name but isn't the right person, DO NOT include them in orderedHandles. False positives are unacceptable.`
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

  const queries: string[] = [];

  // When location is given, ONLY generate location-anchored queries.
  // Never add a skill-only fallback — that is the #1 cause of wrong-city devs appearing.
  if (locationParts.length > 0) {
    // Use LOCATION_ALIASES if we recognise the city, else use what the user typed
    const cityVariants: string[] = [];
    for (const [, aliases] of Object.entries(LOCATION_ALIASES)) {
      if (aliases.some(a => locationParts.some(lp => lp.toLowerCase() === a || a.includes(lp.toLowerCase())))) {
        cityVariants.push(...aliases.slice(0, 4));
        break;
      }
    }
    // Fallback: just use what the user typed
    if (cityVariants.length === 0) cityVariants.push(...locationParts);

    // ── LAYER 1: BIO-KEYWORD QUERIES (highest signal) ──────────────────────
    // Find people who self-identify with the role in their GitHub bio.
    // e.g. location:"bangalore" kernel linux in:bio type:user
    const bioKeywords = ROLE_SEARCH_KEYWORDS[roleKey] || [];
    const bioPhrases = bioKeywords.slice(0, 2); // Use first 2 domain terms for bio search
    const locQueries: string[] = [];

    for (const locV of cityVariants.slice(0, 3)) {
      // Bio-keyword queries: find self-identified role experts
      if (bioPhrases.length > 0) {
        locQueries.push(`location:"${locV}" ${bioPhrases.join(' ')} in:bio type:user`.trim());
      }
      // Bio + language hybrid: domain keyword in bio + language filter
      if (bioPhrases.length > 0 && langFilter) {
        locQueries.push(`location:"${locV}" ${langFilter} ${bioPhrases[0]} in:bio type:user`.trim());
      }
      // ── LAYER 3: LANGUAGE-ONLY QUERIES (broadest fallback) ────────────────
      if (langFilter) locQueries.push(`location:"${locV}" ${langFilter} type:user`.trim());
      for (const secL of secondaryLangs) {
        locQueries.push(`location:"${locV}" language:"${secL}" type:user`.trim());
      }
    }
    queries.push(...locQueries.slice(0, 12));
  } else {
    // No location — pure skill search
    const bioKeywords = ROLE_SEARCH_KEYWORDS[roleKey] || [];
    if (bioKeywords.length > 0) {
      queries.push(`${bioKeywords[0]} ${bioKeywords[1] || ''} in:bio type:user`.trim());
      if (langFilter) queries.push(`${langFilter} ${bioKeywords[0]} in:bio type:user`.trim());
    }
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
        const gHeaders: HeadersInit = githubToken && githubToken !== 'dummy'
          ? { Authorization: `token ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' }
          : { 'User-Agent': 'libreHire-Test', 'X-GitHub-Api-Version': '2022-11-28' };
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
          try { require('fs').writeFileSync('debug.json', JSON.stringify({ jobProfile, languages, country, state, city, queries, locationInfo }, null, 2)); } catch { /* read-only FS on serverless — skip */ }
          console.log('[DEBUG] deterministic request received:', { jobProfile, languages, country, state, city });
          console.log('[DEBUG] queries generated:', queries);

          // Jump directly to Stage 2 (skip AI call)
          // ── LAYER 2: REPO-DOMAIN SEARCH (run in parallel with user search) ──
          const detRoleKey = PROFILE_TO_ROLE[jobProfile] || jobProfile.toLowerCase();
          const detMustLangs = (languages && languages.length > 0) ? languages : (constraints?.must || []);
          send({ type: 'progress', step: 2, total: 6, label: `Running ${queries.length} precision searches + repo domain scan...` });

          const [searchResults, repoOwnerMap] = await Promise.all([
            Promise.all(
              queries.map((q: string) =>
                fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=100&sort=followers&order=desc`, { headers: gHeaders })
                  .then(r => r.json()).catch(() => ({ items: [] }))
              )
            ),
            searchByDomainRepos(detRoleKey, detMustLangs, gHeaders)
          ]);

          // Track how many queries each user appeared in — users in more queries
          // have repos in more of the selected languages (the intersection we want).
          const appearanceCount = new Map<number, number>();
          const userMap = new Map<number, any>();
          for (const data of searchResults) {
            for (const item of (data.items || [])) {
              if (item.type === 'User') {
                appearanceCount.set(item.id, (appearanceCount.get(item.id) || 0) + 1);
                if (!userMap.has(item.id)) userMap.set(item.id, item);
              }
            }
          }

          // Merge repo-domain owners into user pool (they get +2 appearance bonus for being domain-relevant)
          for (const [login, owner] of repoOwnerMap) {
            if (!userMap.has(owner.id)) {
              userMap.set(owner.id, owner);
              appearanceCount.set(owner.id, 3); // high priority — they built relevant projects
            } else {
              appearanceCount.set(owner.id, (appearanceCount.get(owner.id) || 0) + 2);
            }
          }

          // Sort by appearance count DESC — users with all languages first
          const sortedByOverlap = [...userMap.values()].sort((a, b) =>
            (appearanceCount.get(b.id) || 0) - (appearanceCount.get(a.id) || 0)
          );
          const uniqueItems = sortedByOverlap.slice(0, 100); // take more, filter later
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
            const { displayScore, relevanceScore, breakdown } = computeScore(user, langBars, events, queryTerms, repos, constraints, 'technical', locationInfo, null, evalRes);
            const own = repos.filter((r: any) => !r.fork);
            return {
              handle: user.login, name: user.name || user.login, avatar: user.avatar_url,
              bio: user.bio || '', location: user.location || null, company: user.company || null,
              followers: user.followers || 0, own_repos: own.length,
              stars: own.reduce((a: number, r: any) => a + (r.stargazers_count || 0), 0),
              contactDetails: extractContactDetails(user), languages: langBars,
              proficientLanguages: langBars.slice(0, 3).map((l: LanguageBar) => l.name),
              commitCalendar: [] as CommitDay[], topRepos: getTopRepoSummaries(repos),
              score: displayScore, relevance: relevanceScore, scoreBreakdown: breakdown, summary: evalRes?.assessment || '', accountCreated: user.created_at,
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

          const detWithTiers = scored.map(p => {
            const { tier, missingLangs } = getDetTier(p);
            return { ...p, matchTier: tier, missingLangs };
          });
          
          // STRICT STACK ALIGNMENT: We explicitly drop tier 'none' (those who lack the primary language).
          // We'd rather return highly qualified engineers than irrelevant devs.
          const detValid = detWithTiers.filter(p => p.matchTier !== 'none');
          
          // STRICT QUALITY RANKING: Sort strictly by quality score, ignoring match tier grouping
          const detPresorted = detValid.sort((a, b) => b.score - a.score).slice(0, 20);
          
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

        // ── OPEN-ENDED SEARCH (Stateless Hybrid Search) ─────────────────────
        const userQuery = body.userQuery || '';

        // ── STAGE 1: AI QUERY GENERATION (Provider Agnostic) ───────────────
        send({ type: 'progress', step: 1, total: 6, label: 'Parsing search intent...' });

        const intentPrompt = `You are a senior technical recruiter building GitHub search parameters.
Parse the following developer search query.
Query: "${userQuery}"

Extract the intent into this strict JSON format:
{
  "primary_locations": ["city or country 1", "city or country 2"],
  "primary_language": "main programming language",
  "secondary_languages": ["lang1", "lang2"],
  "semantic_keywords": ["keyword1", "keyword2"]
}

Rules:
- primary_locations: Array of locations. If none, return [].
- primary_language: The main programming language required. If none, return "".
- secondary_languages: Other languages or frameworks.
- semantic_keywords: Technical domain keywords, company names, project names, or specific tools mentioned (e.g., "kernel", "zerodha", "react"). Return at most 5 keywords.
- Return ONLY JSON.`;

        let parsedIntent;
        try {
          const aiResponse = await callAI(intentPrompt, provider, llmKey, baseUrl, modelName);
          parsedIntent = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;
          if (!parsedIntent.semantic_keywords) parsedIntent = { primary_locations: [], primary_language: '', secondary_languages: [], semantic_keywords: [userQuery] };
        } catch (err) {
          console.warn('AI Parsing failed, falling back to basic extraction:', err);
          parsedIntent = { primary_locations: [], primary_language: '', secondary_languages: [], semantic_keywords: [userQuery] };
        }

        const { primary_locations, primary_language, secondary_languages, semantic_keywords } = parsedIntent;

        // ── STAGE 2: MULTI-THREADED GITHUB FETCHING ─────────────────────────
        send({ type: 'progress', step: 2, total: 6, label: 'Running parallel GitHub searches...' });

        const ghQueries: string[] = [];
        const locFilter = primary_locations.length > 0 ? `location:"${primary_locations[0]}"` : '';
        const langFilter = primary_language ? `language:"${primary_language}"` : '';
        const baseQuery = [locFilter, langFilter].filter(Boolean).join(' ');

        if (semantic_keywords.length > 0) {
          const kw = semantic_keywords[0];
          ghQueries.push(`${baseQuery} ${kw} in:bio type:user`.trim());
          ghQueries.push(`${baseQuery} ${kw} in:readme type:user`.trim());
          ghQueries.push(`${baseQuery} ${kw} type:user`.trim());
          if (semantic_keywords[1]) ghQueries.push(`${baseQuery} ${semantic_keywords[1]} type:user`.trim());
        } else {
          ghQueries.push(`${baseQuery} type:user`.trim());
        }
        
        // Ensure we have fallback queries if no keywords
        if (ghQueries.length === 0) ghQueries.push('type:user');

        const uniqueQueries = [...new Set(ghQueries)].slice(0, 5);
        console.log('[DEBUG] GitHub Queries:', uniqueQueries);

        const searchResults = await Promise.all(
          uniqueQueries.map(q =>
            fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=40&sort=followers&order=desc`, { headers: gHeaders })
              .then(r => r.json()).catch(() => ({ items: [] }))
          )
        );

        const userMap = new Map();
        for (const data of searchResults) {
          for (const item of (data.items || [])) {
            if (item.type === 'User' && !userMap.has(item.id)) {
              userMap.set(item.id, item);
            }
          }
        }

        const uniqueItems = [...userMap.values()].slice(0, 80);
        if (!uniqueItems.length) {
          send({ type: 'error', message: 'No developers found matching your criteria.' });
          controller.close(); return;
        }

        // ── STAGE 3: DATA ENRICHMENT ────────────────────────────────────────
        send({ type: 'progress', step: 3, total: 6, label: `Fetching profiles for ${uniqueItems.length} candidates...` });
        const enriched = [];
        for (let i = 0; i < uniqueItems.length; i += 15) {
          const batch = uniqueItems.slice(i, i + 15);
          const res = await Promise.all(batch.map(async (item) => {
            try {
              const [uRes, rRes, eRes] = await Promise.all([
                fetch(`https://api.github.com/users/${item.login}`, { headers: gHeaders }),
                fetch(`https://api.github.com/users/${item.login}/repos?per_page=40&sort=pushed`, { headers: gHeaders }),
                fetch(`https://api.github.com/users/${item.login}/events/public?per_page=30`, { headers: gHeaders }),
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

        // ── STAGE 4: LOCAL JIT EMBEDDING & COSINE SCORING ───────────────────
        send({ type: 'progress', step: 4, total: 6, label: 'Running local semantic scoring...' });
        
        const extractor = await PipelineSingleton.getInstance();
        const keywordString = semantic_keywords.join(' ');
        
        let keywordEmbedding: any = null;
        if (keywordString) {
            const out = await extractor(keywordString, { pooling: 'mean', normalize: true });
            keywordEmbedding = out.data;
        }

        function cosineSimilarity(a: any, b: any) {
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            for (let i = 0; i < a.length; i++) {
                dotProduct += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
            }
            if (normA === 0 || normB === 0) return 0;
            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }

        const withLangs = await Promise.all(
          enriched.map(async ({ user, repos, events }) => {
            const langBars = await getLanguageProficiency(user.login, repos, gHeaders, primary_language ? [primary_language, ...secondary_languages] : []);
            
            let semanticScore = 0;
            if (keywordEmbedding) {
                const topRepos = getTopRepoSummaries(repos);
                const candDoc = `${user.bio || ''} ${topRepos.map(r => r.name + ' ' + (r.description || '')).join(' ')}`;
                if (candDoc.trim()) {
                    const candOut = await extractor(candDoc, { pooling: 'mean', normalize: true });
                    semanticScore = cosineSimilarity(keywordEmbedding, candOut.data);
                }
            }
            
            return { user, repos, events, langBars, semanticScore };
          })
        );

        // ── STAGE 5: RECIPROCAL RANK FUSION (RRF) ───────────────────────────
        send({ type: 'progress', step: 5, total: 6, label: 'Fusing scores & ranking...' });

        const queryTerms = [...semantic_keywords, primary_language, ...secondary_languages].filter(Boolean);
        const scored = withLangs.map(({ user, repos, events, langBars, semanticScore }) => {
          const { displayScore, relevanceScore, breakdown } = computeScore(
            user, langBars, events, queryTerms, repos, null, 'open', null, null, null
          );
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
            proficientLanguages: langBars.slice(0, 3).map((l: any) => l.name),
            commitCalendar: [] as CommitDay[],
            topRepos: getTopRepoSummaries(repos),
            heuristicScore: displayScore + relevanceScore,
            semanticScore,
            scoreBreakdown: breakdown,
            summary: `${langBars[0]?.name || 'Developer'} expert with ${own.length} repos.`,
            accountCreated: user.created_at,
            score: 0,
            rrfScore: 0
          };
        });

        // Calculate RRF
        const k = 60;
        const sortedByHeuristic = [...scored].sort((a, b) => b.heuristicScore - a.heuristicScore);
        const sortedBySemantic = [...scored].sort((a, b) => b.semanticScore - a.semanticScore);
        
        const heuristicRankMap = new Map();
        sortedByHeuristic.forEach((c, i) => heuristicRankMap.set(c.handle, i + 1));
        
        const semanticRankMap = new Map();
        sortedBySemantic.forEach((c, i) => semanticRankMap.set(c.handle, i + 1));
        
        scored.forEach(c => {
            const hRank = heuristicRankMap.get(c.handle);
            const sRank = semanticRankMap.get(c.handle);
            c.rrfScore = (1 / (k + hRank)) + (1 / (k + sRank));
            c.score = c.heuristicScore; // keep display score
        });

        const finalCandidates = scored.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, 20);

        const top15 = finalCandidates.slice(0, 15);
        await Promise.all(top15.map(async (p) => {
          p.commitCalendar = await getYearContributions(p.handle, token);
        }));

        send({ type: 'done', data: finalCandidates, searchQuality: 'good', locationFiltered: primary_locations.length > 0 });
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