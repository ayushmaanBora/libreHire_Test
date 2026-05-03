"use client";

import { useState, useEffect } from "react";

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

interface ProgressState {
  step: number;
  total: number;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE COLORS (matches GitHub's color scheme)
// ─────────────────────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3572a5',
  Rust: '#dea584', Go: '#00add8', C: '#555555', 'C++': '#f34b7d',
  Java: '#b07219', Kotlin: '#a97bff', Swift: '#ffac45', Ruby: '#701516',
  PHP: '#4f5d95', Zig: '#ec915c', Haskell: '#5e5086', Elixir: '#6e4a7e',
  Lua: '#000080', Dart: '#00b4ab', Scala: '#c22d40', 'C#': '#178600',
  Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Assembly: '#6e4c13',
  'Objective-C': '#438eff', Fortran: '#4d41b1', Julia: '#a270ba',
  'Jupyter Notebook': '#da5b0b', HCL: '#844fba',
};

function langColor(name: string) {
  return LANG_COLORS[name] || '#888888';
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT CALENDAR
// ─────────────────────────────────────────────────────────────────────────────

function CommitCalendar({ days }: { days: CommitDay[] }) {
  if (!days || days.length === 0) return (
    <div className="mt-5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-300">
        Contribution Activity · No data available
      </span>
    </div>
  );

  const maxCount = Math.max(...days.map(d => d.count), 1);
  const totalCommits = days.reduce((a, d) => a + d.count, 0);
  const activeDays = days.filter(d => d.count > 0).length;

  function getCellClass(count: number) {
    if (count === 0) return 'bg-gray-100 border border-gray-200';
    const pct = count / maxCount;
    if (pct > 0.75) return 'bg-gray-900 border border-gray-800';
    if (pct > 0.4)  return 'bg-gray-600 border border-gray-500';
    if (pct > 0.15) return 'bg-gray-400 border border-gray-300';
    return 'bg-gray-200 border border-gray-200';
  }

  // Group into weeks of 7 days each
  const weeks: CommitDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, Math.min(i + 7, days.length)));
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
          Contribution Activity · Last 90 Days
        </span>
        <span className="text-[10px] font-mono text-gray-400">
          {totalCommits} contributions · {activeDays} active days
        </span>
      </div>
      <div className="flex gap-[3px]">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                title={`${day.date}: ${day.count} contribution${day.count !== 1 ? 's' : ''}`}
                className={`w-[11px] h-[11px] rounded-sm cursor-default transition-opacity hover:opacity-60 ${getCellClass(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[9px] font-mono text-gray-400">Less</span>
        {[0, 0.15, 0.4, 0.75, 1].map((v, i) => (
          <div key={i} className={`w-[10px] h-[10px] rounded-sm ${getCellClass(Math.round(v * maxCount))}`} />
        ))}
        <span className="text-[9px] font-mono text-gray-400">More</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE PROFICIENCY BARS
// ─────────────────────────────────────────────────────────────────────────────

function LanguageProficiency({ languages }: { languages: LanguageBar[] }) {
  if (!languages || languages.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block mb-2">
        Language Proficiency · Byte-Weighted
      </span>
      {/* Stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden w-full mb-2.5 gap-px">
        {languages.map((lang) => (
          <div
            key={lang.name}
            style={{ width: `${lang.percentage}%`, backgroundColor: langColor(lang.name) }}
            title={`${lang.name}: ${lang.percentage}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {languages.map((lang) => (
          <div key={lang.name} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: langColor(lang.name) }} />
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
// SCORE DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

function ScoreDisplay({ score, breakdown }: { score: number; breakdown: ScoreBreakdown }) {
  const bg = score >= 75 ? 'bg-black text-white' : score >= 50 ? 'bg-gray-800 text-white' : score >= 30 ? 'bg-gray-200 text-black' : 'bg-gray-100 text-gray-400';

  return (
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <div className={`${bg} w-16 h-16 flex items-center justify-center font-black text-2xl border-2 border-black`}>
        {score}
      </div>
      <div className="space-y-0.5">
        {([
          { label: 'Match',    val: breakdown.relevance,       max: 40 },
          { label: 'Activity', val: breakdown.activityRecency, max: 30 },
          { label: 'Quality',  val: breakdown.codeQuality,     max: 20 },
          { label: 'Profile',  val: breakdown.profileSignal,   max: 10 },
        ] as const).map(({ label, val, max }) => (
          <div key={label} className="flex items-center gap-2 justify-end">
            <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 w-12 text-right">{label}</span>
            <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-black rounded-full" style={{ width: `${(val / max) * 100}%` }} />
            </div>
            <span className="text-[9px] font-mono text-gray-500 w-9 text-right">{Math.round(val)}/{max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT LINKS
// ─────────────────────────────────────────────────────────────────────────────

function ContactLinks({ handle, contact }: { handle: string; contact: ContactDetails }) {
  const links = [
    { label: 'GitHub',    href: `https://github.com/${handle}` },
    contact.email     && { label: 'Email',     href: `mailto:${contact.email}` },
    contact.twitter   && { label: 'Twitter',   href: `https://twitter.com/${contact.twitter}` },
    contact.linkedin  && { label: 'LinkedIn',  href: contact.linkedin },
    contact.portfolio && { label: 'Portfolio', href: contact.portfolio },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {links.map(({ label, href }) => (
        <a
          key={label}
          href={href}
          target={href.startsWith('mailto') ? undefined : '_blank'}
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
// DEVELOPER CARD
// ─────────────────────────────────────────────────────────────────────────────

function DeveloperCard({ profile, rank }: { profile: DeveloperProfile; rank: number }) {
  const [bioOpen, setBioOpen] = useState(false);

  return (
    <div className="border-l-8 border-black pl-8 relative">
      {/* Rank badge */}
      <div className="absolute -left-5 top-0 w-10 h-10 bg-black text-white flex items-center justify-center font-black text-sm select-none">
        #{rank}
      </div>

      {/* Header */}
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
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

            {/* Stats */}
            <div className="flex gap-5 mt-2.5">
              {[
                { label: 'followers', val: profile.followers.toLocaleString() },
                { label: 'repos',     val: profile.own_repos },
                { label: 'stars',     val: profile.stars.toLocaleString() },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-base font-black leading-none">{val}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400">{label}</div>
                </div>
              ))}
            </div>

            <ContactLinks handle={profile.handle} contact={profile.contactDetails} />
          </div>
        </div>

        {profile.scoreBreakdown && (
          <ScoreDisplay score={profile.score} breakdown={profile.scoreBreakdown} />
        )}
      </div>

      {/* AI Assessment */}
      {profile.summary && (
        <div className="border-l-4 border-gray-200 pl-4 mb-2">
          <p className="font-mono text-sm text-gray-700 leading-relaxed italic">{profile.summary}</p>
        </div>
      )}

      {/* Language Proficiency */}
      <LanguageProficiency languages={profile.languages} />

      {/* Commit Calendar */}
      <CommitCalendar days={profile.commitCalendar} />

      {/* Bio toggle */}
      {profile.bio && (
        <div className="mt-4">
          <button
            onClick={() => setBioOpen(v => !v)}
            className="text-[10px] font-mono uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
          >
            {bioOpen ? '▲ Hide bio' : '▼ Show bio'}
          </button>
          {bioOpen && (
            <p className="mt-2 text-sm text-gray-600 font-mono leading-relaxed border-l-2 border-gray-200 pl-3">
              {profile.bio}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SCREEN
// Shows real progress steps from the SSE stream.
// The progress bar advances by step/total so it accurately reflects
// actual pipeline progress, not a fake timer.
// ─────────────────────────────────────────────────────────────────────────────

function LoadingScreen({ progress, query }: { progress: ProgressState; query: string }) {
  const pct = Math.round((progress.step / progress.total) * 100);

  const steps = [
    'Parsing intent & building queries',
    'Searching GitHub',
    'Enriching profiles',
    'Computing language proficiency',
    'Scoring candidates',
    'Writing AI assessments',
  ];

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center px-8">
      {/* Animated logo */}
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-black uppercase tracking-tighter italic mb-2">LIBRE-HIRE</h1>
        <p className="font-mono text-sm text-gray-500">Hunting: <span className="text-black font-bold">{query}</span></p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex justify-between items-end mb-2">
          <span className="font-mono text-xs text-gray-500 uppercase tracking-widest">
            Stage {progress.step} of {progress.total}
          </span>
          <span className="font-black text-2xl">{pct}%</span>
        </div>
        <div className="w-full h-3 bg-gray-100 border-2 border-black">
          <div
            className="h-full bg-black transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Current label */}
      <p className="font-mono text-sm text-gray-600 mb-12 text-center max-w-md min-h-[2rem]">
        {progress.label}
      </p>

      {/* Step checklist */}
      <div className="space-y-2 w-full max-w-sm">
        {steps.map((s, i) => {
          const stepNum = i + 1;
          const done = stepNum < progress.step;
          const active = stepNum === progress.step;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center text-[10px] font-black
                ${done   ? 'border-black bg-black text-white' :
                  active ? 'border-black bg-white text-black animate-pulse' :
                           'border-gray-200 text-gray-300'}`}>
                {done ? '✓' : stepNum}
              </div>
              <span className={`font-mono text-xs uppercase tracking-widest
                ${done   ? 'text-gray-400 line-through' :
                  active ? 'text-black font-bold' :
                           'text-gray-300'}`}>
                {s}
              </span>
            </div>
          );
        })}
      </div>
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
  const [progress, setProgress] = useState<ProgressState>({ step: 0, total: 6, label: '' });
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
    try {
      const saved = localStorage.getItem("librehire_config");
      if (saved) setConfig(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveConfig = () => {
    localStorage.setItem("librehire_config", JSON.stringify(config));
    setIsConfigOpen(false);
  };

  const handleHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!config.githubToken) {
      setError("Missing GitHub Token — click Configure Engine first.");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    setProgress({ step: 1, total: 6, label: 'Initialising...' });

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

      if (!res.body) throw new Error("No stream returned from server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));

            if (msg.type === 'progress') {
              setProgress({ step: msg.step, total: msg.total, label: msg.label });
            } else if (msg.type === 'done') {
              setResults(msg.data || []);
              setLoading(false);
            } else if (msg.type === 'error') {
              setError(msg.message);
              setLoading(false);
            }
          } catch { /* malformed line, skip */ }
        }
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-24">

      {/* Loading overlay */}
      {loading && <LoadingScreen progress={progress} query={query} />}

      {/* NAVBAR */}
      <header className="border-b-4 border-black px-8 py-5 flex justify-between items-center">
        <div className="flex items-center gap-10">
          <h1
            onClick={() => setActiveView("search")}
            className="text-2xl font-black tracking-tighter cursor-pointer hover:opacity-60 transition-opacity italic uppercase"
          >
            LIBRE-HIRE
          </h1>
          <nav className="hidden md:flex gap-6 text-xs font-mono uppercase tracking-widest text-gray-500">
            {(["how-to", "about"] as const).map(v => (
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={`hover:text-black transition-colors ${activeView === v ? 'text-black font-bold' : ''}`}
              >
                {v === 'how-to' ? 'How to Use' : 'About'}
              </button>
            ))}
          </nav>
        </div>
        <button
          onClick={() => setIsConfigOpen(true)}
          className="border-2 border-black px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
        >
          Configure Engine
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-14">

        {/* ── SEARCH VIEW ── */}
        {activeView === "search" && (
          <div>
            <div className="mb-14">
              <h2 className="text-4xl md:text-5xl font-black text-gray-200 tracking-tighter uppercase mb-5 leading-tight">
                STOP PAYING DATA BROKERS.<br />SOURCE BUILDERS ETHICALLY.
              </h2>
              <p className="font-mono text-sm leading-relaxed max-w-2xl font-semibold text-gray-700">
                The free, open-source alternative to Vamo, Nina by TraqCheck, and similar tools.
                We score by actual bytes of code written, real commit activity, and only surface contact
                details the developer has made public themselves.
              </p>
            </div>

            {/* SEARCH BAR */}
            <form onSubmit={handleHunt} className="relative flex items-end mb-14">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="kernel developers in bangalore"
                className="w-full text-3xl md:text-4xl font-bold bg-transparent border-b-4 border-black outline-none pb-4 pr-32 placeholder:text-gray-200"
                autoFocus
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-0 bottom-3 bg-black text-white px-6 py-3 font-mono font-bold tracking-widest text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                HUNT
              </button>
            </form>

            {/* ERROR */}
            {error && (
              <div className="border-4 border-red-500 bg-red-50 text-red-700 p-5 font-mono text-sm font-bold uppercase tracking-wide text-center mb-10">
                {error}
              </div>
            )}

            {/* RESULTS HEADER */}
            {results.length > 0 && (
              <div className="flex items-center justify-between mb-10 border-b-2 border-black pb-4">
                <span className="font-mono text-sm uppercase tracking-widest font-bold">
                  {results.length} ranked candidates
                </span>
                <span className="font-mono text-xs text-gray-400 uppercase tracking-widest">
                  Sorted by match · activity · quality
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
              <div className="text-center py-24">
                <p className="font-mono text-gray-300 text-sm uppercase tracking-widest">
                  Enter a search query to begin
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── HOW TO USE ── */}
        {activeView === "how-to" && (
          <div className="max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 border-b-4 border-black pb-4">How to Use</h2>
            <div className="space-y-10 font-mono text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">1. Get a GitHub Token</h3>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Go to <strong>GitHub → Settings → Developer Settings → Personal Access Tokens (Classic)</strong></li>
                  <li>Click <strong>Generate new token</strong>. No scopes needed — public data only.</li>
                  <li>Copy the token and paste it into Configure Engine.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">2. Add an AI Key</h3>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Click <strong>Configure Engine</strong> top-right.</li>
                  <li>Pick your provider: Gemini (free tier available), Claude, OpenAI, or any custom OpenAI-compatible endpoint.</li>
                  <li>Paste your key and click <strong>Save & Lock</strong>.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">3. Scoring Explained</h3>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Match (40pts):</strong> Primary language by bytes vs. the role's required stack. A Python dev gets near-zero for a kernel role.</li>
                  <li><strong>Activity (30pts):</strong> Actual events (pushes, PRs) in the last 90 days — not repo timestamps.</li>
                  <li><strong>Quality (20pts):</strong> Log-scaled stars + forks on original (non-fork) repos only.</li>
                  <li><strong>Profile (10pts):</strong> Email, bio, links — is this person actually findable?</li>
                </ul>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">4. Search Tips</h3>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Include both role and location: <em>"rust backend engineers in berlin"</em></li>
                  <li>Be specific about the role: <em>"kernel developer"</em> not just <em>"systems"</em></li>
                  <li>Roles with hard constraints: kernel, firmware, embedded, rust, golang, ml, frontend, devops, ios, android</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── ABOUT ── */}
        {activeView === "about" && (
          <div className="max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 border-b-4 border-black pb-4">About Libre-Hire</h2>
            <div className="space-y-8 font-mono text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Why this exists</h3>
                <p>Tools like Vamo and Nina by TraqCheck charge thousands per month and buy data from brokers — including contact info developers never consented to share. Libre-Hire only uses what GitHub developers have publicly posted on their own profiles.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Byte-weighted languages</h3>
                <p>We measure actual bytes of code written per language, not repo count. Counting repos is how you end up recommending someone with 3 hello-world Rust repos for a systems role.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Hard role constraints</h3>
                <p>Role-to-language mapping is hard-coded in the engine, not delegated to the AI. LLMs try to be inclusive and will suggest Python devs for kernel roles. Our constraint map is strict by design.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Real activity signals</h3>
                <p>The commit calendar and activity score use GitHub&apos;s public events API — actual PushEvents, PullRequestEvents — not the &apos;updated_at&apos; timestamp which updates on any edit.</p>
              </div>
              <p className="pt-6 border-t border-dashed border-gray-200 text-xs text-gray-400 uppercase tracking-widest">
                LIBRE-HIRE // FREE. OPEN SOURCE. SELF-HOSTABLE. // 2026
              </p>
            </div>
          </div>
        )}

      </main>

      {/* ── CONFIG MODAL ── */}
      {isConfigOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsConfigOpen(false); }}
        >
          <div className="bg-white border-4 border-black p-8 w-full max-w-md shadow-[8px_8px_0px_0px_#000]">
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6 border-b-2 border-black pb-3">
              Engine Configuration
            </h2>
            <div className="space-y-5 font-mono text-sm">
              <div>
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">AI Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                  className="w-full border-2 border-black p-3 outline-none bg-white focus:bg-gray-50"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom (OpenAI Compatible)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">LLM API Key</label>
                <input
                  type="password"
                  value={config.llmKey}
                  onChange={(e) => setConfig({ ...config, llmKey: e.target.value })}
                  className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                  placeholder="sk-... / AIza..."
                />
              </div>
              {config.provider === "custom" && (
                <>
                  <div>
                    <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">Base URL</label>
                    <input
                      type="text"
                      value={config.baseUrl}
                      onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                      className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                      placeholder="https://api.together.xyz/v1"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">Model Name</label>
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
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">GitHub Personal Token</label>
                <input
                  type="password"
                  value={config.githubToken}
                  onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                  className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                  placeholder="ghp_..."
                />
                <p className="text-gray-400 text-[10px] mt-1.5 leading-relaxed">
                  No scopes needed. Settings → Developer Settings → Personal Access Tokens (Classic)
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveConfig}
                  className="flex-1 bg-black text-white font-bold uppercase tracking-widest py-3 hover:bg-gray-800 transition-colors"
                >
                  Save & Lock
                </button>
                <button
                  onClick={() => setIsConfigOpen(false)}
                  className="flex-1 border-2 border-black font-bold uppercase tracking-widest py-3 hover:bg-gray-50 transition-colors"
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
