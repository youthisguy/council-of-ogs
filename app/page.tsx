
"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { PERSONAS, type Persona } from "./src/personas/personas"; 
import Scene from "./ council/components/Scene";
import LoginGate from "./components/LoginGate";

type ChatTurn = {
  personaId: string;
  personaName: string;
  content: string;
  sources?: string[];
};

// One accent color per persona, used to color message bubbles once a
// debate has more than one speaker. Generated automatically for any
// persona not explicitly listed, so adding new figures never silently
// falls back to a single flat gold for everyone.
const PERSONA_ACCENTS: Record<string, string> = {
  grant: "#4a5d4e",
  lincoln: "#5a6b8c",
  churchill: "#8b3a3a",
  curie: "#3a6b6b",
  suntzu: "#7a6a3a",
  aurelius: "#9c7a3a",
  aristotle: "#6b5a8c",
  dante: "#8c3a4a",
  augustine: "#5a4a3a",
};

const FALLBACK_ACCENTS = ["#c9a876", "#7a9c8c", "#9c7a8c", "#8c9c7a"];

function accentFor(personaId: string, index: number) {
  return (
    PERSONA_ACCENTS[personaId] ??
    FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length]
  );
}

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

export default function Home() {
  const { ready, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // The embedded (or connected) wallet's address is what we use as the
  // durable per-user identity for 0G Storage scoping. It's stable across
  // sessions/devices as long as the user logs back in with the same
  // method, and it's already a real on-chain address — no extra wiring
  // needed later when minting conversations becomes a feature.
  const wallet = wallets[0];
  const userId = wallet?.address;

  return (
    <LoginGate>
      {ready && authenticated && userId ? (
        <ChatApp userId={userId} user={user} logout={logout} />
      ) : (
        <div className="flex h-dvh w-screen items-center justify-center bg-[#0d0a07] text-[#e8dcc4]/40">
          <span className="font-display text-sm tracking-wide">
            Preparing your wallet…
          </span>
        </div>
      )}
    </LoginGate>
  );
}

function ChatApp({
  userId,
  user,
  logout,
}: {
  userId: string;
  user: ReturnType<typeof usePrivy>["user"];
  logout: () => Promise<void>;
}) {
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [revealedSeal, setRevealedSeal] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [participants, setParticipants] = useState<string[]>([PERSONAS[0].id]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (panelOpen && !sessionId) {
      setSessionId(generateSessionId());
    }
  }, [panelOpen, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  // On small screens, opening the on-screen keyboard to type a message
  // can push the layout around. Re-anchor scroll to bottom once the
  // textarea is focused so the latest turn stays visible.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handler = () =>
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 200);
    el.addEventListener("focus", handler);
    return () => el.removeEventListener("focus", handler);
  }, []);

  const isCouncil = participants.length > 1;

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const message = input.trim();
    setInput("");
    setTurns((t) => [...t, { personaId: "user", personaName: "You", content: message }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          personaId: activePersona.id,
          message,
          sessionId,
        }),
      });
      const data = await res.json();
      setTurns((t) => [
        ...t,
        {
          personaId: data.persona.id,
          personaName: data.persona.name,
          content: data.reply,
          sources: data.sources,
        },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        {
          personaId: activePersona.id,
          personaName: activePersona.name,
          content: "The record could not be retrieved. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function inviteToDebate(invitee: Persona) {
    setInvitePickerOpen(false);
    setLoading(true);
    try {
      const res = await fetch("/api/council/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sessionId,
          hostPersonaId: activePersona.id,
          inviteePersonaId: invitee.id,
        }),
      });
      const data = await res.json();
      setTurns((t) => [
        ...t,
        {
          personaId: invitee.id,
          personaName: invitee.name,
          content: data.newTurn.content,
        },
      ]);
      setParticipants(data.participants);
    } catch (e) {
      setTurns((t) => [
        ...t,
        {
          personaId: "system",
          personaName: "",
          content: `${invitee.name} could not be reached to join the conversation.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function switchPersona(p: Persona) {
    setActivePersona(p);
    setTurns([]);
    // setPanelOpen(true);
    setSessionId(generateSessionId());
    setParticipants([p.id]);
    setInvitePickerOpen(false);
  }

  const availableToInvite = PERSONAS.filter((p) => !participants.includes(p.id));

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0d0a07] text-[#e8dcc4] font-body">
      {/* Ambient backdrop scene with mouse-driven parallax */}
      <Scene persona={activePersona} dimmed={panelOpen} />

      {/* Persona picker rail — horizontally scrollable so 9+ figures never
          overflow the viewport on phones. Edge fade hints there's more
          to scroll without needing arrows. */}
      <div className="absolute left-0 top-12 z-20 w-full pt-1 sm:left-6 sm:top-6 sm:w-auto sm:pt-0">
        <div className="relative">
          <div className="scrollbar-none flex gap-2.5 overflow-x-auto px-4 pb-1 sm:gap-3 sm:px-0">
            {PERSONAS.map((p, i) => (
              <button
                key={p.id}
                onClick={() => switchPersona(p)}
                className={`h-11 w-11 shrink-0 rounded-full border-2 transition-all sm:h-12 sm:w-12 ${
                  p.id === activePersona.id
                    ? "shadow-[0_0_0_3px_rgba(201,168,118,0.25)]"
                    : "opacity-55 hover:opacity-100"
                } bg-[#2d2419] font-display text-xs sm:text-sm text-[#e8dcc4]`}
                style={{
                  borderColor:
                    p.id === activePersona.id ? "#c9a876" : "rgba(232,220,196,0.2)",
                }}
                title={p.name}
              >
                {initials(p.name)}
              </button>
            ))}
          </div>
          {/* Edge fades signal scrollability on mobile */}
          <div className="pointer-events-none absolute left-0 top-0 h-full w-6 bg-linear-to-r from-[#0d0a07] to-transparent sm:hidden" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-linear-to-l from-[#0d0a07] to-transparent sm:hidden" />
        </div>
      </div>

      {/* Account indicator — shows the real wallet address backing this
          session's identity, with a way to log out. Hidden while the panel
          is open so it doesn't compete with the panel header. */}
      {!panelOpen && (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-[#c9a876]/20 bg-[#1a1410]/70 px-3 py-1.5 backdrop-blur-sm sm:right-6 sm:top-6">
          <span className="font-mono text-[10px] text-[#e8dcc4]/50">
            {user?.email?.address ??
              user?.google?.email ??
              `${userId.slice(0, 6)}…${userId.slice(-4)}`}
          </span>
          <button
            onClick={logout}
            className="text-[10px] uppercase tracking-wide text-[#e8dcc4]/30 transition hover:text-[#e8dcc4]/70"
          >
            Log out
          </button>
        </div>
      )}

      {/* Open council button */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute bottom-6 right-4 z-20 rounded-full border border-[#c9a876]/50 bg-[#1a1410]/80 px-5 py-2.5 font-display text-xs tracking-wide text-[#c9a876] backdrop-blur-sm transition hover:bg-[#1a1410] sm:bottom-10 sm:right-10 sm:px-6 sm:py-3 sm:text-sm"
        >
          Consult {activePersona.name.split(" ").slice(-1)[0]} →
        </button>
      )}

      {/* Side panel — full-screen sheet on mobile, fixed-width panel on desktop */}
      <div
        className={`absolute right-0 top-0 z-30 flex h-full w-full flex-col border-l border-[#c9a876]/15 bg-[#161108]/97 backdrop-blur-md transition-transform duration-500 sm:w-115 ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-[#c9a876]/15 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="truncate font-display text-base text-[#c9a876] sm:text-lg">
              {isCouncil
                ? participants
                    .map((id) => PERSONAS.find((p) => p.id === id)?.name.split(" ").slice(-1)[0])
                    .join(" & ")
                : activePersona.name}
            </div>
            <div className="text-xs text-[#e8dcc4]/50">
              {isCouncil ? "Council in session" : activePersona.years}
            </div>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="ml-3 shrink-0 p-2 text-[#e8dcc4]/50 transition hover:text-[#e8dcc4]"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        {/* Transcript */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 sm:px-6 sm:py-5"
        >
          {turns.length === 0 && (
            <p className="text-sm leading-relaxed text-[#e8dcc4]/45">
              Ask {activePersona.name} about their documented record. Every
              claim made here is grounded in named sources, sealed and
              recorded on 0G. You can invite a second figure in at any time
              to hear their take.
            </p>
          )}
          {turns.map((t, i) => {
            const isUser = t.personaId === "user";
            const isSystem = t.personaId === "system";
            const personaIndex = PERSONAS.findIndex((p) => p.id === t.personaId);
            const accent = accentFor(t.personaId, Math.max(personaIndex, 0));
            return (
              <div key={i} className={isUser ? "text-right" : ""}>
                {!isUser && !isSystem && isCouncil && (
                  <div
                    className="mb-1 text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: accent }}
                  >
                    {t.personaName}
                  </div>
                )}
                <div
                  className={`inline-block max-w-[92%] rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed sm:max-w-[90%] sm:px-4 sm:py-3 ${
                    isUser
                      ? "bg-[#2d2419] text-[#e8dcc4]"
                      : isSystem
                      ? "bg-transparent text-[#e8dcc4]/40 italic"
                      : "bg-[#1f1912] text-[#e8dcc4]/90"
                  }`}
                  style={
                    !isUser && !isSystem && isCouncil
                      ? { borderLeft: `2px solid ${accent}` }
                      : undefined
                  }
                >
                  {t.content}
                  {t.sources && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setRevealedSeal(revealedSeal === i ? null : i)}
                        className="flex items-center gap-1.5 rounded-full border border-[#8b3a3a]/40 bg-[#8b3a3a]/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#c9a876] transition hover:bg-[#8b3a3a]/20"
                      >
                        <span>🜞</span> Sealed Source
                      </button>
                    </div>
                  )}
                  {revealedSeal === i && t.sources && (
                    <div className="mt-2 rounded-lg border border-[#4a5d4e]/30 bg-[#0d0a07]/60 p-3 text-xs">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[#4a5d4e]">
                        <span>✓</span>
                        <span className="font-mono uppercase tracking-wide">
                          Verified on 0G Storage
                        </span>
                      </div>
                      <ul className="space-y-1 font-mono text-[11px] text-[#e8dcc4]/60">
                        {t.sources.map((s, si) => (
                          <li key={si}>· {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="inline-block rounded-xl bg-[#1f1912] px-4 py-3 text-sm text-[#e8dcc4]/40">
              Consulting the record…
            </div>
          )}
        </div>

        {/* Invite picker — wraps and scrolls on small screens instead of
            overflowing the panel width */}
        {invitePickerOpen && (
          <div className="max-h-[40vh] overflow-y-auto border-t border-[#c9a876]/15 bg-[#0d0a07]/60 px-4 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-[#e8dcc4]/40">
              Invite to weigh in
            </div>
            <div className="flex flex-wrap gap-2">
              {availableToInvite.map((p) => (
                <button
                  key={p.id}
                  onClick={() => inviteToDebate(p)}
                  className="rounded-full border border-[#c9a876]/30 bg-[#1f1912] px-3 py-1.5 text-xs text-[#e8dcc4] transition hover:border-[#c9a876]/60"
                >
                  {p.name}
                </button>
              ))}
              {availableToInvite.length === 0 && (
                <span className="text-xs text-[#e8dcc4]/40">
                  Everyone is already at the table.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Input */}
        <div
          className="border-t border-[#c9a876]/15 px-3 py-3 sm:px-4 sm:py-4"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => setInvitePickerOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full border border-[#c9a876]/30 px-3 py-1 text-[11px] text-[#c9a876]/80 transition hover:border-[#c9a876]/60 hover:text-[#c9a876]"
            >
              + Invite another figure
            </button>
          </div>
          <div className="flex items-end gap-2 rounded-lg border border-[#c9a876]/20 bg-[#1f1912] px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                isCouncil
                  ? "Ask the council something…"
                  : `Ask ${activePersona.name.split(" ").slice(-1)[0]} something…`
              }
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-md bg-[#c9a876] px-3 py-1.5 text-xs font-medium text-[#1a1410] transition disabled:opacity-30"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}