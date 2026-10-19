"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PrivyRootProvider } from "./privy-root-provider";

type AuthRuntimeConfig = {
  privyConfigured: boolean;
  adamTokenConfigured: boolean;
  configLoaded: boolean;
};

const AuthRuntimeConfigContext = createContext<AuthRuntimeConfig>({
  privyConfigured: false,
  adamTokenConfigured: false,
  configLoaded: false,
});

type AppProvidersProps = {
  privyAppId?: string;
  children: React.ReactNode;
};

export function AppProviders({ privyAppId, children }: AppProvidersProps) {
  const [runtimeAppId, setRuntimeAppId] = useState<string | undefined>(
    privyAppId?.trim() || undefined,
  );
  const [adamTokenConfigured, setAdamTokenConfigured] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(Boolean(privyAppId?.trim()));

  useEffect(() => {
    let cancelled = false;
    async function fetchConfig() {
      try {
        const res = await fetch("/api/admin/config", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          privyAppId?: string | null;
          privyConfigured?: boolean;
          adamTokenConfigured?: boolean;
        };
        if (cancelled) return;
        if (data.privyAppId?.trim()) {
          setRuntimeAppId((prev) => prev || data.privyAppId!.trim());
        }
        setAdamTokenConfigured(Boolean(data.adamTokenConfigured));
      } catch {
        // Ignore network errors and proceed with static config
      } finally {
        if (!cancelled) {
          setConfigLoaded(true);
        }
      }
    }
    void fetchConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedAppId = privyAppId?.trim() || runtimeAppId;
  const contextValue = useMemo<AuthRuntimeConfig>(
    () => ({
      privyConfigured: Boolean(resolvedAppId),
      adamTokenConfigured,
      configLoaded,
    }),
    [resolvedAppId, adamTokenConfigured, configLoaded],
  );

  if (!resolvedAppId) {
    return (
      <AuthRuntimeConfigContext.Provider value={contextValue}>
        {children}
      </AuthRuntimeConfigContext.Provider>
    );
  }

  return (
    <AuthRuntimeConfigContext.Provider value={contextValue}>
      <PrivyRootProvider appId={resolvedAppId}>{children}</PrivyRootProvider>
    </AuthRuntimeConfigContext.Provider>
  );
}

export function useSafePrivy() {
  const privy = usePrivy();
  const { privyConfigured, adamTokenConfigured, configLoaded } = useContext(
    AuthRuntimeConfigContext,
  );
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  useEffect(() => {
    if (!privyConfigured || privy.ready) {
      setPrivyTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setPrivyTimedOut(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, [privyConfigured, privy.ready]);

  const ready = privyConfigured
    ? privy.ready || privyTimedOut
    : configLoaded || true;

  return {
    ...privy,
    ready,
    privyConfigured,
    adamTokenConfigured,
    configLoaded,
    privyTimedOut,
  };
}
