import { NextResponse } from 'next/server';

// Define the GraphQL query to fetch deep user metrics
const USER_METRICS_QUERY = `
  query($username: String!) {
    user(login: $username) {
      login
      name
      bio
      email
      twitterUsername
      websiteUrl
      socialAccounts(first: 3) {
        nodes { provider url }
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
        }
      }
      repositories(first: 10, orderBy: {field: STARGAZERS, direction: DESC}, isFork: false) {
        nodes {
          name
          description
          stargazerCount
          primaryLanguage { name }
        }
      }
    }
  }
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, location, githubToken } = body;

    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub PAT is required.' }, { status: 401 });
    }

    // PHASE 1: Broad Search (Find the candidates)
    // We search for users based on bio, readme, and location
    const searchQuery = encodeURIComponent(`${query} location:${location}`);
    const searchRes = await fetch(
      `https://api.github.com/search/users?q=${searchQuery}&per_page=15`, 
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!searchRes.ok) throw new Error('Failed to fetch base users');
    const searchData = await searchRes.json();
    const baseUsers = searchData.items || [];

    // PHASE 2: Deep Metric Extraction & Scoring
    const scoredCandidates = await Promise.all(
      baseUsers.map(async (baseUser: any) => {
        // Fetch detailed metrics via GraphQL
        const gqlRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: USER_METRICS_QUERY,
            variables: { username: baseUser.login },
          }),
        });

        const gqlData = await gqlRes.json();
        const userDetails = gqlData.data?.user;

        if (!userDetails) return null;

        // --- SCORING ALGORITHM ---
        let repoRelevanceScore = 0;
        let languageScore = 0;
        let socialProofScore = 0;
        const queryTerms = query.toLowerCase().split(' ');

        const repos = userDetails.repositories.nodes || [];
        
        repos.forEach((repo: any) => {
          // 1. Repo Relevance (Check names and descriptions for query keywords)
          const repoText = `${repo.name} ${repo.description || ''}`.toLowerCase();
          queryTerms.forEach((term: string) => {
            if (repoText.includes(term)) repoRelevanceScore += 15;
          });

          // 2. Language Match (e.g., C, Rust, C++ for Systems/Kernel)
          const lang = repo.primaryLanguage?.name?.toLowerCase();
          if (lang) {
            if (queryTerms.includes('kernel') || queryTerms.includes('systems')) {
              if (['c', 'c++', 'rust', 'go'].includes(lang)) languageScore += 20;
            } else if (queryTerms.includes(lang)) {
              languageScore += 20; // Direct language match
            }
          }

          // 3. Social Proof (Stars on original repos)
          socialProofScore += (repo.stargazerCount * 0.5); 
        });

        // 4. Commit Velocity (Active contribution in the last year)
        const totalCommits = userDetails.contributionsCollection?.contributionCalendar?.totalContributions || 0;
        const velocityScore = Math.min(totalCommits / 10, 30); // Cap at 30 points

        // Calculate Final Weighted Score
        const rawScore = 
          (repoRelevanceScore * 0.4) + 
          (languageScore * 0.3) + 
          (velocityScore * 0.2) + 
          (Math.min(socialProofScore, 50) * 0.1);

        // Normalize score to a 0-100 scale (approximate)
        const finalScore = Math.min(Math.round(rawScore), 100);

        // Extract proficient languages for UI pills
        const languages = Array.from(new Set(repos.map((r: any) => r.primaryLanguage?.name).filter(Boolean)));

        // Generate basic sourcing logic based on data (Saves AI tokens)
        const topStack = languages.slice(0, 3).join(', ');
        const activeRepos = repos.length;
        const fallbackLogic = `${topStack ? `${topStack} is their primary stack. ` : ''}They have ${activeRepos} active original repositories and ${totalCommits} contributions this year.`;

        return {
          username: userDetails.login,
          name: userDetails.name || userDetails.login,
          score: finalScore,
          languages: languages.slice(0, 4), // Top 4 for UI
          contact: {
            email: userDetails.email,
            twitter: userDetails.twitterUsername,
            website: userDetails.websiteUrl,
            socials: userDetails.socialAccounts.nodes,
          },
          metrics: {
            commits: totalCommits,
            topRepos: repos.slice(0, 3).map((r: any) => r.name),
          },
          sourcingLogic: fallbackLogic, // Pass this to your LLM for refinement, or use as is
        };
      })
    );

    // PHASE 3: Sort & Filter
    // Filter out nulls and users with a score too low (e.g., below 15), then sort descending
    const finalResults = scoredCandidates
      .filter((c) => c !== null && c.score > 15)
      .sort((a, b) => b!.score - a!.score);

    return NextResponse.json({ 
      success: true, 
      count: finalResults.length,
      data: finalResults 
    });

  } catch (error: any) {
    console.error('Hunt API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
