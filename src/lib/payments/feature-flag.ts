let paymentsEnabledOverride: boolean | undefined;

export function setPaymentsEnabledForTests(value: boolean | undefined): void {
  paymentsEnabledOverride = value;
}

export function isPaymentsEnabled(): boolean {
  if (paymentsEnabledOverride !== undefined) {
    return paymentsEnabledOverride;
  }
  return process.env.PAYMENTS_ENABLED?.trim().toLowerCase() === "true";
}
