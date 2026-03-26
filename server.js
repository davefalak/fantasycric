const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.WEB_PORT || 3000);
const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fantasy IPL 2026</title>
  <style>
    :root {
      --bg: #f3efe3;
      --paper: #fffdfa;
      --ink: #102217;
      --muted: #5f6b63;
      --accent: #dd6b20;
      --accent-dark: #a44910;
      --line: #e5d9c7;
      --success: #1f7a46;
      --danger: #b23a2b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, 'Times New Roman', serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, rgba(221,107,32,0.22), transparent 24%),
        linear-gradient(180deg, #fff7ef 0%, var(--bg) 55%, #efe7d7 100%);
    }
    a { color: inherit; }
    .page {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 56px;
    }
    .hero {
      display: grid;
      gap: 20px;
      margin-bottom: 28px;
    }
    .eyebrow {
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-size: 0.75rem;
      color: var(--accent-dark);
      font-weight: 700;
    }
    h1 {
      font-size: clamp(2.4rem, 5vw, 4.8rem);
      line-height: 0.95;
      margin: 0;
      max-width: 12ch;
    }
    .hero p {
      margin: 0;
      max-width: 60ch;
      color: var(--muted);
      font-size: 1.05rem;
      line-height: 1.7;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      align-items: start;
    }
    .stack { display: grid; gap: 20px; }
    .card {
      background: rgba(255,253,250,0.9);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 22px;
      box-shadow: 0 10px 30px rgba(40, 31, 20, 0.08);
      backdrop-filter: blur(8px);
    }
    .card h2, .card h3 {
      margin-top: 0;
      margin-bottom: 8px;
    }
    .card p {
      color: var(--muted);
      line-height: 1.6;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .pill {
      background: #fff2e7;
      border: 1px solid #f3c8a8;
      border-radius: 999px;
      padding: 10px 12px;
      font-size: 0.9rem;
      text-align: center;
      color: var(--accent-dark);
      font-weight: 700;
    }
    form {
      display: grid;
      gap: 12px;
      margin-top: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 0.92rem;
      font-weight: 700;
    }
    input, textarea, select {
      width: 100%;
      border: 1px solid #d7ccb9;
      border-radius: 12px;
      padding: 12px 14px;
      font: inherit;
      background: #fff;
    }
    textarea { min-height: 90px; resize: vertical; }
    button {
      border: 0;
      border-radius: 999px;
      padding: 13px 18px;
      font: inherit;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent-dark));
      color: white;
      cursor: pointer;
    }
    button.secondary {
      background: #efe1cd;
      color: var(--ink);
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .message {
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 0.95rem;
      white-space: pre-wrap;
    }
    .message.success {
      background: #eef9f1;
      border: 1px solid #b8dfc2;
      color: var(--success);
    }
    .message.error {
      background: #fff1ef;
      border: 1px solid #efc0ba;
      color: var(--danger);
    }
    .endpoint-list, .tips {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    .endpoint, .tip {
      border: 1px dashed #dbcdb9;
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.65);
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88rem;
      color: var(--accent-dark);
    }
    .docs a {
      display: inline-block;
      margin-right: 12px;
      margin-top: 8px;
      padding: 10px 14px;
      text-decoration: none;
      border-radius: 999px;
      background: #102217;
      color: #fff;
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .status-grid, .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="eyebrow">Offline-first IPL 2026 workspace</div>
      <h1>Private leagues, invite codes, and team-building are live.</h1>
      <p>
        This workspace now runs a local source-based API and a static product shell. It does not depend on npm registry access for league creation, league joining, or fantasy roster submission.
      </p>
    </section>

    <section class="grid">
      <div class="stack">
        <article class="card">
          <h2>Create a league</h2>
          <p>Create a private IPL league with a custom budget, member cap, and lock deadline. The creator is automatically added as the first member.</p>
          <form id="league-form">
            <label>League name
              <input name="name" required maxlength="100" placeholder="Weekend Warriors" />
            </label>
            <label>Description
              <textarea name="description" placeholder="Friends-only league for the full IPL season"></textarea>
            </label>
            <div class="row">
              <label>Member limit
                <input name="memberLimit" type="number" min="2" max="100" value="6" required />
              </label>
              <label>Total budget
                <input name="totalBudget" type="number" min="50" max="1000" value="100" required />
              </label>
            </div>
            <label>Join deadline
              <input name="joinDeadline" type="datetime-local" required />
            </label>
            <button type="submit">Create league</button>
          </form>
          <div id="league-message"></div>
        </article>

        <article class="card">
          <h2>Join a league</h2>
          <p>Join by invite code using a different user id in the request header or in the form below.</p>
          <form id="join-form">
            <div class="row">
              <label>User id
                <input name="userId" value="friend-1" required />
              </label>
              <label>Invite code
                <input name="inviteCode" required placeholder="AB12CD34" />
              </label>
            </div>
            <button type="submit" class="secondary">Join league</button>
          </form>
          <div id="join-message"></div>
        </article>

        <article class="card">
          <h2>Submit a team</h2>
          <p>Roster validation is enforced on the API: exactly 11 players, budget cap, role composition, captain and vice-captain checks.</p>
          <form id="team-form">
            <div class="row">
              <label>User id
                <input name="userId" value="friend-1" required />
              </label>
              <label>League id
                <input name="leagueId" required placeholder="Paste a league id" />
              </label>
            </div>
            <label>Team name
              <input name="teamName" required value="Boundary Riders" />
            </label>
            <label>Players JSON
              <textarea name="players" required></textarea>
            </label>
            <div class="row">
              <label>Captain player id
                <input name="captainPlayerId" value="ar1" required />
              </label>
              <label>Vice-captain player id
                <input name="viceCaptainPlayerId" value="bat1" required />
              </label>
            </div>
            <button type="submit">Save team</button>
          </form>
          <div id="team-message"></div>
        </article>
      </div>

      <div class="stack">
        <article class="card">
          <h3>Runtime status</h3>
          <p>The API is served from the source tree at <span class="mono">${API_BASE}</span>. Data persists locally to <span class="mono">apps/api/data/runtime-store.json</span>.</p>
          <div class="status-grid">
            <div class="pill">League create</div>
            <div class="pill">League join</div>
            <div class="pill">Team submit</div>
          </div>
          <div class="docs">
            <a href="/prd">PRD</a>
            <a href="/architecture">Architecture</a>
            <a href="/readme">README</a>
          </div>
        </article>

        <article class="card">
          <h3>API endpoints</h3>
          <div class="endpoint-list">
            <div class="endpoint"><div class="mono">GET /api/health</div><div>Service health and timestamp.</div></div>
            <div class="endpoint"><div class="mono">POST /api/leagues</div><div>Create a league with the request owner in <span class="mono">X-User-Id</span>.</div></div>
            <div class="endpoint"><div class="mono">POST /api/leagues/join</div><div>Join a league by invite code.</div></div>
            <div class="endpoint"><div class="mono">POST /api/teams</div><div>Create or update the caller's roster for a league.</div></div>
          </div>
        </article>

        <article class="card">
          <h3>Next migration step</h3>
          <p>The runtime store is a deliberate bridge. Once npm access is available, swap the store implementation for PostgreSQL using the schema in <span class="mono">apps/api/src/leagues/league.schema.sql</span> without changing the controller surface.</p>
          <div class="tips">
            <div class="tip">Use <span class="mono">npm run dev:api</span> and <span class="mono">npm run dev:web</span> from the repo root.</div>
            <div class="tip">Use different <span class="mono">X-User-Id</span> values to simulate league members locally.</div>
            <div class="tip">Use the built-in test suite with <span class="mono">npm run test:api</span>.</div>
          </div>
        </article>
      </div>
    </section>
  </div>

  <script>
    const API_BASE = ${JSON.stringify(API_BASE)};
    const defaultPlayers = [
      { playerId: 'wk1', playerName: 'Keeper One', teamCode: 'MI', role: 'WK', cost: 8 },
      { playerId: 'bat1', playerName: 'Batter One', teamCode: 'CSK', role: 'BAT', cost: 9 },
      { playerId: 'bat2', playerName: 'Batter Two', teamCode: 'RCB', role: 'BAT', cost: 9 },
      { playerId: 'bat3', playerName: 'Batter Three', teamCode: 'GT', role: 'BAT', cost: 8 },
      { playerId: 'bat4', playerName: 'Batter Four', teamCode: 'DC', role: 'BAT', cost: 8 },
      { playerId: 'ar1', playerName: 'Allrounder One', teamCode: 'RR', role: 'AR', cost: 10 },
      { playerId: 'ar2', playerName: 'Allrounder Two', teamCode: 'LSG', role: 'AR', cost: 9 },
      { playerId: 'bowl1', playerName: 'Bowler One', teamCode: 'SRH', role: 'BOWL', cost: 8 },
      { playerId: 'bowl2', playerName: 'Bowler Two', teamCode: 'PBKS', role: 'BOWL', cost: 7 },
      { playerId: 'bowl3', playerName: 'Bowler Three', teamCode: 'KKR', role: 'BOWL', cost: 7 },
      { playerId: 'bowl4', playerName: 'Bowler Four', teamCode: 'MI', role: 'BOWL', cost: 7 }
    ];

    document.querySelector('input[name="joinDeadline"]').value = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    document.querySelector('textarea[name="players"]').value = JSON.stringify(defaultPlayers, null, 2);

    function renderMessage(node, payload, isError) {
      node.innerHTML = '<div class="message ' + (isError ? 'error' : 'success') + '">' + payload + '</div>';
    }

    async function postJson(url, body, userId) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId || 'demo-user'
        },
        body: JSON.stringify(body)
      });
      return response.json();
    }

    document.getElementById('league-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('league-message');
      const form = new FormData(event.currentTarget);
      const payload = {
        name: form.get('name'),
        description: form.get('description'),
        memberLimit: Number(form.get('memberLimit')),
        totalBudget: Number(form.get('totalBudget')),
        joinDeadline: new Date(String(form.get('joinDeadline'))).toISOString()
      };
      try {
        const result = await postJson(API_BASE + '/api/leagues', payload, 'owner-1');
        if (!result.success) throw new Error(result.error || 'League creation failed');
        renderMessage(message, 'League created.\nLeague id: ' + result.data.id + '\nInvite code: ' + result.data.inviteCode, false);
        document.querySelector('input[name="leagueId"]').value = result.data.id;
        document.querySelector('input[name="inviteCode"]').value = result.data.inviteCode;
      } catch (error) {
        renderMessage(message, String(error.message || error), true);
      }
    });

    document.getElementById('join-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('join-message');
      const form = new FormData(event.currentTarget);
      try {
        const result = await postJson(API_BASE + '/api/leagues/join', { inviteCode: form.get('inviteCode') }, String(form.get('userId')));
        if (!result.success) throw new Error(result.error || 'Join failed');
        renderMessage(message, 'Joined league ' + result.data.name + '. Members: ' + result.data.memberCount, false);
      } catch (error) {
        renderMessage(message, String(error.message || error), true);
      }
    });

    document.getElementById('team-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('team-message');
      const form = new FormData(event.currentTarget);
      try {
        const result = await postJson(API_BASE + '/api/teams', {
          leagueId: form.get('leagueId'),
          teamName: form.get('teamName'),
          players: JSON.parse(String(form.get('players'))),
          captainPlayerId: form.get('captainPlayerId'),
          viceCaptainPlayerId: form.get('viceCaptainPlayerId')
        }, String(form.get('userId')));
        if (!result.success) throw new Error(result.error || 'Team save failed');
        renderMessage(message, 'Team saved. Budget used: ' + result.data.totalBudgetUsed, false);
      } catch (error) {
        renderMessage(message, String(error.message || error), true);
      }
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlContent);
    return;
  }

  if (req.url === '/README.md' || req.url === '/readme') {
    const readmePath = path.join(__dirname, 'README.md');
    fs.readFile(readmePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('README not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/prd' || req.url === '/PRD') {
    const prdPath = path.join(__dirname, 'docs', 'PRD-Fantasy-Cricket-IPL-2026.md');
    fs.readFile(prdPath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('PRD not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/architecture' || req.url === '/ARCHITECTURE') {
    const archPath = path.join(__dirname, 'docs', 'ARCHITECTURE.md');
    fs.readFile(archPath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('ARCHITECTURE not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', service: 'fantasy-web-shell', apiBase: API_BASE }, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Fantasy IPL 2026 web shell running on http://localhost:${PORT}`);
  console.log(`Web shell expects API at ${API_BASE}`);
});
