/**
 * Data cleanup migration
 *
 * Problems this fixes:
 * 1. Non-UUID seeded members (owner-1, dummy-01 to dummy-08) are in league_members/league_teams
 *    but have no auth_users records — so they appear as blank everywhere.
 * 2. All Mega League team names are raw-ID placeholders ("Dummy XI - owner-1", etc.)
 * 3. The Mega League leaderboard only has 2/10 members
 * 4. Auto Fixture Join Test leaderboard is missing davefalak@gmail.com
 *
 * Result:
 * - Every dummy member gets a proper auth_users row with a real UUID, display name, and email
 * - All table references (league_members, league_teams, league_h2h_fixtures, leaderboards)
 *   are updated to the new UUIDs
 * - Team names become proper fantasy names
 * - Leaderboards are completed with all league members
 */

import pg from "pg";
import { randomBytes, scryptSync } from "node:crypto";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/fantasy_ipl_2026";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

// Fixed, deterministic UUIDs for each placeholder user (idempotent re-runs)
const DUMMY_USERS = [
  { oldId: "owner-1",  uuid: "a0000001-0000-4000-8000-000000000001", name: "Rahul Sharma",    email: "rahul.sharma@fantasy.local" },
  { oldId: "dummy-01", uuid: "d0000001-0000-4000-8000-000000000001", name: "Priya Patel",      email: "priya.patel@fantasy.local" },
  { oldId: "dummy-02", uuid: "d0000002-0000-4000-8000-000000000002", name: "Vikram Singh",     email: "vikram.singh@fantasy.local" },
  { oldId: "dummy-03", uuid: "d0000003-0000-4000-8000-000000000003", name: "Anjali Kumar",     email: "anjali.kumar@fantasy.local" },
  { oldId: "dummy-04", uuid: "d0000004-0000-4000-8000-000000000004", name: "Arjun Malhotra",   email: "arjun.malhotra@fantasy.local" },
  { oldId: "dummy-05", uuid: "d0000005-0000-4000-8000-000000000005", name: "Neha Gupta",       email: "neha.gupta@fantasy.local" },
  { oldId: "dummy-06", uuid: "d0000006-0000-4000-8000-000000000006", name: "Kabir Ali",        email: "kabir.ali@fantasy.local" },
  { oldId: "dummy-07", uuid: "d0000007-0000-4000-8000-000000000007", name: "Divya Nair",       email: "divya.nair@fantasy.local" },
  { oldId: "dummy-08", uuid: "d0000008-0000-4000-8000-000000000008", name: "Rohit Joshi",      email: "rohit.joshi@fantasy.local" },
];

// Proper team names for each user in each league (by userId in their current form)
// Keys are old IDs for dummies, UUIDs for real users
const TEAM_NAMES = {
  "owner-1":                                    "Royal Challengers",
  "dummy-01":                                   "Thunder Strikers",
  "dummy-02":                                   "Mumbai Warriors",
  "dummy-03":                                   "Delhi Dynamos",
  "dummy-04":                                   "Rajasthan Royals XI",
  "dummy-05":                                   "Chennai Superstars",
  "dummy-06":                                   "Kolkata Knights",
  "dummy-07":                                   "Punjab Kings XI",
  "dummy-08":                                   "Hyderabad Hawks",
  "fef76fbc-92fc-459d-92a8-4714b3c3f82c":       "Falak's Warriors",
  "334ad436-1d18-4600-9b2b-5de64ef995df":       "Dave's Dream XI",
  "abaaff18-9d0f-44ed-ba13-68122c2826d7":       "Auto One Avengers",
  "eb7bdc56-8943-4060-9902-60bafa449f3b":       "Auto Two Titans",
  "70e73637-d71e-4055-942b-1611a76345cf":       "Test Team",
  "0a32bb29-1043-4835-8fd1-60b11181724d":       "UI United",
  "023830a1-7448-4c68-a033-b51edfc3c6fe":       "Admin Allstars",
};

async function run() {
  const pool = new pg.Pool({ connectionString: DB_URL });
  const client = await pool.connect();

  console.log("🔧 Starting data cleanup migration...\n");

  try {
    await client.query("BEGIN");

    // ────────────────────────────────────────────────────────────
    // 1. Create auth_users for all dummy placeholder accounts
    // ────────────────────────────────────────────────────────────
    const passwordHash = hashPassword("Fantasy@2026");

    for (const user of DUMMY_USERS) {
      const exists = await client.query(
        "SELECT 1 FROM auth_users WHERE id = $1::uuid",
        [user.uuid]
      );
      if (exists.rowCount === 0) {
        await client.query(
          `INSERT INTO auth_users (id, email, password_hash, display_name, created_at, role)
             VALUES ($1::uuid, $2, $3, $4, NOW(), 'member')`,
          [user.uuid, user.email, passwordHash, user.name]
        );
        console.log(`  ✅ Created auth user: ${user.name} (${user.uuid})`);
      } else {
        // Ensure display name and email are up to date
        await client.query(
          `UPDATE auth_users SET display_name = $2, email = $3 WHERE id = $1::uuid`,
          [user.uuid, user.name, user.email]
        );
        console.log(`  🔁 Updated auth user: ${user.name}`);
      }
    }

    // ────────────────────────────────────────────────────────────
    // 2. Replace old placeholder IDs with new UUIDs in all tables
    // ────────────────────────────────────────────────────────────
    for (const user of DUMMY_USERS) {
      const { oldId, uuid } = user;

      // league_members
      const lm = await client.query(
        "UPDATE league_members SET user_id = $1 WHERE user_id = $2",
        [uuid, oldId]
      );
      if (lm.rowCount > 0) console.log(`  🔄 league_members: ${oldId} → ${uuid} (${lm.rowCount} rows)`);

      // league_teams
      const lt = await client.query(
        "UPDATE league_teams SET user_id = $1 WHERE user_id = $2",
        [uuid, oldId]
      );
      if (lt.rowCount > 0) console.log(`  🔄 league_teams: ${oldId} → ${uuid} (${lt.rowCount} rows)`);

      // league_h2h_fixtures (home)
      const fh = await client.query(
        "UPDATE league_h2h_fixtures SET home_user_id = $1 WHERE home_user_id = $2",
        [uuid, oldId]
      );
      if (fh.rowCount > 0) console.log(`  🔄 h2h_fixtures home: ${oldId} → ${uuid} (${fh.rowCount} rows)`);

      // league_h2h_fixtures (away)
      const fa = await client.query(
        "UPDATE league_h2h_fixtures SET away_user_id = $1 WHERE away_user_id = $2",
        [uuid, oldId]
      );
      if (fa.rowCount > 0) console.log(`  🔄 h2h_fixtures away: ${oldId} → ${uuid} (${fa.rowCount} rows)`);

      // leaderboards
      const lb = await client.query(
        "UPDATE leaderboards SET user_id = $1 WHERE user_id = $2",
        [uuid, oldId]
      );
      if (lb.rowCount > 0) console.log(`  🔄 leaderboards: ${oldId} → ${uuid} (${lb.rowCount} rows)`);
    }

    // ────────────────────────────────────────────────────────────
    // 3. Fix all team names — map old team names to real names
    //    for both old-ID rows that were just migrated AND real users
    // ────────────────────────────────────────────────────────────
    console.log("\n  🏏 Fixing team names...");

    // Dummies now have new UUIDs — fix their team names using the new UUID
    for (const user of DUMMY_USERS) {
      const friendlyName = TEAM_NAMES[user.oldId];
      if (friendlyName) {
        const res = await client.query(
          "UPDATE league_teams SET team_name = $1 WHERE user_id = $2",
          [friendlyName, user.uuid]
        );
        if (res.rowCount > 0) console.log(`    ✅ ${user.name}: "${friendlyName}" (${res.rowCount} row(s))`);
      }
    }

    // Fix real users' team names too
    const realUserIds = Object.keys(TEAM_NAMES).filter(
      (id) => !DUMMY_USERS.some((d) => d.oldId === id)
    );
    for (const userId of realUserIds) {
      const friendlyName = TEAM_NAMES[userId];
      if (friendlyName) {
        const res = await client.query(
          `UPDATE league_teams SET team_name = $1
           WHERE user_id = $2
             AND team_name NOT LIKE '%Warriors%'
             AND team_name NOT LIKE '%Dream%'
             AND team_name NOT LIKE '%Avengers%'
             AND team_name NOT LIKE '%Titans%'
             AND team_name NOT LIKE '%Team%'
             AND team_name NOT LIKE '%United%'
             AND team_name NOT LIKE '%Allstars%'`,
          [friendlyName, userId]
        );
        if (res.rowCount > 0) console.log(`    ✅ Real user ${userId.slice(0, 8)}...: "${friendlyName}" (${res.rowCount} row(s))`);
      }
    }

    // ────────────────────────────────────────────────────────────
    // 4. Fix leaderboards — ensure EVERY league member has a row
    // ────────────────────────────────────────────────────────────
    console.log("\n  📊 Ensuring complete leaderboard rows for all members...");

    const leagues = await client.query("SELECT id, name FROM leagues");
    for (const league of leagues.rows) {
      const members = await client.query(
        "SELECT user_id FROM league_members WHERE league_id = $1",
        [league.id]
      );

      for (const member of members.rows) {
        const existing = await client.query(
          "SELECT 1 FROM leaderboards WHERE league_id = $1 AND user_id = $2",
          [league.id, member.user_id]
        );

        if (existing.rowCount === 0) {
          await client.query(
            `INSERT INTO leaderboards
               (id, league_id, user_id, wins, losses, ties,
                total_points, rank, updated_at, points, score_for, score_against, total_score)
             VALUES
               (gen_random_uuid(), $1, $2, 0, 0, 0, 0, 999, NOW(), 0, 0, 0, 0)`,
            [league.id, member.user_id]
          );
          console.log(`    ➕ Added leaderboard row for ${member.user_id.slice(0, 12)}... in "${league.name}"`);
        }
      }

      // Re-rank all rows for this league (rank by points desc, then userId for tiebreak)
      await client.query(
        `UPDATE leaderboards lb
         SET rank = sub.rn
         FROM (
           SELECT user_id,
                  ROW_NUMBER() OVER (ORDER BY points DESC, total_score DESC, user_id ASC) AS rn
           FROM leaderboards
           WHERE league_id = $1
         ) sub
         WHERE lb.league_id = $1 AND lb.user_id = sub.user_id`,
        [league.id]
      );
      console.log(`    ✅ Re-ranked leaderboard for "${league.name}"`);
    }

    // ────────────────────────────────────────────────────────────
    // 5. Sync leagues.member_count with actual member rows
    // ────────────────────────────────────────────────────────────
    console.log("\n  👥 Syncing league member counts...");
    await client.query(`
      UPDATE leagues l
      SET member_count = (
        SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id
      )
    `);
    console.log("    ✅ member_count synced");

    await client.query("COMMIT");
    console.log("\n✅ Migration complete.\n");

    // ────────────────────────────────────────────────────────────
    // 6. Print final state for verification
    // ────────────────────────────────────────────────────────────
    console.log("=== Final State ===\n");

    const usersRes = await client.query(
      "SELECT id, display_name, email FROM auth_users ORDER BY display_name"
    );
    console.log(`auth_users (${usersRes.rowCount} total):`);
    for (const u of usersRes.rows) {
      console.log(`  ${u.id}  ${u.display_name.padEnd(20)}  ${u.email}`);
    }

    console.log("\nleague_teams with resolved names:");
    const teamsRes = await client.query(`
      SELECT l.name AS league, u.display_name, lt.game_day, lt.team_name
      FROM league_teams lt
      JOIN leagues l ON l.id = lt.league_id
      LEFT JOIN auth_users u ON u.id::text = lt.user_id
      ORDER BY l.name, lt.user_id
    `);
    for (const t of teamsRes.rows) {
      console.log(`  [${t.league}] ${(t.display_name || "??").padEnd(20)} | ${t.game_day} | ${t.team_name}`);
    }

    console.log("\nleaderboards:");
    const lbRes = await client.query(`
      SELECT l.name AS league, u.display_name, lb.rank, lb.points, lb.wins, lb.losses
      FROM leaderboards lb
      JOIN leagues l ON l.id = lb.league_id
      LEFT JOIN auth_users u ON u.id::text = lb.user_id
      ORDER BY l.name, lb.rank
    `);
    for (const r of lbRes.rows) {
      console.log(`  [${r.league}] #${r.rank} ${(r.display_name || r.user_id || "??").padEnd(22)} pts=${r.points} W=${r.wins} L=${r.losses}`);
    }

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
