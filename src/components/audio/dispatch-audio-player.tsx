"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripHtmlTags } from "@/lib/posts/reading-time";

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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(listenMinutes * 60);
  const [useBrowserSpeech, setUseBrowserSpeech] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const plainText = `${title}. ${excerpt ? excerpt + ". " : ""}${stripHtmlTags(bodyHtml ?? "")}`;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying) {
      if (audioRef.current && !useBrowserSpeech) {
        audioRef.current.pause();
      } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    // Start playing
    if (useBrowserSpeech) {
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
      return;
    }

    if (audioRef.current && audioRef.current.src) {
      audioRef.current.playbackRate = playbackRate;
      void audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    // Fetch synthesized audio from API
    setIsLoading(true);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/audio`);
      if (!res.ok) {
        throw new Error("Audio route error");
      }
      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        fallbackToLocalWebSpeech?: boolean;
      };

      if (data.audioBase64) {
        const audioSrc = `data:${data.mimeType || "audio/mp3"};base64,${data.audioBase64}`;
        if (!audioRef.current) {
          audioRef.current = new Audio(audioSrc);
        } else {
          audioRef.current.src = audioSrc;
        }

        audioRef.current.playbackRate = playbackRate;
        audioRef.current.onloadedmetadata = () => {
          if (audioRef.current?.duration) {
            setDuration(audioRef.current.duration);
          }
        };
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        };
        audioRef.current.onended = () => {
          setIsPlaying(false);
          setCurrentTime(0);
        };

        await audioRef.current.play();
        setIsPlaying(true);
      } else {
        // Fallback to browser speech
        setUseBrowserSpeech(true);
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
      }
    } catch {
      // Fallback to Web Speech API
      setUseBrowserSpeech(true);
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
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, useBrowserSpeech, plainText, playbackRate, slug]);

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
            aria-label={isPlaying ? "Pause audio narration" : "Play audio narration"}
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
              AI Narration by Adam • ~{listenMinutes} min listen
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </span>

          <button
            type="button"
            onClick={handleSpeedToggle}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
