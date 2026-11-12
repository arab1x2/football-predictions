# Match Intelligence (football research and predictions)

A free web app that lists real football fixtures and, in later steps, produces source-backed match research and statistical predictions. Nothing is invented: when data is missing, the app says so.

**Status:** step 1 done. The homepage lists real fixtures for any date from football-data.org once an API key is added. "Deep Analyze" is not built yet.

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for which free data sources are used and their limits.

## What you need (all free)

1. A **GitHub** account (you have it: this repository).
2. A **football-data.org** API key: register at https://www.football-data.org/client/register. The key arrives by email.
3. A **Cloudflare** account: https://dash.cloudflare.com/sign-up

## Put the site online (Cloudflare Pages)

1. In Cloudflare, open **Workers & Pages**, click **Create**, choose the **Pages** tab, then **Connect to Git**.
2. Pick the `football-predictions` repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Click **Save and Deploy**. Your site gets an address like `football-predictions.pages.dev`.

### Add your API key

1. In Cloudflare, open your Pages project, then **Settings**, then **Variables and Secrets**.
2. Add a variable named `FOOTBALL_DATA_API_KEY`, paste your key as the value, and choose **Encrypt**.
3. Go to **Deployments** and click **Retry deployment** on the latest one so the key is picked up.

The key stays on Cloudflare's servers. It is never sent to visitors' browsers and must never be put in the code.

## For developers

```bash
npm install
cp .dev.vars.example .dev.vars   # then put your key in .dev.vars
npm test                         # unit tests
npm run dev:full                 # build + run site and API locally on http://localhost:8788
```

- `src/`: React frontend (Vite, TypeScript, Tailwind).
- `functions/api/`: Cloudflare Pages Functions (server side, holds the key, caches responses).
- `shared/`: normalized data types, time zone helpers, provider adapters.
- `tests/`: Vitest unit tests.

Default time zone is `Africa/Casablanca`, taken from the runtime's time zone database (no hardcoded offset).

### Changing or adding a provider

Each provider has an adapter in `shared/providers/` that converts its data into the types in `shared/types.ts`. Add a new adapter there and call it from a function in `functions/api/`.

## What is tested and what is not

- Tested: date and time zone logic, provider data normalization (missing fields, duplicates, statuses), team search, API error responses (missing key, bad date) on a local server.
- **Not tested yet:** live calls to football-data.org. The build environment cannot reach it. This needs your key and the deployed site.
