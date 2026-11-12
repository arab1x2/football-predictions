# Match Intelligence (football research and predictions)

A free web app that lists real football fixtures and, in later steps, produces source-backed match research and statistical predictions. Nothing is invented: when data is missing, the app says so.

**Status:** the homepage lists real fixtures for any date, and "Deep Analyze" builds a report for a match: last 5/10/20 matches for both teams, head-to-head meetings, and a Poisson goals model (1X2, double chance, draw no bet, both teams to score, total and team goals, likely scores) with uncertainty ranges and a chronological accuracy check. The homepage opens on "Picks of the day" (picks for every upcoming match, with fair odds) and refreshes today's list every minute. First-half and second-half markets come from separate models fitted on real half scores. Not yet built: corners, cards and penalties (the free data source does not provide them), injuries and news, saved analyses.

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for which free data sources are used and their limits.

## What you need (all free)

1. A **GitHub** account (you have it: this repository).
2. A **football-data.org** API key: register at https://www.football-data.org/client/register. The key arrives by email.
3. A **Cloudflare** account: https://dash.cloudflare.com/sign-up

## Put the site online (Cloudflare Workers)

1. In Cloudflare, open **Compute (Workers)**, click **Create**, then **Import a repository** and pick `football-predictions`.
2. Settings:
   - Project name: `football-predictions`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. Click **Deploy**. Your site gets an address like `football-predictions.<your-name>.workers.dev`.

### Add your API key

1. In Cloudflare, open your Worker, then **Settings**, then **Variables and Secrets**.
2. Click **Add**, choose type **Secret**, name it `FOOTBALL_DATA_API_KEY`, paste your key, and save.
3. Reload the site. (If matches still don't show, go to **Deployments** and redeploy.)

The key stays on Cloudflare's servers. It is never sent to visitors' browsers and must never be put in the code.

## Bookmaker odds (optional, free)

The match page can compare the model with real bookmaker prices from The Odds API, a licensed odds feed. It does not scrape betting websites.

1. Get a free key at https://the-odds-api.com (free plan: 500 credits per month). The key arrives by email.
2. In Cloudflare, open your Worker, then **Settings**, then **Variables and Secrets**, and add a **Secret** named `ODDS_API_KEY` with that key.
3. Open any upcoming match and click **Load bookmaker odds**.

Loading odds for a league costs 2 credits and is then kept for 12 hours. Markets covered: match result and total goals. If the app cannot identify the match in the bookmaker list with certainty, it shows nothing rather than risk the wrong match.

## For developers

```bash
npm install
cp .dev.vars.example .dev.vars   # then put your key in .dev.vars
npm test                         # unit tests
npm run dev:full                 # build + run site and API locally on http://localhost:8788
```

- `src/`: React frontend (Vite, TypeScript, Tailwind).
- `worker/`: Cloudflare Worker (server side API, holds the key, caches responses, serves the built site).
- `shared/`: normalized data types, time zone helpers, provider adapters.
- `tests/`: Vitest unit tests.

Default time zone is `Africa/Casablanca`, taken from the runtime's time zone database (no hardcoded offset).

### Changing or adding a provider

Each provider has an adapter in `shared/providers/` that converts its data into the types in `shared/types.ts`. Add a new adapter there and call it from a handler in `worker/`.

## What is tested and what is not

- Tested (28 unit tests): date and time zone logic, provider data normalization (missing fields, duplicates, statuses), team search, form windows, the goals model (complementary markets sum to 100%, determinism, no lookahead in training or backtesting), and the data path whitelist. The API error responses were checked on a local server, and the analysis page was checked end to end in a browser with simulated API responses.
- **Not tested with live data from the build environment:** the bookmaker odds feed. The build environment cannot reach it; its adapter was written from the official documentation and tested with sample responses. The football-data.org connection was confirmed working on the deployed site.
