import { NextResponse } from 'next/server';

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

interface CommitDay {
  date: string;
  count: number;
}

interface LanguageBar {
  name: string;
  percentage: number;
  bytes: number;
}

interface ScoreBreakdown {
  relevance: number;
  activityRecency: number;
  codeQuality: number;
  profileSignal: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HARD-CODED ROLE → LANGUAGE CONSTRAINTS
// This is intentionally NOT delegated to the LLM. LLMs try to be inclusive
// and will add Python/JS to every role. These constraints are strict by design.
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_CONSTRAINTS: Record<string, { must: string[]; negative: string[] }> = {
  kernel: {
    must: ['C', 'C++', 'Assembly', 'Rust'],
    negative: ['JavaScript', 'TypeScript', 'Python', 'Java', 'PHP', 'Ruby', 'Go', 'Swift', 'Kotlin', 'Dart', 'Jupyter+Notebook'],
  },
  firmware: {
    must: ['C', 'C++', 'Assembly', 'Rust', 'Zig'],
    negative: ['JavaScript', 'TypeScript', 'Python', 'Java', 'PHP', 'Ruby', 'Go', 'Swift', 'Kotlin'],
  },
  embedded: {
    must: ['C', 'C++', 'Assembly', 'Rust', 'Zig'],
    negative: ['JavaScript', 'TypeScript', 'Java', 'PHP', 'Ruby', 'Go', 'Swift', 'Kotlin', 'Dart'],
  },
  systems: {
    must: ['C', 'C++', 'Rust', 'Assembly', 'Zig'],
    negative: ['JavaScript', 'TypeScript', 'PHP', 'Ruby', 'Dart', 'Jupyter+Notebook'],
  },
  'low-level': {
    must: ['C', 'C++', 'Assembly', 'Rust', 'Zig'],
    negative: ['JavaScript', 'TypeScript', 'Python', 'PHP', 'Ruby', 'Dart'],
  },
  rust: {
    must: ['Rust'],
    negative: ['JavaScript', 'TypeScript', 'PHP', 'Ruby', 'Dart', 'Jupyter+Notebook'],
  },
  golang: {
    must: ['Go'],
    negative: ['JavaScript', 'PHP', 'Ruby', 'Dart', 'Jupyter+Notebook', 'Assembly'],
  },
  backend: {
    must: ['Go', 'Rust', 'Python', 'Java', 'C++', 'C#', 'Ruby'],
    negative: ['HTML', 'CSS', 'Jupyter+Notebook'],
  },
  frontend: {
    must: ['TypeScript', 'JavaScript'],
    negative: ['C', 'C++', 'Assembly', 'Rust', 'Zig', 'Go', 'Jupyter+Notebook'],
  },
  ml: {
    must: ['Python', 'Julia', 'C++'],
    negative: ['JavaScript', 'PHP', 'Ruby', 'Dart', 'Assembly'],
  },
  'machine learning': {
    must: ['Python', 'Julia', 'C++'],
    negative: ['JavaScript', 'PHP', 'Ruby', 'Dart'],
  },
  ai: {
    must: ['Python', 'Julia', 'C++'],
    negative: ['PHP', 'Ruby', 'Dart', 'Assembly'],
  },
  devops: {
    must: ['Go', 'Python', 'Shell', 'HCL'],
    negative: ['Assembly', 'Fortran', 'Jupyter+Notebook'],
  },
  mobile: {
    must: ['Swift', 'Kotlin', 'Dart'],
    negative: ['Assembly', 'Fortran', 'Jupyter+Notebook'],
  },
  android: {
    must: ['Kotlin', 'Java'],
    negative: ['Swift', 'Assembly', 'Fortran', 'Jupyter+Notebook'],
  },
  ios: {
    must: ['Swift', 'Objective-C'],
    negative: ['Kotlin', 'Assembly', 'Fortran', 'Jupyter+Notebook'],
  },
};

function detectRoleConstraints(query: string) {
  const lower = query.toLowerCase();
  // Sort by key length desc so "machine learning" matches before "ml"
  const keys = Object.keys(ROLE_CONSTRAINTS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) return ROLE_CONSTRAINTS[key];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ADAPTERS
// ─────────────────────────────────────────────────────────────────────────────

async function callGemini(prompt: string, key: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callClaude(prompt: string, key: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Claude Error: ${data.error.message}`);
  return data.content?.[0]?.text;
}

async function callUniversal(prompt: string, key: string, baseUrl: string, modelName: string) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: modelName || "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`API Error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.choices?.[0]?.message?.content;
}

async function callAI(prompt: string, provider: string, key: string, baseUrl?: string, modelName?: string) {
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      let rawOutput = '';
      if (provider === 'gemini') {
        rawOutput = await callGemini(prompt, key);
      } else if (provider === 'anthropic') {
        rawOutput = await callClaude(prompt, key);
      } else {
        const targetUrl = provider === 'openai' ? 'https://api.openai.com/v1' : (baseUrl || '');
        const targetModel = provider === 'openai' ? 'gpt-4o-mini' : (modelName || '');
        if (!targetUrl) throw new Error("Custom Provider requires a Base URL.");
        rawOutput = await callUniversal(prompt, key, targetUrl, targetModel);
      }
      if (!rawOutput) throw new Error(`${provider.toUpperCase()} returned empty output.`);
      const start = rawOutput.search(/\{|\[/);
      const end = Math.max(rawOutput.lastIndexOf('}'), rawOutput.lastIndexOf(']'));
      if (start === -1 || end === -1) throw new Error("Invalid JSON returned from AI.");
      return JSON.parse(rawOutput.substring(start, end + 1));
    } catch (err: any) {
      if (attempts >= maxAttempts - 1) throw err;
      attempts++;
      await delay(attempts * 2000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING
// ─────────────────────────────────────────────────────────────────────────────

function makeEncoder() {
  const encoder = new TextEncoder();
  return (obj: object) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function extractContactDetails(user: any): ContactDetails {
  const blog = (user.blog || '').trim();

  let linkedin: string | null = null;
  const linkedinMatch = blog.match(/linkedin\.com\/(in|pub)\/[\w\-]+/i);
  if (linkedinMatch) linkedin = `https://${linkedinMatch[0]}`;

  let portfolio: string | null = null;
  if (blog && !linkedinMatch && !blog.includes('twitter.com') && !blog.includes('x.com')) {
    portfolio = blog.startsWith('http') ? blog : `https://${blog}`;
  }

  let twitter = user.twitter_username || null;
  if (!twitter) {
    const twMatch = blog.match(/(?:twitter|x)\.com\/@?([\w]+)/i);
    if (twMatch) twitter = twMatch[1];
  }

  return { email: user.email || null, twitter, linkedin, portfolio };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT CALENDAR (last 90 days from events API)
// ─────────────────────────────────────────────────────────────────────────────

function buildCommitCalendar(events: any[]): CommitDay[] {
  const dayMap: Record<string, number> = {};
  const now = new Date();

  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().split('T')[0]] = 0;
  }

  const WEIGHTS: Record<string, number> = {
    PushEvent: 3,
    PullRequestEvent: 2,
    CreateEvent: 1,
    IssuesEvent: 1,
    IssueCommentEvent: 1,
    CommitCommentEvent: 1,
    PullRequestReviewEvent: 1,
  };

  for (const event of events) {
    const weight = WEIGHTS[event.type];
    if (!weight) continue;
    const dateKey = event.created_at?.split('T')[0];
    if (!dateKey || !(dateKey in dayMap)) continue;

    if (event.type === 'PushEvent') {
      const commits = event.payload?.commits?.length ?? 1;
      dayMap[dateKey] += commits * 3;
    } else {
      dayMap[dateKey] += weight;
    }
  }

  return Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE PROFICIENCY (byte-weighted across top repos)
// ─────────────────────────────────────────────────────────────────────────────

async function getLanguageProficiency(
  login: string,
  repos: any[],
  gHeaders: HeadersInit
): Promise<LanguageBar[]> {
  const targetRepos = repos
    .filter(r => !r.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 12);

  const langBytes: Record<string, number> = {};

  await Promise.all(
    targetRepos.map(async (repo) => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${login}/${repo.name}/languages`,
          { headers: gHeaders }
        );
        if (!res.ok) return;
        const data: Record<string, number> = await res.json();
        for (const [lang, bytes] of Object.entries(data)) {
          langBytes[lang] = (langBytes[lang] || 0) + bytes;
        }
      } catch { /* skip */ }
    })
  );

  const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0);
  if (totalBytes === 0) return [];

  return Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage: Math.round((bytes / totalBytes) * 1000) / 10,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC SCORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function computeScore(
  user: any,
  langBars: LanguageBar[],
  events: any[],
  queryTerms: string[],
  repos: any[],
  roleConstraints: { must: string[]; negative: string[] } | null
): { total: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    relevance: 0,
    activityRecency: 0,
    codeQuality: 0,
    profileSignal: 0,
  };

  const topLangNames = langBars.map(l => l.name.toLowerCase());
  const bioText = (user.bio || '').toLowerCase();

  // ── RELEVANCE (0–40) ─────────────────────────────────────────────────────
  if (roleConstraints) {
    const mustLower = roleConstraints.must.map(l => l.toLowerCase());
    const negLower = roleConstraints.negative.map(l => l.toLowerCase().replace(/\+/g, ' '));

    const primaryLang = topLangNames[0] || '';
    const top3 = topLangNames.slice(0, 3);

    const primaryMatch = mustLower.some(m => primaryLang.includes(m) || m.includes(primaryLang));
    const top3Match = top3.some(l => mustLower.some(m => l.includes(m) || m.includes(l)));
    const primaryIsNegative = negLower.some(n => primaryLang.includes(n) || n.includes(primaryLang));

    // % of codebase in negative languages
    const negPct = langBars.filter(l =>
      negLower.some(n => l.name.toLowerCase().includes(n) || n.includes(l.name.toLowerCase()))
    ).reduce((acc, l) => acc + l.percentage, 0);

    if (primaryIsNegative && negPct > 40) {
      // Definitively wrong stack — score cap at 8
      breakdown.relevance = Math.max(0, 8 - negPct / 10);
    } else if (primaryMatch) {
      breakdown.relevance = 40;
    } else if (top3Match) {
      breakdown.relevance = 26;
    } else {
      const anyMatch = topLangNames.filter(l => mustLower.some(m => l.includes(m) || m.includes(l))).length;
      breakdown.relevance = Math.min(18, anyMatch * 6);
    }

    // Bio bonus for role keywords
    const bioBonus = queryTerms.filter(t => bioText.includes(t)).length * 3;
    breakdown.relevance = Math.min(40, breakdown.relevance + bioBonus);
  } else {
    const allText = bioText + ' ' + topLangNames.join(' ');
    const hits = queryTerms.filter(t => allText.includes(t.toLowerCase())).length;
    breakdown.relevance = Math.min(40, (hits / Math.max(queryTerms.length, 1)) * 40);
  }

  // ── ACTIVITY RECENCY (0–30) ───────────────────────────────────────────────
  const now = Date.now();
  const cut90 = now - 90 * 24 * 60 * 60 * 1000;
  const cut180 = now - 180 * 24 * 60 * 60 * 1000;
  const cut365 = now - 365 * 24 * 60 * 60 * 1000;

  const events90 = events.filter(e =>
    ['PushEvent', 'PullRequestEvent', 'CreateEvent'].includes(e.type) &&
    new Date(e.created_at).getTime() > cut90
  );
  const events180 = events.filter(e =>
    ['PushEvent', 'PullRequestEvent'].includes(e.type) &&
    new Date(e.created_at).getTime() > cut180
  );

  const activityCount90 = events90.reduce((acc, e) => {
    if (e.type === 'PushEvent') return acc + (e.payload?.commits?.length ?? 1);
    return acc + 1;
  }, 0);

  const reposActive = repos.filter(r => !r.fork && new Date(r.pushed_at).getTime() > cut365).length;

  const actScore = Math.min(20, Math.log10(Math.max(activityCount90, 1) + 1) * 10);
  const repoVar = Math.min(7, reposActive * 1.2);
  const consistency = events180.length > events90.length * 1.2 ? 3 : 0;
  breakdown.activityRecency = Math.min(30, actScore + repoVar + consistency);

  // ── CODE QUALITY (0–20) ───────────────────────────────────────────────────
  const ownRepos = repos.filter(r => !r.fork);
  const ownStars = ownRepos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
  const forkedByOthers = ownRepos.reduce((acc, r) => acc + (r.forks_count || 0), 0);
  const starScore = Math.min(15, Math.log10(Math.max(ownStars, 1)) * 5);
  const forkSig = Math.min(5, Math.log10(Math.max(forkedByOthers, 1)) * 3);
  breakdown.codeQuality = Math.min(20, starScore + forkSig);

  // ── PROFILE SIGNAL (0–10) ─────────────────────────────────────────────────
  let pts = 0;
  if (user.email) pts += 3;
  if (user.bio && user.bio.length > 20) pts += 2;
  if (user.blog) pts += 2;
  if (user.twitter_username) pts += 1;
  if (user.location) pts += 1;
  if (user.name && user.name !== user.login) pts += 1;
  breakdown.profileSignal = Math.min(10, pts);

  const total = Math.round(
    breakdown.relevance + breakdown.activityRecency +
    breakdown.codeQuality + breakdown.profileSignal
  );

  return { total, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLER — Server-Sent Events for real progress updates
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const encode = makeEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: object) => {
        try { controller.enqueue(encode(msg)); } catch { /* closed */ }
      };

      try {
        const { userQuery, provider, llmKey, githubToken, baseUrl, modelName } = await req.json();
        const gHeaders: HeadersInit = {
          Authorization: `token ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        };

        const roleConstraints = detectRoleConstraints(userQuery);

        // STAGE 1/6 — Query generation
        send({ type: 'progress', step: 1, total: 6, label: 'Parsing intent & generating search strategies...' });

        const negativeFilter = roleConstraints
          ? roleConstraints.negative.map(l => `-language:"${l}"`).join(' ')
          : '';

        const mustLangs = roleConstraints?.must || [];

        const intentPrompt = `You are a technical recruiter building GitHub search queries.
Query: "${userQuery}"
${mustLangs.length ? `REQUIRED languages for this role: ${mustLangs.join(', ')}` : ''}
${negativeFilter ? `MANDATORY negative filters to append to ALL queries verbatim: ${negativeFilter}` : ''}

Generate 4 GitHub Search API query strings. Return ONLY JSON:
{"queries":["q1","q2","q3","q4"],"queryTerms":["t1","t2","t3"]}

Rules:
- q1: location tag + must-language (e.g. "location:bangalore language:C type:user ${negativeFilter}")
- q2: raw location text + must-language + role keyword (e.g. "bangalore kernel language:C type:user ${negativeFilter}")
- q3: nearby city or state + must-language (e.g. "location:karnataka language:C type:user ${negativeFilter}")
- q4: role keywords + must-language, no location (e.g. "linux kernel driver language:C type:user ${negativeFilter}")
- ALL queries must include the mandatory negative filters EXACTLY as given
- queryTerms: 3-5 role-specific technical keywords (no location words)`;

        const params = await callAI(intentPrompt, provider, llmKey, baseUrl, modelName);
        if (!params?.queries?.length) throw new Error("AI failed to construct query array.");

        const queryTerms: string[] = params.queryTerms || [];

        // STAGE 2/6 — GitHub search
        send({ type: 'progress', step: 2, total: 6, label: `Running ${params.queries.length} targeted searches on GitHub...` });

        const searchResults = await Promise.all(
          params.queries.map((q: string) =>
            fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=25&sort=repositories&order=desc`, {
              headers: gHeaders
            }).then(r => r.json()).catch(() => ({ items: [] }))
          )
        );

        const seenIds = new Set<number>();
        const uniqueItems: any[] = [];
        for (const data of searchResults) {
          for (const item of (data.items || [])) {
            if (item.type === 'User' && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueItems.push(item);
            }
          }
        }

        if (uniqueItems.length === 0) {
          send({ type: 'error', message: 'No developers found. Try broadening your search.' });
          controller.close();
          return;
        }

        // STAGE 3/6 — Profile enrichment
        send({ type: 'progress', step: 3, total: 6, label: `Deep-reading ${uniqueItems.length} profiles: repos, events, contacts...` });

        const CONCURRENCY = 8;
        const enriched: any[] = [];

        for (let i = 0; i < uniqueItems.length; i += CONCURRENCY) {
          const batch = uniqueItems.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (item) => {
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
                if (!u || (u.public_repos || 0) === 0) return null;
                return {
                  user: u,
                  repos: Array.isArray(repos) ? repos : [],
                  events: Array.isArray(events) ? events : [],
                };
              } catch { return null; }
            })
          );
          enriched.push(...results.filter(Boolean));
          if (i + CONCURRENCY < uniqueItems.length) await delay(150);
        }

        // STAGE 4/6 — Language analysis
        send({ type: 'progress', step: 4, total: 6, label: 'Measuring byte-weighted language proficiency...' });

        const withLangs = await Promise.all(
          enriched.map(async ({ user, repos, events }) => {
            const langBars = await getLanguageProficiency(user.login, repos, gHeaders);
            return { user, repos, events, langBars };
          })
        );

        // STAGE 5/6 — Scoring
        send({ type: 'progress', step: 5, total: 6, label: `Scoring ${withLangs.length} candidates on relevance, activity & quality...` });

        const scored = withLangs.map(({ user, repos, events, langBars }) => {
          const { total, breakdown } = computeScore(user, langBars, events, queryTerms, repos, roleConstraints);
          const ownRepos = repos.filter((r: any) => !r.fork);
          return {
            handle: user.login,
            name: user.name || user.login,
            avatar: user.avatar_url,
            bio: user.bio || '',
            location: user.location || null,
            followers: user.followers || 0,
            public_repos: user.public_repos || 0,
            own_repos: ownRepos.length,
            stars: ownRepos.reduce((acc: number, r: any) => acc + (r.stargazers_count || 0), 0),
            contactDetails: extractContactDetails(user),
            languages: langBars,
            proficientLanguages: langBars.slice(0, 3).map((l: LanguageBar) => l.name),
            commitCalendar: buildCommitCalendar(events),
            score: total,
            scoreBreakdown: breakdown,
            summary: '',
            accountCreated: user.created_at,
          };
        });

        const top30 = scored.sort((a, b) => b.score - a.score).slice(0, 30);

        // STAGE 6/6 — AI assessment
        send({ type: 'progress', step: 6, total: 6, label: `AI writing assessments for top ${top30.length} candidates...` });

        const assessmentPrompt = `You are a Principal Engineer writing brief candidate assessments for: "${userQuery}"
${roleConstraints ? `This role requires: ${roleConstraints.must.join(', ')}. Wrong stacks: ${roleConstraints.negative.slice(0, 5).join(', ')}.` : ''}

Write 1-2 sentence direct assessments. If stack mismatches the role, say explicitly why.
No double quotes in assessment strings.

${JSON.stringify(top30.map(p => ({
  handle: p.handle,
  bio: p.bio,
  languages: p.languages.slice(0, 4).map((l: LanguageBar) => `${l.name}(${l.percentage}%)`).join(', '),
  stars: p.stars,
  score: p.score,
  breakdown: p.scoreBreakdown,
}))).slice(0, 8000)}

Return ONLY JSON: {"assessments":[{"handle":"string","assessment":"string"}]}`;

        let assessments: Record<string, string> = {};
        try {
          const result = await callAI(assessmentPrompt, provider, llmKey, baseUrl, modelName);
          for (const a of (result?.assessments || [])) {
            assessments[a.handle] = a.assessment;
          }
        } catch (err) {
          console.warn('⚠️ AI assessment skipped:', err);
        }

        const final = top30
          .map(p => ({
            ...p,
            summary: assessments[p.handle] ||
              `${p.proficientLanguages.join(', ')} developer with ${p.stars} stars across ${p.own_repos} repos.`
          }))
          .filter(p => p.score >= 5);

        send({ type: 'done', data: final });
        controller.close();

      } catch (err: any) {
        console.error("🔥 ENGINE ERROR:", err.message);
        send({ type: 'error', message: `ENGINE ERROR: ${err.message}` });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
