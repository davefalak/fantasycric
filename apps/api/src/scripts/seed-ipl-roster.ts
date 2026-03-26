import { Pool } from "pg";
import { IPL_2026_ROSTER } from "../players/ipl-roster.data.ts";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fantasy_ipl_2026";

async function main() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const player of IPL_2026_ROSTER) {
      await client.query(
        `
          INSERT INTO ipl_players (
            id,
            external_player_id,
            name,
            role,
            team_code,
            team_name,
            status,
            fantasy_points,
            is_overseas,
            salary,
            source,
            source_url,
            updated_at
          ) VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            'iplt20.com',
            $11,
            NOW()
          )
          ON CONFLICT (external_player_id)
          DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            team_code = EXCLUDED.team_code,
            team_name = EXCLUDED.team_name,
            status = EXCLUDED.status,
            fantasy_points = EXCLUDED.fantasy_points,
            is_overseas = EXCLUDED.is_overseas,
            salary = EXCLUDED.salary,
            source = EXCLUDED.source,
            source_url = EXCLUDED.source_url,
            updated_at = NOW()
        `,
        [
          crypto.randomUUID(),
          player.externalPlayerId,
          player.name,
          player.role,
          player.teamCode,
          player.teamName,
          player.status,
          player.fantasyPoints,
          player.isOverseas,
          player.salary,
          player.sourceUrl
        ]
      );
    }

    await client.query("COMMIT");

    const countResult = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM ipl_players");
    console.log(`Seeded IPL roster snapshot with ${countResult.rows[0]?.count || "0"} players.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});