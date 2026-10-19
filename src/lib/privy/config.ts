export function getPrivyAppId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ||
    process.env.PRIVY_APP_ID?.trim() ||
    undefined
  );
}

export function getPrivyAppSecret(): string | undefined {
  return process.env.PRIVY_APP_SECRET?.trim() || undefined;
}

export function getPrivyAdminUserIds(): Set<string> {
  const raw = process.env.PRIVY_ADMIN_USER_IDS?.trim();
  if (!raw) {
    return new Set();
  }
  const set = new Set<string>();
  for (const item of raw.split(",").map((id) => id.trim()).filter(Boolean)) {
    set.add(item);
    if (item.startsWith("did:privy:")) {
      set.add(item.slice("did:privy:".length));
    } else {
      set.add(`did:privy:${item}`);
    }
  }
  return set;
}

export function isPrivyConfigured(): boolean {
  return Boolean(getPrivyAppId() && getPrivyAppSecret());
}
