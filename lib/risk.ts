// Risk Radar — token-radar-01, risk-scoring variant (acct-04, attempt 4).
//
// Angle: a launch is only as good as the risk you take to farm it. Most
// radars rank by size or momentum and let a huge, shaky protocol top the
// board. This one scores five risks for every pre-token protocol, all read
// from the sealed snapshot and nothing else, then discounts the implied
// value by the composite risk. A big protocol with a wild 7-day swing, a
// two-month track record and a single chain lands below a smaller, steadier
// one. No protocol name is ever special-cased.
//
//   volatility   = |change_7d| over 60%  -> 0..100 (null change: 55, unknown)
//   youth        = age bands: <90d 85, <180d 70, <365d 55, <730d 35, else 20
//                  (unknown age: 70)
//   concentration= chain count: 1 chain 80, 2 chains 60, 3 chains 45,
//                  4-5 chains 30, 6+ chains 15
//   category     = Bridge 85, Derivatives/Perpetuals 75, Liquid Staking /
//                  Restaking / Prediction 70, RWA 65, Yield 60, Lending /
//                  CDP 55, Dexs 50, Insurance 45, Stablecoins 40, else 60
//   size         = TVL bands: <$10M 85, <$25M 70, <$50M 55, <$100M 40,
//                  <$500M 25, <$2B 15, else 10
//
//   risk         = 0.25*volatility + 0.25*youth + 0.20*concentration
//                  + 0.15*category + 0.15*size        (0..100, integer)
//   band         = Low <30, Moderate 30..49, Elevated 50..69, High >=70
//   base         = tvl_usd * 0.30
//   growthMult   = 1 + clamp(change_7d, -40, 120) / 100 * 0.5 (null: 1.0)
//   maturityMult = 0.65 + min(age, 1095) / 1095 * 0.35 (unknown age: 365d)
//   riskDiscount = 1 - risk / 100 * 0.55
//   implied      = max(1, round(base * growthMult * maturityMult * riskDiscount))
//
// The board ranks every rankable pre-token protocol (watchlist plus every
// pre-token protocol below the floor that is not a wrapped, staked or
// bridged product, an exchange, or a versioned pool),
// 198 rows on this snapshot. Protocols whose token already trades are kept
// apart in the Live view at the market's own value, never mixed into the
// ranking.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface RiskFactors {
  volatility: number;
  youth: number;
  concentration: number;
  category: number;
  size: number;
}

export type RiskBand = 'Low' | 'Moderate' | 'Elevated' | 'High';

export interface RiskScore {
  factors: RiskFactors;
  risk: number;
  band: RiskBand;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  risk: number;
  risk_band: RiskBand;
  risk_factors: RiskFactors;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    risk_discount: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  risk: number;
  risk_band: RiskBand;
  risk_factors: RiskFactors;
  growth_multiplier: number;
  maturity_multiplier: number;
  risk_discount: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  median_risk: number;
  high_risk_count: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export const MODEL_VERSION = 'risk-radar-1';
export const LIVE_ROWS = 24;

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Volatility risk: how violently TVL moved in 7 days, either direction. */
export function volatilityRisk(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 55;
  return Math.round(clamp(Math.abs(change7d) / 60, 0, 1) * 100);
}

/** Youth risk: a short track record with no token is unproven. */
export function youthRisk(age: number | null): number {
  if (age === null) return 70;
  if (age < 90) return 85;
  if (age < 180) return 70;
  if (age < 365) return 55;
  if (age < 730) return 35;
  return 20;
}

/** Concentration risk: one chain is one point of failure. */
export function concentrationRisk(chainCount: number): number {
  if (chainCount <= 1) return 80;
  if (chainCount === 2) return 60;
  if (chainCount === 3) return 45;
  if (chainCount <= 5) return 30;
  return 15;
}

/** Category risk: some categories blow up more often than others. */
export function categoryRisk(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('bridge')) return 85;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 75;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking pool') || c.includes('prediction')) return 70;
  if (c.includes('rwa') || c.includes('real world')) return 65;
  if (c.includes('yield')) return 60;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('curator') || c.includes('allocator')) return 55;
  if (c.includes('dex')) return 50;
  if (c.includes('insurance')) return 45;
  if (c.includes('stable')) return 40;
  if (c.includes('chain')) return 50;
  return 60;
}

/** Size risk: a small TVL is fragile — one whale leaving halves it. */
export function sizeRisk(tvlUsd: number): number {
  if (tvlUsd < 10_000_000) return 85;
  if (tvlUsd < 25_000_000) return 70;
  if (tvlUsd < 50_000_000) return 55;
  if (tvlUsd < 100_000_000) return 40;
  if (tvlUsd < 500_000_000) return 25;
  if (tvlUsd < 2_000_000_000) return 15;
  return 10;
}

export function riskBand(risk: number): RiskBand {
  if (risk < 30) return 'Low';
  if (risk < 50) return 'Moderate';
  if (risk < 70) return 'Elevated';
  return 'High';
}

/** The five factors and the composite score for one protocol. */
export function scoreRisk(p: SnapshotProtocol, age: number | null): RiskScore {
  const factors: RiskFactors = {
    volatility: volatilityRisk(p.change_7d),
    youth: youthRisk(age),
    concentration: concentrationRisk(p.chains.length),
    category: categoryRisk(p.category),
    size: sizeRisk(p.tvl_usd),
  };
  const risk = Math.round(
    0.25 * factors.volatility +
      0.25 * factors.youth +
      0.2 * factors.concentration +
      0.15 * factors.category +
      0.15 * factors.size,
  );
  return { factors, risk, band: riskBand(risk) };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Risk-discounted implied value plus the risk score, for one protocol. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; riskDiscount: number; age: number | null; risk: RiskScore } {
  const age = ageDays(asOf, p.listed_at);
  const risk = scoreRisk(p, age);
  const growthPct = p.change_7d === null ? 0 : clamp(p.change_7d, -40, 120);
  const growthMult = 1 + (growthPct / 100) * 0.5;
  const ageForModel = age ?? 365;
  const maturityMult = 0.65 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.35;
  const riskDiscount = 1 - (risk.risk / 100) * 0.55;
  const base = p.tvl_usd * 0.3;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * riskDiscount));
  return { implied, growthPct, growthMult, maturityMult, riskDiscount, age, risk };
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Wrapped, staked or bridged products of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * Whether a protocol is one the board may rank: pre-token, and not a
 * wrapped, staked or bridged product of a token that already trades
 * (WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's
 * staking product — neither is a protocol still waiting on a launch of
 * its own), not an exchange, not a versioned pool. This mirrors the
 * watchlist's own exclusion, minus the TVL floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORY.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return !VERSIONED.test(p.name);
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The risk mitigation step: what to do about this protocol's worst factor. */
function mitigationStep(p: SnapshotProtocol, risk: RiskScore, capital: number): string {
  const f = risk.factors;
  const worst = (['volatility', 'youth', 'concentration', 'category', 'size'] as const).reduce((a, b) => (f[b] >= f[a] ? b : a));
  if (worst === 'volatility') {
    return `Its 7-day TVL swing is the biggest risk, so split the $${capital} into two deposits a week apart instead of one lump sum.`;
  }
  if (worst === 'youth') {
    return `It has a short track record, so start with half the planned $${capital}, add the rest only after a second month of activity.`;
  }
  if (worst === 'concentration') {
    return `It runs on ${p.chains.length <= 1 ? 'a single chain' : 'few chains'}, so keep the position small and never bridge more than you can afford to strand.`;
  }
  if (worst === 'category') {
    return `Its category carries extra risk, so read the protocol's own docs on fees and liquidations before depositing anything.`;
  }
  return `Its TVL is small, so check the position weekly and be ready to exit if TVL falls by a quarter in a week.`;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * Six-step farm plan, derived from the protocol's own record and its risk
 * score: a fresh wallet, the category action, a weekly qualifying action,
 * a hold sized to its age, a risk-mitigation step aimed at its worst
 * factor, and a log. Every step carries a cost and a time.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, risk: RiskScore): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: mitigationStep(p, risk, capital), cost: 'nothing extra, it only sizes the position', time: '5 minutes to plan' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** The ranked board: every rankable pre-token protocol, by risk-discounted implied value. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, ...scoreProtocol(p, snapshot.as_of) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    risk: s.risk.risk,
    risk_band: s.risk.band,
    risk_factors: s.risk.factors,
    model: {
      base_multiple: 0.3,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      risk_discount: round4(s.riskDiscount),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.risk).map(stepText),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const risks = board.map((r) => r.risk).sort((a, b) => a - b);
  const medianRisk = risks.length > 0 ? risks[Math.floor(risks.length / 2)]! : 0;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    median_risk: medianRisk,
    high_risk_count: board.filter((r) => r.risk_band === 'High').length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      risk: r.risk,
      risk_band: r.risk_band,
      risk_factors: r.risk_factors,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      risk_discount: r.model.risk_discount,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
