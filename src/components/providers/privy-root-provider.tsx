"use client";

import { PrivyProvider } from "@privy-io/react-auth";

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
      {children}
    </PrivyProvider>
  );
}
