# Free football data sources: what they really give (checked 12 Nov 2026)

How this was checked: I read each provider's official documentation and pricing pages. I could **not** call the APIs from the build environment (its network blocks these hosts), so nothing below is a live test. Every point marked "to confirm" will be checked automatically once your free key is in place.

## Recommendation

| Role | Source | Why |
|---|---|---|
| **Main source (used now)** | football-data.org, free plan | Free key, 10 requests/minute, official REST API, fixtures + results + half-time scores for 12 major competitions. |
| Optional add-on (later) | API-Football, free plan | 100 requests/day. Has corners, lineups, injuries and many more leagues (including Morocco's Botola), but the free plan's season access must be confirmed. |
| Historical research (later) | StatsBomb Open Data | Real event data and xG, but only for selected past competitions. Good for model testing, not for today's matches. |
| Not used | TheSportsDB free key | The free key is heavily cut down (for example, team search only works for "Arsenal", 3 results for a day's schedule). |

## football-data.org (main source)

- **Access:** free registration at football-data.org, key sent by email, sent in the `X-Auth-Token` header.
- **Limit:** 10 requests per minute for registered free users ([API policies](https://docs.football-data.org/general/v4/policies.html)). No daily cap is stated.
- **Competitions on the free plan (12):** Champions League, Premier League, Championship, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão Série A, World Cup, European Championship.
- **Data:** fixtures, status, kickoff time, full-time and half-time scores, standings, team crests.
- **Not on the free plan:** lineups, bookings, shots, corners, xG, injuries, odds.
- **To confirm with a key:** how many past seasons the free plan returns (third-party summaries say current season only), which decides how deep head-to-head can go.
- **Not covered:** Botola Pro (Morocco) and most smaller leagues.

## API-Football (optional, later)

- **Limit:** 100 requests per day on the free plan ([pricing](https://www.api-football.com/pricing)). The pricing page says all plans include all competitions and endpoints: fixtures, statistics (corners, shots), lineups, injuries, head-to-head.
- **Catch:** free plans have historically been restricted to older seasons. This must be confirmed with a real key before we rely on it for today's matches.
- **Budget:** 100 requests/day is enough for a few deep analyses per day if responses are cached, not for loading every match.

## TheSportsDB

- Free key `123`, 30 requests/minute ([documentation](https://www.thesportsdb.com/documentation)), but the free key returns only a few results per call and all v2 endpoints need a paid key. Not reliable enough for this app.

## StatsBomb Open Data

- Reachable from the build environment (confirmed: the competitions list downloaded fine from GitHub).
- Contains real xG and event data for a limited set of past competitions and seasons. Must be credited as StatsBomb. Useful for testing the prediction model, not for live fixtures.

## Injuries and news

No free, legally automatable injury feed has been confirmed yet. This will be researched in the injuries step. Until then the app will say "no verified injury data", which is not the same as "no injuries".
