/**
 * Step 4: swap through our CLMM pool and watch the price move.
 * Run: npm run swap            (W11A -> W11B, price goes DOWN)
 *      npm run swap -- B       (W11B -> W11A, price goes UP)
 *
 * A swap walks along the liquidity curve. Inside one tick the pool behaves
 * like x*y=k with the position's (virtual) reserves; when the price crosses
 * an initialised tick, liquidity L changes (positions enter/leave the range).
 */
import { PoolUtils } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import Decimal from "decimal.js";
import { connection, explorer, feePercent, initSdk, readOutput, saveOutput, txVersion } from "./common";

const AMOUNT_IN = 50; // tokens

async function main() {
  const out = readOutput();
  if (!out.position) throw new Error("Run `npm run position` first (pool needs liquidity)");
  const sellA = (process.argv[2] ?? "A").toUpperCase() !== "B";

  const raydium = await initSdk();
  const { poolInfo, poolKeys, computePoolInfo, tickData } = await raydium.clmm.getPoolInfoFromRpc(out.pool!.id);
  const priceBefore = new Decimal(poolInfo.price);

  const mintIn = sellA ? poolInfo.mintA : poolInfo.mintB;
  const mintOut = sellA ? poolInfo.mintB : poolInfo.mintA;
  const amountIn = new BN(AMOUNT_IN).mul(new BN(10).pow(new BN(mintIn.decimals)));

  const epochInfo = await connection.getEpochInfo();
  const blockTimestamp = (await connection.getBlockTime(await connection.getSlot())) ?? Math.floor(Date.now() / 1000);

  // off-chain simulation of the swap over tick arrays
  const quote = PoolUtils.computeAmountOutFormat({
    poolInfo: computePoolInfo,
    tickarrayBitmapExtension: computePoolInfo.exBitmapInfo,
    tickArrayCache: tickData[out.pool!.id],
    amountIn,
    tokenOut: mintOut,
    slippage: 0.01,
    epochInfo,
    blockTimestamp,
  });
  console.log(`quote: ${AMOUNT_IN} ${mintIn.symbol || "in"} -> ${quote.amountOut.amount.toExact()} out`);
  console.log(`       min out ${quote.minAmountOut.amount.toExact()}, pool fee ${feePercent(poolInfo.feeRate)}%, price impact ${quote.priceImpact.toFixed(4)}%`);

  const { execute } = await raydium.clmm.swap({
    poolInfo,
    poolKeys,
    inputMint: mintIn.address,
    amountIn,
    amountOutMin: quote.minAmountOut.amount.raw,
    observationId: computePoolInfo.observationId,
    ownerInfo: { useSOLBalance: true },
    remainingAccounts: quote.remainingAccounts,
    txVersion,
    computeBudgetConfig: { units: 600_000, microLamports: 10_000 },
  });
  const { txId } = await execute({ sendAndConfirm: true });

  const after = await raydium.clmm.getPoolInfoFromRpc(out.pool!.id);
  const priceAfter = new Decimal(after.poolInfo.price);
  console.log(`price: ${priceBefore.toFixed(6)} -> ${priceAfter.toFixed(6)}  (tick ${after.computePoolInfo.tickCurrent})`);
  console.log("tx:", explorer(txId));

  saveOutput({
    swaps: [
      ...(out.swaps ?? []),
      {
        direction: sellA ? "W11A -> W11B" : "W11B -> W11A",
        amountIn: String(AMOUNT_IN),
        tx: txId,
        priceBefore: priceBefore.toFixed(6),
        priceAfter: priceAfter.toFixed(6),
      },
    ],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
