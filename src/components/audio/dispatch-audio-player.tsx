"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { stripHtmlTags } from "@/lib/posts/reading-time";

export type GoogleVoice = "Puck" | "Aoede";

export type DispatchAudioResources = {
  audio: Pick<
    HTMLAudioElement,
    | "pause"
    | "onloadedmetadata"
    | "ontimeupdate"
    | "onended"
    | "onerror"
  > & {
    removeAttribute?: (qualifiedName: string) => void;
    load?: () => void;
  } | null;
  utterance: Pick<SpeechSynthesisUtterance, "onend" | "onerror"> | null;
  abortController: Pick<AbortController, "abort"> | null;
  speechSynthesis?: Pick<SpeechSynthesis, "cancel"> | null;
};

/**
 * Safely tears down active HTMLAudioElement, Web Speech synthesis, and in-flight
 * TTS fetch requests without triggering spurious `audio.onerror` fallbacks.
 */
export function stopDispatchAudioResources(
  resources: DispatchAudioResources,
): void {
  if (resources.abortController) {
    try {
      resources.abortController.abort();
    } catch {
      // Ignore abort errors
    }
  }

  if (resources.audio) {
    const audio = resources.audio;
    // Detach listeners BEFORE pausing or clearing src so resetting the media
    // element does not fire `audio.onerror` and trigger the Web Speech fallback.
    audio.onloadedmetadata = null;
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    try {
      audio.pause();
      audio.removeAttribute?.("src");
      audio.load?.();
    } catch {
      // Ignore errors during media teardown
    }
  }

  if (resources.utterance) {
    resources.utterance.onend = null;
    resources.utterance.onerror = null;
  }

  const synth =
    resources.speechSynthesis !== undefined
      ? resources.speechSynthesis
      : typeof window !== "undefined" && "speechSynthesis" in window
        ? window.speechSynthesis
        : null;

  if (synth) {
    try {
      synth.cancel();
    } catch {
      // Ignore errors if speechSynthesis is unavailable
    }
  }
}

type DispatchAudioPlayerProps = {
  slug: string;
  title: string;
  excerpt?: string | null;
  bodyHtml?: string | null;
  listenMinutes?: number;
  /** Pre-generated narration MP3 on Lens Grove; when set, readers stream it with no live TTS. */
  audioUrl?: string | null;
  /** Voice the author selected when generating `audioUrl`. */
  audioVoice?: string | null;
};

export function DispatchAudioPlayer({
  slug,
  title,
  excerpt,
  bodyHtml,
  listenMinutes = 2,
  audioUrl,
  audioVoice,
}: DispatchAudioPlayerProps) {
  const staticAudioSrc = audioUrl?.trim() || null;
  const narratorName =
    audioVoice === "Puck" ? "Adam" : audioVoice?.trim() || "Narrator";
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.25 | 1.5>(1);
  const [voice, setVoice] = useState<GoogleVoice>("Puck");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(listenMinutes * 60);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [useBrowserSpeech, setUseBrowserSpeech] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Record<string, string>>({});
  const currentVoiceRef = useRef<GoogleVoice>("Puck");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(true);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const plainText = `${title}. ${excerpt ? excerpt + ". " : ""}${stripHtmlTags(bodyHtml ?? "")}`;

  const stopAllPlayback = useCallback(() => {
    stopDispatchAudioResources({
      audio: audioRef.current,
      utterance: utteranceRef.current,
      abortController: abortControllerRef.current,
    });
    audioRef.current = null;
    utteranceRef.current = null;
    abortControllerRef.current = null;
    setIsPlaying(false);
    setIsLoading(false);
    setStatusMessage(null);
    setCurrentTime(0);
  }, []);

  // Stop playback when navigating away (including Next.js Activity hide, link clicks, popstate, and page unload)
  useLayoutEffect(() => {
    isActiveRef.current = true;

    const handlePageLeave = () => {
      isActiveRef.current = false;
      stopAllPlayback();
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      try {
        const destUrl = new URL(anchor.href, window.location.href);
        if (
          destUrl.origin === window.location.origin &&
          destUrl.pathname !== window.location.pathname
        ) {
          isActiveRef.current = false;
          stopAllPlayback();
        }
      } catch {
        // Ignore malformed URLs
      }
    };

    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);
    window.addEventListener("popstate", handlePageLeave);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      isActiveRef.current = false;
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      window.removeEventListener("popstate", handlePageLeave);
      document.removeEventListener("click", handleDocumentClick, true);
      stopAllPlayback();
    };
  }, [slug, stopAllPlayback]);

  // Fallback to native Web Speech API with pitch/voice differentiation
  const fallbackToBrowserSpeech = useCallback(
    (voiceToUse: GoogleVoice = voice) => {
      if (!isActiveRef.current) return;

      setUseBrowserSpeech(true);
      setStatusMessage(null);
      setIsLoading(false);

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = playbackRate;
        utterance.pitch = voiceToUse === "Aoede" ? 1.15 : 0.9;

        const voices = window.speechSynthesis.getVoices?.() || [];
        if (voices.length > 0) {
          const isAoede = voiceToUse === "Aoede";
          const match = voices.find((v) => {
            const nameLower = v.name.toLowerCase();
            if (isAoede) {
              return (
                (nameLower.includes("female") ||
                  nameLower.includes("samantha") ||
                  nameLower.includes("victoria") ||
                  nameLower.includes("zira") ||
                  nameLower.includes("karen") ||
                  nameLower.includes("jenny")) &&
                v.lang.startsWith("en")
              );
            }
            return (
              (nameLower.includes("male") ||
                nameLower.includes("daniel") ||
                nameLower.includes("david") ||
                nameLower.includes("alex") ||
                nameLower.includes("guy")) &&
              v.lang.startsWith("en")
            );
          });
          if (match) {
            utterance.voice = match;
          }
        }

        utterance.onend = () => {
          setIsPlaying(false);
          setCurrentTime(0);
        };
        utterance.onerror = () => {
          setIsPlaying(false);
        };
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
      }
    },
    [plainText, playbackRate, voice],
  );

  // Attach audio element listeners
  const setupAudioElement = useCallback(
    (audio: HTMLAudioElement) => {
      audio.playbackRate = playbackRate;

      audio.onloadedmetadata = () => {
        if (audio.duration && !Number.isNaN(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audio.onerror = () => {
        if (!isActiveRef.current) return;
        console.warn("Audio playback error, switching to Web Speech fallback");
        fallbackToBrowserSpeech(currentVoiceRef.current);
      };
    },
    [playbackRate, fallbackToBrowserSpeech],
  );

  // Play target voice (from cache or Google Voice Engine)
  const playVoice = useCallback(
    async (targetVoice: GoogleVoice, startOffsetSec = 0) => {
      if (!isActiveRef.current) return;
      currentVoiceRef.current = targetVoice;

      // 1. Prefer the author's pre-generated Lens Grove MP3, then the in-memory cache
      const cachedSrc = staticAudioSrc ?? audioCacheRef.current[targetVoice];
      if (cachedSrc) {
        if (!audioRef.current) {
          audioRef.current = new Audio(cachedSrc);
        } else {
          audioRef.current.onerror = null;
          audioRef.current.src = cachedSrc;
        }
        setupAudioElement(audioRef.current);
        audioRef.current.playbackRate = playbackRate;
        if (startOffsetSec > 0) {
          audioRef.current.currentTime = startOffsetSec;
        } else {
          audioRef.current.currentTime = 0;
        }
        try {
          await audioRef.current.play();
          if (!isActiveRef.current) {
            stopAllPlayback();
            return;
          }
          setIsPlaying(true);
          setStatusMessage(null);
        } catch (err) {
          if (!isActiveRef.current) return;
          console.warn("Cached audio playback failed:", err);
          fallbackToBrowserSpeech(targetVoice);
        }
        return;
      }

      // 2. Fetch synthesized narration from Google Voice Engine
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setStatusMessage(
        `Synthesizing narration with ${targetVoice === "Puck" ? "Adam (Puck)" : "Aoede"}...`,
      );

      try {
        const res = await fetch(
          `/api/posts/${encodeURIComponent(slug)}/audio?voice=${encodeURIComponent(targetVoice)}`,
          { signal: controller.signal },
        );

        if (!isActiveRef.current || controller.signal.aborted) {
          return;
        }

        if (!res.ok) {
          throw new Error(`Audio route returned HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          audioBase64?: string;
          audioUrl?: string;
          mimeType?: string;
          provider?: string;
          fallbackToLocalWebSpeech?: boolean;
          error?: string;
        };

        if (!isActiveRef.current || controller.signal.aborted) {
          return;
        }

        const audioSrc =
          data.audioUrl ||
          (data.audioBase64
            ? `data:${data.mimeType || "audio/mp3"};base64,${data.audioBase64}`
            : null);

        if (audioSrc) {
          audioCacheRef.current[targetVoice] = audioSrc;

          // Only proceed if user hasn't switched away while fetching
          if (currentVoiceRef.current === targetVoice && isActiveRef.current) {
            if (!audioRef.current) {
              audioRef.current = new Audio(audioSrc);
            } else {
              audioRef.current.onerror = null;
              audioRef.current.src = audioSrc;
            }

            setupAudioElement(audioRef.current);
            audioRef.current.playbackRate = playbackRate;
            if (startOffsetSec > 0) {
              audioRef.current.currentTime = startOffsetSec;
            } else {
              audioRef.current.currentTime = 0;
            }
            await audioRef.current.play();
            if (!isActiveRef.current || controller.signal.aborted) {
              stopAllPlayback();
              return;
            }
            setIsPlaying(true);
            setStatusMessage(null);
          }
        } else {
          fallbackToBrowserSpeech(targetVoice);
        }
      } catch (err) {
        if (!isActiveRef.current || controller.signal.aborted) {
          return;
        }
        console.warn("Google Voice synthesis unavailable, falling back to Web Speech:", err);
        fallbackToBrowserSpeech(targetVoice);
      } finally {
        if (isActiveRef.current && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [slug, playbackRate, fallbackToBrowserSpeech, setupAudioElement, stopAllPlayback, staticAudioSrc],
  );

  // Toggle play/pause
  const handleTogglePlay = useCallback(async () => {
    isActiveRef.current = true;

    // 1. If currently playing, pause
    if (isPlaying) {
      if (useBrowserSpeech) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.pause();
        }
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      return;
    }

    // 2. If using browser speech fallback
    if (useBrowserSpeech) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          setIsPlaying(true);
        } else {
          fallbackToBrowserSpeech(voice);
        }
      }
      return;
    }

    // 3. If audio is already loaded FOR CURRENT VOICE and paused, resume playback
    if (
      audioRef.current &&
      audioRef.current.src &&
      currentVoiceRef.current === voice &&
      audioRef.current.currentTime > 0 &&
      !audioRef.current.ended
    ) {
      audioRef.current.playbackRate = playbackRate;
      void audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    // 4. Otherwise start playback for current voice
    await playVoice(voice, 0);
  }, [
    isPlaying,
    useBrowserSpeech,
    voice,
    playbackRate,
    fallbackToBrowserSpeech,
    playVoice,
  ]);

  // Handle speed change (1x -> 1.25x -> 1.5x)
  const handleSpeedToggle = () => {
    const nextRate: 1 | 1.25 | 1.5 =
      playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : 1;
    setPlaybackRate(nextRate);

    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }

    if (useBrowserSpeech && isPlaying && typeof window !== "undefined") {
      window.speechSynthesis.cancel();
      fallbackToBrowserSpeech(voice);
    }
  };

  // Switch voice between Puck (Adam) and Aoede
  const handleVoiceToggle = useCallback(async () => {
    const nextVoice: GoogleVoice = voice === "Puck" ? "Aoede" : "Puck";
    setVoice(nextVoice);
    currentVoiceRef.current = nextVoice;

    if (useBrowserSpeech) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        if (isPlaying) {
          fallbackToBrowserSpeech(nextVoice);
        }
      }
      return;
    }

    // If currently playing, seamlessly switch to next voice and resume at same position
    if (isPlaying) {
      const resumeTime = audioRef.current?.currentTime || currentTime || 0;
      if (audioRef.current) {
        audioRef.current.pause();
      }
      await playVoice(nextVoice, resumeTime);
    } else {
      // If paused or idle, cue the next voice so pressing play starts the new voice
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        const cached = audioCacheRef.current[nextVoice];
        if (cached) {
          audioRef.current.src = cached;
          audioRef.current.load();
        }
      }
      setCurrentTime(0);
    }
  }, [
    voice,
    useBrowserSpeech,
    isPlaying,
    currentTime,
    fallbackToBrowserSpeech,
    playVoice,
  ]);

  // Scrubbable timeline seek handler
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = ratio * duration;

    setCurrentTime(seekTime);
    if (audioRef.current && !useBrowserSpeech) {
      audioRef.current.currentTime = seekTime;
    }
  };

  const formatSeconds = (sec: number) => {
    const safeSec = Math.max(0, Math.floor(sec));
    const mins = Math.floor(safeSec / 60);
    const remainder = safeSec % 60;
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
                ? "Synthesizing audio narration"
                : isPlaying
                  ? "Pause audio narration"
                  : "Play audio narration with Google Voice"
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
              ) : useBrowserSpeech ? (
                `Browser Speech • ~${listenMinutes} min listen`
              ) : staticAudioSrc ? (
                `Narrated by ${narratorName} • ~${listenMinutes} min listen`
              ) : (
                `Google Voice (${voice === "Puck" ? "Adam" : "Aoede"}) • ~${listenMinutes} min listen`
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice selector toggle (only for live synthesis; pre-generated audio uses the author's voice) */}
          {staticAudioSrc ? null : (
            <button
              type="button"
              onClick={handleVoiceToggle}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
              title="Switch Voice (Google Voice Engine)"
            >
              Voice: {voice === "Puck" ? "Adam" : "Aoede"}
            </button>
          )}

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

      {/* Scrubbable Progress Bar */}
      <div
        ref={progressBarRef}
        onClick={handleSeek}
        role="progressbar"
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="mt-3 h-2 w-full cursor-pointer overflow-hidden rounded-full bg-zinc-200 transition hover:h-2.5 dark:bg-zinc-800"
        title="Click to seek"
      >
        <div
          className="h-full bg-zinc-900 transition-all duration-150 dark:bg-zinc-100"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}
