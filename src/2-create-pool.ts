/**
 * Step 2: create a Raydium CLMM pool W11A / W11B on devnet.
 * Run: npm run pool
 *
 * A CLMM pool is defined by (mintA, mintB, ammConfig). The AmmConfig sets
 * the trade fee and tickSpacing. On create the program initialises:
 *   PoolState (price, liquidity, current tick), two token vaults,
 *   ObservationState (price oracle) and the tick-array bitmap extension.
 */
import { ApiV3Token, ClmmConfigInfo } from "@raydium-io/raydium-sdk-v2";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Decimal from "decimal.js";
import { CLMM_PROGRAM_ID, explorer, initSdk, readOutput, saveOutput, txVersion } from "./common";

/** Initial price: 1 W11A = 2 W11B */
const INITIAL_PRICE = new Decimal(2);
/** tickSpacing 60 / 0.25% fee — the "standard" config */
const WANTED_TICK_SPACING = 60;

const toApiToken = (mint: string, symbol: string, decimals: number): ApiV3Token => ({
  chainId: 103,
  address: mint,
  programId: TOKEN_PROGRAM_ID.toBase58(),
  logoURI: "",
  symbol,
  name: symbol,
  decimals,
  tags: [],
  extensions: {},
});

async function main() {
  const out = readOutput();
  if (!out.tokenA || !out.tokenB) throw new Error("Run `npm run tokens` first");
  if (out.pool) {
    console.log("Pool already created:", out.pool.id);
    return;
  }

  const raydium = await initSdk();

  // AmmConfigs available on devnet (fee tiers)
  const configs = await raydium.api.getClmmConfigs();
  console.log("Devnet CLMM fee tiers:");
  configs.forEach((c) =>
    console.log(`  ${c.id}  tickSpacing=${c.tickSpacing}  fee=${c.tradeFeeRate / 10_000}%`)
  );
  const cfg = configs.find((c) => c.tickSpacing === WANTED_TICK_SPACING) ?? configs[0];
  const ammConfig: ClmmConfigInfo = { ...cfg, id: new PublicKey(cfg.id), fundOwner: "", description: "" };

  const mintA = toApiToken(out.tokenA.mint, out.tokenA.symbol, out.tokenA.decimals);
  const mintB = toApiToken(out.tokenB.mint, out.tokenB.symbol, out.tokenB.decimals);

  // price = how many mint2 for 1 mint1. The SDK sorts the mints
  // (pool.mintA < pool.mintB by bytes) and inverts the price if needed.
  const { execute, extInfo } = await raydium.clmm.createPool({
    programId: CLMM_PROGRAM_ID,
    mint1: mintA,
    mint2: mintB,
    ammConfig,
    initialPrice: INITIAL_PRICE,
    txVersion,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  const poolId = extInfo.address.id.toString();

  console.log("\nCLMM pool created!");
  console.log("  pool id:   ", poolId);
  console.log("  mintA:     ", extInfo.address.mintA.address);
  console.log("  mintB:     ", extInfo.address.mintB.address);
  console.log("  vault A/B: ", extInfo.address.vault.A.toString(), extInfo.address.vault.B.toString());
  console.log("  tx:        ", explorer(txId));

  saveOutput({
    pool: {
      id: poolId,
      ammConfig: cfg.id,
      tickSpacing: cfg.tickSpacing,
      feeRate: cfg.tradeFeeRate,
      initialPrice: `1 ${out.tokenA.symbol} = ${INITIAL_PRICE} ${out.tokenB.symbol}`,
      createTx: txId,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
