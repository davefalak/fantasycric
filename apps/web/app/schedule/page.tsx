"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { readApi } from "@/lib/api";

interface IplGameDay {
  gameDay: string;
  firstMatchStartAt: string;
  lockAt: string;
  matchCount: number;
  matches: Array<{
    matchNumber: number;
    startsAt: string;
    homeTeamCode: string;
    awayTeamCode: string;
    homeTeamName: string;
    awayTeamName: string;
    venue: string;
  }>;
}

export default function SchedulePage() {
  const [days, setDays] = useState<IplGameDay[]>([]);

  useEffect(() => {
    async function load() {
      const response = await authFetch("/api/schedule/ipl-2026");
      const result = await readApi<IplGameDay[]>(response);
      setDays(result.success ? (result.data || []) : []);
    }
    void load();
  }, []);

  return (
    <main className="container stack-lg">
      <section className="panel">
        <h1>IPL Schedule</h1>
        <p className="meta">Use game-day locks to plan your fantasy submissions before the first match starts.</p>
      </section>
      <section className="grid cards">
        {days.map((day) => (
          <article key={day.gameDay} className="card">
            <h3>{day.gameDay}</h3>
            <p className="meta">Lock: {new Date(day.lockAt).toLocaleString()}</p>
            <p className="meta">Matches: {day.matchCount}</p>
            <div className="action-list">
              {day.matches.map((match) => (
                <div key={`${day.gameDay}-${match.matchNumber}`}>
                  <strong>{match.homeTeamCode} vs {match.awayTeamCode}</strong>
                  <p className="meta">{new Date(match.startsAt).toLocaleString()} · {match.venue}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
