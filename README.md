# Council of History

Chat with grounded, citation-backed historical figures. Built on 0G:

- **0G Compute Router** runs the actual inference behind each figure (OpenAI-compatible API, TEE-backed providers).
- **0G Storage (0G-KV)** persists per-user conversation memory and the source citations behind every reply — so the "this is historically grounded" claim is verifiable, not vibes.

## Why 0G is load-bearing here

Without 0G Storage, "memory" is just `localStorage` and citations are just text the model could make up with no record. By writing memory and citations to 0G's decentralized KV store, anyone can independently pull the citation key for a given reply and confirm what source the figure was instructed to draw from — that's the verifiability hook judges look for.

## Setup

1. **Get 0G testnet access**
   - Visit [pc.testnet.0g.ai](https://pc.testnet.0g.ai), connect a wallet (MetaMask, or sign in with Google/X via the embedded wallet).
   - Get testnet 0G tokens (check the [0G Discord](https://discord.gg/0gLabs) for the current faucet).
   - Deposit tokens to the Router's payment contract.
   - In **Dashboard → API Keys**, create a key with `inference` permission.

2. **Clone and install**
   ```bash
   npx create-next-app@latest council-of-history --typescript --tailwind --app --src-dir
   cd council-of-history
   npm install openai @0gfoundation/0g-storage-ts-sdk ethers
   ```
   Then copy the files from this plan into the matching paths (`src/lib/`, `src/personas/`, `src/app/api/chat/route.ts`).

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # fill in ZG_ROUTER_API_KEY and ZG_STORAGE_PRIVATE_KEY (testnet wallet key)
   ```

4. **Find a working KV node URL**
   The 0G-KV node endpoint isn't fixed in the public docs example (it points at a placeholder IP). Check the [TypeScript Starter Kit](https://github.com/0gfoundation/0g-storage-ts-starter-kit) or 0G Discord for the current testnet KV node address, and set `ZG_KV_NODE_URL`.

5. **Run**
   ```bash
   npm run dev
   ```

## Architecture

```
User → Next.js UI → /api/chat
                       ├─ readMemory()   ──▶ 0G Storage (0G-KV)
                       ├─ runPersonaChat() ─▶ 0G Compute Router ─▶ model
                       └─ appendMemory() / writeCitation() ─▶ 0G Storage (0G-KV)
```

## Roster (MVP)

- Ulysses S. Grant
- Abraham Lincoln
- Winston Churchill
- Marie Curie
- Sun Tzu

Each persona's system prompt constrains it to documented sources and requires bracketed citations in-line, which get logged to Storage as a structured bundle per reply.

## Demo script (for submission video)

1. Pick a figure (e.g. Grant).
2. Ask a question with a real historical answer ("What did you think of Reconstruction's failures?").
3. Show the reply with its bracketed citation.
4. Show the 0G Storage explorer / a small "view sources" button in the UI that pulls the citation key live and displays the source list — this is your "verifiable, not hallucinated" proof point.
5. Refresh the page, ask a follow-up, show memory persists (pulled from 0G-KV, not local state).

## Next steps after MVP

- Add a "Council mode": ask two figures the same question, show both answers side-by-side (e.g. Grant vs. Lincoln on Reconstruction).
- Add a public "verify" page where anyone can paste a message ID and see the stored citation bundle without using the chat UI — strengthens the verifiability story for judges.
- Swap the read-modify-write KV pattern for true append-only logs if conversation volume grows.