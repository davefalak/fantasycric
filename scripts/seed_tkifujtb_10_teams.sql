WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
), seed_users AS (
  SELECT * FROM (VALUES
    ('dummy-01'),('dummy-02'),('dummy-03'),('dummy-04'),
    ('dummy-05'),('dummy-06'),('dummy-07'),('dummy-08')
  ) AS v(user_id)
)
INSERT INTO league_members (id, league_id, user_id, joined_at)
SELECT gen_random_uuid(), l.id, s.user_id, NOW()
FROM league l
CROSS JOIN seed_users s
WHERE NOT EXISTS (
  SELECT 1 FROM league_members lm
  WHERE lm.league_id = l.id AND lm.user_id = s.user_id
);

WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
)
UPDATE leagues l
SET member_limit = GREATEST(member_limit, 10),
    member_count = (
      SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id
    )
WHERE l.id = (SELECT id FROM league);

WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
)
DELETE FROM league_h2h_results r
WHERE r.league_id = (SELECT id FROM league);

WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
)
DELETE FROM league_h2h_fixtures f
WHERE f.league_id = (SELECT id FROM league);

WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
)
DELETE FROM league_teams t
WHERE t.league_id = (SELECT id FROM league)
  AND t.game_day = DATE '2026-03-28';

WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
), members AS (
  SELECT lm.user_id
  FROM league_members lm
  WHERE lm.league_id = (SELECT id FROM league)
  ORDER BY lm.joined_at ASC, lm.user_id ASC
  LIMIT 10
), picked AS (
  SELECT id, name, role, team_code, salary
  FROM ipl_players
  ORDER BY id
  LIMIT 11
), team_payload AS (
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'playerId', p.id,
        'playerName', p.name,
        'teamCode', p.team_code,
        'role', p.role,
        'cost', p.salary
      ) ORDER BY p.id
    ) AS players,
    (SELECT id FROM picked ORDER BY id LIMIT 1) AS captain_id,
    (SELECT id FROM picked ORDER BY id OFFSET 1 LIMIT 1) AS vice_id,
    (SELECT COALESCE(SUM(salary)::int, 0) FROM picked) AS budget_used
  FROM picked p
)
INSERT INTO league_teams (
  id, league_id, user_id, game_day, team_name,
  players, captain_player_id, vice_captain_player_id,
  total_budget_used, locked_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  l.id,
  m.user_id,
  DATE '2026-03-28',
  'Dummy XI - ' || m.user_id,
  tp.players,
  tp.captain_id,
  tp.vice_id,
  tp.budget_used,
  NULL,
  NOW(),
  NOW()
FROM league l
CROSS JOIN members m
CROSS JOIN team_payload tp;

WITH league AS (
  SELECT id FROM leagues WHERE invite_code = 'TKIFUJTB'
)
SELECT
  (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = (SELECT id FROM league)) AS members,
  (SELECT COUNT(*) FROM league_teams lt WHERE lt.league_id = (SELECT id FROM league) AND lt.game_day = DATE '2026-03-28') AS teams_seeded,
  (SELECT member_limit FROM leagues WHERE id = (SELECT id FROM league)) AS member_limit;
