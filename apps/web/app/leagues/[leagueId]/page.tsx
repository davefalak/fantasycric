"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TeamBuilderForm } from "@/components/TeamBuilderForm";
import { authFetch, getCurrentUser, type AuthUser } from "@/lib/auth";
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

export default function LeagueDetailPage() {
  const params = useParams<{ leagueId: string }>();
  const leagueId = params.leagueId;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [teamName, setTeamName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [currentUser, leagueResponse, teamNameResponse] = await Promise.all([
        getCurrentUser(),
        authFetch(`/api/leagues/${leagueId}`),
        authFetch(`/api/leagues/${leagueId}/team-name`)
      ]);
      setUser(currentUser);

      const leagueResult = await readApi<LeagueSummary>(leagueResponse);
      if (!leagueResult.success || !leagueResult.data) {
        setError(leagueResult.error || "Could not load league");
        return;
      }
      setLeague(leagueResult.data);

      const teamNameResult = await readApi<{ teamName: string }>(teamNameResponse);
      if (teamNameResult.success && teamNameResult.data?.teamName) {
        setTeamName(teamNameResult.data.teamName);
      }
    }

    void load();
  }, [leagueId]);

  async function saveTeamName() {
    setSavingName(true);
    setError("");
    try {
      const response = await authFetch(`/api/leagues/${leagueId}/team-name`, {
        method: "PUT",
        body: JSON.stringify({ teamName })
      });
      const result = await readApi<{ teamName: string }>(response);
      if (!result.success) {
        setError(result.error || "Could not save team name");
      }
    } finally {
      setSavingName(false);
    }
  }

  if (!league && !error) {
    return <main className="container stack-lg"><p className="meta">Loading league…</p></main>;
  }

  return (
    <main className="container stack-lg">
      {error ? <p className="error-text">{error}</p> : null}
      {league ? (
        <>
          <section className="panel">
            <div className="section-header">
              <div>
                <h1>{league.name}</h1>
                <p className="section-subtitle">{league.description || "No description provided."}</p>
              </div>
              <div className="meta">Invite code: <strong>{league.inviteCode}</strong></div>
            </div>
            <div className="row meta">
              <span>Members: {league.memberCount}/{league.memberLimit}</span>
              <span>Budget: {league.totalBudget}</span>
              <span>State: {league.state}</span>
              <span>Deadline: {new Date(league.joinDeadline).toLocaleString()}</span>
            </div>
          </section>

          <section className="panel">
            <h2>League Team Name</h2>
            <div className="row">
              <input className="input" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Set your persistent league team name" />
              <button className="button" onClick={() => void saveTeamName()} disabled={savingName}>{savingName ? "Saving…" : "Save"}</button>
            </div>
          </section>

          {user ? <TeamBuilderForm leagueId={league.id} budget={league.totalBudget} userId={user.id} /> : <p className="meta">Login required to build a team.</p>}
        </>
      ) : null}
    </main>
  );
}
