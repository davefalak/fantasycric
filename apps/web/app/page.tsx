"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch, getCurrentUser, type AuthUser } from "@/lib/auth";
import { readApi, type ApiResult } from "@/lib/api";

interface LeagueSummary {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
  state: string;
}

export default function HomePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const response = await authFetch("/api/leagues");
      const result = await readApi<LeagueSummary[]>(response);
      setLeagues(result.success ? (result.data || []) : []);
      setLoading(false);
    }

    void load();
  }, []);

  return (
    <main className="container stack-lg">
      <section className="hero">
        <div>
          <p className="eyebrow">Fantasy Cricket Control Center</p>
          <h1>Fantasy IPL 2026</h1>
          <p className="hero-copy">
            Manage leagues, build game-day squads, and track player availability from one place.
          </p>
        </div>
        <div className="hero-actions">
          {user ? (
            <>
              <Link className="button" href="/leagues">Open My Leagues</Link>
              <Link className="button button-secondary" href="/leagues/create">Create League</Link>
            </>
          ) : (
            <>
              <Link className="button" href="/auth/login">Login</Link>
              <Link className="button button-secondary" href="/auth/register">Register</Link>
            </>
          )}
        </div>
      </section>

      <section className="grid two-col">
        <article className="panel">
          <h2>League Operations</h2>
          <p className="meta">Create private competitions, invite players, and edit game-day teams.</p>
          <div className="action-list">
            <Link href="/leagues" className="text-link">View leagues</Link>
            <Link href="/leagues/create" className="text-link">Create a league</Link>
            <Link href="/leagues/join" className="text-link">Join via invite code</Link>
          </div>
        </article>

        <article className="panel">
          <h2>Matchday Tools</h2>
          <p className="meta">Review player pools, team distribution, and upcoming IPL game-day locks.</p>
          <div className="action-list">
            <Link href="/players" className="text-link">Browse players</Link>
            <Link href="/schedule" className="text-link">See schedule</Link>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>{user ? `${user.displayName}'s Leagues` : "Get Started"}</h2>
          {user ? <Link href="/leagues" className="text-link">Manage all</Link> : null}
        </div>
        {!user ? (
          <p className="meta">Sign in to view your leagues and build teams.</p>
        ) : loading ? (
          <p className="meta">Loading leagues…</p>
        ) : leagues.length === 0 ? (
          <p className="meta">No leagues yet. Create one or join with an invite code.</p>
        ) : (
          <div className="grid cards">
            {leagues.slice(0, 4).map((league) => (
              <Link key={league.id} href={`/leagues/${league.id}`} className="card card-link">
                <h3>{league.name}</h3>
                <p className="meta">{league.memberCount}/{league.memberLimit} members</p>
                <p className="meta">Budget: {league.totalBudget}</p>
                <p className="meta">State: {league.state}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

