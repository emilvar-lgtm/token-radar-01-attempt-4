# Risk Radar

A token launch radar for make.fun's **“Build the best token launch radar”** bounty
(`token-radar-01`). It ranks pre-token protocols by what a token would be worth if the
protocol's record stayed as it is — discounted by the risk of farming it — and shows a
reader how to farm each one.

## The angle: risk scoring

A launch is only as good as the risk you take to farm it. Most radars rank by size or
momentum and let a huge, shaky protocol top the board. This one scores five risks for
every pre-token protocol, all read from the sealed snapshot and nothing else:

- **Volatility** — |7-day TVL change| over 60%. A swing either way is risk; no change reported scores 55.
- **Youth** — under 90 days: 85; under 180: 70; under 365: 55; under 730: 35; older: 20. Unknown age: 70.
- **Concentration** — 1 chain: 80; 2: 60; 3: 45; 4–5: 30; 6 or more: 15.
- **Category** — Bridge 85, Derivatives 75, Liquid Staking / Restaking / Prediction 70, RWA 65, Yield 60, Lending / CDP 55, Dexs 50, Insurance 45, Stablecoins 40, other 60.
- **Size** — under $10M TVL: 85; under $25M: 70; under $50M: 55; under $100M: 40; under $500M: 25; under $2B: 15; larger: 10.

```
risk    = 0.25·volatility + 0.25·youth + 0.20·concentration + 0.15·category + 0.15·size
implied = TVL × 0.30 × growth × maturity × (1 − risk ÷ 100 × 0.55)
```

growth = 1 + clamp(7-day change, −40%, +120%) ÷ 100 × 0.5. maturity = 0.65 +
min(age, 1095 days) ÷ 1095 × 0.35, unknown age counted as 365 days. Bands: Low under 30,
Moderate 30–49, Elevated 50–69, High 70 and over.

No protocol name is ever special-cased. Protocols whose token already trades are kept
apart in the Already trading view at the market's own value, never mixed into the ranking.

The board ranks **all 198 rankable pre-token protocols** — all 40 watchlist protocols plus
every other pre-token protocol below the $50M floor that is not a CEX or a versioned pool.
Each row carries a six-step farm plan with cost and time, including a mitigation step aimed
at that protocol's worst risk factor (split the deposit, start small, keep the position
small, read the docs, or watch TVL weekly).

## The dashboard

A static page with no network: a sortable, filterable board (risk band, category, chain,
search, sort by implied value / lowest risk / TVL / growth), a detail view for every
protocol with its five-factor risk breakdown and farm plan, an Already trading view, and
the full model. Open `dashboard/index.html` with the generated `data.js` beside it.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node.js 22.18 or later. No dependencies, no network: `main.ts` reads the sealed snapshot,
scores the board, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` into the
output directory, and `dossier.json` with the vendored make.fun library.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/risk.ts` — the risk model: five factors, composite risk, risk-discounted implied value, farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the static risk dashboard.
- `screenshots/` — board, detail and filtered views, taken with Chromium against the local dashboard.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored from the kit.

Note for the submitter: fill in this README with the make.fun readme template using the
real owner and repo (badges), and set the repo About from the requirements.

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
