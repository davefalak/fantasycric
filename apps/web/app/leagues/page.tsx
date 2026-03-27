"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { readApi } from "@/lib/api";

interface LeagueSummary {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  memberLimit: number;
  totalBudget: number;
  state: string;
  inviteCode: string;
  joinDeadline: string;
}

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const response = await authFetch("/api/leagues");
      const result = await readApi<LeagueSummary[]>(response);
      if (!result.success) {
        setError(result.error || "Could not load leagues");
      } else {
        setLeagues(result.data || []);
      }
      setLoading(false);
    }

    void load();
  }, []);

  return (
    <main className="container stack-lg">
      <section className="section-header">
        <div>
          <h1>My Leagues</h1>
          <p className="section-subtitle">Open a league to manage your team, invite members, and review deadlines.</p>
        </div>
        <div className="row">
          <Link className="button" href="/leagues/create">Create League</Link>
          <Link className="button button-secondary" href="/leagues/join">Join League</Link>
        </div>
      </section>

      {loading ? <p className="meta">Loading leagues…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !error && leagues.length === 0 ? <p className="meta">No leagues found yet.</p> : null}

      <section className="grid cards">
        {leagues.map((league) => (
          <Link key={league.id} href={`/leagues/${league.id}`} className="card card-link">
            <h3>{league.name}</h3>
            <p className="meta">{league.memberCount}/{league.memberLimit} members</p>
            <p className="meta">Budget per team: {league.totalBudget}</p>
            <p className="meta">Deadline: {new Date(league.joinDeadline).toLocaleString()}</p>
            <p className="meta">Invite code: {league.inviteCode}</p>
            {league.description ? <p>{league.description}</p> : null}
          </Link>
        ))}
      </section>
    </main>
  );
}
