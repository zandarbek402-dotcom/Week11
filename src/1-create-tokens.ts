/**
 * Step 1: create two test SPL tokens on devnet and mint supply to our wallet.
 * Run: npm run tokens
 */
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, explorer, owner, readOutput, saveOutput } from "./common";

const TOKENS = [
  { key: "tokenA" as const, symbol: "W11A", decimals: 6, supply: 1_000_000 },
  { key: "tokenB" as const, symbol: "W11B", decimals: 6, supply: 1_000_000 },
];

async function main() {
  console.log("Wallet:", owner.publicKey.toBase58());
  const balance = await connection.getBalance(owner.publicKey);
  console.log("SOL balance:", balance / LAMPORTS_PER_SOL);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log("Requesting devnet airdrop...");
    const sig = await connection.requestAirdrop(owner.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  const out = readOutput();
  for (const t of TOKENS) {
    if (out[t.key]) {
      console.log(`${t.symbol} already exists: ${out[t.key]!.mint}`);
      continue;
    }
    // mint authority = our wallet, no freeze authority
    const mint = await createMint(connection, owner, owner.publicKey, null, t.decimals);
    const ata = await getOrCreateAssociatedTokenAccount(connection, owner, mint, owner.publicKey);
    const tx = await mintTo(connection, owner, mint, ata.address, owner, BigInt(t.supply) * 10n ** BigInt(t.decimals));

    console.log(`${t.symbol}: mint ${mint.toBase58()}  minted ${t.supply.toLocaleString()}`);
    console.log("  ", explorer(mint.toBase58(), "address"));
    saveOutput({ [t.key]: { mint: mint.toBase58(), symbol: t.symbol, decimals: t.decimals, createTx: tx } });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
