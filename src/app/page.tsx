"use client";

import React, { useState, useEffect, Fragment } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ContactDetails { email:string|null; twitter:string|null; linkedin:string|null; portfolio:string|null; }
interface CommitDay { date:string; count:number; }
interface LanguageBar { name:string; percentage:number; bytes:number; }
interface ScoreBreakdown { relevance:number; activityRecency:number; codeQuality:number; profileSignal:number; locationMatch?:number; }
interface RepoSummary { name:string; description:string|null; stars:number; language:string|null; topics:string[]; url?:string; forks?:number; }

interface DeveloperProfile {
  handle:string; name:string; avatar:string; bio:string; location:string|null; company:string|null;
  followers:number; own_repos:number; stars:number; contactDetails:ContactDetails;
  languages:LanguageBar[]; proficientLanguages:string[]; commitCalendar:CommitDay[];
  topRepos:RepoSummary[]; score:number; scoreBreakdown:ScoreBreakdown; summary:string; accountCreated:string;
  matchTier?: 'full' | 'primary' | 'none';
  missingLangs?: string[];
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
  const entries = Object.entries(breakdown)
    .filter(([k]) => k !== 'locationMatch') // shown separately
    .map(([k,v]) => ({
      label: k.replace(/([A-Z])/g,' $1').replace('activityRecency','Activity').replace('codeQuality','Quality').replace('profileSignal','Profile').replace('relevance','Match').trim(),
      val: v as number,
      max: k==='relevance'||k==='codeQuality'?40:k==='activityRecency'||k==='activity'?30:k==='profileSignal'||k==='profileCompleteness'?20:10,
    }));
  const locMatch = (breakdown as any).locationMatch as number | undefined;

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
  const tier = profile.matchTier ?? 'full';
  const missing = profile.missingLangs ?? [];
  const borderColor = tier === 'full' ? 'border-black' : tier === 'primary' ? 'border-amber-400' : 'border-yellow-300';
  return (
    <div className={`border-l-8 pl-8 relative ${borderColor}`}>
      <div className="absolute -left-5 top-0 w-10 h-10 bg-black text-white flex items-center justify-center font-black text-sm">#{rank}</div>
      {tier === 'primary' && missing.length > 0 && (
        <div className="inline-flex items-center gap-1.5 mb-3 border border-amber-400 bg-amber-50 px-2 py-0.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-700">
            ⚠ {missing.map(l => l.charAt(0).toUpperCase()+l.slice(1)).join(', ')} not found in repos
          </span>
        </div>
      )}
      {tier === 'none' && (
        <div className="inline-flex items-center gap-1.5 mb-3 border border-yellow-400 bg-yellow-50 px-2 py-0.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-yellow-700">
            Near Match — {missing.length > 0 ? `${missing.map(l=>l.charAt(0).toUpperCase()+l.slice(1)).join(' & ')} not found` : 'partial overlap only'}
          </span>
        </div>
      )}
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

// ─────────────────────────────────────────────────────────────────────────────
// PRECISION HUNT — job profile + language + location options
// ─────────────────────────────────────────────────────────────────────────────

const JOB_PROFILES = [
  'Systems / Kernel','Kernel / Low-Level','Firmware / Embedded',
  'Frontend','Backend','Full Stack',
  'Machine Learning / AI','Data Engineer','Data Scientist',
  'DevOps / SRE','Security','QA / Testing',
  'Mobile (iOS/Android)','iOS','Android',
  'Blockchain / Web3','Game / Graphics',
];

const LANG_OPTIONS = [
  'C','C++','Rust','Go','Zig','Assembly',
  'Python','Java','Kotlin','Swift','Objective-C',
  'TypeScript','JavaScript','HTML','CSS',
  'Ruby','PHP','Scala','Elixir','Haskell',
  'Dart','Lua','Julia','R','Solidity','Shell',
];

function PrecisionHunt({ onSubmit, loading }: {
  onSubmit: (params: { jobProfile: string; languages: string[]; country: string; state: string; city: string }) => void;
  loading: boolean;
}) {
  const [jobProfile, setJobProfile] = useState('');
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');

  const toggleLang = (l: string) =>
    setSelectedLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobProfile && selectedLangs.length === 0) return;
    onSubmit({ jobProfile, languages: selectedLangs, country, state, city });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 mb-10">
      {/* Row 1: Job Profile */}
      <div>
        <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500 mb-3">1 · Job Profile</label>
        <div className="flex flex-wrap gap-2">
          {JOB_PROFILES.map(p => (
            <button
              key={p} type="button"
              onClick={() => setJobProfile(prev => prev === p ? '' : p)}
              className={`text-xs font-mono px-3 py-1.5 border-2 transition-colors ${
                jobProfile === p ? 'border-black bg-black text-white' : 'border-gray-300 text-gray-600 hover:border-black hover:text-black'
              }`}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Row 2: Language Proficiency */}
      <div>
        <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500 mb-3">
          2 · Language Proficiency <span className="text-gray-400 normal-case">(pick all that apply)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {LANG_OPTIONS.map(l => (
            <button
              key={l} type="button"
              onClick={() => toggleLang(l)}
              className={`text-xs font-mono px-3 py-1.5 border-2 transition-colors ${
                selectedLangs.includes(l) ? 'border-black bg-black text-white' : 'border-gray-300 text-gray-600 hover:border-black hover:text-black'
              }`}
            >{l}</button>
          ))}
        </div>
        {selectedLangs.length > 0 && (
          <p className="mt-2 text-[10px] font-mono text-gray-400">
            Selected: <span className="text-black font-bold">{selectedLangs.join(', ')}</span>
            &nbsp;·&nbsp;
            <button type="button" onClick={() => setSelectedLangs([])} className="underline hover:text-black">clear</button>
          </p>
        )}
      </div>

      {/* Row 3: Location */}
      <div>
        <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500 mb-3">3 · Location <span className="text-gray-400 normal-case">(all optional)</span></label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[9px] font-mono text-gray-400 uppercase tracking-widest mb-1">Country</label>
            <input
              type="text" value={country} onChange={e => setCountry(e.target.value)}
              placeholder="India, USA, Germany…"
              className="w-full border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-gray-50 placeholder:text-gray-300"
            />
          </div>
          <div>
            <label className="block text-[9px] font-mono text-gray-400 uppercase tracking-widest mb-1">State / Region</label>
            <input
              type="text" value={state} onChange={e => setState(e.target.value)}
              placeholder="Karnataka, California…"
              className="w-full border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-gray-50 placeholder:text-gray-300"
            />
          </div>
          <div>
            <label className="block text-[9px] font-mono text-gray-400 uppercase tracking-widest mb-1">City</label>
            <input
              type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="Bangalore, Berlin, NYC…"
              className="w-full border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-gray-50 placeholder:text-gray-300"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit" disabled={loading || (!jobProfile && selectedLangs.length === 0)}
        className="bg-black text-white px-8 py-3.5 font-mono font-bold tracking-widest text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors uppercase"
      >
        PRECISION HUNT
      </button>
    </form>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'hunt'|'profile'|'precision'>('hunt');
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
  const [precisionLabel, setPrecisionLabel] = useState('');
  const [searchQuality, setSearchQuality] = useState<'good'|'partial'|'none'|null>(null);

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
            else if (msg.type === 'done') { result = msg.data; if (msg.searchQuality) setSearchQuality(msg.searchQuality); }
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
    setResults([]); setProfileData(null); setSearchQuality(null);
    const data = await streamRequest('/api/hunt', { userQuery:query, provider:config.provider, llmKey:config.llmKey, githubToken:config.githubToken, baseUrl:config.baseUrl, modelName:config.modelName }, 6);
    if (data) setResults(data);
  };

  const handleProfileLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim().replace(/^@/,'').replace(/.*github\.com\//,'');
    if (!u) return;
    if (!config.githubToken) { setError('Missing GitHub Token — click Configure Engine.'); return; }
    setProfileData(null); setResults([]); setSearchQuality(null);
    const data = await streamRequest('/api/profile', { username:u, provider:config.provider, llmKey:config.llmKey, githubToken:config.githubToken, baseUrl:config.baseUrl, modelName:config.modelName }, 4);
    if (data) setProfileData(data);
  };

  const handleDeterministicHunt = async (params: { jobProfile: string; languages: string[]; country: string; state: string; city: string }) => {
    if (!config.githubToken) { setError('Missing GitHub Token — click Configure Engine.'); return; }
    setResults([]); setProfileData(null);
    const label = [params.jobProfile, params.languages.slice(0,3).join('+'), params.city || params.state || params.country].filter(Boolean).join(' · ');
    setPrecisionLabel(label);
    const data = await streamRequest('/api/hunt', {
      searchMode: 'deterministic',
      jobProfile: params.jobProfile,
      languages: params.languages,
      country: params.country,
      state: params.state,
      city: params.city,
      provider: config.provider, llmKey: config.llmKey,
      githubToken: config.githubToken, baseUrl: config.baseUrl, modelName: config.modelName,
    }, 6);
    if (data) setResults(data);
  };

  const currentQuery = activeTab === 'hunt' ? query : activeTab === 'precision' ? precisionLabel : username;

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-24">

      {loading && <LoadingScreen progress={progress} query={currentQuery} />}

      {/* NAVBAR */}
      <header className="border-b-4 border-black px-8 py-5 flex justify-between items-center">
        <div className="flex items-center gap-10">
          <h1
            onClick={() => {
              setActiveView('search');
              setResults([]);
              setProfileData(null);
              setQuery('');
              setUsername('');
              setError('');
              setSearchQuality(null);
              setPrecisionLabel('');
              setActiveTab('hunt');
            }}
            className="text-2xl font-black tracking-tighter cursor-pointer hover:opacity-60 italic uppercase"
          >LIBRE-HIRE</h1>
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
                Free, open-source developer sourcing. Real commit data, byte-weighted language proficiency, ethical contact discovery — only showing what developers have publicly shared themselves.
              </p>
            </div>

            {/* TABS */}
            <div className="flex flex-wrap border-b-4 border-black mb-10">
              <button
                onClick={()=>setActiveTab('hunt')}
                className={`px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest transition-colors ${activeTab==='hunt'?'bg-black text-white':'hover:bg-gray-100'}`}
              >
                🔍 Open Search
              </button>
              <button
                onClick={()=>setActiveTab('precision')}
                className={`px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest transition-colors ${activeTab==='precision'?'bg-black text-white':'hover:bg-gray-100'}`}
              >
                🎯 Precision Hunt
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
                    'rust + C devs in bangalore',
                    'founder of xeneva',
                    'kernel engineers india',
                    'ml researcher python',
                    'ios developer san francisco',
                    'QA analyst bangalore working at Nasdaq',
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

            {/* PRECISION HUNT TAB */}
            {activeTab === 'precision' && (
              <div>
                <p className="font-mono text-sm text-gray-600 mb-6 leading-relaxed max-w-2xl">
                  Select a job profile, language stack, and location to run structured, AI-free GitHub searches.
                  More deterministic than open search — ideal when you know exactly what you need.
                </p>
                <PrecisionHunt onSubmit={handleDeterministicHunt} loading={loading} />
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

            {/* SEARCH QUALITY BANNER */}
            {searchQuality && searchQuality !== 'good' && results.length > 0 && (
              <div className="border-2 border-yellow-400 bg-yellow-50 px-5 py-3 mb-6 font-mono text-sm">
                <span className="font-bold text-yellow-700 uppercase tracking-widest text-[10px]">⚠ Partial Match</span>
                <p className="text-yellow-800 mt-1">
                  {searchQuality === 'none'
                    ? 'No developers found in the exact location you specified. Showing the best global results — try a broader location like a state or country.'
                    : 'Not enough exact-location matches found. Showing the best available results alongside some near-matches.'}
                </p>
              </div>
            )}

            {/* HUNT RESULTS */}
            {results.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-10 border-b-2 border-black pb-4">
                  <span className="font-mono text-sm uppercase tracking-widest font-bold">{results.length} ranked candidates</span>
                  <span className="font-mono text-xs text-gray-400 uppercase tracking-widest">Sorted by match · activity · quality</span>
                </div>
                <div className="space-y-16">
                  {results.map((p, i) => {
                    const prevTier = i > 0 ? (results[i-1].matchTier ?? 'full') : 'full';
                    const curTier  = p.matchTier ?? 'full';
                    const showPartialDivider = curTier === 'primary' && prevTier === 'full';
                    const showNearDivider    = curTier === 'none'    && prevTier !== 'none';
                    return (
                      <Fragment key={p.handle}>
                        {showPartialDivider && (
                          <div key={`div-p-${i}`} className="border-t-2 border-dashed border-amber-300 pt-4 -mt-4">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-600">
                              ↓ Partial Matches — have the primary language but the secondary language wasn&apos;t found in their public repos
                            </span>
                          </div>
                        )}
                        {showNearDivider && (
                          <div key={`div-n-${i}`} className="border-t-2 border-dashed border-yellow-300 pt-4 -mt-4">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-yellow-600">
                              ↓ Near Matches — language criteria not met, shown as best available
                            </span>
                          </div>
                        )}
                        <DeveloperCard key={p.handle} profile={p} rank={i+1} />
                      </Fragment>
                    );
                  })}
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
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-10 border-b-4 border-black pb-4">How to Use Libre-Hire</h2>
            <div className="space-y-12 font-mono text-sm leading-relaxed">

              {/* STEP 1 — LLM API */}
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">Step 1 — Get a Free LLM API Key (Groq recommended)</h3>
                <p className="mb-3 text-gray-600">Libre-Hire uses an LLM to interpret your search query and write developer assessments. Groq offers a generous free tier with fast inference.</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Go to <strong className="text-black">console.groq.com</strong> and create a free account.</li>
                  <li>Navigate to <strong className="text-black">API Keys</strong> in the sidebar and click <strong className="text-black">Create API Key</strong>.</li>
                  <li>Copy the key (starts with <code className="bg-gray-100 px-1">gsk_</code>).</li>
                  <li>In Libre-Hire, click <strong className="text-black">Configure Engine</strong> (top right).</li>
                  <li>Set <strong className="text-black">AI Provider</strong> to <strong className="text-black">Groq (Free)</strong>.</li>
                  <li>Paste your key into <strong className="text-black">LLM API Key</strong>.</li>
                  <li>The Base URL and Model Name are <strong className="text-black">auto-filled</strong> — leave them as-is unless you want a different Groq model.</li>
                </ol>
                <div className="mt-4 border border-dashed border-gray-300 p-4 text-xs text-gray-500">
                  <p className="font-bold text-black mb-1">Groq defaults (auto-filled)</p>
                  <p>Base URL: <code className="bg-gray-100 px-1">https://api.groq.com/openai/v1</code></p>
                  <p>Model: <code className="bg-gray-100 px-1">llama-3.3-70b-versatile</code></p>
                  <p className="mt-1">Other good free Groq models: <code className="bg-gray-100 px-1">llama3-70b-8192</code>, <code className="bg-gray-100 px-1">mixtral-8x7b-32768</code></p>
                </div>
              </div>

              {/* STEP 2 — GitHub PAT */}
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">Step 2 — Get a GitHub Personal Access Token</h3>
                <p className="mb-3 text-gray-600">Libre-Hire reads public GitHub data. A token gives you a much higher API rate limit (5,000 req/hr vs 60 unauthenticated).</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Log in to <strong className="text-black">github.com</strong>.</li>
                  <li>Click your avatar (top-right) → <strong className="text-black">Settings</strong>.</li>
                  <li>Scroll to the bottom of the left sidebar → <strong className="text-black">Developer settings</strong>.</li>
                  <li>Click <strong className="text-black">Personal access tokens</strong> → <strong className="text-black">Tokens (classic)</strong>.</li>
                  <li>Click <strong className="text-black">Generate new token (classic)</strong>.</li>
                  <li>Give it a name (e.g. <em>libre-hire</em>), set expiry as needed.</li>
                  <li><strong className="text-black">No scopes needed</strong> — leave all checkboxes unchecked. We only read public data.</li>
                  <li>Click <strong className="text-black">Generate token</strong>, copy it (starts with <code className="bg-gray-100 px-1">ghp_</code>).</li>
                  <li>Paste it into <strong className="text-black">GitHub Personal Token</strong> in Configure Engine.</li>
                </ol>
              </div>

              {/* STEP 3 — Search modes */}
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">Step 3 — Choose Your Search Mode</h3>

                <div className="space-y-6">
                  <div className="border-l-4 border-black pl-4">
                    <p className="font-bold text-black uppercase tracking-widest text-xs mb-2">🔍 Open Search</p>
                    <p className="text-gray-600 mb-2">Natural language search. The AI interprets your query and generates optimised GitHub searches. Best for flexible, exploratory sourcing.</p>
                    <p className="text-gray-500 text-xs">Examples:</p>
                    <ul className="list-disc pl-4 text-xs text-gray-500 mt-1 space-y-1">
                      <li>&ldquo;rust + C developers in bangalore&rdquo;</li>
                      <li>&ldquo;QA analyst in bangalore working at Nasdaq&rdquo;</li>
                      <li>&ldquo;Google engineers in Delhi&rdquo;</li>
                      <li>&ldquo;founder of xeneva&rdquo; or &ldquo;who built supabase&rdquo;</li>
                      <li>&ldquo;ml researcher python india&rdquo;</li>
                    </ul>
                  </div>

                  <div className="border-l-4 border-black pl-4">
                    <p className="font-bold text-black uppercase tracking-widest text-xs mb-2">🎯 Precision Hunt</p>
                    <p className="text-gray-600 mb-2">Structured, AI-free search. Select a job profile, language stack, and location using toggles. More deterministic — ideal when you know exactly what you need.</p>
                    <p className="text-gray-500 text-xs">Good for: &ldquo;Frontend devs&rdquo;, &ldquo;Rust + C kernel engineers in India&rdquo;, &ldquo;Android devs in Karnataka&rdquo;.</p>
                  </div>

                  <div className="border-l-4 border-black pl-4">
                    <p className="font-bold text-black uppercase tracking-widest text-xs mb-2">👤 Profile Deep-Dive</p>
                    <p className="text-gray-600 mb-2">Already have a candidate&apos;s GitHub username? Enter it here for a full AI assessment: what they&apos;ve built, their language depth, contribution consistency, and reachability.</p>
                    <p className="text-gray-500 text-xs">Paste a username or a full GitHub URL (e.g. <code className="bg-gray-100 px-1">torvalds</code> or <code className="bg-gray-100 px-1">https://github.com/torvalds</code>).</p>
                  </div>
                </div>
              </div>

              {/* STEP 4 — Scores */}
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">Step 4 — Reading Scores</h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Match (40 pts):</strong> Primary + secondary language presence by bytes vs. your query</li>
                  <li><strong>Activity (30 pts):</strong> Real GitHub events in last 90 days — pushes, PRs, new repos</li>
                  <li><strong>Quality (20 pts):</strong> Stars + forks on original (non-forked) repos</li>
                  <li><strong>Profile (10 pts):</strong> Email, bio, blog, Twitter — how reachable they are</li>
                </ul>
                <p className="mt-3 text-xs text-gray-500">Cards with an <strong className="text-amber-600">amber border</strong> have the primary language but the secondary wasn&apos;t found in their public repos. <strong className="text-yellow-600">Yellow border</strong> = neither language found, shown as best-available fallback.</p>
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
                <p>Most developer sourcing tools charge thousands per month and source contact data from brokers — often without developers&apos; knowledge. Libre-Hire only uses what developers have publicly shared on GitHub themselves: their code, their bio, their contact links.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Intelligent search modes</h3>
                <p>The engine detects whether you&apos;re searching for a person (&ldquo;founder of X&rdquo;), a technical role (&ldquo;kernel developer&rdquo;), or an open skill (&ldquo;react developer&rdquo;) and uses different search strategies for each.</p>
              </div>
              <div>
                <h3 className="text-base font-bold bg-black text-white inline-block px-3 py-1 mb-3 uppercase">Real data only</h3>
                <p>The full-year contribution calendar uses GitHub&apos;s GraphQL API — the same data GitHub itself shows on profiles. Language proficiency is measured in bytes of actual code written, not repo count or self-reported skills.</p>
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
                <select value={config.provider} onChange={e => {
                  const p = e.target.value;
                  const groqDefaults = p === 'groq' ? { baseUrl: 'https://api.groq.com/openai/v1', modelName: 'llama-3.3-70b-versatile' } : {};
                  setConfig({...config, provider: p, ...groqDefaults});
                }} className="w-full border-2 border-black p-3 outline-none bg-white">
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq (Free — recommended)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom (OpenAI Compatible)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">LLM API Key</label>
                <input type="password" value={config.llmKey} onChange={e=>setConfig({...config,llmKey:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="sk-... / AIza..." />
              </div>
              {(config.provider==='custom' || config.provider==='groq') &&(<>
                <div>
                  <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">Base URL</label>
                  <input type="text" value={config.baseUrl} onChange={e=>setConfig({...config,baseUrl:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="https://api.groq.com/openai/v1" />
                  {config.provider==='groq' && <p className="text-gray-400 text-[10px] mt-1">Groq default: https://api.groq.com/openai/v1</p>}
                </div>
                <div>
                  <label className="block font-bold mb-1.5 uppercase tracking-widest text-xs">Model Name</label>
                  <input type="text" value={config.modelName} onChange={e=>setConfig({...config,modelName:e.target.value})} className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300" placeholder="llama-3.3-70b-versatile" />
                  {config.provider==='groq' && <p className="text-gray-400 text-[10px] mt-1">Recommended: llama-3.3-70b-versatile &nbsp;|&nbsp; Also good: llama3-70b-8192</p>}
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
