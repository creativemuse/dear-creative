export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED?.trim().toLowerCase() === "true";
}
