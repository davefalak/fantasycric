export interface IplGameDay {
  gameDay: string;
  firstMatchStartAt: string;
  lockAt: string;
  matchCount: number;
  matches: IplMatchFixture[];
}

export interface IplMatchFixture {
  matchNumber: number;
  startsAt: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  venue: string;
}

const IPL_TEAMS: Array<{ code: string; name: string }> = [
  { code: "CSK", name: "Chennai Super Kings" },
  { code: "MI", name: "Mumbai Indians" },
  { code: "RCB", name: "Royal Challengers Bengaluru" },
  { code: "KKR", name: "Kolkata Knight Riders" },
  { code: "DC", name: "Delhi Capitals" },
  { code: "GT", name: "Gujarat Titans" },
  { code: "LSG", name: "Lucknow Super Giants" },
  { code: "PBKS", name: "Punjab Kings" },
  { code: "RR", name: "Rajasthan Royals" },
  { code: "SRH", name: "Sunrisers Hyderabad" }
];

const IPL_VENUES = [
  "Wankhede Stadium",
  "M. A. Chidambaram Stadium",
  "Narendra Modi Stadium",
  "Eden Gardens",
  "Arun Jaitley Stadium",
  "M. Chinnaswamy Stadium",
  "Rajiv Gandhi International Stadium",
  "Sawai Mansingh Stadium",
  "Ekana Cricket Stadium",
  "PCA Stadium"
];

const IST_OFFSET_MINUTES = 330;
const MINUTE_MS = 60_000;

function toUtcIsoFromIstParts(date: string, hour: number, minute: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - (IST_OFFSET_MINUTES * MINUTE_MS);
  return new Date(utcMs).toISOString();
}

function makeGameDay(date: string, matches: IplMatchFixture[]): IplGameDay {
  const firstMatchStartAt = matches[0]?.startsAt || toUtcIsoFromIstParts(date, 19, 30);
  const lockAt = new Date(new Date(firstMatchStartAt).getTime() - 30 * MINUTE_MS).toISOString();
  return {
    gameDay: date,
    firstMatchStartAt,
    lockAt,
    matchCount: matches.length,
    matches
  };
}

function getFixtureTeams(matchNumber: number): {
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
} {
  const homeIndex = (matchNumber * 2 + 1) % IPL_TEAMS.length;
  let awayIndex = (matchNumber * 3 + 4) % IPL_TEAMS.length;
  if (awayIndex === homeIndex) {
    awayIndex = (awayIndex + 1) % IPL_TEAMS.length;
  }

  const home = IPL_TEAMS[homeIndex];
  const away = IPL_TEAMS[awayIndex];
  return {
    homeTeamCode: home.code,
    awayTeamCode: away.code,
    homeTeamName: home.name,
    awayTeamName: away.name
  };
}

function makeFixture(date: string, hour: number, minute: number, matchNumber: number): IplMatchFixture {
  const startsAt = toUtcIsoFromIstParts(date, hour, minute);
  const teams = getFixtureTeams(matchNumber);
  const venue = IPL_VENUES[(matchNumber - 1) % IPL_VENUES.length];

  return {
    matchNumber,
    startsAt,
    homeTeamCode: teams.homeTeamCode,
    awayTeamCode: teams.awayTeamCode,
    homeTeamName: teams.homeTeamName,
    awayTeamName: teams.awayTeamName,
    venue
  };
}

function dayNameUtc(date: string): number {
  const value = new Date(`${date}T00:00:00.000Z`);
  return value.getUTCDay();
}

// IPL 2026 season schedule backbone.
// The first fixture date aligns with the official fixture release.
// Match counts follow common IPL pattern (weekday single-match, weekend double-header).
export function getIpl2026GameDays(): IplGameDay[] {
  const start = new Date("2026-03-28T00:00:00.000Z");
  const end = new Date("2026-05-24T00:00:00.000Z");
  const days: IplGameDay[] = [];
  let matchNumber = 1;

  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    const date = cursor.toISOString().slice(0, 10);
    const weekday = dayNameUtc(date);
    const isWeekend = weekday === 0 || weekday === 6;

    if (isWeekend) {
      const matches = [
        makeFixture(date, 15, 30, matchNumber),
        makeFixture(date, 19, 30, matchNumber + 1)
      ];
      days.push(makeGameDay(date, matches));
      matchNumber += 2;
      continue;
    }

    const matches = [makeFixture(date, 19, 30, matchNumber)];
    days.push(makeGameDay(date, matches));
    matchNumber += 1;
  }

  return days;
}

export function getIpl2026GameDay(date: string): IplGameDay | null {
  const normalized = date.slice(0, 10);
  return getIpl2026GameDays().find((entry) => entry.gameDay === normalized) ?? null;
}

export function getIplGameDayForNow(now = new Date()): IplGameDay | null {
  const date = now.toISOString().slice(0, 10);
  return getIpl2026GameDay(date);
}
