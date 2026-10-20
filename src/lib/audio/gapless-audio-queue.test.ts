import { describe, expect, it, vi } from "vitest";
import { GaplessAudioQueue } from "./gapless-audio-queue";

describe("GaplessAudioQueue", () => {
  it("throws if AudioContext is accessed in non-browser environment without window", () => {
    // In vitest node environment, window is undefined unless setup
    if (typeof window === "undefined") {
      const queue = new GaplessAudioQueue();
      expect(() => queue.init()).toThrow("Web Audio API is only available in browser environments");
    }
  });

  it("schedules continuous gapless audio chunks with nextStartTime calculation", () => {
    let mockCurrentTime = 1.0;
    const mockStartedSources: Array<{ startTime: number; buffer: unknown }> = [];

    const mockSourceNode = {
      buffer: null as unknown,
      playbackRate: { value: 1.0 },
      connect: vi.fn(),
      start: vi.fn((time: number) => {
        mockStartedSources.push({ startTime: time, buffer: mockSourceNode.buffer });
      }),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null as (() => void) | null,
    };

    const mockGainNode = {
      connect: vi.fn(),
      gain: { value: 1.0 },
    };

    const mockAudioContext = {
      get currentTime() {
        return mockCurrentTime;
      },
      state: "running",
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      destination: {},
      createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => ({
        length,
        duration: length / sampleRate,
        copyToChannel: vi.fn(),
      })),
      createBufferSource: vi.fn(() => ({ ...mockSourceNode })),
      createGain: vi.fn(() => ({ ...mockGainNode })),
    };

    // Install mock window and AudioContext
    const originalWindow = globalThis.window;
    function MockAudioContextConstructor() {
      return mockAudioContext;
    }
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: MockAudioContextConstructor,
    };

    try {
      const stateChanges: boolean[] = [];
      const queue = new GaplessAudioQueue({
        sampleRate: 24000,
        onPlaybackStateChange: (isPlaying) => stateChanges.push(isPlaying),
      });

      // Chunk 1: 24,000 samples = 1.0 second duration
      const chunk1 = new Float32Array(24000);
      queue.enqueueChunk(chunk1);

      expect(queue.isPlaying).toBe(true);
      expect(stateChanges).toContain(true);
      expect(mockStartedSources[0].startTime).toBe(1.0); // Math.max(currentTime=1.0, nextStartTime=0) => 1.0

      // Advance mock hardware clock to 1.5s (chunk 1 still playing, ends at 2.0s)
      mockCurrentTime = 1.5;

      // Chunk 2: 48,000 samples = 2.0 second duration
      const chunk2 = new Float32Array(48000);
      queue.enqueueChunk(chunk2);

      // Chunk 2 must start at exactly 2.0s (the end of chunk 1), gaplessly!
      expect(mockStartedSources[1].startTime).toBe(2.0);

      // Stop queue
      queue.stop();
      expect(queue.isPlaying).toBe(false);
    } finally {
      (globalThis as unknown as { window: unknown }).window = originalWindow;
    }
  });
});
