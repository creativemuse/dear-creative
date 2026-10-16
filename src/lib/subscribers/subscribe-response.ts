/** Uniform POST /api/subscribe success body (anti-enumeration). */
export const SUBSCRIBE_HTTP_ACK = {
  status: "ok" as const,
  message:
    "If this address is eligible to subscribe, you will receive a confirmation email shortly.",
};
