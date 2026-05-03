"use client";

import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (mirrors route.ts)
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

interface DeveloperProfile {
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  location: string | null;
  followers: number;
  public_repos: number;
  own_repos: number;
  stars: number;
  contactDetails: ContactDetails;
  languages: LanguageBar[];
  proficientLanguages: string[];
  commitCalendar: CommitDay[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  summary: string;
  accountCreated: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT CALENDAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function CommitCalendar({ days }: { days: CommitDay[] }) {
  if (!days || days.length === 0) return null;

  const maxCount = Math.max(...days.map(d => d.count), 1);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-gray-100';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'bg-black';
    if (intensity > 0.5)  return 'bg-gray-700';
    if (intensity > 0.25) return 'bg-gray-400';
    return 'bg-gray-200';
  };

  // Group into weeks (columns of 7)
  const weeks: CommitDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const totalCommits = days.reduce((a, d) => a + d.count, 0);
  const activeDays = days.filter(d => d.count > 0).length;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
          Contribution Activity · Last 90 Days
        </span>
        <span className="text-[10px] font-mono text-gray-400">
          {totalCommits} commits · {activeDays} active days
        </span>
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                title={`${day.date}: ${day.count} contribution${day.count !== 1 ? 's' : ''}`}
                className={`w-3 h-3 rounded-sm cursor-default transition-opacity hover:opacity-70 ${getColor(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE BARS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  C: '#555555',
  'C++': '#f34b7d',
  Java: '#b07219',
  Kotlin: '#a97bff',
  Swift: '#ffac45',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Zig: '#ec915c',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Lua: '#000080',
  Dart: '#00b4ab',
  Scala: '#c22d40',
  'C#': '#178600',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Assembly: '#6e4c13',
};

function LanguageProficiency({ languages }: { languages: LanguageBar[] }) {
  if (!languages || languages.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block mb-2">
        Language Proficiency
      </span>
      {/* Stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden w-full mb-3 gap-[1px]">
        {languages.map((lang) => (
          <div
            key={lang.name}
            style={{
              width: `${lang.percentage}%`,
              backgroundColor: LANG_COLORS[lang.name] || '#888',
            }}
            title={`${lang.name}: ${lang.percentage}%`}
            className="transition-all"
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {languages.map((lang) => (
          <div key={lang.name} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: LANG_COLORS[lang.name] || '#888' }}
            />
            <span className="text-[11px] font-mono text-gray-600">
              {lang.name} <span className="text-gray-400">{lang.percentage}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE BREAKDOWN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function ScoreDisplay({ score, breakdown }: { score: number; breakdown: ScoreBreakdown }) {
  const scoreColor = score >= 75 ? 'text-black' : score >= 50 ? 'text-gray-700' : 'text-gray-400';
  const scoreBg = score >= 75 ? 'bg-black text-white' : score >= 50 ? 'bg-gray-200 text-black' : 'bg-gray-100 text-gray-500';

  return (
    <div className="flex flex-col items-end gap-2">
      <div className={`${scoreBg} w-16 h-16 flex items-center justify-center font-black text-2xl border-2 border-black`}>
        {score}
      </div>
      <div className="text-right">
        {[
          { label: 'Match', val: breakdown.relevance, max: 40 },
          { label: 'Activity', val: breakdown.activityRecency, max: 30 },
          { label: 'Quality', val: breakdown.codeQuality, max: 20 },
          { label: 'Profile', val: breakdown.profileSignal, max: 10 },
        ].map(({ label, val, max }) => (
          <div key={label} className="flex items-center gap-2 justify-end mb-0.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 w-12 text-right">{label}</span>
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-black rounded-full transition-all duration-500"
                style={{ width: `${(val / max) * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-gray-500 w-8 text-right">{Math.round(val)}/{max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT LINKS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function ContactLinks({ handle, contact }: { handle: string; contact: ContactDetails }) {
  const links = [
    { label: 'GitHub', href: `https://github.com/${handle}`, always: true },
    { label: 'Email', href: contact.email ? `mailto:${contact.email}` : null },
    { label: 'Twitter', href: contact.twitter ? `https://twitter.com/${contact.twitter}` : null },
    { label: 'LinkedIn', href: contact.linkedin },
    { label: 'Portfolio', href: contact.portfolio },
  ].filter(l => l.href);

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {links.map(({ label, href }) => (
        <a
          key={label}
          href={href!}
          target={href!.startsWith('mailto') ? undefined : '_blank'}
          rel="noreferrer"
          className="border-2 border-black text-[10px] font-mono px-2.5 py-1 uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
        >
          {label}
        </a>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function DeveloperCard({ profile, rank }: { profile: DeveloperProfile; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-l-8 border-black pl-8 relative group">
      {/* Rank number */}
      <div className="absolute -left-5 top-0 w-10 h-10 bg-black text-white flex items-center justify-center font-black text-sm">
        #{rank}
      </div>

      {/* Header row */}
      <div className="flex justify-between items-start gap-6 mb-4">
        <div className="flex items-start gap-5 flex-1 min-w-0">
          <img
            src={profile.avatar}
            alt={profile.handle}
            className="w-20 h-20 border-4 border-black object-cover flex-shrink-0"
          />
          <div className="min-w-0">
            <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">
              {profile.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <a
                href={`https://github.com/${profile.handle}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm text-gray-500 hover:text-black"
              >
                @{profile.handle}
              </a>
              {profile.location && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="font-mono text-xs text-gray-400">{profile.location}</span>
                </>
              )}
            </div>

            {/* Stats row */}
            <div className="flex gap-4 mt-2">
              {[
                { label: 'followers', val: profile.followers.toLocaleString() },
                { label: 'repos', val: profile.own_repos },
                { label: 'stars', val: profile.stars.toLocaleString() },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <div className="text-base font-black leading-none">{val}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400">{label}</div>
                </div>
              ))}
            </div>

            {/* Contact links */}
            <ContactLinks handle={profile.handle} contact={profile.contactDetails} />
          </div>
        </div>

        {/* Score box */}
        {profile.scoreBreakdown && (
          <div className="flex-shrink-0">
            <ScoreDisplay score={profile.score} breakdown={profile.scoreBreakdown} />
          </div>
        )}
      </div>

      {/* AI Assessment */}
      {profile.summary && (
        <div className="border-l-4 border-gray-200 pl-4 mb-4">
          <p className="font-mono text-sm text-gray-700 leading-relaxed italic">
            {profile.summary}
          </p>
        </div>
      )}

      {/* Language Proficiency */}
      <LanguageProficiency languages={profile.languages} />

      {/* Commit Calendar */}
      <CommitCalendar days={profile.commitCalendar} />

      {/* Expand/collapse button for bio */}
      {profile.bio && (
        <div className="mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-mono uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
          >
            {expanded ? '▲ Hide bio' : '▼ Show bio'}
          </button>
          {expanded && (
            <p className="mt-2 text-sm text-gray-600 font-mono leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DeveloperProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<"search" | "how-to" | "about">("search");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [config, setConfig] = useState({
    provider: "gemini",
    llmKey: "",
    githubToken: "",
    baseUrl: "",
    modelName: "",
  });

  useEffect(() => {
    const saved = localStorage.getItem("librehire_config");
    if (saved) setConfig(JSON.parse(saved));
  }, []);

  const saveConfig = () => {
    localStorage.setItem("librehire_config", JSON.stringify(config));
    setIsConfigOpen(false);
  };

  const handleHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!config.githubToken) {
      setError("ENGINE HALTED: Missing GitHub Token. Click 'Configure Engine' first.");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userQuery: query,
          provider: config.provider,
          llmKey: config.llmKey,
          githubToken: config.githubToken,
          baseUrl: config.baseUrl,
          modelName: config.modelName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch candidates");
      setResults(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-20">

      {/* NAVBAR */}
      <header className="border-b-4 border-black px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-12">
          <h1
            onClick={() => setActiveView("search")}
            className="text-2xl font-black tracking-tighter cursor-pointer hover:opacity-70 transition-opacity italic uppercase"
          >
            LIBRE-HIRE
          </h1>
          <nav className="hidden md:flex space-x-6 text-xs font-mono uppercase tracking-widest text-gray-500">
            <button onClick={() => setActiveView("how-to")} className={`hover:text-black transition-colors ${activeView === "how-to" ? "text-black font-bold" : ""}`}>
              How to Use
            </button>
            <button onClick={() => setActiveView("about")} className={`hover:text-black transition-colors ${activeView === "about" ? "text-black font-bold" : ""}`}>
              About
            </button>
          </nav>
        </div>
        <button
          onClick={() => setIsConfigOpen(true)}
          className="border-2 border-black px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
        >
          Configure Engine
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-16">

        {/* ── SEARCH VIEW ── */}
        {activeView === "search" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-16">
              <h2 className="text-4xl md:text-[3.5rem] font-black text-gray-200 tracking-tighter uppercase mb-6 leading-[1.1]">
                STOP PAYING DATA BROKERS.<br />SOURCE BUILDERS ETHICALLY.
              </h2>
              <p className="font-mono text-sm md:text-base leading-relaxed max-w-2xl font-semibold">
                Libre-Hire is the free, open-source alternative to expensive recruiter tools. We analyze actual code output — language proficiency by bytes written, real commit activity, and public contact details — with no privacy invasion.
              </p>
            </div>

            {/* SEARCH BAR */}
            <form onSubmit={handleHunt} className="relative flex items-end mb-16 group">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="rust systems engineers in delhi"
                className="w-full text-3xl md:text-5xl font-bold bg-transparent border-b-4 border-black outline-none pb-4 placeholder:text-gray-300"
                autoFocus
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-0 bottom-4 bg-black text-white px-8 py-3 font-mono font-bold tracking-widest hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {loading ? "HUNTING..." : "HUNT"}
              </button>
            </form>

            {/* LOADING */}
            {loading && (
              <div className="space-y-2 mb-12 font-mono text-xs text-gray-400 uppercase tracking-widest">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                  Running multi-strategy GitHub search...
                </div>
                <div className="flex items-center gap-3 opacity-60">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                  Enriching profiles: events, language bytes, contacts...
                </div>
                <div className="flex items-center gap-3 opacity-40">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" style={{ animationDelay: '0.6s' }} />
                  Scoring with deterministic engine, then AI assessment...
                </div>
              </div>
            )}

            {/* ERROR */}
            {error && (
              <div className="border-4 border-red-500 bg-red-50 text-red-700 p-6 font-mono text-sm uppercase font-bold text-center tracking-widest mb-12">
                {error}
              </div>
            )}

            {/* RESULTS COUNT */}
            {results.length > 0 && (
              <div className="flex items-center justify-between mb-10 border-b-2 border-black pb-4">
                <span className="font-mono text-sm uppercase tracking-widest">
                  {results.length} ranked candidates
                </span>
                <span className="font-mono text-xs text-gray-400 uppercase tracking-widest">
                  Sorted by relevance · activity · quality
                </span>
              </div>
            )}

            {/* RESULTS */}
            <div className="space-y-16">
              {results.map((profile, idx) => (
                <DeveloperCard key={profile.handle} profile={profile} rank={idx + 1} />
              ))}
            </div>

            {/* EMPTY STATE */}
            {!loading && !error && results.length === 0 && (
              <div className="text-center py-20">
                <p className="font-mono text-gray-300 text-sm uppercase tracking-widest">
                  Enter a search query to begin hunting
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── HOW TO USE VIEW ── */}
        {activeView === "how-to" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-12 border-b-4 border-black pb-4">How to Use</h2>
            <div className="space-y-12 font-mono text-sm">
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">1. GitHub Token</h3>
                <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                  <li>Go to <strong>GitHub → Settings → Developer Settings</strong>.</li>
                  <li>Click <strong>Personal Access Tokens (Classic)</strong>.</li>
                  <li>Click <strong>Generate new token</strong>. No scopes needed.</li>
                  <li>Copy the token. This lets us read public data without IP rate limits.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">2. AI API Key</h3>
                <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                  <li>Click <strong>CONFIGURE ENGINE</strong> in the top right.</li>
                  <li>Select your AI provider (Gemini, Claude, OpenAI, or Custom).</li>
                  <li>Paste your key. This powers query parsing and technical assessments.</li>
                  <li>Click <strong>Save & Lock</strong>.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">3. How Scoring Works</h3>
                <ul className="list-disc pl-5 space-y-2 leading-relaxed">
                  <li><strong>Match (40pts):</strong> Language/bio alignment with your query. Byte-weighted, not repo count.</li>
                  <li><strong>Activity (30pts):</strong> Real commits in the last 90 days from push events.</li>
                  <li><strong>Quality (20pts):</strong> Stars and forks earned on their own (non-forked) repos.</li>
                  <li><strong>Profile (10pts):</strong> Email, links, bio completeness — are they reachable?</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── ABOUT VIEW ── */}
        {activeView === "about" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-12 border-b-4 border-black pb-4">About Libre-Hire</h2>
            <div className="space-y-10 font-mono text-sm leading-relaxed">
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">1. Byte-Weighted Language Analysis</h3>
                <p>
                  We measure actual bytes of code written per language across all original repos — not just a count of repos that happen to use a language. Someone who wrote 800k bytes of Rust outranks someone with 3 small Rust repos.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">2. Real Activity Signal</h3>
                <p>
                  The commit calendar and activity score use GitHub&apos;s public events API — actual PushEvents with commit counts, not just &quot;updated_at&quot; timestamps that can be gamed.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">3. Ethical Discovery</h3>
                <p>
                  We only surface contact details the developer has explicitly made public on their GitHub profile. No data brokers, no scraped databases. If they want to be found, they can be.
                </p>
              </div>
              <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-300">
                <p className="text-xs text-gray-500 uppercase tracking-widest">LIBRE-HIRE // AGNOSTIC. OPEN. SELF-HOSTED. // 2026</p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── CONFIG MODAL ── */}
      {isConfigOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-4 border-black p-8 w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6 border-b-2 border-black pb-2">Engine Configuration</h2>
            <div className="space-y-6 font-mono text-sm">
              <div>
                <label className="block font-bold mb-2 uppercase tracking-widest text-xs">AI Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                  className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom (OpenAI Compatible)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-2 uppercase tracking-widest text-xs">LLM API Key</label>
                <input
                  type="password"
                  value={config.llmKey}
                  onChange={(e) => setConfig({ ...config, llmKey: e.target.value })}
                  className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                  placeholder="sk-..."
                />
              </div>
              {config.provider === "custom" && (
                <>
                  <div>
                    <label className="block font-bold mb-2 uppercase tracking-widest text-xs">Base URL</label>
                    <input
                      type="text"
                      value={config.baseUrl}
                      onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                      className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                      placeholder="https://api.together.xyz/v1"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-2 uppercase tracking-widest text-xs">Model Name</label>
                    <input
                      type="text"
                      value={config.modelName}
                      onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                      className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                      placeholder="meta-llama/Llama-3-70b-chat-hf"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block font-bold mb-2 uppercase tracking-widest text-xs">GitHub Personal Token</label>
                <input
                  type="password"
                  value={config.githubToken}
                  onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                  className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                  placeholder="ghp_..."
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button
                  onClick={saveConfig}
                  className="flex-1 bg-black text-white border-2 border-black font-bold uppercase tracking-widest py-3 hover:bg-gray-800"
                >
                  Save & Lock
                </button>
                <button
                  onClick={() => setIsConfigOpen(false)}
                  className="flex-1 bg-white text-black border-2 border-black font-bold uppercase tracking-widest py-3 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
