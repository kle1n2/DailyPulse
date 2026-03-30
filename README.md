# DailyPulse

DailyPulse is a static Astro site that publishes a daily digest of news and AI papers/blog posts.
The project runs as an offline pipeline: fetch RSS -> generate JSON -> build and deploy static pages.

## What This Repo Does

- Generates daily report files under `data/daily/YYYY-MM-DD.json`
- Maintains archive index in `data/index.json`
- Serves pages from static JSON at build time (no runtime API/database)
- Uses GitHub Actions for daily data update and Pages deployment

## Quick Start

Prerequisites:

- Node.js `22+`

Install and run locally:

```bash
npm install
npm run fetch:daily
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Windows PowerShell Notes

If your PowerShell execution policy blocks `npm` script shims, use `npm.cmd` directly:

```powershell
npm.cmd install
npm.cmd run fetch:daily
npm.cmd run dev
```

If you hit local `spawn EPERM` in restricted Windows environments, treat Linux CI as source of truth for deployment builds.

## Core Commands

- `npm run fetch:daily`: fetch feeds and write daily/index JSON
- `npm run dev`: run Astro dev server
- `npm run check`: Astro checks (requires `@astrojs/check`, already listed in devDependencies)
- `npm run build`: build static output into `dist/`
- `npm run preview`: preview built output

## Data Pipeline

Pipeline entry:

- `scripts/build-daily-data.mjs`

Configuration:

- `scripts/config/sources.mjs`

Daily flow:

1. Fetch news/paper RSS feeds with timeout protection.
2. Normalize links and metadata.
3. De-duplicate and score items.
4. Generate `data/daily/<date>.json`.
5. Update `data/index.json`.
6. Build/deploy static pages that consume these files.

Data contract:

- `data/schema.json` defines the daily report schema.

## Deployment

Workflows:

- `.github/workflows/daily-update.yml`
- `.github/workflows/deploy.yml`

Behavior:

- `daily-update.yml`: runs on schedule (`0 0 * * *`, UTC) and manual dispatch; commits `data/` changes.
- `deploy.yml`: runs on pushes to `main`; computes `BASE_PATH` by repo name and deploys to GitHub Pages.

Initial setup checklist:

1. In repository settings, set Pages source to `GitHub Actions`.
2. Grant Actions workflow permission `Read and write` for automated data commits.
3. Manually run `Daily Data Update` once and confirm data commit and deploy workflow trigger.

## Content Quality And Operations

See:

- `docs/architecture.md`
- `docs/content-quality.md`
- `docs/operations.md`

## Troubleshooting Quick Hits

- Repeated `[warn] source failed`: one or more feeds timed out/unavailable; output still completes with partial data.
- Category count below target: expected behavior; this project does not backfill with older content.
- GitHub Pages 404 on assets: verify repo Pages settings and ensure `deploy.yml` base-path logic matches repository type.
