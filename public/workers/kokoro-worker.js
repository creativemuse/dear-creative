/**
 * Kokoro-82M Web Worker
 *
 * Runs Kokoro-82M text-to-speech synthesis on a background worker thread.
 * Emits zero-copy transferable ArrayBuffers to the main thread for gapless scheduling.
 */

import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";

let ttsInstance = null;
let initPromise = null;

async function getOrCreateTTS() {
  if (ttsInstance) {
    return ttsInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      self.postMessage({
        type: "STATUS",
        status: "loading",
        message: "Loading Kokoro-82M ONNX model...",
      });

      const model = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        {
          dtype: "q8",
          progress_callback: (progress) => {
            self.postMessage({
              type: "PROGRESS",
              progress: typeof progress === "object" ? progress : { progress },
            });
          },
        }
      );

      ttsInstance = model;
      self.postMessage({
        type: "STATUS",
        status: "ready",
        message: "Kokoro-82M model ready",
      });
      return model;
    })();
  }

  return initPromise;
}

self.onmessage = async (e) => {
  const { type, text, voice = "am_adam", speed = 1.0, id } = e.data || {};

  if (type === "INIT") {
    try {
      await getOrCreateTTS();
    } catch (err) {
      self.postMessage({
        type: "ERROR",
        error: err instanceof Error ? err.message : String(err),
        id,
      });
    }
    return;
  }

  if (type === "GENERATE") {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return;
    }

    try {
      const model = await getOrCreateTTS();
      const rawAudio = await model.generate(text.trim(), {
        voice,
        speed: typeof speed === "number" ? speed : 1.0,
      });

      const float32Data = rawAudio.audio;
      const sampleRate = rawAudio.sampling_rate || 24000;
      const rawBuffer = float32Data.buffer;

      // Zero-copy memory transfer using Transferable Objects
      self.postMessage(
        {
          type: "AUDIO_READY",
          audioBuffer: rawBuffer,
          sampleRate,
          text,
          id,
        },
        [rawBuffer]
      );
    } catch (err) {
      self.postMessage({
        type: "ERROR",
        error: err instanceof Error ? err.message : String(err),
        text,
        id,
      });
    }
  }
};
