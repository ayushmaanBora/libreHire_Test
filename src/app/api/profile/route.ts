// src/app/api/profile/route.ts
// Deep-dive assessment for a specific GitHub username — like Vamo's profile view

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

interface LanguageBar { name: string; percentage: number; bytes: number; }
interface CommitDay { date: string; count: number; }

function makeEncoder() {
  const enc = new TextEncoder();
  return (obj: object) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function extractContactDetails(user: any) {
  const blog = (user.blog || '').trim();
  const linkedinMatch = blog.match(/linkedin\.com\/(in|pub)\/[\w\-]+/i);
  const linkedin = linkedinMatch ? `https://${linkedinMatch[0]}` : null;
  const portfolio = (!linkedinMatch && blog && !blog.includes('twitter.com') && !blog.includes('x.com'))
    ? (blog.startsWith('http') ? blog : `https://${blog}`) : null;
  let twitter = user.twitter_username || null;
  if (!twitter) { const m = blog.match(/(?:twitter|x)\.com\/@?([\w]+)/i); if (m) twitter = m[1]; }
  return { email: user.email || null, twitter, linkedin, portfolio };
}

async function getYearContributions(login: string, token: string): Promise<CommitDay[]> {
  const now = new Date();
  const yearAgo = new Date(now); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login, from: yearAgo.toISOString(), to: now.toISOString() } })
    });
    if (!res.ok) throw new Error('GraphQL failed');
    const data = await res.json();
    const weeks = data?.data?.user?.contributionsCollection?.contributionCalendar?.weeks || [];
    return weeks.flatMap((w: any) => w.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount })));
  } catch {
    const days: CommitDay[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days.push({ date: d.toISOString().split('T')[0], count: 0 });
    }
    return days;
  }
}

async function getLanguageProficiency(login: string, repos: any[], gHeaders: HeadersInit): Promise<LanguageBar[]> {
  const targets = repos.filter(r => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 15);
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

async function callAI(prompt: string, provider: string, key: string, baseUrl?: string, modelName?: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 2048, messages: [{ role: 'user', content: prompt }], temperature: 0.3 })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.content?.[0]?.text || '';
      } else {
        const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : `${(baseUrl||'').replace(/\/+$/,'')}/chat/completions`;
        const model = provider === 'openai' ? 'gpt-4o-mini' : (modelName || '');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices?.[0]?.message?.content || '';
      }
    } catch (err: any) {
      if (attempt >= 2) throw err;
      await delay((attempt + 1) * 2000);
    }
  }
  return '';
}

export async function POST(req: Request) {
  const encode = makeEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: object) => { try { controller.enqueue(encode(msg)); } catch { /* closed */ } };

      try {
        const { username, provider, llmKey, githubToken, baseUrl, modelName } = await req.json();
        const gHeaders: HeadersInit = { Authorization: `token ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' };

        send({ type: 'progress', step: 1, total: 4, label: `Fetching @${username}'s GitHub profile...` });

        // Fetch user + repos in parallel
        const [uRes, rRes] = await Promise.all([
          fetch(`https://api.github.com/users/${username}`, { headers: gHeaders }),
          fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`, { headers: gHeaders }),
        ]);

        if (!uRes.ok) {
          send({ type: 'error', message: `User @${username} not found on GitHub.` });
          controller.close(); return;
        }

        const [user, repos] = await Promise.all([uRes.json(), rRes.ok ? rRes.json() : []]);
        const repoList = Array.isArray(repos) ? repos : [];

        send({ type: 'progress', step: 2, total: 4, label: 'Analysing language proficiency & contribution history...' });

        const [langBars, calendar] = await Promise.all([
          getLanguageProficiency(username, repoList, gHeaders),
          getYearContributions(username, githubToken),
        ]);

        send({ type: 'progress', step: 3, total: 4, label: 'Computing scores...' });

        const own = repoList.filter((r: any) => !r.fork);
        const stars = own.reduce((a: number, r: any) => a + (r.stargazers_count || 0), 0);
        const forks = own.reduce((a: number, r: any) => a + (r.forks_count || 0), 0);

        const topRepos = own
          .sort((a: any, b: any) => (b.stargazers_count + b.forks_count) - (a.stargazers_count + a.forks_count))
          .slice(0, 8)
          .map((r: any) => ({ name: r.name, description: r.description, stars: r.stargazers_count, forks: r.forks_count, language: r.language, topics: r.topics?.slice(0, 5) || [], url: r.html_url }));

        const totalContribs = calendar.reduce((a, d) => a + d.count, 0);
        const activeDays = calendar.filter(d => d.count > 0).length;

        const scoreBreakdown = {
          codeQuality: Math.min(40, Math.min(30, Math.log10(Math.max(stars,1))*10) + Math.min(10, Math.log10(Math.max(forks,1))*5)),
          activity: Math.min(30, Math.min(20, Math.log10(Math.max(totalContribs,1))*7) + Math.min(10, activeDays / 3.65)),
          profileCompleteness: Math.min(20, (user.email?5:0)+(user.bio?.length>20?4:0)+(user.blog?4:0)+(user.twitter_username?3:0)+(user.location?2:0)+(user.name&&user.name!==user.login?2:0)),
          influence: Math.min(10, Math.log10(Math.max(user.followers||0, 1)) * 4),
        };
        const totalScore = Math.round(Object.values(scoreBreakdown).reduce((a,b)=>a+b,0));

        send({ type: 'progress', step: 4, total: 4, label: 'AI reviewing their entire body of work...' });

        const prompt = `You are a senior technical recruiter writing a comprehensive profile assessment for a GitHub developer.

Developer: @${user.login} (${user.name || user.login})
Bio: ${user.bio || 'No bio'}
Location: ${user.location || 'Unknown'}
Company: ${user.company || 'Unknown'}
Followers: ${user.followers} | Following: ${user.following}
Account age: ${new Date(user.created_at).getFullYear()} to present
Public repos: ${user.public_repos} (${own.length} original, ${repoList.length - own.length} forks)
Total stars earned: ${stars} | Times forked by others: ${forks}
GitHub contributions this year: ${totalContribs} across ${activeDays} active days
Primary languages: ${langBars.slice(0,4).map(l=>`${l.name}(${l.percentage}%)`).join(', ')}

Notable projects:
${topRepos.map((r: any) => `- ${r.name} [${r.stars}★, ${r.forks} forks, ${r.language}]: ${r.description || 'No description'} ${r.topics.length ? `(topics: ${r.topics.join(', ')})` : ''}`).join('\n')}

Write a comprehensive 4-6 sentence profile assessment covering:
1. What this developer has built — specific projects and what they do
2. Their technical strengths based on actual language distribution
3. Their activity level and consistency
4. Their community impact (stars, forks, followers)
5. A sentence on what kind of role or team they would be ideal for

Be specific and reference actual project names. Write in second person (e.g. "They built..."). No hollow phrases like "passionate developer".`;

        const assessment = await callAI(prompt, provider, llmKey, baseUrl, modelName);

        const profileData = {
          handle: user.login,
          name: user.name || user.login,
          avatar: user.avatar_url,
          bio: user.bio || '',
          location: user.location || null,
          company: user.company || null,
          followers: user.followers || 0,
          following: user.following || 0,
          own_repos: own.length,
          stars,
          forks,
          totalContribs,
          activeDays,
          contactDetails: extractContactDetails(user),
          languages: langBars,
          commitCalendar: calendar,
          topRepos,
          score: totalScore,
          scoreBreakdown,
          summary: assessment,
          accountCreated: user.created_at,
        };

        send({ type: 'done', data: profileData });
        controller.close();

      } catch (err: any) {
        console.error('PROFILE ERROR:', err.message);
        send({ type: 'error', message: `Error: ${err.message}` });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}
