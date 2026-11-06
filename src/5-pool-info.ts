/**
 * Step 5: read the on-chain state of our CLMM pool and position.
 * Run: npm run info
 */
import Decimal from "decimal.js";
import { CLMM_PROGRAM_ID, explorer, feePercent, initSdk, readOutput } from "./common";
import { amountsForLiquidity, tickToPrice } from "./tick-math";

async function main() {
  const out = readOutput();
  if (!out.pool) throw new Error("Run `npm run pool` first");
  const raydium = await initSdk();
  const { poolInfo, rpcPoolInfo } = await raydium.clmm.getPoolInfoFromRpc(out.pool.id);
  const decA = poolInfo.mintA.decimals;
  const decB = poolInfo.mintB.decimals;

  console.log("=== PoolState ===");
  console.log("pool:           ", out.pool.id, explorer(out.pool.id, "address"));
  console.log("mintA / mintB:  ", poolInfo.mintA.address, "/", poolInfo.mintB.address);
  console.log("fee / spacing:  ", `${feePercent(poolInfo.feeRate)}%`, "/", poolInfo.config.tickSpacing);
  console.log("price (B per A):", poolInfo.price);
  console.log("tickCurrent:    ", rpcPoolInfo.tickCurrent);
  console.log("sqrtPriceX64:   ", rpcPoolInfo.sqrtPriceX64.toString());
  console.log("liquidity (L):  ", rpcPoolInfo.liquidity.toString(), " <- active liquidity at the current tick");
  console.log("vault balances: ", poolInfo.mintAmountA / 10 ** decA, "A /", poolInfo.mintAmountB / 10 ** decB, "B");

  console.log("\n=== Our positions (NFTs) ===");
  const positions = await raydium.clmm.getOwnerPositionInfo({ programId: CLMM_PROGRAM_ID });
  const rawPrice = new Decimal(rpcPoolInfo.sqrtPriceX64.toString()).div(new Decimal(2).pow(64)).pow(2);
  for (const p of positions.filter((x) => x.poolId.toBase58() === out.pool!.id)) {
    const inRange = rpcPoolInfo.tickCurrent >= p.tickLower && rpcPoolInfo.tickCurrent < p.tickUpper;
    const { a, b } = amountsForLiquidity(p.liquidity.toString(), rawPrice, tickToPrice(p.tickLower), tickToPrice(p.tickUpper));
    console.log(`NFT ${p.nftMint.toBase58()}`);
    console.log(`  range ticks [${p.tickLower}, ${p.tickUpper}] = price ${tickToPrice(p.tickLower, decA, decB).toFixed(4)} – ${tickToPrice(p.tickUpper, decA, decB).toFixed(4)}`);
    console.log(`  liquidity ${p.liquidity.toString()}   ${inRange ? "IN RANGE (earning fees)" : "OUT OF RANGE"}`);
    console.log(`  holds now: ${a.div(10 ** decA).toFixed(4)} A + ${b.div(10 ** decB).toFixed(4)} B`);
    console.log(`  uncollected fees: ${p.tokenFeesOwedA.toString()} A raw, ${p.tokenFeesOwedB.toString()} B raw (updated on next position change)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
