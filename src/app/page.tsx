"use client";

import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ContactDetails { email:string|null; twitter:string|null; linkedin:string|null; portfolio:string|null; }
interface CommitDay { date:string; count:number; }
interface LanguageBar { name:string; percentage:number; bytes:number; }
interface ScoreBreakdown { relevance:number; activityRecency:number; codeQuality:number; profileSignal:number; }
interface RepoSummary { name:string; description:string|null; stars:number; language:string|null; topics:string[]; url?:string; forks?:number; }

interface DeveloperProfile {
  handle:string; name:string; avatar:string; bio:string; location:string|null; company:string|null;
  followers:number; own_repos:number; stars:number; contactDetails:ContactDetails;
  languages:LanguageBar[]; proficientLanguages:string[]; commitCalendar:CommitDay[];
  topRepos:RepoSummary[]; score:number; scoreBreakdown:ScoreBreakdown; summary:string; accountCreated:string;
}

interface ProfileDeepDive {
  handle:string; name:string; avatar:string; bio:string; location:string|null; company:string|null;
  followers:number; following:number; own_repos:number; stars:number; forks:number;
  totalContribs:number; activeDays:number; contactDetails:ContactDetails;
  languages:LanguageBar[]; commitCalendar:CommitDay[]; topRepos:RepoSummary[];
  score:number; scoreBreakdown:Record<string,number>; summary:string; accountCreated:string;
}

interface ProgressState { step:number; total:number; label:string; }

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE COLORS
// ─────────────────────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string,string> = {
  TypeScript:'#3178c6',JavaScript:'#f7df1e',Python:'#3572a5',Rust:'#dea584',
  Go:'#00add8',C:'#555555','C++':'#f34b7d',Java:'#b07219',Kotlin:'#a97bff',
  Swift:'#ffac45',Ruby:'#701516',PHP:'#4f5d95',Zig:'#ec915c',Haskell:'#5e5086',
  Elixir:'#6e4a7e',Lua:'#000080',Dart:'#00b4ab',Scala:'#c22d40','C#':'#178600',
  Shell:'#89e051',HTML:'#e34c26',CSS:'#563d7c',Assembly:'#6e4c13',
  'Objective-C':'#438eff',Fortran:'#4d41b1',Julia:'#a270ba',
  'Jupyter Notebook':'#da5b0b',HCL:'#844fba',Solidity:'#AA6746',
};
const langColor = (n:string) => LANG_COLORS[n] || '#888';

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT CALENDAR — full year, GitHub-style grid with month labels
// ─────────────────────────────────────────────────────────────────────────────

function CommitCalendar({ days }: { days: CommitDay[] }) {
  if (!days?.length) return (
    <div className="mt-5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-300">Contribution data unavailable</span>
    </div>
  );

  const max = Math.max(...days.map(d => d.count), 1);
  const total = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter(d => d.count > 0).length;

  function cellClass(c:number) {
    if (c === 0) return 'bg-gray-100 border border-gray-200';
    const p = c/max;
    if (p > 0.75) return 'bg-gray-900 border border-gray-800';
    if (p > 0.4)  return 'bg-gray-600 border border-gray-500';
    if (p > 0.15) return 'bg-gray-400 border border-gray-300';
    return 'bg-gray-200 border border-gray-200';
  }

  // Group into weeks
  const weeks: CommitDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, Math.min(i+7, days.length)));

  // Build month labels: check when month changes across weeks
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels: { idx:number; label:string }[] = [];
  weeks.forEach((week, wi) => {
    if (!week[0]) return;
    const m = new Date(week[0].date).getMonth();
    if (wi === 0 || m !== new Date(weeks[wi-1][0]?.date || week[0].date).getMonth()) {
      monthLabels.push({ idx: wi, label: monthNames[m] });
    }
  });

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
          Contributions · Past Year
        </span>
        <span className="text-[10px] font-mono text-gray-400">
          {total.toLocaleString()} total · {active} active days
        </span>
      </div>
      {/* Month labels */}
      <div className="relative mb-1" style={{ paddingLeft: 0 }}>
        <div className="flex gap-[3px]">
          {weeks.map((_, wi) => {
            const label = monthLabels.find(m => m.idx === wi);
            return (
              <div key={wi} className="w-[11px] flex-shrink-0">
                {label && <span className="text-[8px] font-mono text-gray-400 whitespace-nowrap">{label.label}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Grid */}
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px] flex-shrink-0">
            {week.map((day, di) => (
              <div
                key={di}
                title={`${day.date}: ${day.count} contribution${day.count!==1?'s':''}`}
                className={`w-[11px] h-[11px] rounded-sm cursor-default ${cellClass(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[9px] font-mono text-gray-400">Less</span>
        {[0,0.15,0.4,0.75,1].map((v,i) => (
          <div key={i} className={`w-[10px] h-[10px] rounded-sm ${cellClass(Math.round(v*max))}`} />
        ))}
        <span className="text-[9px] font-mono text-gray-400">More</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE BARS
// ─────────────────────────────────────────────────────────────────────────────

function LanguageProficiency({ languages }: { languages: LanguageBar[] }) {
  if (!languages?.length) return null;
  return (
    <div className="mt-4">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block mb-2">Language Proficiency · Byte-Weighted</span>
      <div className="flex h-2 rounded-full overflow-hidden w-full mb-2.5 gap-px">
        {languages.map(l => (
          <div key={l.name} style={{ width:`${l.percentage}%`, backgroundColor:langColor(l.name) }} title={`${l.name}: ${l.percentage}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {languages.map(l => (
          <div key={l.name} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor:langColor(l.name) }} />
            <span className="text-[11px] font-mono text-gray-600">{l.name} <span className="text-gray-400">{l.percentage}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE BOX
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBox({ score, breakdown }: { score:number; breakdown:Record<string,number>|ScoreBreakdown }) {
  const bg = score>=75?'bg-black text-white':score>=50?'bg-gray-800 text-white':score>=30?'bg-gray-200 text-black':'bg-gray-100 text-gray-400';

  // Normalize breakdown to display pairs
  const entries = Object.entries(breakdown).map(([k,v]) => ({
    label: k.replace(/([A-Z])/g,' $1').replace('activityRecency','Activity').replace('codeQuality','Quality').replace('profileSignal','Profile').replace('relevance','Match').trim(),
    val: v as number,
    max: k==='relevance'||k==='codeQuality'?40:k==='activityRecency'||k==='activity'?30:k==='profileSignal'||k==='profileCompleteness'?20:10,
  }));

  return (
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <div className={`${bg} w-16 h-16 flex items-center justify-center font-black text-2xl border-2 border-black`}>{score}</div>
      <div className="space-y-0.5">
        {entries.map(({ label, val, max }) => (
          <div key={label} className="flex items-center gap-2 justify-end">
            <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 w-14 text-right truncate">{label}</span>
            <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-black rounded-full" style={{ width:`${Math.min((val/max)*100,100)}%` }} />
            </div>
            <span className="text-[9px] font-mono text-gray-500 w-8 text-right">{Math.round(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT SECTION — with label and arrow
// ─────────────────────────────────────────────────────────────────────────────

function ContactSection({ handle, contact }: { handle:string; contact:ContactDetails }) {
  const links = [
    { label:'GitHub',    href:`https://github.com/${handle}`, always:true },
    contact.email     && { label:'Email',     href:`mailto:${contact.email}` },
    contact.twitter   && { label:'Twitter',   href:`https://twitter.com/${contact.twitter}` },
    contact.linkedin  && { label:'LinkedIn',  href:contact.linkedin },
    contact.portfolio && { label:'Portfolio', href:contact.portfolio },
  ].filter(Boolean) as { label:string; href:string }[];

  if (links.length <= 1) return (
    <a href={`https://github.com/${handle}`} target="_blank" rel="noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 border-2 border-black text-[10px] font-mono px-2.5 py-1 uppercase tracking-wider hover:bg-black hover:text-white transition-colors">
      GitHub ↗
    </a>
  );

  return (
    <div className="mt-3 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 uppercase tracking-widest flex-shrink-0">
        <span>Contact</span>
        <span className="text-gray-300">→</span>
      </div>
      {links.map(({ label, href }) => (
        <a key={label} href={href} target={href.startsWith('mailto')?undefined:'_blank'} rel="noreferrer"
          className="border-2 border-black text-[10px] font-mono px-2.5 py-1 uppercase tracking-wider hover:bg-black hover:text-white transition-colors">
          {label}
        </a>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB USERNAME BUTTON — distinctive, clickable
// ─────────────────────────────────────────────────────────────────────────────

function GitHubHandle({ handle }: { handle:string }) {
  return (
    <a
      href={`https://github.com/${handle}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 mt-0.5 group"
    >
      <span className="bg-gray-900 text-white font-mono text-xs px-2 py-0.5 rounded-sm group-hover:bg-black transition-colors flex items-center gap-1">
        {/* GitHub Mark SVG */}
        <svg height="12" viewBox="0 0 16 16" width="12" fill="white">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        @{handle}
      </span>
      <span className="text-[10px] font-mono text-gray-400 group-hover:text-black transition-colors">↗</span>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP REPOS LIST (for profile deep-dive)
// ─────────────────────────────────────────────────────────────────────────────

function TopRepos({ repos }: { repos: RepoSummary[] }) {
  if (!repos?.length) return null;
  return (
    <div className="mt-5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block mb-2">Notable Projects</span>
      <div className="space-y-2">
        {repos.slice(0, 5).map(r => (
          <div key={r.name} className="border border-gray-200 px-3 py-2 hover:border-gray-400 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-sm font-bold hover:underline truncate block">{r.name}</a>
                ) : (
                  <span className="font-mono text-sm font-bold truncate block">{r.name}</span>
                )}
                {r.description && <p className="text-xs text-gray-500 font-mono mt-0.5 leading-relaxed">{r.description}</p>}
                {r.topics?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.topics.map(t => <span key={t} className="text-[9px] font-mono bg-gray-100 px-1.5 py-0.5 text-gray-600">{t}</span>)}
                  </div>
                )}
              </div>
              <div className="flex gap-3 flex-shrink-0 text-[10px] font-mono text-gray-400">
                {r.language && (
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor:langColor(r.language) }} />{r.language}
                  </span>
                )}
                <span>★{r.stars}</span>
                {r.forks != null && <span>⑂{r.forks}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER CARD (search results)
// ─────────────────────────────────────────────────────────────────────────────

function DeveloperCard({ profile, rank }: { profile:DeveloperProfile; rank:number }) {
  const [bioOpen, setBioOpen] = useState(false);
  return (
    <div className="border-l-8 border-black pl-8 relative">
      <div className="absolute -left-5 top-0 w-10 h-10 bg-black text-white flex items-center justify-center font-black text-sm">#{rank}</div>
      <div className="flex justify-between items-start gap-6 mb-4">
        <div className="flex items-start gap-5 flex-1 min-w-0">
          <img src={profile.avatar} alt={profile.handle} className="w-20 h-20 border-4 border-black object-cover flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">{profile.name}</h3>
            <GitHubHandle handle={profile.handle} />
            {profile.location && <div className="text-[11px] font-mono text-gray-400 mt-0.5">{profile.location}</div>}
            <div className="flex gap-5 mt-2.5">
              {[{ label:'followers',val:profile.followers.toLocaleString()},{label:'repos',val:profile.own_repos},{label:'stars',val:profile.stars.toLocaleString()}].map(({label,val})=>(
                <div key={label}>
                  <div className="text-base font-black leading-none">{val}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400">{label}</div>
                </div>
              ))}
            </div>
            <ContactSection handle={profile.handle} contact={profile.contactDetails} />
          </div>
        </div>
        {profile.scoreBreakdown && <ScoreBox score={profile.score} breakdown={profile.scoreBreakdown} />}
      </div>

      {profile.summary && (
        <div className="border-l-4 border-gray-200 pl-4 mb-2">
          <p className="font-mono text-sm text-gray-700 leading-relaxed italic">{profile.summary}</p>
        </div>
      )}

      <LanguageProficiency languages={profile.languages} />
      <CommitCalendar days={profile.commitCalendar} />

      {profile.bio && (
        <div className="mt-4">
          <button onClick={()=>setBioOpen(v=>!v)} className="text-[10px] font-mono uppercase tracking-widest text-gray-400 hover:text-black transition-colors">
            {bioOpen?'▲ Hide bio':'▼ Show bio'}
          </button>
          {bioOpen && <p className="mt-2 text-sm text-gray-600 font-mono leading-relaxed border-l-2 border-gray-200 pl-3">{profile.bio}</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE DEEP DIVE CARD (username lookup)
// ─────────────────────────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile:ProfileDeepDive }) {
  return (
    <div className="border-4 border-black p-8">
      {/* Header */}
      <div className="flex justify-between items-start gap-6 mb-6">
        <div className="flex items-start gap-6 flex-1">
          <img src={profile.avatar} alt={profile.handle} className="w-28 h-28 border-4 border-black object-cover flex-shrink-0" />
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">{profile.name}</h2>
            <GitHubHandle handle={profile.handle} />
            {profile.location && <div className="font-mono text-sm text-gray-500 mt-1">📍 {profile.location}</div>}
            {profile.company && <div className="font-mono text-sm text-gray-500">🏢 {profile.company}</div>}
            <div className="flex gap-6 mt-3">
              {[
                {label:'followers',val:profile.followers.toLocaleString()},
                {label:'following',val:profile.following.toLocaleString()},
                {label:'repos',val:profile.own_repos},
                {label:'stars',val:profile.stars.toLocaleString()},
                {label:'forks',val:profile.forks.toLocaleString()},
                {label:'contributions/yr',val:profile.totalContribs.toLocaleString()},
              ].map(({label,val})=>(
                <div key={label} className="text-center">
                  <div className="text-xl font-black leading-none">{val}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400">{label}</div>
                </div>
              ))}
            </div>
            <ContactSection handle={profile.handle} contact={profile.contactDetails} />
          </div>
        </div>
        <ScoreBox score={profile.score} breakdown={profile.scoreBreakdown} />
      </div>

      {/* AI Assessment */}
      {profile.summary && (
        <div className="border-2 border-black p-4 mb-6 bg-gray-50">
          <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-2">AI Profile Assessment</div>
          <p className="font-mono text-sm text-gray-800 leading-relaxed">{profile.summary}</p>
        </div>
      )}

      <LanguageProficiency languages={profile.languages} />
      <CommitCalendar days={profile.commitCalendar} />
      <TopRepos repos={profile.topRepos} />

      {profile.bio && (
        <div className="mt-5 border-l-4 border-gray-200 pl-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1">Bio</div>
          <p className="text-sm text-gray-600 font-mono leading-relaxed">{profile.bio}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function LoadingScreen({ progress, query }: { progress:ProgressState; query:string }) {
  const pct = Math.round((progress.step / progress.total) * 100);
  const steps6 = ['Parsing intent','Searching GitHub','Reading profiles','Language & calendar','Scoring','AI assessment'];
  const steps4 = ['Fetching profile','Analysing code','Computing scores','AI assessment'];
  const steps = progress.total === 4 ? steps4 : steps6;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center px-8">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black uppercase tracking-tighter italic mb-2">LIBRE-HIRE</h1>
        <p className="font-mono text-sm text-gray-500">Hunting: <span className="text-black font-bold">{query}</span></p>
      </div>
      <div className="w-full max-w-lg mb-6">
        <div className="flex justify-between items-end mb-2">
          <span className="font-mono text-xs text-gray-500 uppercase tracking-widest">Stage {progress.step} of {progress.total}</span>
          <span className="font-black text-3xl">{pct}%</span>
        </div>
        <div className="w-full h-3 bg-gray-100 border-2 border-black">
          <div className="h-full bg-black transition-all duration-700 ease-out" style={{ width:`${pct}%` }} />
        </div>
      </div>
      <p className="font-mono text-sm text-gray-600 mb-10 text-center max-w-md min-h-[1.5rem]">{progress.label}</p>
      <div className="space-y-2 w-full max-w-sm">
        {steps.map((s, i) => {
          const n = i+1, done = n<progress.step, active = n===progress.step;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center text-[10px] font-black
                ${done?'border-black bg-black text-white':active?'border-black bg-white animate-pulse':'border-gray-200 text-gray-300'}`}>
                {done?'✓':n}
              </div>
              <span className={`font-mono text-xs uppercase tracking-widest
                ${done?'text-gray-400 line-through':active?'text-black font-bold':'text-gray-300'}`}>
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
  const [activeTab, setActiveTab] = useState<'hunt'|'profile'>('hunt');
  const [query, setQuery]     = useState('');
  const [username, setUsername] = useState('');
  const [results, setResults]   = useState<DeveloperProfile[]>([]);
  const [profileData, setProfileData] = useState<ProfileDeepDive|null>(null);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ step:0, total:6, label:'' });
  const [error, setError]       = useState('');
  const [activeView, setActiveView] = useState<'search'|'how-to'|'about'>('search');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [config, setConfig]     = useState({ provider:'gemini', llmKey:'', githubToken:'', baseUrl:'', modelName:'' });

  useEffect(() => {
    try { const s = localStorage.getItem('librehire_config'); if (s) setConfig(JSON.parse(s)); } catch { /* ignore */ }
  }, []);

  const saveConfig = () => { localStorage.setItem('librehire_config', JSON.stringify(config)); setIsConfigOpen(false); };

  async function streamRequest(endpoint: string, body: object, totalSteps: number) {
    setLoading(true); setError(''); setProgress({ step: 1, total: totalSteps, label: 'Starting...' });
    let result: any = null;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Server ${res.status}: ${t.slice(0, 200)}`);
      }
      if (!res.body) throw new Error('No stream from server');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (value) buf += dec.decode(value, { stream: !done });
        const lines = buf.split('\n');
        buf = done ? '' : (lines.pop() || '');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'progress') setProgress({ step: msg.step, total: msg.total, label: msg.label });
            else if (msg.type === 'done') result = msg.data;
            else if (msg.type === 'error') { setError(msg.message); setLoading(false); return null; }
          } catch { /* skip malformed */ }
        }
        if (done) break;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Check your API keys and GitHub token.');
    }
    setLoading(false);
    return result;
  }

  const handleHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!config.githubToken) { setError('Missing GitHub Token — click Configure Engine.'); return; }
    setResults([]); setProfileData(null);
    const data = await streamRequest('/api/hunt', { userQuery:query, provider:config.provider, llmKey:config.llmKey, githubToken:config.githubToken, baseUrl:config.baseUrl, modelName:config.modelName }, 6);
    if (data) setResults(data);
  };

  const handleProfileLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim().replace(/^@/,'').replace(/.*github\.com\//,'');
    if (!u) return;
    if (!config.githubToken) { setError('Missing GitHub Token — click Configure Engine.'); return; }
    setProfileData(null); setResults([]);
    const data = await streamRequest('/api/profile', { username:u, provider:config.provider, llmKey:config.llmKey, githubToken:config.githubToken, baseUrl:config.baseUrl, modelName:config.modelName }, 4);
    if (data) setProfileData(data);
  };

  const currentQuery = activeTab === 'hunt' ? query : username;

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-24">

      {loading && <LoadingScreen progress={progress} query={currentQuery} />}

      {/* NAVBAR */}
      <header className="border-b-4 border-black px-8 py-5 flex justify-between items-center">
        <div className="flex items-center gap-10">
          <h1 onClick={()=>setActiveView('search')} className="text-2xl font-black tracking-tighter cursor-pointer hover:opacity-60 italic uppercase">LIBRE-HIRE</h1>
          <nav className="hidden md:flex gap-6 text-xs font-mono uppercase tracking-widest text-gray-500">
            {(['how-to','about'] as const).map(v=>(
              <button key={v} onClick={()=>setActiveView(v)} className={`hover:text-black transition-colors ${activeView===v?'text-black font-bold':''}`}>
                {v==='how-to'?'How to Use':'About'}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={()=>setIsConfigOpen(true)} className="border-2 border-black px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors">
          Configure Engine
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-14">

        {activeView === 'search' && (
          <div>
            {/* HERO */}
            <div className="mb-10">
              <h2 className="text-4xl md:text-5xl font-black text-gray-200 tracking-tighter uppercase mb-4 leading-tight">
                STOP PAYING DATA BROKERS.<br />SOURCE BUILDERS ETHICALLY.
              </h2>
              <p className="font-mono text-sm leading-relaxed max-w-2xl font-semibold text-gray-700">
                The free, open-source alternative to Vamo and Nina by TraqCheck. Real commit data, byte-weighted languages, ethical contact discovery.
              </p>
            </div>

            {/* TABS */}
            <div className="flex border-b-4 border-black mb-10">
              <button
                onClick={()=>setActiveTab('hunt')}
                className={`px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest transition-colors ${activeTab==='hunt'?'bg-black text-white':'hover:bg-gray-100'}`}
              >
                🔍 Hunt Developers
              </button>
              <button
                onClick={()=>setActiveTab('profile')}
                className={`px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest transition-colors ${activeTab==='profile'?'bg-black text-white':'hover:bg-gray-100'}`}
              >
                👤 Profile Deep-Dive
              </button>
            </div>

            {/* HUNT TAB */}
            {activeTab === 'hunt' && (
              <div>
                <form onSubmit={handleHunt} className="relative flex items-end mb-4">
                  <input
                    type="text" value={query} onChange={e=>setQuery(e.target.value)}
                    placeholder="kernel developers in bangalore"
                    className="w-full text-3xl md:text-4xl font-bold bg-transparent border-b-4 border-black outline-none pb-4 pr-32 placeholder:text-gray-200"
                    autoFocus
                  />
                  <button type="submit" disabled={loading}
                    className="absolute right-0 bottom-3 bg-black text-white px-6 py-3 font-mono font-bold tracking-widest text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors">
                    HUNT
                  </button>
                </form>
                {/* Search tips */}
                <div className="mb-10 flex flex-wrap gap-2">
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mr-1 self-center">Try:</span>
                  {[
                    'react developers in berlin',
                    'founder of xeneva',
                    'rust backend engineers india',
                    'ml researcher python',
                    'ios developer san francisco',
                    'devops engineer with kubernetes',
                    'who built supabase',
                  ].map(tip=>(
                    <button key={tip} onClick={()=>setQuery(tip)}
                      className="text-[11px] font-mono border border-gray-300 px-2 py-1 text-gray-500 hover:border-black hover:text-black hover:bg-gray-50 transition-colors">
                      {tip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PROFILE DEEP-DIVE TAB */}
            {activeTab === 'profile' && (
              <div>
                <div className="mb-5">
                  <p className="font-mono text-sm text-gray-600 mb-6 leading-relaxed">
                    Enter any GitHub username to get a full AI-powered profile assessment — their projects, tech depth, activity, and fit. Perfect when you already have a candidate in mind.
                  </p>
                </div>
                <form onSubmit={handleProfileLookup} className="relative flex items-end mb-10">
                  <div className="absolute left-0 bottom-4 text-gray-400 font-mono text-3xl md:text-4xl font-bold">@</div>
                  <input
                    type="text" value={username} onChange={e=>setUsername(e.target.value)}
                    placeholder="torvalds"
                    className="w-full text-3xl md:text-4xl font-bold bg-transparent border-b-4 border-black outline-none pb-4 pl-10 pr-40 placeholder:text-gray-200"
                    autoFocus
                  />
                  <button type="submit" disabled={loading}
                    className="absolute right-0 bottom-3 bg-black text-white px-6 py-3 font-mono font-bold tracking-widest text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors">
                    ANALYSE
                  </button>
                </form>
                <div className="flex flex-wrap gap-2 mb-6">
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mr-1 self-center">Try:</span>
                  {['torvalds','gaearon','antirez','yyx990803','tj'].map(u=>(
                    <button key={u} onClick={()=>setUsername(u)}
                      className="text-[11px] font-mono border border-gray-300 px-2 py-1 text-gray-500 hover:border-black hover:text-black transition-colors">
                      @{u}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ERROR */}
            {error && (
              <div className="border-4 border-red-500 bg-red-50 text-red-700 p-5 font-mono text-sm font-bold uppercase tracking-wide text-center mb-10">
                {error}
              </div>
            )}

            {/* PROFILE RESULT */}
            {profileData && <ProfileCard profile={profileData} />}

            {/* HUNT RESULTS */}
            {results.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-10 border-b-2 border-black pb-4">
                  <span className="font-mono text-sm uppercase tracking-widest font-bold">{results.length} ranked candidates</span>
                  <span className="font-mono text-xs text-gray-400 uppercase tracking-widest">Sorted by match · activity · quality</span>
                </div>
                <div className="space-y-16">
                  {results.map((p, i) => <DeveloperCard key={p.handle} profile={p} rank={i+1} />)}
                </div>
              </>
            )}

            {!loading && !error && !results.length && !profileData && (
              <div className="text-center py-20">
                <p className="font-mono text-gray-300 text-sm uppercase tracking-widest">
                  {activeTab === 'hunt' ? 'Enter a search query above' : 'Enter a GitHub username above'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* HOW TO USE */}
        {activeView === 'how-to' && (
          <div className="max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 border-b-4 border-black pb-4">How to Use</h2>
            <div className="space-y-10 font-mono text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">1. Get a GitHub Token</h3>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>GitHub → Settings → Developer Settings → Personal Access Tokens (Classic)</li>
                  <li>Generate new token. No scopes needed — we only read public data.</li>
                  <li>Paste it into Configure Engine.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">2. Hunt Developers</h3>
                <p className="mb-2">Use natural language — be as vague or specific as you like:</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li><strong className="text-black">Role + location:</strong> "rust backend engineers in berlin"</li>
                  <li><strong className="text-black">Find a person:</strong> "founder of xeneva" or "who built supabase"</li>
                  <li><strong className="text-black">Skill only:</strong> "machine learning researcher python"</li>
                  <li><strong className="text-black">Specific stack:</strong> "react developer with next.js experience"</li>
                </ul>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">3. Profile Deep-Dive</h3>
                <p>Already have a candidate's GitHub username? Switch to the Profile tab. Enter their username and get a full AI assessment of what they've built, their tech depth, and contribution consistency.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">4. Understanding Scores</h3>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Match (40pts):</strong> Primary language by bytes vs. query intent</li>
                  <li><strong>Activity (30pts):</strong> Real GitHub events in last 90 days</li>
                  <li><strong>Quality (20pts):</strong> Stars + forks on original repos</li>
                  <li><strong>Profile (10pts):</strong> Email, bio, links — reachability</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT */}
        {activeView === 'about' && (
          <div className="max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 border-b-4 border-black pb-4">About Libre-Hire</h2>
            <div className="space-y-8 font-mono text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Why it exists</h3>
                <p>Tools like Vamo and Nina by TraqCheck charge thousands per month and source contact data from brokers. Libre-Hire only uses what developers have publicly shared on GitHub themselves.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Intelligent search modes</h3>
                <p>The engine detects whether you're searching for a person ("founder of X"), a technical role ("kernel developer"), or an open skill ("react developer") and uses different search strategies for each.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Real data only</h3>
                <p>The full-year contribution calendar uses GitHub's GraphQL API — the same data GitHub itself shows on profiles. Language proficiency is measured in bytes of actual code written, not repo count.</p>
              </div>
              <p className="pt-6 border-t border-dashed border-gray-200 text-xs text-gray-400 uppercase tracking-widest">
                LIBRE-HIRE // FREE. OPEN SOURCE. ETHICAL. // 2026
              </p>
            </div>
          </div>
        )}

      </main>

      {/* CONFIG MODAL */}
      {isConfigOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e=>{if(e.target===e.currentTarget)setIsConfigOpen(false);}}>
          <div className="bg-white border-4 border-black p-8 w-full max-w-md shadow-[8px_8px_0px_0px_#000]">
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6 border-b-2 border-black pb-3">Engine Configuration</h2>
            <div className="space-y-5 font-mono text-sm">
              <div>
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">AI Provider</label>
                <select value={config.provider} onChange={e=>setConfig({...config,provider:e.target.value})} className="w-full border-2 border-black p-3 outline-none bg-white">
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom (OpenAI Compatible)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">LLM API Key</label>
                <input type="password" value={config.llmKey} onChange={e=>setConfig({...config,llmKey:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="sk-... / AIza..." />
              </div>
              {config.provider==='custom'&&(<>
                <div>
                  <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">Base URL</label>
                  <input type="text" value={config.baseUrl} onChange={e=>setConfig({...config,baseUrl:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="https://api.together.xyz/v1" />
                </div>
                <div>
                  <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">Model Name</label>
                  <input type="text" value={config.modelName} onChange={e=>setConfig({...config,modelName:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="meta-llama/Llama-3-70b-chat-hf" />
                </div>
              </>)}
              <div>
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">GitHub Personal Token</label>
                <input type="password" value={config.githubToken} onChange={e=>setConfig({...config,githubToken:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="ghp_..." />
                <p className="text-gray-400 text-[10px] mt-1.5">Settings → Developer Settings → Personal Access Tokens (Classic) — no scopes needed</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={saveConfig} className="flex-1 bg-black text-white font-bold uppercase tracking-widest py-3 hover:bg-gray-800">Save & Lock</button>
                <button onClick={()=>setIsConfigOpen(false)} className="flex-1 border-2 border-black font-bold uppercase tracking-widest py-3 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
