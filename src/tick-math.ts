/**
 * CLMM price math, written from scratch to understand how Raydium CLMM works.
 * Run: npm run math
 *
 *   price(tick)        = 1.0001^tick                       (token B per token A, raw units)
 *   tick(price)        = floor( log(price) / log(1.0001) )
 *   sqrtPriceX64       = sqrt(price) * 2^64                (Q64.64 fixed point, stored on-chain)
 *   human price        = raw price * 10^(decimalsA - decimalsB)
 *
 * Liquidity L of a position in range [Pa, Pb] with current price P:
 *   P <= Pa (below range):  only token A     amountA = L * (1/√Pa - 1/√Pb)
 *   P >= Pb (above range):  only token B     amountB = L * (√Pb - √Pa)
 *   Pa < P < Pb (in range): both tokens      amountA = L * (1/√P - 1/√Pb)
 *                                            amountB = L * (√P  - √Pa)
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 40 });
const BASE = new Decimal("1.0001");
const Q64 = new Decimal(2).pow(64);

export function tickToPrice(tick: number, decA = 0, decB = 0): Decimal {
  return BASE.pow(tick).mul(new Decimal(10).pow(decA - decB));
}

export function priceToTick(price: Decimal.Value, decA = 0, decB = 0): number {
  const raw = new Decimal(price).div(new Decimal(10).pow(decA - decB));
  return Math.floor(raw.ln().div(BASE.ln()).toNumber());
}

/** Ticks of a position must be multiples of the pool's tickSpacing */
export function alignTick(tick: number, tickSpacing: number, roundUp = false): number {
  const t = Math.floor(tick / tickSpacing) * tickSpacing;
  return roundUp && t < tick ? t + tickSpacing : t;
}

export function sqrtPriceX64(price: Decimal.Value): Decimal {
  return new Decimal(price).sqrt().mul(Q64).floor();
}

/** Token amounts needed for liquidity L in [pa, pb] at current price p */
export function amountsForLiquidity(L: Decimal.Value, p: Decimal.Value, pa: Decimal.Value, pb: Decimal.Value) {
  const l = new Decimal(L);
  const sp = new Decimal(p).sqrt();
  const sa = new Decimal(pa).sqrt();
  const sb = new Decimal(pb).sqrt();
  if (sp.lte(sa)) return { a: l.mul(new Decimal(1).div(sa).sub(new Decimal(1).div(sb))), b: new Decimal(0) };
  if (sp.gte(sb)) return { a: new Decimal(0), b: l.mul(sb.sub(sa)) };
  return { a: l.mul(new Decimal(1).div(sp).sub(new Decimal(1).div(sb))), b: l.mul(sp.sub(sa)) };
}

/** Liquidity from a given amount of token A (in range) */
export function liquidityFromA(amountA: Decimal.Value, p: Decimal.Value, pb: Decimal.Value): Decimal {
  const sp = new Decimal(p).sqrt();
  const sb = new Decimal(pb).sqrt();
  return new Decimal(amountA).mul(sp).mul(sb).div(sb.sub(sp));
}

/** Constant product x*y=k: output for an input of dx (fee in bps) */
export function cpAmountOut(x: Decimal.Value, y: Decimal.Value, dx: Decimal.Value, feeBps = 25): Decimal {
  const dxAfterFee = new Decimal(dx).mul(10_000 - feeBps).div(10_000);
  return new Decimal(y).mul(dxAfterFee).div(new Decimal(x).add(dxAfterFee));
}

/** Impermanent loss for a full-range (x*y=k) position when price moves by factor r */
export function impermanentLoss(r: number): number {
  return (2 * Math.sqrt(r)) / (1 + r) - 1;
}

// ---------------------------------------------------------------- demo
if (require.main === module) {
  const line = (s = "") => console.log(s);

  line("=== 1. Ticks <-> price (price = 1.0001^tick) ===");
  for (const t of [-6960, -60, 0, 60, 6931, 23028]) {
    line(`tick ${String(t).padStart(6)}  ->  price ${tickToPrice(t).toFixed(6)}`);
  }
  line(`price 2.0  -> tick ${priceToTick(2)}  (tickSpacing 60 -> ${alignTick(priceToTick(2), 60)})`);
  line(`sqrtPriceX64(2.0) = ${sqrtPriceX64(2).toFixed(0)}`);
  line(`decimals: SOL(9)/USDC(6) human price 150 -> tick ${priceToTick(150, 9, 6)}`);

  line("\n=== 2. Classic AMM x*y=k (Raydium AMM v4 / CPMM) ===");
  const x = 1_000, y = 2_000; // 1000 A, 2000 B -> price 2
  for (const dx of [10, 100, 500]) {
    const dy = cpAmountOut(x, y, dx);
    const execPrice = dy.div(dx);
    line(`swap ${dx} A -> ${dy.toFixed(4)} B   exec price ${execPrice.toFixed(4)}  (price impact ${new Decimal(1).sub(execPrice.div(2)).mul(100).toFixed(2)}%)`);
  }

  line("\n=== 3. Concentrated liquidity: same 1000 A of capital ===");
  const P = new Decimal(2);
  for (const [pa, pb, name] of [[1e-9, 1e9, "full range (~x*y=k)"], [1, 4, "1.0 - 4.0"], [1.6, 2.4, "1.6 - 2.4 (±20%)"], [1.9, 2.1, "1.9 - 2.1 (±5%)"]] as const) {
    const L = liquidityFromA(1000, P, pb);
    const { b } = amountsForLiquidity(L, P, pa, pb);
    line(`range ${name.padEnd(22)} L = ${L.toFixed(0).padStart(10)}   needs B = ${b.toFixed(2).padStart(10)}`);
  }
  line("-> narrower range = more liquidity L from the same tokens = more fees, but out-of-range sooner");

  line("\n=== 4. Position state vs price (range 1.6 - 2.4, L from 1000 A at P=2) ===");
  const L = liquidityFromA(1000, P, 2.4);
  for (const p of [1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6]) {
    const { a, b } = amountsForLiquidity(L, p, 1.6, 2.4);
    const state = p <= 1.6 ? "out of range: 100% A, no fees" : p >= 2.4 ? "out of range: 100% B, no fees" : "in range: earns fees";
    line(`price ${p.toFixed(1)}  A=${a.toFixed(2).padStart(8)}  B=${b.toFixed(2).padStart(8)}  ${state}`);
  }

  line("\n=== 5. Impermanent loss (full range) ===");
  for (const r of [1.25, 1.5, 2, 4]) line(`price x${r}: IL ${(impermanentLoss(r) * 100).toFixed(2)}%`);
  line("Concentrated positions amplify both fees AND impermanent loss.");
}
