#!/usr/bin/env python3
"""Minimal BeautifulSoup-based live cricket scraper for fallback preview.

Outputs JSON to stdout. Never raises raw tracebacks to stdout.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone

try:
    import requests
    from bs4 import BeautifulSoup
except Exception as exc:  # pragma: no cover
    print(json.dumps({"success": False, "error": f"Missing dependencies: {exc}"}))
    sys.exit(0)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def dedupe_by_name(rows: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for row in rows:
        name = str(row.get("playerName", "")).strip()
        if name and name not in seen:
            seen[name] = row
    return list(seen.values())


def extract_first_match_id(text: str) -> str | None:
    m = re.search(r"/live-cricket-scores/(\d+)/", text)
    return m.group(1) if m else None


def extract_score(text: str) -> str | None:
    m = re.search(r"([A-Z]{2,5})\s+(\d+)-(\d+)\s*\((\d+(?:\.\d+)?)\s*Ov\)", text)
    if not m:
        return None
    return f"{m.group(1)} {m.group(2)}-{m.group(3)} ({m.group(4)} Ov)"


def extract_batting(text: str) -> list[dict]:
    rows: list[dict] = []
    pat = re.compile(
        r"([A-Z][A-Za-z .'-]{2,})\s+(?:c\s+[^\[]+?\s+b\s+[^\[]+?|not out\s+|run out\s*\([^)]*\)\s+)?(\d+)\((\d+)\)\s*\[4s-(\d+)(?:,\s*6s-(\d+))?\]"
    )
    for m in pat.finditer(text):
        name = re.sub(r"\s+(?:c|b|lbw|run out|st|not out)\b.*$", "", m.group(1).strip(), flags=re.IGNORECASE)
        runs = int(m.group(2))
        balls = int(m.group(3))
        fours = int(m.group(4))
        sixes = int(m.group(5) or "0")
        sr = round((runs / balls) * 100, 2) if balls > 0 else 0
        rows.append(
            {
                "playerName": name,
                "runs": runs,
                "balls": balls,
                "fours": fours,
                "sixes": sixes,
                "strikeRate": sr,
            }
        )
    return dedupe_by_name(rows)


def extract_bowling(text: str) -> list[dict]:
    rows: list[dict] = []
    pat = re.compile(r"([A-Z][A-Za-z .'-]{2,})\s+(\d+)-(\d+)-(\d+)-(\d+)")
    for m in pat.finditer(text):
        rows.append(
            {
                "playerName": m.group(1).strip(),
                "overs": int(m.group(2)),
                "maidens": int(m.group(3)),
                "runsConceded": int(m.group(4)),
                "wickets": int(m.group(5)),
            }
        )
    return dedupe_by_name(rows)


def get(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; FantasyIPLBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    r = requests.get(url, headers=headers, timeout=12)
    r.raise_for_status()
    return r.text


def scrape_cricbuzz(base_url: str, match_id: str | None) -> dict:
    notes: list[str] = []

    if not match_id:
        live_scores_url = f"{base_url}/cricket-match/live-scores"
        live_html = get(live_scores_url)
        found_id = extract_first_match_id(live_html)
        if not found_id:
            return {"success": False, "error": "No live match id found on Cricbuzz live scores page"}
        match_id = found_id

    match_url = f"{base_url}/live-cricket-scorecard/{match_id}"
    html = get(match_url)
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)

    batting = extract_batting(text)
    bowling = extract_bowling(text)
    score_text = extract_score(text)

    if not batting and not bowling:
        notes.append("BeautifulSoup parser did not extract structured player rows from this page layout.")

    return {
        "success": True,
        "source": "cricbuzz",
        "fetchedAt": now_iso(),
        "matchId": match_id,
        "matchUrl": match_url,
        "fetchedFromUrl": match_url,
        "scoreText": score_text,
        "batting": batting,
        "bowling": bowling,
        "notes": notes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default="cricbuzz")
    parser.add_argument("--match-id", default=None)
    parser.add_argument("--base-url", default="https://www.cricbuzz.com")
    args = parser.parse_args()

    try:
        if args.provider != "cricbuzz":
            print(json.dumps({"success": False, "error": "Only cricbuzz provider is implemented in bs4 fallback"}))
            return

        result = scrape_cricbuzz(args.base_url.rstrip("/"), args.match_id)
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"success": False, "error": str(exc)}))


if __name__ == "__main__":
    main()
