/** Voices authors can pick for pre-generated narration (client-safe module). */
export const NARRATION_VOICES = [
  { id: "Puck", label: "Adam (Puck) — Warm" },
  { id: "Charon", label: "Charon — Editorial" },
  { id: "Fenrir", label: "Fenrir — Crisp" },
  { id: "Aoede", label: "Aoede — Expressive" },
  { id: "Kore", label: "Kore — Bright" },
] as const;

export type NarrationVoice = (typeof NARRATION_VOICES)[number]["id"];

export function isNarrationVoice(value: string): value is NarrationVoice {
  return NARRATION_VOICES.some((v) => v.id === value);
}

export function voiceLabel(voice: string | null | undefined): string {
  return NARRATION_VOICES.find((v) => v.id === voice)?.label ?? voice ?? "Narrator";
}
