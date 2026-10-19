"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { createContext } from "react";

export type PrivyContextValue = ReturnType<typeof usePrivy>;

export const PrivyBridgeContext = createContext<PrivyContextValue | null>(null);

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();
  return (
    <PrivyBridgeContext.Provider value={privy}>
      {children}
    </PrivyBridgeContext.Provider>
  );
}

type PrivyRootProviderProps = {
  appId: string;
  children: React.ReactNode;
};

export function PrivyRootProvider({ appId, children }: PrivyRootProviderProps) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#18181b",
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
