/**
 * Step 3: add concentrated liquidity — open a position in a price range.
 * Run: npm run position
 *
 * Range 1.6 – 2.4 W11B per W11A (±20% around price 2).
 * Ticks must be multiples of tickSpacing (60). The position is an NFT
 * (PersonalPositionState holds tickLower, tickUpper, liquidity, fees).
 */
import { TickUtil } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import Decimal from "decimal.js";
import { explorer, initSdk, readOutput, saveOutput, txVersion } from "./common";
import { alignTick, amountsForLiquidity, liquidityFromA, priceToTick, tickToPrice } from "./tick-math";

const PRICE_LOWER = 1.6;
const PRICE_UPPER = 2.4;
const BASE_AMOUNT_A = 1_000; // W11A to deposit; W11B amount is computed

async function main() {
  const out = readOutput();
  if (!out.pool) throw new Error("Run `npm run pool` first");
  if (out.position) {
    console.log("Position already opened, NFT:", out.position.nftMint);
    return;
  }
  const raydium = await initSdk();

  // NOTE: getPoolInfoFromRpc() of SDK 0.2.x crashes on a brand-new pool that has
  // no tick arrays yet, so we use getSimplePoolInfo() + raw PoolState data.
  const { poolInfo, rpcData } = await raydium.clmm.getSimplePoolInfo(out.pool.id);
  const poolKeys = { vault: { A: rpcData.vaultA, B: rpcData.vaultB } };
  const { tickSpacing } = poolInfo.config;
  const decA = poolInfo.mintA.decimals;
  const decB = poolInfo.mintB.decimals;

  // PoolState stores sqrt(price) as Q64.64 fixed point
  const sqrtP = new Decimal(rpcData.sqrtPriceX64.toString()).div(new Decimal(2).pow(64));
  const rawPrice = sqrtP.pow(2); // B base units per A base unit
  const price = rawPrice.mul(new Decimal(10).pow(decA - decB));
  console.log(`Pool ${poolInfo.id}  price ${price.toFixed(6)}  tick ${rpcData.tickCurrent}  tickSpacing ${tickSpacing}`);

  // ---- price -> tick, our own math ----
  const tickLower = alignTick(priceToTick(PRICE_LOWER, decA, decB), tickSpacing);
  const tickUpper = alignTick(priceToTick(PRICE_UPPER, decA, decB), tickSpacing, true);

  // ---- cross-check with Raydium SDK ----
  const sdkLower = TickUtil.getPriceAndTick({ price: new Decimal(PRICE_LOWER), mintADecimals: decA, mintBDecimals: decB, zeroForOne: true, tickSpacing });
  console.log(`our ticks: [${tickLower}, ${tickUpper}]   SDK lower tick: ${sdkLower.tick}`);
  console.log(`real range: ${tickToPrice(tickLower, decA, decB).toFixed(4)} – ${tickToPrice(tickUpper, decA, decB).toFixed(4)}`);

  // ---- how much B is needed for BASE_AMOUNT_A in this range (our CLMM math) ----
  const baseAmount = new BN(BASE_AMOUNT_A).mul(new BN(10).pow(new BN(decA)));
  const pa = tickToPrice(tickLower); // raw prices at the range bounds
  const pb = tickToPrice(tickUpper);
  const L = liquidityFromA(baseAmount.toString(), rawPrice, pb);
  const { b } = amountsForLiquidity(L, rawPrice, pa, pb);
  const otherAmountMax = new BN(b.mul(1.02).ceil().toFixed(0)); // +2% slippage
  console.log(`liquidity L ≈ ${L.toFixed(0)}`);
  console.log(`deposit: ${BASE_AMOUNT_A} A + ~${b.div(10 ** decB).toFixed(4)} B`);

  const { execute, extInfo } = await raydium.clmm.openPositionFromBase({
    poolInfo,
    poolKeys,
    tickLower,
    tickUpper,
    base: "MintA",
    ownerInfo: { useSOLBalance: true },
    baseAmount,
    otherAmountMax,
    txVersion,
    computeBudgetConfig: { units: 600_000, microLamports: 10_000 },
  });
  const { txId } = await execute({ sendAndConfirm: true });

  console.log("\nPosition opened!");
  console.log("  position NFT:", extInfo.nftMint.toBase58());
  console.log("  tx:          ", explorer(txId));
  saveOutput({
    position: {
      nftMint: extInfo.nftMint.toBase58(),
      tickLower,
      tickUpper,
      priceLower: tickToPrice(tickLower, decA, decB).toFixed(6),
      priceUpper: tickToPrice(tickUpper, decA, decB).toFixed(6),
      tx: txId,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
