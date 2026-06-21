 // Wraps 0G Storage's Key-Value (0G-KV) primitive for two jobs:
//  1. Persisting conversation memory per (user, persona) pair
//  2. Persisting the citation/source bundle behind each assistant reply

import { Indexer, KvClient } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";

const RPC_URL =
  process.env.ZG_STORAGE_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const INDEXER_RPC =
  process.env.ZG_STORAGE_INDEXER_RPC ??
  "https://indexer-storage-testnet-turbo.0g.ai";
const KV_NODE_URL = process.env.ZG_KV_NODE_URL ?? ""; 
 
const STREAM_NAME = process.env.ZG_KV_STREAM_ID ?? "council-of-history";
const STREAM_ID = ethers.id(STREAM_NAME); // keccak256 hash -> 0x-prefixed bytes32 hex string

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(
  process.env.ZG_STORAGE_PRIVATE_KEY ?? ethers.Wallet.createRandom().privateKey,
  provider
);

const indexer = new Indexer(INDEXER_RPC);
const kvClient = KV_NODE_URL ? new KvClient(KV_NODE_URL) : null;

function encode(str: string) {
  return Uint8Array.from(Buffer.from(str, "utf-8"));
}

function decode(value: string | null | undefined) {
  if (!value) return null;
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return value;
  }
}

/**
 * Append one conversation turn to a persona's memory log on 0G-KV.
 * Memory is stored as a JSON array under one key per (user, persona) pair,
 * read-modify-write style (fine for hackathon-scale chat volume).
 */
export async function appendMemory(
  userId: string,
  personaId: string,
  turn: { role: "user" | "assistant"; content: string; ts: number }
) {
  const key = `memory:${userId}:${personaId}`;
  const existing = await readMemory(userId, personaId);
  const updated = [...existing, turn];

  await writeKV(key, JSON.stringify(updated));
  return updated;
}

export async function readMemory(
  userId: string,
  personaId: string
): Promise<{ role: "user" | "assistant"; content: string; ts: number }[]> {
  const key = `memory:${userId}:${personaId}`;
  const raw = await readKV(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// --- Council mode: shared multi-persona debate transcripts ---

export type CouncilTurn = {
  personaId: string;
  personaName: string;
  content: string;
  ts: number;
  messageId: string;
};

/**
 * Append one turn to a shared debate transcript, identified by sessionId.
 * Unlike 1:1 persona memory (keyed per user+persona), this is one shared
 * log all participating personas read from — that's what makes it a real
 * debate instead of parallel independent monologues.
 */
export async function appendCouncilTurn(sessionId: string, turn: CouncilTurn) {
  const key = `council:${sessionId}`;
  const existing = await readCouncilTranscript(sessionId);
  const updated = [...existing, turn];
  await writeKV(key, JSON.stringify(updated));
  return updated;
}

export async function readCouncilTranscript(
  sessionId: string
): Promise<CouncilTurn[]> {
  const key = `council:${sessionId}`;
  const raw = await readKV(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Seed a brand-new council transcript from an existing 1:1 conversation.
 * Called once, the moment a user invites a second persona into a chat
 * that started as a normal 1:1 — this is what makes the debate feel like
 * a continuation rather than a cold restart.
 *
 * Idempotent: if a transcript already exists at sessionId, it is returned
 * as-is rather than overwritten (so re-inviting doesn't duplicate history).
 */
export async function seedCouncilFromMemory(
  sessionId: string,
  userId: string,
  hostPersonaId: string,
  hostPersonaName: string
): Promise<CouncilTurn[]> {
  const existing = await readCouncilTranscript(sessionId);
  if (existing.length > 0) return existing;

  const history = await readMemory(userId, hostPersonaId);
  const seeded: CouncilTurn[] = history.map((h) => ({
    personaId: h.role === "user" ? "user" : hostPersonaId,
    personaName: h.role === "user" ? "You" : hostPersonaName,
    content: h.content,
    ts: h.ts,
    messageId: `seed-${h.ts}`,
  }));

  if (seeded.length > 0) {
    await writeKV(`council:${sessionId}`, JSON.stringify(seeded));
  }
  return seeded;
}

/**
 * Store the citation bundle (source list) backing one assistant reply.
 * This is the "verifiability" artifact: a judge or user can pull this key
 * and confirm the figure's claim was grounded in a real, named source.
 */
export async function writeCitation(
  userId: string,
  personaId: string,
  messageId: string,
  sources: string[]
) {
  const key = `citation:${userId}:${personaId}:${messageId}`;
  await writeKV(key, JSON.stringify({ sources, ts: Date.now() }));
}

export async function readCitation(
  userId: string,
  personaId: string,
  messageId: string
) {
  const key = `citation:${userId}:${personaId}:${messageId}`;
  const raw = await readKV(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- low-level KV helpers (per docs: Batcher for writes, KvClient for reads) ---

// Testnet flow contract address 
const FLOW_CONTRACT_ADDRESS =
  process.env.ZG_FLOW_CONTRACT_ADDRESS ??
  "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296";

async function writeKV(key: string, value: string) {
  const [nodes, err] = await indexer.selectNodes(1);
  if (err !== null) throw new Error(`KV node selection error: ${err}`);

  // Build a properly connected flow contract instance (needs a signer to
  // send transactions — this is what was missing before, causing
  // "Cannot read properties of undefined (reading 'runner')").
  const { Batcher, getFlowContract } = await import(
    "@0gfoundation/0g-storage-ts-sdk"
  );
  const flowContract = getFlowContract(FLOW_CONTRACT_ADDRESS, signer);
  const batcher = new Batcher(1, nodes, flowContract, RPC_URL);

  batcher.streamDataBuilder.set(STREAM_ID, encode(key), encode(value));
  const [tx, batchErr] = await batcher.exec();
  if (batchErr !== null) throw new Error(`KV write error: ${batchErr}`);
  return tx;
}

async function readKV(key: string): Promise<string | null> {
  if (!kvClient) {
    console.warn(
      "[zgStorage] ZG_KV_NODE_URL not configured — returning null."
    );
    return null;
  }
  try {
    const value: any = await kvClient.getValue(
      STREAM_ID,
      ethers.encodeBase64(encode(key))
    );
    return decode(value);
  } catch {
    return null;
  }
}