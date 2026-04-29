"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // View states
  const [activeView, setActiveView] = useState<"search" | "how-to" | "about">("search");
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Config states (Restored Custom Fields)
  const [config, setConfig] = useState({
    provider: "gemini",
    llmKey: "",
    githubToken: "",
    baseUrl: "",
    modelName: "",
  });

  // Load config on mount
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
            <button 
              onClick={() => setActiveView("how-to")} 
              className={`hover:text-black transition-colors ${activeView === "how-to" ? "text-black font-bold" : ""}`}
            >
              How to Use
            </button>
            <button 
              onClick={() => setActiveView("about")} 
              className={`hover:text-black transition-colors ${activeView === "about" ? "text-black font-bold" : ""}`}
            >
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
        
        {/* --- SEARCH VIEW --- */}
        {activeView === "search" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* HERO - Resized to fit two lines */}
            <div className="mb-16">
              <h2 className="text-4xl md:text-[3.5rem] font-black text-gray-200 tracking-tighter uppercase mb-6 leading-[1.1]">
                STOP PAYING DATA BROKERS.<br/>SOURCE BUILDERS ETHICALLY.
              </h2>
              <p className="font-mono text-sm md:text-base leading-relaxed max-w-2xl font-semibold">
                Libre-Hire is the free, open-source alternative to expensive recruiter tools. We use public OSINT to analyze actual code output, giving you deep technical insights without the privacy invasion.
              </p>
            </div>

            {/* SEARCH BAR */}
            <form onSubmit={handleHunt} className="relative flex items-end mb-16 group">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="systems engineers in delhi"
                className="w-full text-3xl md:text-5xl font-bold bg-transparent border-b-4 border-black outline-none pb-4 placeholder:text-gray-300"
                autoFocus
              />
              <button 
                type="submit" 
                disabled={loading}
                className="absolute right-0 bottom-4 bg-black text-white px-8 py-3 font-mono font-bold tracking-widest hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "HUNTING..." : "HUNT"}
              </button>
            </form>

            {/* ERROR STATE */}
            {error && (
              <div className="border-4 border-red-500 bg-red-50 text-red-700 p-6 font-mono text-sm uppercase font-bold text-center tracking-widest mb-12">
                {error}
              </div>
            )}

            {/* RESULTS */}
            <div className="space-y-16">
              {results.map((profile, idx) => (
                <div key={idx} className="border-l-8 border-black pl-8 relative">
                  
                  {/* Header: Avatar, Name, Score */}
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-6">
                      <img src={profile.avatar} alt={profile.handle} className="w-24 h-24 border-4 border-black object-cover" />
                      <div>
                        <h3 className="text-3xl font-black uppercase tracking-tight">{profile.name}</h3>
                        <a href={`https://github.com/${profile.handle}`} target="_blank" rel="noreferrer" className="font-mono text-gray-500 hover:text-black">
                          @{profile.handle}
                        </a>
                        
                        {/* Links */}
                        <div className="flex gap-2 mt-3">
                          {profile.email && (
                            <a href={`mailto:${profile.email}`} className="border-2 border-black text-[10px] font-mono px-2 py-1 uppercase hover:bg-black hover:text-white">Email</a>
                          )}
                          {profile.twitter && (
                            <a href={`https://twitter.com/${profile.twitter}`} target="_blank" className="border-2 border-black text-[10px] font-mono px-2 py-1 uppercase hover:bg-black hover:text-white">Twitter</a>
                          )}
                          {profile.website && (
                            <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" className="border-2 border-black text-[10px] font-mono px-2 py-1 uppercase hover:bg-black hover:text-white">Portfolio</a>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`text-6xl font-black ${profile.score >= 70 ? "text-blue-600" : "text-black"}`}>
                        {profile.score}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mt-1">
                        {profile.score >= 85 ? "Cracked" : profile.score >= 70 ? "High Signal" : "Verified"}
                      </div>
                    </div>
                  </div>

                  {/* Languages */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    {profile.languages?.map((lang: string) => (
                      <span key={lang} className="bg-black text-white text-[10px] font-mono font-bold uppercase px-3 py-1">
                        {lang}
                      </span>
                    ))}
                  </div>

                  {/* Sourcing Logic Box */}
                  <div className="border-4 border-black p-6 relative bg-gray-50">
                    <div className="absolute -top-3 left-4 bg-black text-white text-[10px] font-mono font-bold uppercase px-3 py-1 tracking-widest">
                      Sourcing Logic
                    </div>
                    <p className="font-mono text-sm leading-relaxed italic text-gray-800">
                      "{profile.summary}"
                    </p>
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- HOW TO USE VIEW --- */}
        {activeView === "how-to" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-12 border-b-4 border-black pb-4">How to Use</h2>
            <div className="space-y-12 font-mono text-sm">
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">1. GitHub Token</h3>
                <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                  <li>Go to <strong>GitHub → Settings → Developer Settings</strong>.</li>
                  <li>Click on <strong>Personal Access Tokens (Classic)</strong>.</li>
                  <li>Click <strong>Generate new token</strong>. You do <strong>not</strong> need to check any scopes/permissions.</li>
                  <li>Copy the raw token. Libre-Hire needs this to read repository data without hitting IP limits.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">2. AI API Key</h3>
                <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                  <li>Click <strong>CONFIGURE ENGINE</strong> in the top right corner.</li>
                  <li>Select your preferred AI provider (Gemini, Claude, OpenAI, or Custom).</li>
                  <li>Paste your API key. This powers the semantic codebase review.</li>
                  <li>Click <strong>Save & Lock</strong>.</li>
                </ol>
              </div>
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">3. Hunt</h3>
                <p className="leading-relaxed mb-2">Search the way you actually speak.</p>
                <ul className="list-disc pl-5 space-y-2 leading-relaxed">
                  <li><span className="text-green-600 font-bold">Example:</span> "Systems engineers in Delhi"</li>
                  <li><span className="text-green-600 font-bold">Example:</span> "Rust backend devs in Bangalore"</li>
                </ul>
                <p className="mt-4 leading-relaxed">
                  The engine will natively convert your intent, fetch raw GitHub data, and execute an AI-driven technical due diligence pass before showing you the builders.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* --- ABOUT VIEW --- */}
        {activeView === "about" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-12 border-b-4 border-black pb-4">About Libre-Hire</h2>
            <div className="space-y-10 font-mono text-sm leading-relaxed">
              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">1. Deep Code Analysis</h3>
                <p>
                  Our engine bypasses vanity metrics. We weigh language complexity (C++ &gt; HTML) and actual repository output to find heads-down systems engineers, not just clout-chasers.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">2. Ethical Discovery</h3>
                <p>
                  Unlike paid tools that buy leaked databases, Libre-Hire relies strictly on public, opt-in data. If a developer locks their email behind a noreply mask, we respect their boundary.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold bg-black text-white inline-block px-3 py-1 mb-4 uppercase">3. Bring Your Own Keys</h3>
                <p>
                  Recruiting data shouldn't be a luxury subscription. Connect your free GitHub token and your preferred AI API key via the Configure Engine menu for unlimited, throttle-free sourcing.
                </p>
              </div>
              
              <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-300">
                <p className="text-xs text-gray-500 uppercase tracking-widest">LIBRE-HIRE // AGNOSTIC. OPEN. SELF-HOSTED. // 2026</p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* --- CONFIG MODAL --- */}
      {isConfigOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-4 border-black p-8 w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6 border-b-2 border-black pb-2">Engine Configuration</h2>
            
            <div className="space-y-6 font-mono text-sm">
              <div>
                <label className="block font-bold mb-2 uppercase tracking-widest text-xs">AI Provider</label>
                <select 
                  value={config.provider} 
                  onChange={(e) => setConfig({...config, provider: e.target.value})}
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
                  onChange={(e) => setConfig({...config, llmKey: e.target.value})}
                  className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                  placeholder="sk-..."
                />
              </div>

              {/* CUSTOM API FIELDS */}
              {config.provider === "custom" && (
                <>
                  <div>
                    <label className="block font-bold mb-2 uppercase tracking-widest text-xs">Base URL</label>
                    <input 
                      type="text" 
                      value={config.baseUrl}
                      onChange={(e) => setConfig({...config, baseUrl: e.target.value})}
                      className="w-full border-2 border-black p-3 outline-none focus:bg-gray-50 placeholder:text-gray-300"
                      placeholder="https://api.together.xyz/v1"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-2 uppercase tracking-widest text-xs">Model Name</label>
                    <input 
                      type="text" 
                      value={config.modelName}
                      onChange={(e) => setConfig({...config, modelName: e.target.value})}
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
                  onChange={(e) => setConfig({...config, githubToken: e.target.value})}
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