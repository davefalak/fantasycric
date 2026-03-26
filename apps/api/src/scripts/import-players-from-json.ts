import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { IPL_2026_ROSTER } from "../players/ipl-roster.data.ts";

interface JsonPlayer {
  PlayerId: number;
  PlayerName: string;
  PlayerTypeId: number; // 1=BAT, 2=BOWL, 3=AR, 4=WK
  PlayerFormId: number;
  IsInjured: number;
  Price: number;
  RealTeamName: string;
}

interface JsonPlayersResponse {
  Result: JsonPlayer[];
}

const TEAM_MAPPING: Record<string, { code: string; fullName: string }> = {
  PNJ: { code: "PBKS", fullName: "Punjab Kings" },
  CHN: { code: "CSK", fullName: "Chennai Super Kings" },
  RJS: { code: "RR", fullName: "Rajasthan Royals" },
  BNG: { code: "RCB", fullName: "Royal Challengers Bengaluru" },
  KOL: { code: "KKR", fullName: "Kolkata Knight Riders" },
  MUM: { code: "MI", fullName: "Mumbai Indians" },
  HYD: { code: "SRH", fullName: "Sunrisers Hyderabad" },
  DEC: { code: "DC", fullName: "Delhi Capitals" },
  GJT: { code: "GT", fullName: "Gujarat Titans" },
  LUK: { code: "LSG", fullName: "Lucknow Super Giants" }
};

const ROLE_MAPPING: Record<number, "WK" | "BAT" | "AR" | "BOWL"> = {
  1: "BAT",
  2: "BOWL",
  3: "AR",
  4: "WK"
};

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fantasy_ipl_2026";

function normalizePlayerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

async function main() {
  const playersJsonPath = path.join(__dirname, "../../../..", "players.json");

  if (!fs.existsSync(playersJsonPath)) {
    throw new Error(`Players JSON file not found at ${playersJsonPath}`);
  }

  const jsonContent = fs.readFileSync(playersJsonPath, "utf-8");
  const playersData: JsonPlayersResponse = JSON.parse(jsonContent);
  const rosterByTeamAndName = new Map(
    IPL_2026_ROSTER.map((player) => [`${player.teamCode}:${normalizePlayerName(player.name)}`, player])
  );

  console.log(`📥 Loading ${playersData.Result.length} players from JSON...`);

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    console.log("🗑️  Clearing existing players...");
    await client.query("DELETE FROM ipl_players");

    await client.query("BEGIN");

    let insertedCount = 0;

    for (const jsonPlayer of playersData.Result) {
      const teamInfo = TEAM_MAPPING[jsonPlayer.RealTeamName];
      if (!teamInfo) {
        console.warn(`⚠️  Unknown team: ${jsonPlayer.RealTeamName}`);
        continue;
      }

      const role = ROLE_MAPPING[jsonPlayer.PlayerTypeId] || "BAT";
      const status = jsonPlayer.IsInjured === 1 ? "injured" : "active";
      const rosterPlayer = rosterByTeamAndName.get(`${teamInfo.code}:${normalizePlayerName(jsonPlayer.PlayerName)}`);
      const isOverseas = rosterPlayer?.isOverseas ?? false;
      const sourceUrl = rosterPlayer?.sourceUrl ?? null;

      await client.query(
        `INSERT INTO ipl_players (
          id, external_player_id, name, role, team_code, team_name,
          player_form, status, fantasy_points, is_overseas, salary, source, source_url, updated_at
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, 'players.json', $11, NOW())`,
        [
          randomUUID(),
          jsonPlayer.PlayerId,
          jsonPlayer.PlayerName,
          role,
          teamInfo.code,
          teamInfo.fullName,
          jsonPlayer.PlayerFormId,
          status,
          isOverseas,
          jsonPlayer.Price,
          sourceUrl
        ]
      );

      insertedCount++;
      if (insertedCount % 50 === 0) {
        console.log(`  ✓ Processed ${insertedCount}/${playersData.Result.length} players...`);
      }
    }

    await client.query("COMMIT");
    console.log(`\n✅ Successfully imported ${insertedCount} players into ipl_players table`);

    // Print summary by team and role
    const summary = await client.query<{ team_code: string; team_name: string; role: string; count: string }>(
      `SELECT team_code, team_name, role, COUNT(*) as count
       FROM ipl_players 
       GROUP BY team_code, team_name, role 
       ORDER BY team_code, role`
    );

    console.log("\n📊 Players by Team and Role:");
    console.log("────────────────────────────────");

    let currentTeam = "";
    for (const row of summary.rows) {
      if (row.team_code !== currentTeam) {
        currentTeam = row.team_code;
        console.log(`\n${row.team_code} (${row.team_name}):`);
      }
      console.log(`  ${row.role}: ${row.count}`);
    }

    const totalSummary = await client.query<{ total: string; teams: string }>(
      `SELECT COUNT(*) as total, COUNT(DISTINCT team_code) as teams FROM ipl_players`
    );
    const total = totalSummary.rows[0].total;
    const teams = totalSummary.rows[0].teams;
    console.log(
      `\n✨ Total: ${total} players across ${teams} teams`
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // Ignore rollback errors
    }
    console.error("❌ Error importing players:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
