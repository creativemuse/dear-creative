"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripHtmlTags } from "@/lib/posts/reading-time";
import { GaplessAudioQueue } from "@/lib/audio/gapless-audio-queue";
import {
  getKokoroTTSClient,
  KokoroVoice,
  SynthesisProgress,
} from "@/lib/audio/kokoro-tts-client";

type DispatchAudioPlayerProps = {
  slug: string;
  title: string;
  excerpt?: string | null;
  bodyHtml?: string | null;
  listenMinutes?: number;
};

export function DispatchAudioPlayer({
  title,
  excerpt,
  bodyHtml,
  listenMinutes = 2,
}: DispatchAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.25 | 1.5>(1);
  const [voice, setVoice] = useState<KokoroVoice>("am_adam");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(listenMinutes * 60);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUsingFallbackSpeech, setIsUsingFallbackSpeech] = useState(false);

  const queueRef = useRef<GaplessAudioQueue | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const plainText = `${title}. ${excerpt ? excerpt + ". " : ""}${stripHtmlTags(bodyHtml ?? "")}`;

  // Initialize or retrieve queue
  const getQueue = useCallback(() => {
    if (!queueRef.current) {
      queueRef.current = new GaplessAudioQueue({
        sampleRate: 24000,
        onPlaybackStateChange: (playing) => {
          setIsPlaying(playing);
          if (!playing && !isPaused) {
            setIsPaused(false);
          }
        },
        onEnded: () => {
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentTime(duration);
        },
      });
    }
    return queueRef.current;
  }, [duration, isPaused]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (queueRef.current) {
        queueRef.current.stop();
      }
      getKokoroTTSClient().stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Time tracker effect
  useEffect(() => {
    if (isPlaying && !isPaused) {
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.25 * playbackRate;
          return next >= duration ? duration : next;
        });
      }, 250);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, isPaused, duration, playbackRate]);

  // Handle Play/Pause
  const handleTogglePlay = useCallback(async () => {
    const queue = getQueue();

    // 1. If currently playing, pause
    if (isPlaying && !isPaused) {
      if (isUsingFallbackSpeech) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.pause();
        }
      } else {
        await queue.pause();
      }
      setIsPaused(true);
      setIsPlaying(false);
      return;
    }

    // 2. If paused, resume
    if (isPaused) {
      if (isUsingFallbackSpeech) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.resume();
        }
      } else {
        await queue.resume();
      }
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    // 3. Fresh start: initialize Kokoro-82M on-device synthesis
    setIsLoading(true);
    setStatusMessage("Preparing Kokoro-82M engine...");

    try {
      // Initialize audio context on explicit user gesture
      queue.init();
      queue.setPlaybackRate(playbackRate);

      const client = getKokoroTTSClient();

      await client.streamTextToSpeech(plainText, queue, {
        voice,
        speed: playbackRate,
        onProgress: (prog: SynthesisProgress) => {
          if (prog.status === "loading") {
            setStatusMessage("Loading on-device model...");
          } else if (prog.status === "synthesizing") {
            setStatusMessage(null);
            setIsLoading(false);
          } else if (prog.status === "completed") {
            setStatusMessage(null);
            setIsLoading(false);
          }
        },
        onError: (err) => {
          console.warn("Kokoro TTS playback encountered error, switching to Web Speech fallback:", err);
          fallbackToBrowserSpeech();
        },
      });

      setIsPlaying(true);
      setIsPaused(false);
    } catch (err) {
      console.warn("Kokoro engine could not start, falling back to Web Speech:", err);
      fallbackToBrowserSpeech();
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isPaused, getQueue, isUsingFallbackSpeech, playbackRate, plainText, voice]);

  // Fallback to local Web Speech API
  const fallbackToBrowserSpeech = () => {
    setIsUsingFallbackSpeech(true);
    setStatusMessage(null);
    setIsLoading(false);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.rate = playbackRate;
      utterance.onend = () => {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentTime(duration);
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  // Handle speed change
  const handleSpeedToggle = () => {
    const nextRate: 1 | 1.25 | 1.5 =
      playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : 1;
    setPlaybackRate(nextRate);

    if (queueRef.current) {
      queueRef.current.setPlaybackRate(nextRate);
    }

    if (isUsingFallbackSpeech && isPlaying && typeof window !== "undefined") {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.rate = nextRate;
      utterance.onend = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Voice toggle between Adam and Heart
  const handleVoiceToggle = () => {
    const nextVoice: KokoroVoice = voice === "am_adam" ? "af_heart" : "am_adam";
    setVoice(nextVoice);

    // If currently active, stop and re-stream with the new voice
    if (isPlaying || isPaused) {
      if (queueRef.current) {
        queueRef.current.stop();
      }
      getKokoroTTSClient().stop();
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentTime(0);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = Math.floor(sec % 60);
    return `${mins}:${remainder < 10 ? "0" : ""}${remainder}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="my-6 rounded-2xl border border-zinc-200/90 bg-gradient-to-r from-zinc-50 via-zinc-100/60 to-zinc-50 p-4 shadow-2xs dark:border-zinc-800 dark:from-zinc-900/90 dark:via-zinc-900/50 dark:to-zinc-900/90">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleTogglePlay()}
            disabled={isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm transition hover:scale-105 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            aria-label={
              isLoading
                ? "Loading Kokoro-82M model"
                : isPlaying
                  ? "Pause audio narration"
                  : isPaused
                    ? "Resume audio narration"
                    : "Play audio narration with Kokoro-82M"
            }
          >
            {isLoading ? (
              <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : isPlaying ? (
              <span className="text-sm">⏸</span>
            ) : (
              <span className="ml-0.5 text-sm">▶</span>
            )}
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Listen to Dispatch
              </span>
              {isPlaying ? (
                <div className="flex items-center gap-0.5" aria-hidden="true">
                  <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-emerald-500" />
                  <span className="h-4 w-0.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:150ms]" />
                  <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:300ms]" />
                  <span className="h-3 w-0.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:450ms]" />
                </div>
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-500">
              {statusMessage ? (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {statusMessage}
                </span>
              ) : isUsingFallbackSpeech ? (
                `Browser Speech • ~${listenMinutes} min listen`
              ) : (
                `Kokoro-82M (${voice === "am_adam" ? "Adam" : "Heart"}) • ~${listenMinutes} min listen`
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice selector toggle */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
            title="Switch Voice (Kokoro-82M)"
          >
            Voice: {voice === "am_adam" ? "Adam" : "Heart"}
          </button>

          <span className="font-mono text-xs text-zinc-500">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </span>

          {/* Speed toggle */}
          <button
            type="button"
            onClick={handleSpeedToggle}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
            title="Toggle playback speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-zinc-900 transition-all duration-200 dark:bg-zinc-100"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}
