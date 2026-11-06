import { Raydium, TxVersion, DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

export const RPC_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");
export const connection = new Connection(RPC_URL, "confirmed");
export const txVersion = TxVersion.V0;

/** Raydium CLMM program on devnet */
export const CLMM_PROGRAM_ID = DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID;

/** Wallet: $KEYPAIR or the default Solana CLI keypair (~/.config/solana/id.json) */
export function loadWallet(): Keypair {
  const file = process.env.KEYPAIR ?? path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  return Keypair.fromSecretKey(secret);
}

export const owner = loadWallet();

let raydium: Raydium | undefined;
export async function initSdk(): Promise<Raydium> {
  if (raydium) return raydium;
  raydium = await Raydium.load({
    owner,
    connection,
    cluster: "devnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "finalized",
  });
  return raydium;
}

// ---------- results are saved to devnet-output.json (proof of work) ----------
export const OUTPUT_FILE = path.join(__dirname, "..", "devnet-output.json");

export type Output = {
  wallet?: string;
  tokenA?: { mint: string; symbol: string; decimals: number; createTx: string };
  tokenB?: { mint: string; symbol: string; decimals: number; createTx: string };
  pool?: { id: string; ammConfig: string; tickSpacing: number; feeRate: number; initialPrice: string; createTx: string };
  position?: { nftMint: string; tickLower: number; tickUpper: number; priceLower: string; priceUpper: string; tx: string };
  swaps?: { direction: string; amountIn: string; tx: string; priceBefore: string; priceAfter: string }[];
};

export function readOutput(): Output {
  return fs.existsSync(OUTPUT_FILE) ? JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8")) : {};
}

export function saveOutput(patch: Partial<Output>) {
  const next = { ...readOutput(), ...patch, wallet: owner.publicKey.toBase58() };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(next, null, 2));
}

/** Fee rate from RPC is parts-per-million (2500 = 0.25%), from the API a fraction (0.0025) */
export const feePercent = (rate: number) => (rate >= 1 ? rate / 10_000 : rate * 100).toFixed(2);

export const explorer =(sigOrAddr: string, kind: "tx" | "address" = "tx") =>
  `https://explorer.solana.com/${kind}/${sigOrAddr}?cluster=devnet`;
