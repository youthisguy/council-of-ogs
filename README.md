# Council AI

**Chat with historical figures whose answers are grounded in named sources and sealed, verifiably, on 0G.**

---

## The problem

AI chatbots that role-play as historical figures are everywhere, and almost all of them have the same flaw: there's no way to tell whether a response reflects the actual historical record or the model improvising in character. "Lincoln" can say anything and sound convincing. Nothing about the interaction lets you check.

Council of History is an attempt to fix that. Every figure is constrained to speak only from a named set of primary and secondary sources, and every reply is paired with a citation bundle written immutably to 0G Storage — so the grounding claim isn't just "trust the prompt," it's something a skeptical user can independently pull and verify.

## What it does

- **Talk one-on-one** with a roster of historical figures — generals, statesmen, scientists, philosophers, a poet, and a theologian — each constrained by a system prompt to their own documented record.
- **Invite a second figure into the conversation** mid-chat. Rather than starting a separate "debate mode," the new figure is shown the actual conversation transcript and responds in context — agreeing, disagreeing, or complicating what's already been said. A 1:1 chat organically becomes a council.
- **See the receipts.** Every reply carries a "Sealed Source" marker. Opening it reveals the named sources behind that figure's answer, with a "Verified on 0G Storage" tag confirming the citation was written on-chain, not generated as decoration.
- **Persistent memory across sessions**, stored on 0G rather than in browser state — a figure's memory of your conversation isn't tied to one device or one tab.

## How 0G is load-bearing, not decorative

The submission criteria are explicit: 0G has to do real work, not sit beside an app that would run identically without it. Here's exactly where it sits in this build:

| Layer | What it does | What breaks without it |
|---|---|---|
| **0G Compute Router** | Runs every persona's actual inference call (OpenAI-compatible endpoint, TEE-attested providers) | There's no "verifiable inference" claim left — it's just another LLM API call |
| **0G Storage (0G-KV)** | Stores per-user conversation memory, the shared council transcript once a debate starts, and the citation bundle behind every single reply | Memory becomes ordinary browser state, and "sources" become unverifiable text the model could fabricate with no record anywhere |

Concretely: when a figure answers, the system prompt constrains it to draw only from a fixed list of real, named primary sources for that figure. That constraint, and the resulting answer, are both written to 0G Storage under a unique message ID. Anyone holding that ID can pull the citation bundle independently of the chat UI and confirm what the figure was instructed to ground its answer in.

**Being precise about what this does and doesn't prove:** the citation bundle currently reflects the persona's source list as a whole, not a sentence-by-sentence fact-check against primary texts. What's verifiable on-chain is that the model was constrained to a specific, named source set and that the resulting reply was recorded immutably at that moment — not that every individual claim has been independently audited against the source.  

## Architecture

```
                    ┌─────────────────────────┐
   User ──────────▶ │   Next.js UI (App Router)│
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  /api/chat               │
                    │  /api/council/invite      │
                    └──┬──────────────────┬────┘
                       │                  │
          ┌────────────▼───────┐  ┌───────▼─────────────┐
          │  0G Compute Router  │  │  0G Storage (0G-KV)  │
          │  (OpenAI-compatible,│  │  - 1:1 memory         │
          │   TEE-attested)     │  │  - council transcripts│
          │                     │  │  - citation bundles   │
          └─────────────────────┘  └───────────────────────┘
```

**Request flow for a single message:**
1. Load the persona's system prompt and source list.
2. Pull prior conversation memory from 0G Storage (1:1 memory, or the shared council transcript if a second figure has already been invited into this session).
3. Send the system prompt + history + new message to the 0G Compute Router for inference.
4. Write the new turn back to 0G Storage, and write a citation bundle (the persona's source list) under a unique message ID.
5. Return the reply and sources to the UI, where the citation renders as a sealed, clickable marker.

**Invite-to-debate flow:**
1. A user already mid-conversation with one figure taps "Invite another figure."
2. The backend seeds a new shared transcript from that figure's existing 1:1 memory (one-time, idempotent — re-inviting doesn't duplicate history).
3. The invited figure receives the real transcript as context and responds to what's actually been said, not a cold topic prompt.
4. From that point, both figures read from and write to the same shared transcript, so the conversation stays coherent regardless of who answers next.

## Roster

| Figure | Role | Grounded in |
|---|---|---|
| Ulysses S. Grant | Union general, 18th U.S. President | Personal Memoirs, presidential papers, Reconstruction-era correspondence |
| Abraham Lincoln | 16th U.S. President | Gettysburg Address, Emancipation Proclamation, Lincoln-Douglas Debates, collected letters |
| Winston Churchill | British Prime Minister, WWII leader | Wartime speeches, *The Second World War* memoirs, War Cabinet minutes |
| Marie Curie | Physicist, chemist, two-time Nobel laureate | Nobel lectures, research papers, personal correspondence |
| Sun Tzu | Military strategist | *The Art of War* |
| Marcus Aurelius | Roman emperor, Stoic philosopher | *Meditations* |
| Aristotle | Philosopher | *Nicomachean Ethics*, *Politics*, *Metaphysics*, *Poetics* |
| Dante Alighieri | Poet | *Divine Comedy*, *La Vita Nuova* |
| Augustine of Hippo | Theologian, Bishop of Hippo | *Confessions*, *City of God* |

Each system prompt requires the model to speak only in first person, ground claims in the named sources, cite specific works inline (e.g. `[Personal Memoirs, 1885]`), and explicitly decline to invent a position the figure never documented.

## Tech stack

- **Frontend:** Next.js (App Router) + React + Tailwind CSS
- **Inference:** 0G Compute Router (`qwen/qwen2.5-omni-7b` on testnet), via the OpenAI-compatible SDK
- **Storage:** 0G Storage's key-value layer (0G-KV), via `@0gfoundation/0g-storage-ts-sdk`
- **Chain interaction:** `ethers.js` for signing storage transactions

## Running it locally

```bash
git clone <this-repo>
cd council-of-history
npm install
cp .env.example .env.local
# fill in ZG_ROUTER_API_KEY (from pc.testnet.0g.ai dashboard)
# and ZG_STORAGE_PRIVATE_KEY (a funded testnet wallet key)
npm run dev
```

You'll need:
- A 0G testnet account funded via [pc.testnet.0g.ai](https://pc.testnet.0g.ai) (Router mode, not Advanced/Direct), with an API key created under **Dashboard → API Keys**.
- A small amount of testnet 0G deposited into the Router's Payment Layer balance.

See `.env.example` for the full list of required variables.

## limitations

- **Citation granularity is currently persona-level, not claim-level.** A figure's source list is fixed per persona; it doesn't yet vary per specific claim within an answer.
- **Demo build uses a single shared user identity** for simplicity; per-user isolation (e.g. via a session cookie) is a planned next step rather than shipped.
- **Storage writes are synchronous and can take tens of seconds** on testnet, since each write is a real on-chain transaction waiting on storage-node sync — this is genuine on-chain latency, not an artificial demo delay.

## What's next

- Per-claim citation parsing, so the sealed source shown matches the specific sentence it backs, not just the persona's full bibliography.
- A standalone public "verify" page where anyone can paste a message ID and pull the raw citation bundle from 0G Storage without going through the chat UI at all.
- A "where they disagree" summary after a council exchange, surfacing the sharpest point of divergence between two figures for easy sharing.