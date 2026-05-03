'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function Home() {
  const [query, setQuery] = useState('systems engineers');
  const [location, setLocation] = useState('delhi');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');

  // Simulated progress bar logic to keep the user engaged during the heavy backend GraphQL fetch
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setProgress(10);
      interval = setInterval(() => {
        setProgress((prev) => (prev >= 90 ? 90 : prev + 5));
      }, 400);
    } else {
      setProgress(100);
      setTimeout(() => setProgress(0), 500); // Reset after completion
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleHunt = async () => {
    setLoading(true);
    setError('');
    setResults([]);

    try {
      const res = await fetch('/api/hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          location,
          // Replace with your actual secure token retrieval method
          githubToken: process.env.NEXT_PUBLIC_GITHUB_PAT, 
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch developers');
      
      setResults(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-black p-8 font-mono">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER & SEARCH */}
        <div className="border-b-4 border-black pb-8 mb-12">
          <h1 className="text-4xl font-bold mb-4 tracking-tighter uppercase">Libre-Hire</h1>
          <p className="text-sm text-gray-600 mb-6 uppercase tracking-widest">
            Stop paying data brokers. Source builders ethically.
          </p>
          
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full flex border-2 border-black">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full p-3 outline-none"
                placeholder="e.g., kernel engineers"
              />
              <span className="p-3 border-l-2 border-black bg-gray-100 uppercase text-xs font-bold flex items-center">
                in
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-1/3 p-3 outline-none"
                placeholder="delhi"
              />
            </div>
            <button 
              onClick={handleHunt}
              disabled={loading}
              className="bg-black text-white font-bold px-8 py-3 uppercase hover:bg-gray-800 disabled:opacity-50 border-2 border-black"
            >
              Hunt
            </button>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="my-12">
            <p className="text-sm font-bold uppercase mb-2 animate-pulse">
              Hunting Codebases... {progress}%
            </p>
            <div className="w-full h-4 border-2 border-black bg-white">
              <div 
                className="h-full bg-black transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="border-2 border-red-500 text-red-500 p-4 mb-8 font-bold uppercase">
            Error: {error}
          </div>
        )}

        {/* RESULTS */}
        <div className="space-y-12">
          {results.map((user, idx) => (
            <div key={idx} className="border-l-4 border-black pl-6 relative">
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-3xl font-bold uppercase tracking-tight">{user.name}</h2>
                  <a href={`https://github.com/${user.username}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-black">
                    @{user.username}
                  </a>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-black tracking-tighter">{user.score}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest">Relevance</div>
                </div>
              </div>

              {/* PILLS & LINKS */}
              <div className="flex flex-wrap gap-2 mb-6">
                {user.languages.map((lang: string) => (
                  <span key={lang} className="bg-black text-white text-xs px-3 py-1 font-bold uppercase">
                    {lang}
                  </span>
                ))}
                {user.contact.email && (
                  <span className="border-2 border-black text-xs px-3 py-1 font-bold uppercase cursor-pointer hover:bg-gray-100">
                    Email
                  </span>
                )}
                {user.contact.twitter && (
                  <a href={`https://twitter.com/${user.contact.twitter}`} target="_blank" rel="noreferrer" className="border-2 border-black text-xs px-3 py-1 font-bold uppercase hover:bg-gray-100">
                    Twitter
                  </a>
                )}
              </div>

              {/* SOURCING LOGIC */}
              <div className="border-2 border-black p-4 mb-6 relative">
                <div className="absolute -top-3 left-4 bg-black text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest">
                  Sourcing Logic
                </div>
                <p className="text-sm mt-2">
                  "{user.sourcingLogic}"
                </p>
              </div>

              {/* GITHUB CALENDAR */}
              <div className="border-2 border-black p-4 relative overflow-x-auto">
                 <div className="absolute -top-3 left-4 bg-black text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest">
                  Activity (1 YR)
                </div>
                {/* We use rshah.org to generate an SVG chart of the user's GitHub activity. 
                    The '219138' hex code makes the green boxes match standard GitHub green, 
                    but you can change it to '000000' for a greyscale brutalist look. */}
                <img 
                  src={`https://ghchart.rshah.org/219138/${user.username}`} 
                  alt={`${user.username}'s Github Chart`} 
                  className="w-full min-w-[600px] mt-2 filter contrast-125"
                />
              </div>

            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
