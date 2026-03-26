"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { ROLE_COMPOSITION_LIMITS, MAX_PLAYERS_PER_TEAM, MAX_OVERSEAS_PLAYERS } from "@fantasy/shared";

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

interface SelectedPlayer {
  playerId: string;
  playerName: string;
  teamCode: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  cost: number;
  isOverseas: boolean;
}

interface ExistingTeam {
  id: string;
  userId?: string;
  gameDay?: string;
  teamName: string;
  players: SelectedPlayer[];
  captainPlayerId: string;
  viceCaptainPlayerId: string;
  totalBudgetUsed: number;
  updatedAt?: string;
}

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
  }>;
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function safeReadApi<T>(response: Response): Promise<ApiResult<T>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as ApiResult<T>;
  } catch {
    const fallback = raw?.trim() || `Request failed with status ${response.status}`;
    return { success: false, error: fallback };
  }
}

// Default role-based costs (fallback if salary not yet seeded)
const ROLE_COST_FALLBACK: Record<string, number> = { WK: 9, BAT: 8, AR: 9, BOWL: 7 };

// Role composition limits are imported from @fantasy/shared
const TEAM_MAX = MAX_PLAYERS_PER_TEAM;
const OVERSEAS_MAX = MAX_OVERSEAS_PLAYERS;

interface Props {
  leagueId: string;
  budget: number;
  userId: string;
}

export function TeamBuilderForm({ leagueId, budget, userId }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectedPlayer>>(new Map());
  const [captainId, setCaptainId] = useState("");
  const [vcId, setVcId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [existingTeam, setExistingTeam] = useState<ExistingTeam | null>(null);
  const [mySubmittedTeams, setMySubmittedTeams] = useState<ExistingTeam[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [gameDays, setGameDays] = useState<IplGameDay[]>([]);
  const [selectedGameDay, setSelectedGameDay] = useState("");

  useEffect(() => {
    void loadBootstrap();
  }, [leagueId, userId]);

  useEffect(() => {
    if (!selectedGameDay) return;
    void loadExistingTeam(selectedGameDay);
  }, [selectedGameDay, leagueId, userId]);

  async function loadBootstrap() {
    await Promise.all([loadTeamSummaries(), loadPlayers(), loadLeagueTeamName()]);
    const [days, ownTeams] = await Promise.all([loadSchedule(), loadMySubmittedTeams()]);

    const today = new Date().toISOString().slice(0, 10);
    const nextOpenDay = days.find((entry) => entry.gameDay >= today);
    const fallback = days[days.length - 1];
    const preferredExisting = ownTeams[0]?.gameDay;
    const picked = preferredExisting || nextOpenDay?.gameDay || fallback?.gameDay || "";
    setSelectedGameDay(picked);
  }

  async function loadSchedule(): Promise<IplGameDay[]> {
    const res = await authFetch("/api/schedule/ipl-2026");
    const json = await safeReadApi<IplGameDay[]>(res);
    if (!json.success) return [];

    const days = (json.data || []) as IplGameDay[];
    setGameDays(days);
    return days;
  }

  async function loadMySubmittedTeams(): Promise<ExistingTeam[]> {
    const res = await authFetch(`/api/teams/${leagueId}`);
    const json = await safeReadApi<ExistingTeam[]>(res);
    if (!json.success) {
      setMySubmittedTeams([]);
      return [];
    }

    const ownTeams = (json.data || [])
      .filter((team) => team.userId === userId)
      .sort((a, b) => {
        const dayA = a.gameDay || "";
        const dayB = b.gameDay || "";
        if (dayA !== dayB) {
          return dayB.localeCompare(dayA);
        }
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });

    setMySubmittedTeams(ownTeams);
    return ownTeams;
  }

  async function loadTeamSummaries() {
    const res = await authFetch("/api/players/teams");
    const json = await safeReadApi<TeamSummary[]>(res);
    if (json.success) setTeams(json.data || []);
  }

  async function loadPlayers() {
    const params = new URLSearchParams({ status: "active" });
    const res = await authFetch(`/api/players?${params.toString()}`);
    const json = await safeReadApi<Player[]>(res);
    if (json.success) setPlayers(json.data || []);
  }

  async function loadLeagueTeamName() {
    const res = await authFetch(`/api/leagues/${leagueId}/team-name`);
    const json = await safeReadApi<{ teamName: string }>(res);
    if (json.success && json.data?.teamName) {
      setTeamName(json.data.teamName);
    }
  }

  async function loadExistingTeam(gameDay: string) {
    const params = new URLSearchParams({ leagueId, gameDay });
    const res = await authFetch(`/api/team?${params.toString()}`);
    const json = await safeReadApi<ExistingTeam>(res);
    if (json.success && json.data) {
      const t = json.data as ExistingTeam;
      setExistingTeam(t);
      setTeamName(t.teamName);
      setCaptainId(t.captainPlayerId);
      setVcId(t.viceCaptainPlayerId);
      const map = new Map<string, SelectedPlayer>();
      for (const p of t.players) {
        map.set(p.playerId, p);
      }
      setSelected(map);
      return;
    }

    setExistingTeam(null);
    setSelected(new Map());
    setCaptainId("");
    setVcId("");
  }

  const selectedList = Array.from(selected.values());
  const budgetUsed = selectedList.reduce((s, p) => s + p.cost, 0);
  const budgetLeft = budget - budgetUsed;
  const overseasCount = selectedList.filter((p) => p.isOverseas).length;

  const roleCounts = selectedList.reduce(
    (acc, p) => { acc[p.role] = (acc[p.role] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  function teamCountForPlayer(teamCode: string) {
    return selectedList.filter((p) => p.teamCode === teamCode).length;
  }

  const selectedSchedule = gameDays.find((entry) => entry.gameDay === selectedGameDay);
  const playingTeamCodes = new Set<string>();
  for (const match of selectedSchedule?.matches || []) {
    playingTeamCodes.add(match.homeTeamCode);
    playingTeamCodes.add(match.awayTeamCode);
  }

  function canSelect(player: Player): string | null {
    if (selected.has(player.id)) return null; // already selected, always removable
    if (playingTeamCodes.size > 0 && !playingTeamCodes.has(player.teamCode)) {
      return "Not playing in selected game day";
    }
    if (selected.size >= 11) return "Max 11 players";
    const cost = player.salary > 0 ? player.salary : (ROLE_COST_FALLBACK[player.role] || 8);
    if (budgetLeft < cost) return "Insufficient budget";
    const count = roleCounts[player.role] || 0;
    const [, max] = ROLE_COMPOSITION_LIMITS[player.role] || [1, 4];
    if (count >= max) return `Max ${max} ${player.role}`;
    if (teamCountForPlayer(player.teamCode) >= TEAM_MAX) return `Max ${TEAM_MAX} from ${player.teamCode}`;
    if (player.isOverseas && overseasCount >= OVERSEAS_MAX) return `Max ${OVERSEAS_MAX} overseas`;
    return null;
  }

  function togglePlayer(player: Player) {
    const next = new Map(selected);
    if (next.has(player.id)) {
      next.delete(player.id);
      if (captainId === player.id) setCaptainId("");
      if (vcId === player.id) setVcId("");
    } else {
      const reason = canSelect(player);
      if (reason) return;
      next.set(player.id, {
        playerId: player.id,
        playerName: player.name,
        teamCode: player.teamCode,
        role: player.role,
        cost: player.salary > 0 ? player.salary : (ROLE_COST_FALLBACK[player.role] || 8),
        isOverseas: player.isOverseas
      });
    }
    setSelected(next);
  }

  const filteredPlayers = players.filter((p) => {
    if (filterTeam && p.teamCode !== filterTeam) return false;
    if (filterRole && p.role !== filterRole) return false;
    if (filterQ && !p.name.toLowerCase().includes(filterQ.toLowerCase())) return false;
    return true;
  });

  async function handleSave() {
    setSaveError("");
    setSaveSuccess("");
    if (!selectedGameDay) { setSaveError("Select an IPL game day"); return; }
    if (!teamName.trim()) { setSaveError("Team name is required"); return; }
    if (selected.size !== 11) { setSaveError("Select exactly 11 players"); return; }
    if (!captainId || !selected.has(captainId)) { setSaveError("Select a captain from your squad"); return; }
    if (!vcId || !selected.has(vcId)) { setSaveError("Select a vice-captain from your squad"); return; }
    if (captainId === vcId) { setSaveError("Captain and vice-captain must be different"); return; }

    setSaving(true);
    try {
      const res = await authFetch("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          gameDay: selectedGameDay,
          teamName: teamName.trim(),
          players: selectedList,
          captainPlayerId: captainId,
          viceCaptainPlayerId: vcId
        })
      });
      const json = await safeReadApi<ExistingTeam>(res);
      if (json.success) {
        setSaveSuccess(existingTeam ? "Team updated!" : "Team saved!");
        setExistingTeam(json.data as ExistingTeam);
        setShowBuilder(false);
        await loadExistingTeam(selectedGameDay);
      } else {
        setSaveError(json.error || "Could not save team");
      }
    } finally {
      setSaving(false);
    }
  }

  // Validation summary for display
  const validationIssues: string[] = [];
  if (selected.size !== 11) validationIssues.push(`${selected.size}/11 players selected`);
  if (overseasCount > OVERSEAS_MAX) validationIssues.push(`Max ${OVERSEAS_MAX} overseas (have ${overseasCount})`);
  for (const role of ["WK", "BAT", "AR", "BOWL"] as const) {
    const [min] = ROLE_COMPOSITION_LIMITS[role];
    const count = roleCounts[role] || 0;
    if (count < min) validationIssues.push(`Need ${min - count} more ${role}`);
  }

  if (!showBuilder) {
    return (
      <section className="panel">
        <h2>Your Team{existingTeam ? `: ${existingTeam.teamName}` : ""}</h2>
        {mySubmittedTeams.length > 1 ? (
          <>
            <p className="label">Submitted game days</p>
            <select className="input" value={selectedGameDay} onChange={(e) => setSelectedGameDay(e.target.value)} style={{ maxWidth: 340 }}>
              {mySubmittedTeams.map((team) => (
                <option key={`${team.id}-${team.gameDay}`} value={team.gameDay}>
                  {team.gameDay} - {team.teamName}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <p className="meta">Game day: {selectedGameDay}</p>
        {existingTeam ? (
          <>
            <p className="meta">Budget used: {existingTeam.totalBudgetUsed}/{budget}</p>
            <p className="meta">League team name: <strong>{teamName || "Set from league details"}</strong></p>
            <p className="meta">
              Captain: {existingTeam.players.find((p) => p.playerId === existingTeam.captainPlayerId)?.playerName || "—"} &nbsp;|&nbsp;
              VC: {existingTeam.players.find((p) => p.playerId === existingTeam.viceCaptainPlayerId)?.playerName || "—"}
            </p>
            <div className="team-chips">
              {existingTeam.players.map((p) => (
                <span key={p.playerId} className={`chip chip-${p.role.toLowerCase()}${p.playerId === existingTeam.captainPlayerId ? " chip-captain" : ""}${p.playerId === existingTeam.viceCaptainPlayerId ? " chip-vc" : ""}`}>
                  {p.playerName}
                  {p.playerId === existingTeam.captainPlayerId ? " (C)" : ""}
                  {p.playerId === existingTeam.viceCaptainPlayerId ? " (VC)" : ""}
                </span>
              ))}
            </div>
            <button className="button" style={{ marginTop: "0.8rem" }} onClick={() => setShowBuilder(true)}>Edit Team</button>
          </>
        ) : (
          <>
            <p className="meta">No team submitted yet for this game day.</p>
            <button className="button" style={{ marginTop: "0.8rem" }} onClick={() => setShowBuilder(true)}>Create Team</button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{existingTeam ? "Edit Your Team" : "Build Your Team"}</h2>

      {mySubmittedTeams.length > 0 ? (
        <>
          <p className="label">Your submitted game days</p>
          <select className="input" value={selectedGameDay} onChange={(e) => setSelectedGameDay(e.target.value)} style={{ maxWidth: 340 }}>
            {mySubmittedTeams.map((team) => (
              <option key={`${team.id}-${team.gameDay}`} value={team.gameDay}>
                {team.gameDay} - {team.teamName}
              </option>
            ))}
            {gameDays.filter((day) => !mySubmittedTeams.some((team) => team.gameDay === day.gameDay)).map((day) => (
              <option key={day.gameDay} value={day.gameDay}>
                {day.gameDay} - New Team
              </option>
            ))}
          </select>
        </>
      ) : null}

      <p className="label">IPL Game Day</p>
      <select className="input" value={selectedGameDay} onChange={(e) => setSelectedGameDay(e.target.value)} style={{ maxWidth: 340 }}>
        {gameDays.map((day) => (
          <option key={day.gameDay} value={day.gameDay}>
            {day.gameDay} - {day.matchCount} match{day.matchCount > 1 ? "es" : ""}
          </option>
        ))}
      </select>

      <div className="builder-meta row">
        <span>Selected: <strong>{selected.size}/11</strong></span>
        <span>Budget: <strong className={budgetLeft < 0 ? "error-text" : ""}>{budgetUsed}/{budget}</strong> ({budgetLeft} left)</span>
        <span>Overseas: <strong className={overseasCount > OVERSEAS_MAX ? "error-text" : ""}>{overseasCount}/{OVERSEAS_MAX}</strong></span>
        <span>WK:{roleCounts.WK || 0} BAT:{roleCounts.BAT || 0} AR:{roleCounts.AR || 0} BOWL:{roleCounts.BOWL || 0}</span>
      </div>

      {selectedSchedule?.matches?.length ? (
        <div className="card" style={{ marginBottom: "0.75rem" }}>
          <p className="label" style={{ marginTop: 0 }}>Teams Playing On {selectedGameDay}</p>
          {selectedSchedule.matches.map((match) => (
            <p key={`${selectedGameDay}-${match.matchNumber}`} className="meta">
              {new Date(match.startsAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} IST - {match.homeTeamCode} vs {match.awayTeamCode}
            </p>
          ))}
          <p className="meta">Only players from these teams can be selected. Others are disabled.</p>
        </div>
      ) : null}

      {/* Filters */}
      <div className="filters" style={{ marginBottom: "0.75rem" }}>
        <select className="input" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}>
          <option value="">All Teams</option>
          {teams.map((t) => <option key={t.teamCode} value={t.teamCode}>{t.teamCode}</option>)}
        </select>
        <select className="input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">All Roles</option>
          <option value="WK">WK</option>
          <option value="BAT">BAT</option>
          <option value="AR">AR</option>
          <option value="BOWL">BOWL</option>
        </select>
        <input className="input" placeholder="Search player" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
      </div>

      {/* Player list */}
      <div className="player-picker">
        {filteredPlayers.map((player) => {
          const isSelected = selected.has(player.id);
          const blockReason = isSelected ? null : canSelect(player);

          return (
            <button
              key={player.id}
              className={`picker-row${isSelected ? " picker-row--selected" : ""}${blockReason ? " picker-row--disabled" : ""}`}
              onClick={() => togglePlayer(player)}
              title={blockReason || undefined}
              disabled={!isSelected && !!blockReason}
            >
              <span className={`role-badge role-${player.role.toLowerCase()}`}>{player.role}</span>
              <span className="picker-name">{player.name}</span>
              <span className="picker-team">{player.teamCode}</span>
              {player.isOverseas && <span className="overseas-badge">OS</span>}
              <span className="picker-cost">₹{player.salary > 0 ? player.salary : (ROLE_COST_FALLBACK[player.role] || 8)}cr</span>
              {isSelected && <span className="picker-tick">✓</span>}
            </button>
          );
        })}
        {filteredPlayers.length === 0 && <p className="meta">No players match filters.</p>}
      </div>

      {/* Selected squad */}
      {selected.size > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="label">Your Squad</p>
          <div className="team-chips">
            {selectedList.map((p) => (
              <span key={p.playerId} className={`chip chip-${p.role.toLowerCase()}`}>
                {p.playerName} ({p.role})
              </span>
            ))}
          </div>

          <p className="label">Captain</p>
          <select className="input" value={captainId} onChange={(e) => setCaptainId(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">-- select captain --</option>
            {selectedList.map((p) => (
              <option key={p.playerId} value={p.playerId} disabled={p.playerId === vcId}>{p.playerName}</option>
            ))}
          </select>

          <p className="label">Vice-Captain</p>
          <select className="input" value={vcId} onChange={(e) => setVcId(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">-- select vice-captain --</option>
            {selectedList.map((p) => (
              <option key={p.playerId} value={p.playerId} disabled={p.playerId === captainId}>{p.playerName}</option>
            ))}
          </select>

          <p className="meta">League team name: <strong>{teamName || "Set from league details"}</strong></p>
        </div>
      )}

      {validationIssues.length > 0 && (
        <ul className="meta" style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
          {validationIssues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      )}

      {saveError && <p className="error-text" style={{ marginTop: "0.5rem" }}>{saveError}</p>}
      {saveSuccess && <p className="success-text" style={{ marginTop: "0.5rem" }}>{saveSuccess}</p>}

      <div className="row" style={{ marginTop: "0.85rem" }}>
        <button className="button" onClick={() => void handleSave()} disabled={saving || validationIssues.length > 0}>
          {saving ? "Saving…" : existingTeam ? "Update Team" : "Save Team"}
        </button>
        {existingTeam && (
          <button className="button" style={{ background: "#5f6b63" }} onClick={() => setShowBuilder(false)}>Cancel</button>
        )}
      </div>
    </section>
  );
}
