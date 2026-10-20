"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripHtmlTags } from "@/lib/posts/reading-time";

export type GoogleVoice = "Puck" | "Aoede";

type DispatchAudioPlayerProps = {
  slug: string;
  title: string;
  excerpt?: string | null;
  bodyHtml?: string | null;
  listenMinutes?: number;
};

export function DispatchAudioPlayer({
  slug,
  title,
  excerpt,
  bodyHtml,
  listenMinutes = 2,
}: DispatchAudioPlayerProps) {
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
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const plainText = `${title}. ${excerpt ? excerpt + ". " : ""}${stripHtmlTags(bodyHtml ?? "")}`;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Fallback to native Web Speech API
  const fallbackToBrowserSpeech = useCallback(() => {
    setUseBrowserSpeech(true);
    setStatusMessage(null);
    setIsLoading(false);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.rate = playbackRate;
      utterance.onend = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  }, [plainText, playbackRate]);

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
        console.warn("Audio playback error, switching to Web Speech fallback");
        fallbackToBrowserSpeech();
      };
    },
    [playbackRate, fallbackToBrowserSpeech],
  );

  // Toggle play/pause
  const handleTogglePlay = useCallback(async () => {
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
          fallbackToBrowserSpeech();
        }
      }
      return;
    }

    // 3. If audio is already loaded and paused, resume playback
    if (
      audioRef.current &&
      audioRef.current.src &&
      audioRef.current.currentTime > 0 &&
      !audioRef.current.ended
    ) {
      audioRef.current.playbackRate = playbackRate;
      void audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    // 4. Check in-memory audio cache for current voice
    const cachedSrc = audioCacheRef.current[voice];
    if (cachedSrc) {
      if (!audioRef.current) {
        audioRef.current = new Audio(cachedSrc);
      } else {
        audioRef.current.src = cachedSrc;
      }
      setupAudioElement(audioRef.current);
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    // 5. Fetch synthesized narration from Google Voice Engine
    setIsLoading(true);
    setStatusMessage("Synthesizing narration with Google Voice...");

    try {
      const res = await fetch(
        `/api/posts/${encodeURIComponent(slug)}/audio?voice=${encodeURIComponent(voice)}`,
      );

      if (!res.ok) {
        throw new Error(`Audio route returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        provider?: string;
        fallbackToLocalWebSpeech?: boolean;
        error?: string;
      };

      if (data.audioBase64) {
        const audioSrc = `data:${data.mimeType || "audio/mp3"};base64,${data.audioBase64}`;
        audioCacheRef.current[voice] = audioSrc;

        if (!audioRef.current) {
          audioRef.current = new Audio(audioSrc);
        } else {
          audioRef.current.src = audioSrc;
        }

        setupAudioElement(audioRef.current);
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        setIsPlaying(true);
        setStatusMessage(null);
      } else {
        fallbackToBrowserSpeech();
      }
    } catch (err) {
      console.warn("Google Voice synthesis unavailable, falling back to Web Speech:", err);
      fallbackToBrowserSpeech();
    } finally {
      setIsLoading(false);
    }
  }, [
    isPlaying,
    useBrowserSpeech,
    voice,
    slug,
    playbackRate,
    fallbackToBrowserSpeech,
    setupAudioElement,
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
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.rate = nextRate;
      utterance.onend = () => setIsPlaying(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Switch voice between Puck and Aoede
  const handleVoiceToggle = () => {
    const nextVoice: GoogleVoice = voice === "Puck" ? "Aoede" : "Puck";
    setVoice(nextVoice);

    // If currently active, reset and re-cue with the new voice
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

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
              ) : (
                `Google Voice (${voice === "Puck" ? "Adam" : "Aoede"}) • ~${listenMinutes} min listen`
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
            title="Switch Voice (Google Voice Engine)"
          >
            Voice: {voice === "Puck" ? "Adam" : "Aoede"}
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
