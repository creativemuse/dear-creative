/**
 * Paywall Boundary Parsing
 *
 * Slices article markdown into freeContent and gatedContent based on
 * <!-- PAYWALL_GATE_START --> and <!-- PAYWALL_GATE_END --> tags.
 */

export const PAYWALL_GATE_START_TAG = "<!-- PAYWALL_GATE_START -->";
export const PAYWALL_GATE_END_TAG = "<!-- PAYWALL_GATE_END -->";

export interface ParsedPaywallContent {
  freeContent: string;
  gatedContent: string | null;
  isGated: boolean;
}

export function splitPostPaywall(rawMarkdown: string): ParsedPaywallContent {
  if (!rawMarkdown) {
    return {
      freeContent: "",
      gatedContent: null,
      isGated: false,
    };
  }

  const startIndex = rawMarkdown.indexOf(PAYWALL_GATE_START_TAG);
  if (startIndex === -1) {
    return {
      freeContent: rawMarkdown.trim(),
      gatedContent: null,
      isGated: false,
    };
  }

  const beforeGate = rawMarkdown.slice(0, startIndex).trim();
  const afterStart = rawMarkdown.slice(startIndex + PAYWALL_GATE_START_TAG.length);

  const endIndex = afterStart.indexOf(PAYWALL_GATE_END_TAG);
  if (endIndex !== -1) {
    // Wrapper style: bounded by START and END
    const gatedBlock = afterStart.slice(0, endIndex).trim();
    const afterEnd = afterStart.slice(endIndex + PAYWALL_GATE_END_TAG.length).trim();
    const combinedFree = [beforeGate, afterEnd].filter(Boolean).join("\n\n");

    return {
      freeContent: combinedFree,
      gatedContent: gatedBlock || null,
      isGated: Boolean(gatedBlock),
    };
  }

  // Cut-off style: everything after START tag is gated
  const gatedBlock = afterStart.trim();
  return {
    freeContent: beforeGate,
    gatedContent: gatedBlock || null,
    isGated: Boolean(gatedBlock),
  };
}
