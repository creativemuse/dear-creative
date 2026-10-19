"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PrivyBridgeContext, PrivyRootProvider } from "./privy-root-provider";

export const STUDIO_TOKEN_STORAGE_KEY = "dear_creative_studio_token";

export function useSafePrivy() {
  const privy = useContext(PrivyBridgeContext);
  const { privyConfigured, adamTokenConfigured, configLoaded } = useContext(
    AuthRuntimeConfigContext,
  );
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  const isPrivyMounted = Boolean(privy);
  const isPrivyReady = privy?.ready ?? false;

  useEffect(() => {
    if (!privyConfigured || !isPrivyMounted || isPrivyReady) {
      return;
    }
    const timer = setTimeout(() => {
      setPrivyTimedOut(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, [privyConfigured, isPrivyMounted, isPrivyReady]);

  const isTimedOut = Boolean(privyConfigured && !isPrivyReady && privyTimedOut);
  const ready = privyConfigured
    ? isPrivyReady || isTimedOut
    : configLoaded || true;

  return {
    ready,
    authenticated: privy?.authenticated ?? false,
    user: privy?.user ?? null,
    login: privy?.login ?? (() => {}),
    logout: privy?.logout ?? (async () => {}),
    getAccessToken: privy?.getAccessToken ?? (async () => null),
    privyConfigured,
    adamTokenConfigured,
    configLoaded,
    privyTimedOut: isTimedOut,
  };
}

/**
 * Returns true if the user is authenticated either via Privy or using a Studio Key (ADAM_API_TOKEN).
 */
export function useAuthSession() {
  const privy = useSafePrivy();
  const [hasStudioToken, setHasStudioToken] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = window.localStorage.getItem(STUDIO_TOKEN_STORAGE_KEY);
      const timer = setTimeout(
        () => setHasStudioToken(Boolean(token?.trim())),
        0,
      );
      return () => clearTimeout(timer);
    }
  }, []);

  const isSignedIn = privy.authenticated || hasStudioToken;

  const handleSignOut = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STUDIO_TOKEN_STORAGE_KEY);
    }
    setHasStudioToken(false);
    if (privy.authenticated) {
      await privy.logout();
    }
  };

  return {
    ...privy,
    isSignedIn,
    hasStudioToken,
    signOut: handleSignOut,
  };
}

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
