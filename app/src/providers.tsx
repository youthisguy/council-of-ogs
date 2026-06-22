"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          theme: "dark",
          accentColor: "#c9a876",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
