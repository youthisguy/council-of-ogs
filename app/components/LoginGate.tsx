 "use client";

import { usePrivy } from "@privy-io/react-auth";

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#0d0a07] text-[#e8dcc4]/40">
        <span className="font-display text-sm tracking-wide">
          Opening the archive
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex h-dvh w-screen flex-col items-center justify-center gap-6 bg-[#0d0a07] px-6 text-center text-[#e8dcc4]">
        <div>
          {/* <h1 className="font-display text-2xl tracking-wide text-[#c9a876]">
            Council of History
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#e8dcc4]/50">
            Sign in to begin. Your conversations are kept private to you and
            sealed, verifiably, on 0G.
          </p> */}
        </div>
        <button
          onClick={login}
          className="rounded-full border border-[#c9a876]/50 bg-[#1a1410] px-8 py-3 font-display text-sm tracking-wide text-[#c9a876] transition hover:bg-[#1f1912]"
        >
          Enter the Archive →
        </button>
      </div>
    );
  }

  return <>{children}</>;
}