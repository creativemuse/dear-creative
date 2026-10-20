import { describe, expect, it, vi } from "vitest";
import {
  buildNarrationScript,
  chunkNarrationText,
  encodePcmToMp3,
  generatePostNarrationMp3,
  parseWav,
} from "./narration";

/** Helper to generate a minimal valid 16-bit mono PCM WAV file in memory */
function createMockWavBuffer(samples: number[], sampleRate = 24000): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
  buffer.writeUInt16LE(1, 22); // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i]!, 44 + i * 2);
  }

  return buffer;
}

describe("narration helper functions", () => {
  describe("buildNarrationScript", () => {
    it("combines title, teaser, and stripped html body with punctuation", () => {
      const script = buildNarrationScript({
        title: "The Creative Leap",
        teaserText: "A dispatch on generative workflows",
        bodyHtml: "<p>We are entering <strong>a new era</strong> of storytelling.</p><p>Every tool is expanding.</p>",
      });

      expect(script).toBe(
        "The Creative Leap. A dispatch on generative workflows. We are entering a new era of storytelling. Every tool is expanding.",
      );
    });

    it("handles missing teaser or body gracefully", () => {
      const script = buildNarrationScript({
        title: "Lone Title",
      });
      expect(script).toBe("Lone Title.");
    });
  });

  describe("chunkNarrationText", () => {
    it("returns empty array for whitespace-only text", () => {
      expect(chunkNarrationText("   \n\t ")).toEqual([]);
    });

    it("keeps short text in a single chunk", () => {
      const text = "First sentence. Second sentence! Third sentence?";
      const chunks = chunkNarrationText(text, 100);
      expect(chunks).toEqual([text]);
    });

    it("splits text on sentence boundaries when exceeding maxChars", () => {
      const s1 = "Alpha sentence is approximately twenty eight characters.";
      const s2 = "Beta sentence is also roughly twenty eight chars.";
      const combined = `${s1} ${s2}`;
      const chunks = chunkNarrationText(combined, 60);

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe(s1);
      expect(chunks[1]).toBe(s2);
    });

    it("splits giant single sentences when longer than maxChars", () => {
      const longSentence = "A".repeat(150);
      const chunks = chunkNarrationText(longSentence, 50);
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toHaveLength(50);
      expect(chunks[1]).toHaveLength(50);
      expect(chunks[2]).toHaveLength(50);
    });
  });

  describe("parseWav and encodePcmToMp3", () => {
    it("parses valid RIFF WAVE buffer and extracts PCM metadata", () => {
      const mockWav = createMockWavBuffer([0, 1000, -1000, 2000, -2000], 24000);
      const parsed = parseWav(mockWav);

      expect(parsed).not.toBeNull();
      expect(parsed?.sampleRate).toBe(24000);
      expect(parsed?.channels).toBe(1);
      expect(parsed?.pcm.length).toBe(10);
    });

    it("returns null for non-WAV buffer", () => {
      const invalid = Buffer.from("NOT_A_WAV_FILE_DATA_BUFFER");
      expect(parseWav(invalid)).toBeNull();
    });

    it("encodes mono PCM into valid MP3 buffer with frame header", () => {
      // 1152 samples minimum for an MP3 frame
      const samples = Array.from({ length: 2304 }, (_, i) =>
        Math.floor(Math.sin(i / 10) * 10000),
      );
      const mockWav = createMockWavBuffer(samples, 24000);
      const parsed = parseWav(mockWav)!;
      const mp3 = encodePcmToMp3(parsed.pcm, parsed.sampleRate, parsed.channels);

      expect(mp3.length).toBeGreaterThan(0);
      // MP3 frame sync bytes typically start with 0xFF 0xFB (MPEG-1 Layer 3) or 0xFF 0xF3
      expect(mp3[0]).toBe(0xff);
    });
  });

  describe("generatePostNarrationMp3", () => {
    it("synthesizes chunked speech, encodes to MP3, and uploads to Lens Grove", async () => {
      const samplePcm = Array.from({ length: 2400 }, () => 500);
      const mockWav = createMockWavBuffer(samplePcm, 24000);
      const mockWavBase64 = mockWav.toString("base64");

      const mockSynth = vi.fn().mockResolvedValue({
        audioBase64: mockWavBase64,
        mimeType: "audio/wav",
        provider: "google-tts-gemini",
      });

      const mockUpload = vi.fn().mockImplementation(async (file: File, fileName?: string) => {
        return {
          uri: `lens://grove/raw/0xMock/${fileName}`,
          storageKey: `0xMock/${fileName}`,
          gatewayUrl: `https://grove.lens.xyz/0xMock/${fileName}`,
          mimeType: "audio/mpeg",
          size: file.size,
        };
      });

      const result = await generatePostNarrationMp3({
        slug: "future-of-storytelling",
        title: "The Future of Storytelling",
        teaserText: "AI as a creative co-pilot.",
        bodyHtml: "<p>We build with code, sound, and vision.</p>",
        voice: "Puck",
        synthesizeFn: mockSynth,
        uploadFn: mockUpload,
      });

      expect(mockSynth).toHaveBeenCalledTimes(1);
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(result.url).toBe(
        "https://grove.lens.xyz/0xMock/future-of-storytelling-puck-narration.mp3",
      );
      expect(result.voice).toBe("Puck");
      expect(result.mimeType).toBe("audio/mpeg");
      expect(result.bytes).toBeGreaterThan(0);
      expect(result.chunks).toBe(1);
      expect(result.provider).toBe("google-tts-gemini");
    });

    it("throws when post has no narratable text", async () => {
      await expect(
        generatePostNarrationMp3({
          slug: "empty-post",
          title: "",
          teaserText: "",
          bodyHtml: "",
          voice: "Puck",
        }),
      ).rejects.toThrow("Post has no text to narrate.");
    });
  });
});
