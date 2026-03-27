"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { readApi } from "@/lib/api";

interface Player {
  id: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  teamCode: string;
  teamName: string;
  status: string;
  fantasyPoints: number;
  isOverseas: boolean;
  salary: number;
}

interface TeamSummary {
  teamCode: string;
  teamName: string;
  playerCount: number;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamCode, setTeamCode] = useState("");
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function bootstrap() {
      const [teamResponse, playerResponse] = await Promise.all([
        authFetch("/api/players/teams"),
        authFetch("/api/players?status=active")
      ]);
      const teamsResult = await readApi<TeamSummary[]>(teamResponse);
      const playersResult = await readApi<Player[]>(playerResponse);
      setTeams(teamsResult.success ? (teamsResult.data || []) : []);
      setPlayers(playersResult.success ? (playersResult.data || []) : []);
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    async function loadPlayers() {
      const params = new URLSearchParams();
      params.set("status", "active");
      if (teamCode) params.set("teamCode", teamCode);
      if (role) params.set("role", role);
      if (query) params.set("q", query);
      const response = await authFetch(`/api/players?${params.toString()}`);
      const result = await readApi<Player[]>(response);
      setPlayers(result.success ? (result.data || []) : []);
    }
    void loadPlayers();
  }, [teamCode, role, query]);

  return (
    <main className="container stack-lg">
      <section className="panel">
        <h1>Players</h1>
        <div className="filters">
          <select className="input" value={teamCode} onChange={(event) => setTeamCode(event.target.value)}>
            <option value="">All teams</option>
            {teams.map((team) => <option key={team.teamCode} value={team.teamCode}>{team.teamCode}</option>)}
          </select>
          <select className="input" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">All roles</option>
            <option value="WK">WK</option>
            <option value="BAT">BAT</option>
            <option value="AR">AR</option>
            <option value="BOWL">BOWL</option>
          </select>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player name" />
        </div>
      </section>

      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Team</th>
              <th>Status</th>
              <th>Overseas</th>
              <th>Salary</th>
              <th>Fantasy Points</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td>{player.role}</td>
                <td>{player.teamCode}</td>
                <td>{player.status}</td>
                <td>{player.isOverseas ? "Yes" : "No"}</td>
                <td>{player.salary}</td>
                <td>{player.fantasyPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
