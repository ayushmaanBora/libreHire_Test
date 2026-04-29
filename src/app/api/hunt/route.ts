import { NextResponse } from 'next/server';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- ADAPTERS ---

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
  const url = `https://api.anthropic.com/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ 
      model: "claude-3-5-haiku-latest",
      max_tokens: 1024,
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
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({ 
      model: modelName || "llama-3.3-70b-versatile", 
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" } 
    })
  });
  
  const data = await res.json();
  if (data.error) throw new Error(`Universal API Error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.choices?.[0]?.message?.content;
}

// --- MASTER ROUTER ---

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
      console.warn(`⚠️ ${provider.toUpperCase()} throttle/error. Retrying in ${attempts * 2}s...`);
      await delay(attempts * 2000);
    }
  }
}

// --- THE CORE PIPELINE ---

export async function POST(req: Request) {
  console.log("🚀 ENGINE START: Brutal Grading Mode");
  try {
    const { userQuery, provider, llmKey, githubToken, baseUrl, modelName } = await req.json();
    const gHeaders = { Authorization: `token ${githubToken}` };

    console.log(`🧠 Using Brain: ${provider.toUpperCase()} ${modelName ? `(${modelName})` : ''}`);
    
    // STAGE 1 & 2: INTENT + MULTI-QUERY GENERATION
    const intentPrompt = `You are a Principal Technical Recruiter. Generate 3 distinct GitHub Search API strings 'q' to find the absolute best candidates for this query: "${userQuery}"
    
    STRATEGIES TO USE:
    - Query 1 (The Exact Tag): Use the exact location provided by the user using the official tag (e.g., "location:delhi language:rust").
    - Query 2 (The Rural Catcher): Drop the 'location:' tag entirely. Use the location name as a raw text string (e.g., "delhi" language:rust).
    - Query 3 (Dynamic AI Expansion): Use your internal world knowledge to identify 2 major hubs INSIDE the requested region and search them.
    
    RULES:
    1. Translate roles into CORE programming languages using "language:X". (e.g. "systems" -> "language:c language:cpp language:rust language:zig").
    2. EXTREME NEGATIVE FILTERING: You MUST actively exclude opposite domains. If searching for low-level systems/firmware, you MUST add "-language:javascript -language:typescript -language:html -language:css -language:python -language:java" to ALL queries.
    3. ALWAYS append " type:user".
    Return ONLY JSON: {"queries": ["string", "string", "string"]}`;
    
    const params = await callAI(intentPrompt, provider, llmKey, baseUrl, modelName);
    if (!params || !params.queries || !Array.isArray(params.queries)) throw new Error("AI failed to construct query array.");
    
    console.log(`🔍 Firing ${params.queries.length} Concurrent GitHub Queries...`);

    // STAGE 3: MULTI-THREADED DISCOVERY & DEDUPLICATION
    const fetchPromises = params.queries.map(q => 
      fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=20&sort=followers`, { headers: gHeaders })
        .then(res => res.json())
        .catch(() => ({ items: [] }))
    );
    
    const searchResultsData = await Promise.all(fetchPromises);
    
    const uniqueUsersMap = new Map();
    for (const data of searchResultsData) {
      if (data.items) {
        for (const item of data.items) {
          if (item.type === "User" && !uniqueUsersMap.has(item.login)) {
            uniqueUsersMap.set(item.login, item);
          }
        }
      }
    }
    
    const uniqueItems = Array.from(uniqueUsersMap.values()).slice(0, 40); // Expanded pool

    if (uniqueItems.length === 0) return NextResponse.json({ error: "No developers found on GitHub matching these technical profiles." }, { status: 404 });
    console.log(`📡 Discovered ${uniqueItems.length} unique candidates. Extracting deep metrics...`);

    // STAGE 4: EXTRACTION (WITH RECENCY MATH)
    const profiles = [];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    for (const item of uniqueItems) {
      const [uRes, rRes] = await Promise.all([
        fetch(`https://api.github.com/users/${item.login}`, { headers: gHeaders }),
        fetch(`https://api.github.com/users/${item.login}/repos?per_page=40&sort=pushed`, { headers: gHeaders })
      ]);
      const [u, r] = await Promise.all([uRes.json(), rRes.json()]);
      
      if ((u.public_repos || 0) === 0) continue;

      const langs: Record<string, number> = {};
      let originalStars = 0;
      let originalRepos = 0;
      let activeRepos = 0; 
      
      (Array.isArray(r) ? r : []).forEach((repo: any) => {
        if (!repo.fork) {
          originalRepos++;
          originalStars += repo.stargazers_count || 0;
          if (repo.language) langs[repo.language] = (langs[repo.language] || 0) + 1;
          
          if (new Date(repo.pushed_at) > oneYearAgo) {
            activeRepos++;
          }
        }
      });

      profiles.push({
        handle: item.login,
        name: u.name || item.login,
        avatar: u.avatar_url,
        bio: u.bio || '',
        followers: u.followers || 0,
        public_repos: originalRepos, 
        active_repos: activeRepos, 
        email: u.email || null,
        twitter: u.twitter_username || null,
        website: u.blog || null,
        languages: Object.entries(langs).sort((a,b) => b[1]-a[1]).slice(0,3).map(e => e[0]),
        stars: originalStars 
      });
      await delay(100); 
    }

    if (profiles.length === 0) return NextResponse.json({ error: "All discovered accounts only had forked repositories." }, { status: 404 });

    // STAGE 5: RUTHLESS RANKING (THE HOSTILE GATEKEEPER)
    console.log(`⚖️ AI Grading ${profiles.length} fully compiled portfolios...`);
    const rankPrompt = `You are an elitist, hostile Principal Staff Engineer grading these developers for: "${userQuery}".
    Candidates: ${JSON.stringify(profiles)}
    
    FATAL RULE - DO NOT BE POLITE:
    If the query asks for Systems/Firmware/Kernel, their TOP languages MUST be C, C++, Rust, Zig, or Assembly. 
    If you see Python, JavaScript, TypeScript, HCL, or Java dominating their profile, DO NOT give them a "70" for "some alignment." They are NOT systems engineers. You MUST tank their score to between 10 and 25 and insult their tech stack mismatch.

    SCORING RUBRIC:
    - 90-100: Cracked/God-tier. High 'active_repos', high stars, PERFECT stack alignment (e.g. C/Rust for Systems).
    - 70-89: Solid Senior. Good active repos, correct stack.
    - 30-69: Mid-level or Inactive. Correct stack but low activity.
    - 10-29: The Python/JS Web/DevOps guys who got caught in the crossfire. Give them a terrible score.

    RULES:
    1. Reason: Write a brutal 1-2 sentence technical assessment.
    2. CITE DATA: Mention their specific languages and 'active_repos' count to justify why you destroyed or praised them.
    3. NO double quotes inside the reason string.
    Return ONLY JSON: {"results": [{"handle": "string", "reason": "string", "score": number}]}`;
    
    const rankingsObj = await callAI(rankPrompt, provider, llmKey, baseUrl, modelName);
    
    const rankingsArray = rankingsObj.results || rankingsObj; 
    
    const final = (Array.isArray(rankingsArray) ? rankingsArray : [])
      .map((r: any) => {
        const base = profiles.find(p => p.handle === r.handle);
        return base ? { ...base, summary: r.reason, score: r.score } : null;
      })
      .filter((p: any) => p && p.score >= 10) // Show almost everyone, let the score speak for itself
      .sort((a: any, b: any) => b.score - a.score);

    console.log(`🏁 DONE. Ranked ${final.length} candidates.`);
    return NextResponse.json({ data: final });

  } catch (err: any) {
    console.error("🔥 ACTUAL ENGINE ERROR:", err.message);
    return NextResponse.json({ error: `ENGINE ERROR: ${err.message}` }, { status: 500 });
  }
}