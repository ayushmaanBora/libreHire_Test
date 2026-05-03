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
  date: string;   // YYYY-MM-DD
  count: number;
}

interface LanguageBar {
  name: string;
  percentage: number;
  bytes: number;
}

interface ScoreBreakdown {
  relevance: number;        // 0–40 pts
  activityRecency: number;  // 0–30 pts
  codeQuality: number;      // 0–20 pts
  profileSignal: number;    // 0–10 pts
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ADAPTERS (unchanged from original — your provider routing works well)
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
// CONTACT EXTRACTION
// Parses LinkedIn URLs from blog/bio/readme since GitHub has no native field
// ─────────────────────────────────────────────────────────────────────────────

function extractContactDetails(user: any): ContactDetails {
  const blog = (user.blog || '').trim();
  const bio = (user.bio || '').toLowerCase();

  // Extract LinkedIn from blog field
  let linkedin: string | null = null;
  const linkedinMatch = blog.match(/linkedin\.com\/(in|pub)\/[\w\-]+/i);
  if (linkedinMatch) {
    linkedin = `https://${linkedinMatch[0]}`;
  }

  // Portfolio: blog field that isn't linkedin/twitter
  let portfolio: string | null = null;
  if (blog && !linkedinMatch && !blog.includes('twitter.com') && !blog.includes('x.com')) {
    portfolio = blog.startsWith('http') ? blog : `https://${blog}`;
  }

  // Twitter from both dedicated field and blog
  let twitter = user.twitter_username || null;
  if (!twitter) {
    const twMatch = blog.match(/(?:twitter|x)\.com\/@?([\w]+)/i);
    if (twMatch) twitter = twMatch[1];
  }

  return {
    email: user.email || null,
    twitter,
    linkedin,
    portfolio,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT CALENDAR
// Uses the GitHub events API to build a 90-day contribution heatmap.
// Events only go back ~90 days via API, which is fine for recency signal.
// ─────────────────────────────────────────────────────────────────────────────

function buildCommitCalendar(events: any[]): CommitDay[] {
  // Initialise last 90 days with zero counts
  const dayMap: Record<string, number> = {};
  const now = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().split('T')[0]] = 0;
  }

  for (const event of events) {
    if (!['PushEvent', 'CreateEvent', 'PullRequestEvent', 'IssuesEvent', 'CommitCommentEvent'].includes(event.type)) continue;
    const dateKey = event.created_at?.split('T')[0];
    if (!dateKey || !(dateKey in dayMap)) continue;

    if (event.type === 'PushEvent') {
      // Count actual commits in the push
      dayMap[dateKey] += (event.payload?.commits?.length ?? 1);
    } else {
      dayMap[dateKey] += 1;
    }
  }

  return Object.entries(dayMap).map(([date, count]) => ({ date, count }));
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE PROFICIENCY
// Weight by bytes written (not repo count) — much more accurate signal.
// A dev who wrote 500k bytes of Rust knows Rust. One who has 3 repos with
// a total 2k bytes of Rust is just dabbling.
// ─────────────────────────────────────────────────────────────────────────────

async function getLanguageProficiency(
  login: string,
  repos: any[],
  gHeaders: HeadersInit
): Promise<LanguageBar[]> {
  // Take top 12 non-fork repos by stars to stay within rate limits
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
      percentage: Math.round((bytes / totalBytes) * 1000) / 10, // one decimal
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC SCORING ENGINE
// This runs BEFORE the AI — the AI then gets pre-computed scores and
// is only asked for a human-readable assessment, not raw ranking.
// This prevents the AI from making up scores based on vibes.
// ─────────────────────────────────────────────────────────────────────────────

function computeScore(
  profile: any,
  langBars: LanguageBar[],
  events: any[],
  queryTerms: string[],
  repos: any[]
): { total: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    relevance: 0,
    activityRecency: 0,
    codeQuality: 0,
    profileSignal: 0,
  };

  // ── RELEVANCE (0–40 pts) ──────────────────────────────────────────────────
  // How well does this dev's actual output match the query?
  const topLangs = langBars.slice(0, 3).map(l => l.name.toLowerCase());
  const bioText = (profile.bio || '').toLowerCase();
  const allText = bioText + ' ' + topLangs.join(' ');

  let relevanceHits = 0;
  for (const term of queryTerms) {
    if (allText.includes(term.toLowerCase())) relevanceHits++;
  }
  // Primary language match is worth most — if their #1 lang matches query intent
  const primaryLangMatch = queryTerms.some(t => topLangs[0]?.includes(t) || t.includes(topLangs[0] || '???'));
  breakdown.relevance = Math.min(40,
    (relevanceHits / Math.max(queryTerms.length, 1)) * 25 +
    (primaryLangMatch ? 15 : 0)
  );

  // ── ACTIVITY RECENCY (0–30 pts) ──────────────────────────────────────────
  // Real recent contribution signal, not just account age
  const now = Date.now();
  const cutoff90 = now - 90 * 24 * 60 * 60 * 1000;
  const cutoff180 = now - 180 * 24 * 60 * 60 * 1000;
  const cutoff365 = now - 365 * 24 * 60 * 60 * 1000;

  const pushEvents = events.filter(e => e.type === 'PushEvent');
  const recentPushes90 = pushEvents.filter(e => new Date(e.created_at).getTime() > cutoff90);
  const recentPushes180 = pushEvents.filter(e => new Date(e.created_at).getTime() > cutoff180);

  const commitCount90 = recentPushes90.reduce((acc, e) => acc + (e.payload?.commits?.length ?? 1), 0);
  const commitCount180 = recentPushes180.reduce((acc, e) => acc + (e.payload?.commits?.length ?? 1), 0);

  const reposUpdated365 = repos.filter(r => !r.fork && new Date(r.pushed_at).getTime() > cutoff365).length;

  // Logarithmic scaling: 1 commit = low, 10+ = medium, 50+ = high, 200+ = max
  const commitScore = Math.min(20, Math.log10(Math.max(commitCount90, 1) + 1) * 10);
  // Active repo variety signal
  const repoActivityScore = Math.min(10, reposUpdated365 * 1.5);
  // 180-day consistency bonus
  const consistencyBonus = commitCount180 > commitCount90 * 1.5 ? 3 : 0;

  breakdown.activityRecency = Math.min(30, commitScore + repoActivityScore + consistencyBonus);

  // ── CODE QUALITY (0–20 pts) ────────────────────────────────────────────────
  // Stars earned on own work (not forks), fork ratio as quality signal
  const ownRepos = repos.filter(r => !r.fork);
  const ownStars = ownRepos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
  const forkedByOthers = ownRepos.reduce((acc, r) => acc + (r.forks_count || 0), 0);

  // Stars: log scale — 0 stars = 0, 10 = ~5pts, 100 = ~10pts, 1000+ = ~15pts
  const starScore = Math.min(15, Math.log10(Math.max(ownStars, 1)) * 5);
  // Others forking your work is a strong quality signal
  const forkSignal = Math.min(5, Math.log10(Math.max(forkedByOthers, 1)) * 3);

  breakdown.codeQuality = Math.min(20, starScore + forkSignal);

  // ── PROFILE COMPLETENESS (0–10 pts) ──────────────────────────────────────
  // Signals that the dev is reachable and maintains a professional presence
  let profilePts = 0;
  if (profile.email) profilePts += 3;
  if (profile.bio && profile.bio.length > 20) profilePts += 2;
  if (profile.blog) profilePts += 2;
  if (profile.twitter_username) profilePts += 1;
  if (profile.location) profilePts += 1;
  if (profile.name && profile.name !== profile.login) profilePts += 1;

  breakdown.profileSignal = Math.min(10, profilePts);

  const total = Math.round(
    breakdown.relevance +
    breakdown.activityRecency +
    breakdown.codeQuality +
    breakdown.profileSignal
  );

  return { total, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  console.log("🚀 ENGINE START: LibreHire v2");
  try {
    const { userQuery, provider, llmKey, githubToken, baseUrl, modelName } = await req.json();
    const gHeaders: HeadersInit = {
      Authorization: `token ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // ── STAGE 1: QUERY PARSING + MULTI-STRATEGY SEARCH ───────────────────────
    const intentPrompt = `You are a Principal Technical Recruiter building GitHub search queries.
Query: "${userQuery}"

Generate 3 distinct GitHub Search API query strings. Return ONLY JSON: {"queries": ["string", "string", "string"], "queryTerms": ["term1", "term2"]}

RULES:
- queries[0]: Exact location tag + primary language (e.g. "location:delhi language:rust type:user")  
- queries[1]: Drop location tag, use raw location text as keyword (e.g. "delhi rust type:user")
- queries[2]: Use 2 major nearby cities/hubs in the region + the tech stack (e.g. "location:noida language:rust type:user")
- For roles, translate to CORE languages: systems/firmware→C,C++,Rust,Zig | web backend→Go,Rust,Python,Node | frontend→TypeScript,JavaScript | mobile→Swift,Kotlin | ML/AI→Python,Julia
- Add negative filters for mismatches (e.g. systems query MUST add -language:javascript -language:typescript -language:python)
- queryTerms: 3–6 lowercase technical keywords extracted from the query (language names, frameworks, role keywords) used for relevance scoring`;

    const params = await callAI(intentPrompt, provider, llmKey, baseUrl, modelName);
    if (!params?.queries?.length) throw new Error("AI failed to construct query array.");

    const queryTerms: string[] = params.queryTerms || [];
    console.log(`🔍 Firing ${params.queries.length} queries. Terms: ${queryTerms.join(', ')}`);

    // ── STAGE 2: MULTI-QUERY GITHUB SEARCH (parallel) ─────────────────────
    const fetchPromises = params.queries.map((q: string) =>
      fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=25&sort=repositories&order=desc`, {
        headers: gHeaders
      }).then(r => r.json()).catch(() => ({ items: [] }))
    );

    const searchResults = await Promise.all(fetchPromises);
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
      return NextResponse.json({ error: "No developers found matching these technical profiles." }, { status: 404 });
    }

    console.log(`📡 ${uniqueItems.length} unique candidates. Running deep enrichment...`);

    // ── STAGE 3: PARALLEL ENRICHMENT ──────────────────────────────────────
    // Fetch user + repos + events in parallel per candidate, all candidates in parallel
    const CONCURRENCY = 8;
    const enriched: any[] = [];

    for (let i = 0; i < uniqueItems.length; i += CONCURRENCY) {
      const batch = uniqueItems.slice(i, i + CONCURRENCY);

      const batchResults = await Promise.all(
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

            const repoList = Array.isArray(repos) ? repos : [];
            const eventList = Array.isArray(events) ? events : [];

            return { user: u, repos: repoList, events: eventList };
          } catch {
            return null;
          }
        })
      );

      enriched.push(...batchResults.filter(Boolean));

      // Respect GitHub rate limits: ~5000 req/hr with PAT, ~100 per concurrent batch
      if (i + CONCURRENCY < uniqueItems.length) await delay(200);
    }

    // ── STAGE 4: LANGUAGE PROFICIENCY (parallel, batched) ─────────────────
    // Fetch language bytes for top repos of each candidate
    console.log(`🗂  Computing language proficiency for ${enriched.length} candidates...`);

    const withLangs = await Promise.all(
      enriched.map(async ({ user, repos, events }) => {
        const langBars = await getLanguageProficiency(user.login, repos, gHeaders);
        return { user, repos, events, langBars };
      })
    );

    // ── STAGE 5: DETERMINISTIC SCORING ────────────────────────────────────
    const scored = withLangs.map(({ user, repos, events, langBars }) => {
      const { total, breakdown } = computeScore(user, langBars, events, queryTerms, repos);
      const contactDetails = extractContactDetails(user);
      const commitCalendar = buildCommitCalendar(events);

      const ownRepos = repos.filter((r: any) => !r.fork);
      const ownStars = ownRepos.reduce((acc: number, r: any) => acc + (r.stargazers_count || 0), 0);

      return {
        handle: user.login,
        name: user.name || user.login,
        avatar: user.avatar_url,
        bio: user.bio || '',
        location: user.location || null,
        followers: user.followers || 0,
        public_repos: user.public_repos || 0,
        own_repos: ownRepos.length,
        stars: ownStars,
        contactDetails,
        languages: langBars,              // full LanguageBar[] with percentages
        proficientLanguages: langBars.slice(0, 3).map(l => l.name), // top 3 for quick display
        commitCalendar,                   // CommitDay[] last 90 days
        score: total,
        scoreBreakdown: breakdown,
        // AI assessment filled in next stage
        summary: '',
        accountCreated: user.created_at,
      };
    });

    // Sort by deterministic score, take top 30 for AI assessment
    const top30 = scored.sort((a, b) => b.score - a.score).slice(0, 30);

    // ── STAGE 6: AI TECHNICAL ASSESSMENT ──────────────────────────────────
    // The AI now receives PRE-SCORED data and writes human-readable assessments.
    // It does NOT re-rank. This prevents hallucinated scoring while keeping
    // qualitative insight from the model.
    console.log(`⚖️  AI writing assessments for top ${top30.length} candidates...`);

    const assessmentPrompt = `You are a Principal Staff Engineer writing brief technical assessments.
Query context: "${userQuery}"

For each developer below, write a 1–2 sentence honest technical assessment based on their ACTUAL metrics.
Reference their specific languages, commit activity, and stars. Be direct — if their stack doesn't match the query, say so.
Do NOT use double quotes inside reason strings.

Developers (pre-scored by our engine):
${JSON.stringify(top30.map(p => ({
  handle: p.handle,
  bio: p.bio,
  languages: p.languages.slice(0, 4).map(l => `${l.name}(${l.percentage}%)`).join(', '),
  stars: p.stars,
  score: p.score,
  scoreBreakdown: p.scoreBreakdown,
})))}

Return ONLY JSON: {"assessments": [{"handle": "string", "assessment": "string"}]}`;

    let assessments: Record<string, string> = {};
    try {
      const assessmentResult = await callAI(assessmentPrompt, provider, llmKey, baseUrl, modelName);
      for (const a of (assessmentResult?.assessments || [])) {
        assessments[a.handle] = a.assessment;
      }
    } catch (err) {
      console.warn('⚠️ AI assessment failed, continuing without it:', err);
    }

    // Merge assessments back
    const final = top30
      .map(p => ({ ...p, summary: assessments[p.handle] || `${p.proficientLanguages.join(', ')} developer with ${p.stars} stars across ${p.own_repos} repositories.` }))
      .filter(p => p.score >= 5); // Only drop truly zero-signal profiles

    console.log(`🏁 DONE. Returning ${final.length} ranked candidates.`);
    return NextResponse.json({ data: final });

  } catch (err: any) {
    console.error("🔥 ENGINE ERROR:", err.message);
    return NextResponse.json({ error: `ENGINE ERROR: ${err.message}` }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
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
