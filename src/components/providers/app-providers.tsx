"use client";

import { PrivyRootProvider } from "./privy-root-provider";

type AppProvidersProps = {
  privyAppId?: string;
  children: React.ReactNode;
};

export function AppProviders({ privyAppId, children }: AppProvidersProps) {
  if (!privyAppId) {
    return <>{children}</>;
  }
  return <PrivyRootProvider appId={privyAppId}>{children}</PrivyRootProvider>;
}
