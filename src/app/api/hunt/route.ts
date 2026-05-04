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
  kernel:            { must: ['C','C++','Assembly','Rust'],      negative: ['JavaScript','TypeScript','Python','Java','PHP','Ruby','Go','Swift','Kotlin','Dart'] },
  firmware:          { must: ['C','C++','Assembly','Rust','Zig'],negative: ['JavaScript','TypeScript','Python','Java','PHP','Ruby','Go','Swift','Kotlin'] },
  embedded:          { must: ['C','C++','Assembly','Rust','Zig'],negative: ['JavaScript','TypeScript','Java','PHP','Ruby','Go','Swift','Kotlin','Dart'] },
  systems:           { must: ['C','C++','Rust','Assembly','Zig'],negative: ['JavaScript','TypeScript','PHP','Ruby','Dart'] },
  'low-level':       { must: ['C','C++','Assembly','Rust','Zig'],negative: ['JavaScript','TypeScript','Python','PHP','Ruby','Dart'] },
  rust:              { must: ['Rust'],                            negative: ['JavaScript','TypeScript','PHP','Ruby','Dart'] },
  golang:            { must: ['Go'],                             negative: ['PHP','Ruby','Dart','Assembly'] },
  backend:           { must: ['Go','Rust','Python','Java','C++','C#','Ruby'], negative: ['HTML','CSS'] },
  frontend:          { must: ['TypeScript','JavaScript'],        negative: ['C','C++','Assembly','Zig'] },
  'machine learning':{ must: ['Python','Julia','C++'],           negative: ['PHP','Ruby','Dart','Assembly'] },
  ml:                { must: ['Python','Julia','C++'],           negative: ['PHP','Ruby','Dart','Assembly'] },
  ai:                { must: ['Python','Julia','C++'],           negative: ['PHP','Ruby','Dart','Assembly'] },
  devops:            { must: ['Go','Python','Shell','HCL'],      negative: ['Assembly'] },
  mobile:            { must: ['Swift','Kotlin','Dart'],          negative: ['Assembly'] },
  android:           { must: ['Kotlin','Java'],                  negative: ['Swift','Assembly'] },
  ios:               { must: ['Swift','Objective-C'],            negative: ['Kotlin','Assembly'] },
  blockchain:        { must: ['Solidity','Rust','TypeScript'],   negative: ['Assembly','Fortran'] },
  web3:              { must: ['Solidity','Rust','TypeScript'],   negative: ['Assembly','Fortran'] },
};

// Person-search triggers: these mean "find this human", not "find devs with skill"
const PERSON_TRIGGERS = ['founder','cto','ceo','creator','author','maintainer','lead','head of','director','built','made','who made','who created','who is','person'];

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

async function getLanguageProficiency(login: string, repos: any[], gHeaders: HeadersInit): Promise<LanguageBar[]> {
  const targets = repos.filter(r => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 12);
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
  return Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, bytes]) => ({ name, bytes, percentage: Math.round((bytes / total) * 1000) / 10 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function computeScore(
  user: any, langBars: LanguageBar[], events: any[], queryTerms: string[],
  repos: any[], constraints: { must: string[]; negative: string[] } | null, mode: string
): { total: number; breakdown: ScoreBreakdown } {
  const bd: ScoreBreakdown = { relevance: 0, activityRecency: 0, codeQuality: 0, profileSignal: 0 };
  const topLangs = langBars.map(l => l.name.toLowerCase());
  const bioText = (user.bio || '').toLowerCase();
  const nameText = (user.name || user.login || '').toLowerCase();

  // RELEVANCE
  if (mode === 'person') {
    // For person searches: name/bio/company match is the signal
    const allText = bioText + ' ' + nameText + ' ' + (user.company || '').toLowerCase();
    const hits = queryTerms.filter(t => allText.includes(t)).length;
    bd.relevance = Math.min(40, (hits / Math.max(queryTerms.length, 1)) * 40);
  } else if (constraints) {
    const mustL = constraints.must.map(l => l.toLowerCase());
    const negL = constraints.negative.map(l => l.toLowerCase().replace(/\+/g, ' '));
    const primary = topLangs[0] || '';
    const top3 = topLangs.slice(0, 3);
    const primaryMatch = mustL.some(m => primary.includes(m) || m.includes(primary));
    const top3Match = top3.some(l => mustL.some(m => l.includes(m) || m.includes(l)));
    const primaryIsNeg = negL.some(n => primary.includes(n) || n.includes(primary));
    const negPct = langBars.filter(l => negL.some(n => l.name.toLowerCase().includes(n))).reduce((a, l) => a + l.percentage, 0);

    if (primaryIsNeg && negPct > 40) bd.relevance = Math.max(0, 8 - negPct / 10);
    else if (primaryMatch) bd.relevance = 40;
    else if (top3Match) bd.relevance = 26;
    else bd.relevance = Math.min(18, topLangs.filter(l => mustL.some(m => l.includes(m))).length * 6);

    bd.relevance = Math.min(40, bd.relevance + queryTerms.filter(t => bioText.includes(t)).length * 3);
  } else {
    // Open mode: bio + language name match
    const allText = bioText + ' ' + topLangs.join(' ');
    const hits = queryTerms.filter(t => allText.includes(t)).length;
    bd.relevance = Math.min(40, (hits / Math.max(queryTerms.length, 1)) * 40);
  }

  // ACTIVITY RECENCY
  const now = Date.now();
  const ev90 = events.filter(e => ['PushEvent','PullRequestEvent','CreateEvent'].includes(e.type) && new Date(e.created_at).getTime() > now - 90*86400000);
  const ev180 = events.filter(e => ['PushEvent','PullRequestEvent'].includes(e.type) && new Date(e.created_at).getTime() > now - 180*86400000);
  const cnt90 = ev90.reduce((a, e) => a + (e.type === 'PushEvent' ? (e.payload?.commits?.length ?? 1) : 1), 0);
  const repos365 = repos.filter(r => !r.fork && new Date(r.pushed_at).getTime() > now - 365*86400000).length;
  bd.activityRecency = Math.min(30, Math.min(20, Math.log10(Math.max(cnt90,1)+1)*10) + Math.min(7, repos365*1.2) + (ev180.length > ev90.length*1.2 ? 3 : 0));

  // CODE QUALITY
  const own = repos.filter(r => !r.fork);
  const stars = own.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const forks = own.reduce((a, r) => a + (r.forks_count || 0), 0);
  bd.codeQuality = Math.min(20, Math.min(15, Math.log10(Math.max(stars,1))*5) + Math.min(5, Math.log10(Math.max(forks,1))*3));

  // PROFILE SIGNAL
  let pts = 0;
  if (user.email) pts += 3;
  if (user.bio?.length > 20) pts += 2;
  if (user.blog) pts += 2;
  if (user.twitter_username) pts += 1;
  if (user.location) pts += 1;
  if (user.name && user.name !== user.login) pts += 1;
  bd.profileSignal = Math.min(10, pts);

  return { total: Math.round(bd.relevance + bd.activityRecency + bd.codeQuality + bd.profileSignal), breakdown: bd };
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
// MAIN HUNT ROUTE — Server-Sent Events
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const encode = makeEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: object) => { try { controller.enqueue(encode(msg)); } catch { /* closed */ } };

      try {
        const { userQuery, provider, llmKey, githubToken, baseUrl, modelName } = await req.json();
        const gHeaders: HeadersInit = { Authorization: `token ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' };
        const token = githubToken;

        const { mode, constraints } = detectQueryMode(userQuery);

        // ── STAGE 1: AI QUERY GENERATION ───────────────────────────────────
        send({ type: 'progress', step: 1, total: 6, label: 'Understanding your search intent...' });

        const negFilter = constraints ? constraints.negative.map(l => `-language:"${l}"`).join(' ') : '';
        const mustLangs = constraints?.must || [];

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
          intentPrompt = `You are a technical recruiter building GitHub search queries.
Query: "${userQuery}"
Mode: ${mode}
${mustLangs.length ? `REQUIRED languages: ${mustLangs.join(', ')}` : 'No strict language requirement — infer from context'}
${negFilter ? `MANDATORY negative filters for all queries: ${negFilter}` : ''}

Generate 4 GitHub search queries. Return ONLY JSON:
{"queries":["q1","q2","q3","q4"],"queryTerms":["t1","t2","t3"]}

Rules:
- q1: location tag + language (e.g. "location:bangalore language:TypeScript type:user")
- q2: raw location + role keyword + language (e.g. "bangalore react developer language:TypeScript type:user")
- q3: nearby region + language (e.g. "location:karnataka language:TypeScript type:user")
- q4: skill/role keyword only, no location (e.g. "react developer language:TypeScript type:user")
- For open mode with no clear language, use in:bio to search profile text (e.g. "startup founder in:bio type:user")
- ${negFilter ? 'APPEND all negative filters to every query' : 'No negative filters needed'}
- queryTerms: 3-5 technical/role keywords (no location)`;
        }

        const params = await callAI(intentPrompt, provider, llmKey, baseUrl, modelName);
        if (!params?.queries?.length) throw new Error('AI failed to build queries.');
        const queryTerms: string[] = params.queryTerms || [];

        // ── STAGE 2: GITHUB SEARCH ─────────────────────────────────────────
        send({ type: 'progress', step: 2, total: 6, label: `Running ${params.queries.length} searches on GitHub...` });

        const searchResults = await Promise.all(
          params.queries.map((q: string) =>
            fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=25&sort=repositories&order=desc`, { headers: gHeaders })
              .then(r => r.json()).catch(() => ({ items: [] }))
          )
        );

        const seenIds = new Set<number>();
        const uniqueItems: any[] = [];
        for (const data of searchResults) {
          for (const item of (data.items || [])) {
            if (item.type === 'User' && !seenIds.has(item.id)) { seenIds.add(item.id); uniqueItems.push(item); }
          }
        }

        if (!uniqueItems.length) {
          send({ type: 'error', message: 'No developers found. Try different keywords — e.g. use their GitHub username, project name, or company.' });
          controller.close(); return;
        }

        // ── STAGE 3: ENRICHMENT ────────────────────────────────────────────
        send({ type: 'progress', step: 3, total: 6, label: `Reading ${uniqueItems.length} profiles in depth...` });

        const enriched: any[] = [];
        for (let i = 0; i < uniqueItems.length; i += 8) {
          const batch = uniqueItems.slice(i, i + 8);
          const res = await Promise.all(batch.map(async (item) => {
            try {
              const [uRes, rRes, eRes] = await Promise.all([
                fetch(`https://api.github.com/users/${item.login}`, { headers: gHeaders }),
                fetch(`https://api.github.com/users/${item.login}/repos?per_page=100&sort=pushed`, { headers: gHeaders }),
                fetch(`https://api.github.com/users/${item.login}/events/public?per_page=100`, { headers: gHeaders }),
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
          if (i + 8 < uniqueItems.length) await delay(150);
        }

        // ── STAGE 4: LANGUAGES + 1-YEAR CALENDAR ─────────────────────────
        send({ type: 'progress', step: 4, total: 6, label: 'Fetching full-year contribution history & language analysis...' });

        const withLangs = await Promise.all(
          enriched.map(async ({ user, repos, events }) => {
            const [langBars, calendar] = await Promise.all([
              getLanguageProficiency(user.login, repos, gHeaders),
              getYearContributions(user.login, token),
            ]);
            return { user, repos, events, langBars, calendar };
          })
        );

        // ── STAGE 5: SCORING ───────────────────────────────────────────────
        send({ type: 'progress', step: 5, total: 6, label: `Scoring ${withLangs.length} candidates...` });

        const scored = withLangs.map(({ user, repos, events, langBars, calendar }) => {
          const { total, breakdown } = computeScore(user, langBars, events, queryTerms, repos, constraints, mode);
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
            commitCalendar: calendar,
            topRepos: getTopRepoSummaries(repos),
            score: total,
            scoreBreakdown: breakdown,
            summary: '',
            accountCreated: user.created_at,
          };
        });

        // For person searches: cap to top 3 only — showing 20 people when
        // someone searches "CTO of Zerodha" is confusing and disrespectful.
        // For technical searches: keep top 20 for variety.
        const resultCap = mode === 'person' ? 3 : 20;
        const topCandidates = scored.sort((a, b) => b.score - a.score).slice(0, resultCap);

        // ── STAGE 6: RICH AI ASSESSMENT ────────────────────────────────────
        send({ type: 'progress', step: 6, total: 6, label: `AI reviewing code output & writing assessments...` });

        // For person mode: ask AI to also re-rank by identity match (name/bio/company)
        // so the actual person always floats to the top even if their score is close.
        const personRerankNote = mode === 'person'
          ? `IMPORTANT: The user is searching for a specific person ("${userQuery}"). If any candidate's name, bio, or company clearly matches who is being searched for, rank them FIRST regardless of score. Only include candidates who plausibly ARE this person or are very closely related. Drop anyone who is clearly unrelated.`
          : '';

        const assessPrompt = `You are a senior technical evaluator. Write rich, specific developer assessments.
Search context: "${userQuery}"
${constraints ? `Role requires: ${constraints.must.join(', ')}` : ''}
${personRerankNote}

For each developer, write a 2-3 sentence assessment that:
1. Describes what they have actually BUILT (reference their top repos and descriptions)
2. Assesses their technical depth and activity level
3. States their fit for the search query

Be specific — mention actual project names and what they do. Do NOT be generic like "strong developer with good activity".
No double quotes inside assessment strings. Use single quotes if needed.

Developers:
${JSON.stringify(topCandidates.map(p => ({
  handle: p.handle,
  name: p.name,
  bio: p.bio,
  company: p.company,
  languages: p.languages.slice(0, 4).map((l: LanguageBar) => `${l.name}(${l.percentage}%)`).join(', '),
  stars: p.stars,
  score: p.score,
  topRepos: p.topRepos.map((r: RepoSummary) => `${r.name}: ${r.description} [${r.stars}★, ${r.language}]`),
}))).slice(0, 9000)}

Return ONLY JSON: {"assessments":[{"handle":"string","assessment":"string"}]${mode === 'person' ? ',"orderedHandles":["handle1","handle2"]' : ''}}`; 

        let assessments: Record<string, string> = {};
        let personOrder: string[] = [];
        try {
          const result = await callAI(assessPrompt, provider, llmKey, baseUrl, modelName);
          for (const a of (result?.assessments || [])) assessments[a.handle] = a.assessment;
          if (mode === 'person' && result?.orderedHandles?.length) personOrder = result.orderedHandles;
        } catch (err) { console.warn('Assessment skipped:', err); }

        let finalCandidates = topCandidates
          .map(p => ({ ...p, summary: assessments[p.handle] || `${p.proficientLanguages.join(', ')} developer with ${p.stars} stars across ${p.own_repos} repos.` }))
          .filter(p => p.score >= 3);

        // Re-order person results by AI's identity ranking if available
        if (mode === 'person' && personOrder.length > 0) {
          const ordered = personOrder
            .map(h => finalCandidates.find(p => p.handle === h))
            .filter(Boolean) as typeof finalCandidates;
          const rest = finalCandidates.filter(p => !personOrder.includes(p.handle));
          finalCandidates = [...ordered, ...rest];
        }

        const final = finalCandidates;

        send({ type: 'done', data: final });
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
