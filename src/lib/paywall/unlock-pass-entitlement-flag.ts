let override: boolean | undefined;

/** When false, Unlock pass checks are a no-op (no pass-based access). */
export function isDearPassEntitlementEnabled(): boolean {
  if (override !== undefined) {
    return override;
  }
  return (
    process.env.DEAR_PASS_ENTITLEMENT_ENABLED?.trim().toLowerCase() === "true"
  );
}

export function setDearPassEntitlementEnabledForTests(
  value: boolean | undefined,
): void {
  override = value;
}
