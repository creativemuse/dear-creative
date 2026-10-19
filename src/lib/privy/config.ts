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
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isPrivyConfigured(): boolean {
  return Boolean(getPrivyAppId() && getPrivyAppSecret());
}
