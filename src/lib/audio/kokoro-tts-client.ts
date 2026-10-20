/**
 * Kokoro-82M Text-to-Speech Client
 *
 * Coordinates on-device synthesis using Kokoro-82M ONNX via Web Worker or direct WASM,
 * and feeds PCM chunks into GaplessAudioQueue for timestamp-scheduled, gapless playback.
 */

import { GaplessAudioQueue } from "./gapless-audio-queue";
import { splitArticleIntoSentences } from "./sentence-splitter";

export type KokoroVoice =
  | "am_adam"
  | "af_heart"
  | "af_bella"
  | "af_sky"
  | "am_michael"
  | "bf_emma"
  | "bm_george";

export type SynthesisProgress = {
  status: "idle" | "loading" | "ready" | "synthesizing" | "completed" | "error";
  message?: string;
  currentSentence?: number;
  totalSentences?: number;
  progressPercent?: number;
};

export class KokoroTTSClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private inThreadTTS: unknown = null;
  private isInitializing = false;
  private isReady = false;
  private abortController: AbortController | null = null;

  constructor() {
    // Lazy initialized on first user interaction to comply with browser autoplay policies
  }

  /**
   * Initialize Kokoro-82M (Web Worker or direct thread fallback)
   */
  async init(onStatus?: (status: SynthesisProgress) => void): Promise<void> {
    if (this.isReady) return;
    if (this.isInitializing) return;

    if (typeof window === "undefined") {
      throw new Error("KokoroTTSClient is only available in browser environments");
    }

    this.isInitializing = true;
    onStatus?.({ status: "loading", message: "Initializing Kokoro-82M engine..." });

    // 1. Try Web Worker
    if (typeof Worker !== "undefined" && !this.workerFailed) {
      try {
        const worker = new Worker("/workers/kokoro-worker.js", { type: "module" });

        const initPromise = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            // Timeout if worker doesn't respond in 15 seconds
            reject(new Error("Worker initialization timed out"));
          }, 15000);

          const handleMsg = (e: MessageEvent) => {
            const data = e.data || {};
            if (data.type === "STATUS" && data.status === "ready") {
              clearTimeout(timer);
              worker.removeEventListener("message", handleMsg);
              resolve();
            } else if (data.type === "ERROR") {
              clearTimeout(timer);
              worker.removeEventListener("message", handleMsg);
              reject(new Error(data.error || "Worker error"));
            } else if (data.type === "STATUS") {
              onStatus?.({ status: "loading", message: data.message });
            }
          };

          worker.addEventListener("message", handleMsg);
          worker.postMessage({ type: "INIT" });
        });

        await initPromise;
        this.worker = worker;
        this.isReady = true;
        this.isInitializing = false;
        onStatus?.({ status: "ready", message: "Kokoro-82M ready" });
        return;
      } catch (err) {
        console.warn("Kokoro worker failed, falling back to dynamic import:", err);
        this.workerFailed = true;
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
      }
    }

    // 2. In-thread fallback (dynamic import of kokoro-js)
    try {
      onStatus?.({ status: "loading", message: "Loading Kokoro-82M in main thread..." });
      const { KokoroTTS } = await import("kokoro-js");
      this.inThreadTTS = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        {
          dtype: "q8",
        }
      );
      this.isReady = true;
      this.isInitializing = false;
      onStatus?.({ status: "ready", message: "Kokoro-82M ready" });
    } catch (err) {
      this.isInitializing = false;
      onStatus?.({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load Kokoro-82M",
      });
      throw err;
    }
  }

  /**
   * Synthesize a single sentence into PCM audio buffer
   */
  private async synthesizeSentence(
    text: string,
    voice: KokoroVoice,
    speed: number,
    signal?: AbortSignal
  ): Promise<{ audioBuffer: ArrayBuffer; sampleRate: number }> {
    if (signal?.aborted) {
      throw new Error("Synthesis aborted");
    }

    if (this.worker && !this.workerFailed) {
      const activeWorker = this.worker;
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(2, 9);

        const onAbort = () => {
          activeWorker.removeEventListener("message", onMessage);
          reject(new Error("Synthesis aborted"));
        };

        const onMessage = (e: MessageEvent) => {
          const data = e.data || {};
          if (data.id === id) {
            activeWorker.removeEventListener("message", onMessage);
            signal?.removeEventListener("abort", onAbort);

            if (data.type === "AUDIO_READY") {
              resolve({
                audioBuffer: data.audioBuffer,
                sampleRate: data.sampleRate || 24000,
              });
            } else if (data.type === "ERROR") {
              reject(new Error(data.error || "Worker synthesis error"));
            }
          }
        };

        activeWorker.addEventListener("message", onMessage);
        signal?.addEventListener("abort", onAbort);

        activeWorker.postMessage({
          type: "GENERATE",
          text,
          voice,
          speed,
          id,
        });
      });
    }

    // Main thread fallback
    if (this.inThreadTTS) {
      type InThreadModel = {
        generate: (
          t: string,
          opts: { voice: string; speed: number }
        ) => Promise<{ audio: Float32Array; sampling_rate: number }>;
      };
      const model = this.inThreadTTS as InThreadModel;
      const rawAudio = await model.generate(text, { voice, speed });
      return {
        audioBuffer: rawAudio.audio.buffer as ArrayBuffer,
        sampleRate: rawAudio.sampling_rate || 24000,
      };
    }

    throw new Error("Kokoro engine not initialized");
  }

  /**
   * Stream full article text to speech using GaplessAudioQueue.
   * Schedules PCM chunks continuously along the Web Audio API hardware clock.
   */
  async streamTextToSpeech(
    text: string,
    queue: GaplessAudioQueue,
    options: {
      voice?: KokoroVoice;
      speed?: number;
      onSentenceStart?: (index: number, sentence: string) => void;
      onProgress?: (progress: SynthesisProgress) => void;
      onComplete?: () => void;
      onError?: (err: Error) => void;
    } = {}
  ): Promise<void> {
    const {
      voice = "am_adam",
      speed = 1.0,
      onSentenceStart,
      onProgress,
      onComplete,
      onError,
    } = options;

    this.stop();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // 1. Ensure model is ready
      await this.init(onProgress);

      if (signal.aborted) return;

      // 2. Initialize the audio queue (handles browser user-gesture restrictions)
      queue.init();
      queue.setPlaybackRate(speed);

      // 3. Split the text into complete sentences
      const sentences = splitArticleIntoSentences(text);
      if (sentences.length === 0) {
        onComplete?.();
        return;
      }

      onProgress?.({
        status: "synthesizing",
        message: "Generating audio with Kokoro-82M...",
        totalSentences: sentences.length,
        currentSentence: 0,
        progressPercent: 0,
      });

      // 4. Synthesize and enqueue sentence-by-sentence
      for (let i = 0; i < sentences.length; i++) {
        if (signal.aborted) break;

        const sentence = sentences[i];
        onSentenceStart?.(i, sentence);

        onProgress?.({
          status: "synthesizing",
          currentSentence: i + 1,
          totalSentences: sentences.length,
          progressPercent: Math.round(((i + 1) / sentences.length) * 100),
        });

        const { audioBuffer, sampleRate } = await this.synthesizeSentence(
          sentence,
          voice,
          speed,
          signal
        );

        if (signal.aborted) break;

        // Immediately schedule into gapless hardware timeline
        queue.enqueueChunk(audioBuffer, sampleRate);
      }

      if (!signal.aborted) {
        onProgress?.({
          status: "completed",
          message: "All sentences scheduled",
          totalSentences: sentences.length,
          currentSentence: sentences.length,
          progressPercent: 100,
        });
        onComplete?.();
      }
    } catch (err) {
      if (signal.aborted) return;
      const error = err instanceof Error ? err : new Error(String(err));
      onProgress?.({ status: "error", message: error.message });
      onError?.(error);
    }
  }

  /**
   * Stop active synthesis and abort pending tasks
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Destroy client and worker
   */
  terminate(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.inThreadTTS = null;
    this.isReady = false;
    this.isInitializing = false;
  }
}

// Export singleton instance for seamless playback across components
let globalKokoroClient: KokoroTTSClient | null = null;

export function getKokoroTTSClient(): KokoroTTSClient {
  if (typeof window === "undefined") {
    return new KokoroTTSClient();
  }
  if (!globalKokoroClient) {
    globalKokoroClient = new KokoroTTSClient();
  }
  return globalKokoroClient;
}
