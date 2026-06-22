"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";

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
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/council.png"
            alt="Council of History"
            width={96}
            height={96}
            className="opacity-90"
            priority
          />
 
        </div>
        <button
          onClick={login}
          className="rounded-full border border-[#c9a876]/50 bg-[#1a1410] px-8 py-3 font-display text-sm tracking-wide text-[#c9a876] transition hover:bg-[#1f1912]"
        >
          Log In
        </button>
      </div>
    );
  }

  return <>{children}</>;
}