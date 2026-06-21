 import OpenAI from "openai";

const NETWORK = process.env.ZG_NETWORK ?? "testnet"; // "testnet" | "mainnet"

const BASE_URLS: Record<string, string> = {
  testnet: "https://router-api-testnet.integratenetwork.work/v1",
  mainnet: "https://router-api.0g.ai/v1",
};

const baseURL = BASE_URLS[NETWORK];

if (!process.env.ZG_ROUTER_API_KEY) {
  // Don't throw at import time in case this file is bundled for the client;
  // callers should check before invoking.
  console.warn(
    "[zgCompute] ZG_ROUTER_API_KEY is not set. Set it in .env.local."
  );
}

export const zgClient = new OpenAI({
  baseURL,
  apiKey: process.env.ZG_ROUTER_API_KEY ?? "missing-key",
});

// Pick a model from the live catalog: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/models
// zai-org/GLM-5-FP8 is the example model used in 0G's own quickstart.
export const ZG_MODEL = process.env.ZG_MODEL ?? "zai-org/GLM-5-FP8";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function runPersonaChat(messages: ChatMessage[]) {
  const response = await zgClient.chat.completions.create({
    model: ZG_MODEL,
    messages,
  });

  const text = response.choices[0]?.message?.content ?? "";
  return { text, raw: response };
}