"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSafePrivy } from "@/components/providers/app-providers";
import type {
  StudioAttachmentInput,
  StudioChatMessage,
} from "@/lib/adam/gemini-studio";
import type { AdamIdeaRecord } from "@/lib/adam/ideas";
import type { AdamScheduleRecord } from "@/lib/adam/schedule";
import type { ApprovalQueueItem } from "@/lib/approval/list-queue";
import { htmlToMarkdown } from "@/lib/html/html-to-markdown";
import {
  ensureArticleHtml,
  renderMarkdownToSafeHtml,
} from "@/lib/html/markdown-to-html";
import type { AdminPostRecord } from "@/lib/posts/manage-posts";
import {
  PAST_ISSUE_BANNERS,
  resolvePostCoverImage,
} from "@/lib/posts/post-cover-image";

export type StudioTab = "chat" | "ideas" | "posts" | "approvals" | "schedule";
type VoiceEngineMode = "google" | "browser";
type IdeaEditorMode = "write" | "preview";
type PostEditorMode = "markdown" | "html" | "preview";

type ClientAttachment = StudioAttachmentInput & {
  id: string;
  previewUrl?: string;
};

type ChatThreadSummary = {
  id: string;
  title: string;
  summary?: string | null;
  updatedAt: number;
  createdAt: number;
};

type BrowserSpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getBrowserSpeechRecognitionCtor():
  | (new () => BrowserSpeechRecognitionInstance)
  | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const TEXT_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/ld+json",
  "application/xml",
];

function isTextFile(file: File): boolean {
  if (TEXT_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return true;
  }
  return /\.(txt|md|mdx|csv|json|yaml|yml|html|xml)$/i.test(file.name);
}

async function readFileAsAttachment(file: File): Promise<ClientAttachment> {
  const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const mimeType = file.type || "application/octet-stream";

  if (isTextFile(file)) {
    const textContent = await file.text();
    return {
      id,
      name: file.name,
      mimeType: file.type || "text/plain",
      sizeBytes: file.size,
      textContent: textContent.slice(0, 30000),
    };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64Data = btoa(binary);
  const previewUrl = mimeType.startsWith("image/")
    ? URL.createObjectURL(file)
    : undefined;

  return {
    id,
    name: file.name,
    mimeType,
    sizeBytes: file.size,
    base64Data,
    previewUrl,
  };
}

const STUDIO_TOKEN_STORAGE_KEY = "dear_creative_studio_token";

const SCHEDULE_PRESETS = [
  { label: "Every Monday at 9:00 AM", cron: "0 9 * * 1" },
  { label: "Every Monday & Thursday at 9:00 AM", cron: "0 9 * * 1,4" },
  { label: "Every Sunday at 6:00 PM", cron: "0 18 * * 0" },
  { label: "Every Weekday at 8:30 AM", cron: "30 8 * * 1-5" },
] as const;

function formatCronToHuman(cron: string, timezone = "America/New_York"): string {
  const tzMap: Record<string, string> = {
    "America/New_York": "Eastern Time",
    "America/Chicago": "Central Time",
    "America/Denver": "Mountain Time",
    "America/Los_Angeles": "Pacific Time",
    UTC: "UTC",
    "Europe/London": "London (GMT/BST)",
  };
  const tzLabel = tzMap[timezone] || timezone;

  const preset = SCHEDULE_PRESETS.find((p) => p.cron === cron.trim());
  if (preset) {
    return `${preset.label} (${tzLabel})`;
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, , , dow] = parts;
    const hourNum = parseInt(hour, 10);
    const minNum = parseInt(min, 10);
    if (!isNaN(hourNum) && !isNaN(minNum)) {
      const ampm = hourNum >= 12 ? "PM" : "AM";
      const h12 = hourNum % 12 || 12;
      const timeStr = `${h12}:${minNum.toString().padStart(2, "0")} ${ampm}`;
      const dayMap: Record<string, string> = {
        "0": "Sunday",
        "1": "Monday",
        "2": "Tuesday",
        "3": "Wednesday",
        "4": "Thursday",
        "5": "Friday",
        "6": "Saturday",
        "7": "Sunday",
        "1,4": "Monday & Thursday",
        "1-5": "Weekday (Mon–Fri)",
        "*": "day",
      };
      const dayStr = dayMap[dow] ? `Every ${dayMap[dow]}` : `Weekly (days: ${dow})`;
      return `${dayStr} at ${timeStr} (${tzLabel})`;
    }
  }
  return `${cron} (${tzLabel})`;
}

function StudioUploadMenu({
  isOpen,
  onToggle,
  onSelectAccept,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onSelectAccept: (accept: string) => void;
}) {
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        title="Upload images, documents, or reference files"
      >
        <svg
          className="h-3.5 w-3.5 text-zinc-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>Upload</span>
        <svg
          className="h-3 w-3 opacity-60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute bottom-full left-0 mb-2 w-52 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 z-30">
          <button
            type="button"
            onClick={() => onSelectAccept("image/*")}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 text-left transition"
          >
            <span className="text-sm">🖼️</span>
            <span>Images (PNG, JPG, WebP)</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectAccept("application/pdf")}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 text-left transition"
          >
            <span className="text-sm">📄</span>
            <span>Docs (PDF)</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectAccept("text/*,.md,.mdx,.csv,.json")}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 text-left transition"
          >
            <span className="text-sm">📁</span>
            <span>Files (.md, text, code)</span>
          </button>
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          <button
            type="button"
            onClick={() =>
              onSelectAccept(
                "image/*,application/pdf,text/*,.md,.mdx,.csv,.json,audio/*",
              )
            }
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 text-left transition"
          >
            <span className="text-sm">📎</span>
            <span>All Supported Files</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdamStudio({ initialTab = "chat" }: { initialTab?: StudioTab }) {
  const {
    ready,
    authenticated,
    login,
    logout,
    getAccessToken,
    privyConfigured,
    privyTimedOut,
  } = useSafePrivy();
  const [studioToken, setStudioToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STUDIO_TOKEN_STORAGE_KEY)?.trim() ?? "";
  });
  const [studioTokenInput, setStudioTokenInput] = useState("");
  const [showTokenPrompt, setShowTokenPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const slugParam = params.get("slug")?.trim();
      if (
        tabParam === "chat" ||
        tabParam === "ideas" ||
        tabParam === "posts" ||
        tabParam === "approvals" ||
        tabParam === "schedule"
      ) {
        return tabParam;
      }
      if (slugParam) {
        return "posts";
      }
    }
    return initialTab;
  });
  const [adminStatus, setAdminStatus] = useState<{
    checked: boolean;
    isAdmin: boolean;
    userId: string | null;
  }>({ checked: false, isAdmin: false, userId: null });
  const [statusBanner, setStatusBanner] = useState<{
    kind: "info" | "success" | "error";
    text: string;
  } | null>(null);

  // Chat state
  const [messages, setMessages] = useState<StudioChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm Adam, your Dear Creative editorial agent. You can chat with me by text or voice, upload images or reference files, paste rough ideas for me to turn into a newsletter draft, or configure my Monday morning schedule.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatAttachments, setChatAttachments] = useState<ClientAttachment[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatThreads, setChatThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingThreadTitle, setEditingThreadTitle] = useState("");

  // Voice (STT + TTS) state
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineMode>("google");
  const [googleVoiceName, setGoogleVoiceName] = useState("Puck");
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(false);
  const [isRecordingStt, setIsRecordingStt] = useState(false);
  const [isTranscribingStt, setIsTranscribingStt] = useState(false);
  const [speakingMessageIdx, setSpeakingMessageIdx] = useState<number | null>(
    null,
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const browserRecognitionRef =
    useRef<BrowserSpeechRecognitionInstance | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Ideas & Rough Drafts state
  const [ideas, setIdeas] = useState<AdamIdeaRecord[]>([]);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaContent, setIdeaContent] = useState("");
  const [ideaEditorMode, setIdeaEditorMode] =
    useState<IdeaEditorMode>("write");
  const [ideaAttachments, setIdeaAttachments] = useState<ClientAttachment[]>([]);
  const [isSubmittingIdea, setIsSubmittingIdea] = useState(false);
  const [draftingIdeaId, setDraftingIdeaId] = useState<string | null>(null);

  // Approvals Queue state
  const [approvals, setApprovals] = useState<ApprovalQueueItem[]>([]);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [actingOnPostId, setActingOnPostId] = useState<string | null>(null);

  // Published & Draft Posts Editor state
  const [adminPosts, setAdminPosts] = useState<AdminPostRecord[]>([]);
  const [postSearchQuery, setPostSearchQuery] = useState("");
  const [postStatusFilter, setPostStatusFilter] = useState<
    "all" | "published" | "draft"
  >("all");
  const [selectedEditPostId, setSelectedEditPostId] = useState<string | null>(
    null,
  );
  const selectedEditPostIdRef = useRef<string | null>(null);
  const requestedSlugRef = useRef<string | null>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("slug")?.trim() || null
      : null,
  );
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostSlug, setEditPostSlug] = useState("");
  const [editPostStatus, setEditPostStatus] = useState<"published" | "draft">(
    "published",
  );
  const [editPostTeaser, setEditPostTeaser] = useState("");
  const [editPostEmailSubject, setEditPostEmailSubject] = useState("");
  const [editPostMarkdown, setEditPostMarkdown] = useState("");
  const [editPostHtml, setEditPostHtml] = useState("");
  const [editPostBanner, setEditPostBanner] = useState("");
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [editPostMode, setEditPostMode] = useState<PostEditorMode>("markdown");
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [isPolishingPost, setIsPolishingPost] = useState(false);

  // Schedule state
  const [schedule, setSchedule] = useState<AdamScheduleRecord | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleCron, setScheduleCron] = useState("0 9 * * 1");
  const [scheduleTimezone, setScheduleTimezone] = useState("America/New_York");
  const [scheduleInstructions, setScheduleInstructions] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isRunningSchedule, setIsRunningSchedule] = useState(false);

  const chatFileInputId = useId();
  const ideaFileInputId = useId();
  const [chatUploadMenuOpen, setChatUploadMenuOpen] = useState(false);
  const [ideaUploadMenuOpen, setIdeaUploadMenuOpen] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const ideaFileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectChatAccept = (accept: string) => {
    setChatUploadMenuOpen(false);
    if (chatFileInputRef.current) {
      chatFileInputRef.current.accept = accept;
      chatFileInputRef.current.click();
    }
  };

  const handleSelectIdeaAccept = (accept: string) => {
    setIdeaUploadMenuOpen(false);
    if (ideaFileInputRef.current) {
      ideaFileInputRef.current.accept = accept;
      ideaFileInputRef.current.click();
    }
  };

  const selectPostForEditing = useCallback((post: AdminPostRecord) => {
    selectedEditPostIdRef.current = post.id;
    setSelectedEditPostId(post.id);
    setEditPostTitle(post.title);
    setEditPostSlug(post.slug);
    setEditPostStatus(post.status);
    setEditPostTeaser(post.teaserText ?? "");
    setEditPostEmailSubject(post.emailSubject ?? post.title);
    setEditPostMarkdown(
      post.markdown || htmlToMarkdown(post.bodyHtml ?? post.emailHtml ?? ""),
    );
    setEditPostHtml(post.bodyHtml ?? post.emailHtml ?? "");
    const initialBanner = resolvePostCoverImage({
      slug: post.slug,
      title: post.title,
      bodyHtml: post.bodyHtml,
    });
    setEditPostBanner(initialBanner);
  }, []);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      let token: string | null = null;
      if (privyConfigured && authenticated) {
        try {
          token = await getAccessToken();
        } catch {
          token = null;
        }
      }
      if (!token && studioToken.trim()) {
        token = studioToken.trim();
      }
      const headers = new Headers(init.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, { ...init, headers });
    },
    [authenticated, getAccessToken, privyConfigured, studioToken],
  );

  const loadStudioData = useCallback(async () => {
    try {
      const [meRes, ideasRes, approvalsRes, scheduleRes, postsRes, threadsRes] =
        await Promise.all([
          authFetch("/api/admin/me"),
          authFetch("/api/adam/ideas"),
          authFetch("/api/approvals"),
          authFetch("/api/adam/schedule"),
          authFetch("/api/adam/posts"),
          authFetch("/api/adam/chat/threads"),
        ]);

      if (meRes.ok) {
        const me = (await meRes.json()) as { userId: string; isAdmin: boolean };
        setAdminStatus({
          checked: true,
          isAdmin: Boolean(me.isAdmin),
          userId: me.userId,
        });
      } else {
        setAdminStatus({ checked: true, isAdmin: false, userId: null });
      }

      if (ideasRes.ok) {
        const data = (await ideasRes.json()) as { ideas: AdamIdeaRecord[] };
        setIdeas(data.ideas ?? []);
      }

      if (approvalsRes.ok) {
        const data = (await approvalsRes.json()) as {
          approvals: ApprovalQueueItem[];
        };
        setApprovals(data.approvals ?? []);
      }

      if (scheduleRes.ok) {
        const data = (await scheduleRes.json()) as {
          schedule: AdamScheduleRecord;
        };
        if (data.schedule) {
          setSchedule(data.schedule);
          setScheduleEnabled(data.schedule.enabled);
          setScheduleCron(data.schedule.cronExpression);
          setScheduleTimezone(data.schedule.timezone);
          setScheduleInstructions(data.schedule.instructions ?? "");
        }
      }

      if (postsRes.ok) {
        const data = (await postsRes.json()) as { posts: AdminPostRecord[] };
        const loadedPosts = data.posts ?? [];
        setAdminPosts(loadedPosts);
        if (loadedPosts.length > 0) {
          const targetSlug = requestedSlugRef.current;
          if (targetSlug) {
            const match = loadedPosts.find(
              (p) => p.slug === targetSlug || p.id === targetSlug,
            );
            if (match) {
              selectPostForEditing(match);
              requestedSlugRef.current = null;
            }
          } else if (!selectedEditPostIdRef.current) {
            selectPostForEditing(loadedPosts[0]!);
          }
        }
      }

      if (threadsRes.ok) {
        const data = (await threadsRes.json()) as {
          threads: Array<{
            id: string;
            title: string;
            summary?: string | null;
            updatedAt: string | number;
            createdAt: string | number;
          }>;
        };
        const mapped: ChatThreadSummary[] = (data.threads || []).map((t) => ({
          id: t.id,
          title: t.title,
          summary: t.summary,
          updatedAt: new Date(t.updatedAt).getTime(),
          createdAt: new Date(t.createdAt).getTime(),
        }));
        setChatThreads(mapped);
        if (mapped.length > 0 && !activeThreadIdRef.current) {
          activeThreadIdRef.current = mapped[0]!.id;
          setActiveThreadId(mapped[0]!.id);
          try {
            const tRes = await authFetch(
              `/api/adam/chat/threads/${mapped[0]!.id}`,
            );
            if (tRes.ok) {
              const tData = (await tRes.json()) as {
                messages: Array<{
                  role: "user" | "model" | "assistant";
                  content: string;
                  attachments?: ClientAttachment[];
                }>;
              };
              const tMapped: StudioChatMessage[] = (tData.messages || []).map(
                (m) => ({
                  role: m.role === "model" ? "assistant" : "user",
                  content: m.content,
                  attachments: m.attachments,
                }),
              );
              if (tMapped.length > 0) {
                setMessages(tMapped);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      setAdminStatus((prev) => ({ ...prev, checked: true }));
    }
  }, [authFetch, selectPostForEditing]);

  useEffect(() => {
    const hasSession = (ready && authenticated) || Boolean(studioToken.trim());
    if (!hasSession) return;
    const timer = setTimeout(() => {
      void loadStudioData();
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, authenticated, studioToken, loadStudioData]);

  const handleSaveStudioToken = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = studioTokenInput.trim();
      if (!trimmed) return;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STUDIO_TOKEN_STORAGE_KEY, trimmed);
      }
      setStudioToken(trimmed);
      setStudioTokenInput("");
      setShowTokenPrompt(false);
      setStatusBanner({
        kind: "info",
        text: "Studio token saved. Verifying session…",
      });
    },
    [studioTokenInput],
  );

  const handleSignOut = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STUDIO_TOKEN_STORAGE_KEY);
    }
    setStudioToken("");
    setAdminStatus({ checked: false, isAdmin: false, userId: null });
    if (authenticated) {
      void logout();
    }
  }, [authenticated, logout]);

  // Stop any playing speech on unmount
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // --- TTS (Text-to-Speech) ---
  const stopSpeaking = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageIdx(null);
  }, []);

  const speakWithBrowserFallback = useCallback(
    (text: string, messageIndex: number) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setStatusBanner({
          kind: "error",
          text: "Speech synthesis is not supported in this browser.",
        });
        setSpeakingMessageIdx(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingMessageIdx(null);
      utterance.onerror = () => setSpeakingMessageIdx(null);
      setSpeakingMessageIdx(messageIndex);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  const speakText = useCallback(
    async (text: string, messageIndex: number) => {
      if (speakingMessageIdx === messageIndex) {
        stopSpeaking();
        return;
      }
      stopSpeaking();
      setSpeakingMessageIdx(messageIndex);

      if (voiceEngine === "browser") {
        speakWithBrowserFallback(text, messageIndex);
        return;
      }

      try {
        const res = await authFetch("/api/adam/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceName: googleVoiceName,
          }),
        });

        if (!res.ok) {
          speakWithBrowserFallback(text, messageIndex);
          return;
        }

        const data = (await res.json()) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (!data.audioBase64) {
          speakWithBrowserFallback(text, messageIndex);
          return;
        }

        const audio = new Audio(
          `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`,
        );
        activeAudioRef.current = audio;
        audio.onended = () => {
          setSpeakingMessageIdx(null);
          activeAudioRef.current = null;
        };
        audio.onerror = () => {
          activeAudioRef.current = null;
          speakWithBrowserFallback(text, messageIndex);
        };
        await audio.play();
      } catch {
        speakWithBrowserFallback(text, messageIndex);
      }
    },
    [
      authFetch,
      googleVoiceName,
      speakWithBrowserFallback,
      speakingMessageIdx,
      stopSpeaking,
      voiceEngine,
    ],
  );

  // --- STT (Speech-to-Text) ---
  const startBrowserSpeechRecognition = useCallback(
    (onTranscript: (text: string) => void) => {
      const Ctor = getBrowserSpeechRecognitionCtor();
      if (!Ctor) {
        setStatusBanner({
          kind: "error",
          text: "Browser SpeechRecognition is unavailable; use Chrome/Edge/Safari or configure GEMINI_API_KEY for server STT.",
        });
        setIsRecordingStt(false);
        return;
      }
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
        if (transcript) {
          onTranscript(transcript);
        }
      };
      recognition.onerror = () => {
        setIsRecordingStt(false);
      };
      recognition.onend = () => {
        setIsRecordingStt(false);
        browserRecognitionRef.current = null;
      };
      browserRecognitionRef.current = recognition;
      setIsRecordingStt(true);
      recognition.start();
    },
    [],
  );

  const toggleVoiceRecording = useCallback(
    async (target: "chat" | "idea") => {
      const appendTranscript = (transcript: string) => {
        if (target === "chat") {
          setChatInput((prev) =>
            prev.trim() ? `${prev.trim()} ${transcript}` : transcript,
          );
        } else {
          setIdeaContent((prev) =>
            prev.trim() ? `${prev.trim()}\n${transcript}` : transcript,
          );
        }
      };

      if (isRecordingStt) {
        if (browserRecognitionRef.current) {
          browserRecognitionRef.current.stop();
          browserRecognitionRef.current = null;
        }
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
        setIsRecordingStt(false);
        return;
      }

      if (voiceEngine === "browser") {
        startBrowserSpeechRecognition(appendTranscript);
        return;
      }

      // Google Voice mode: record audio via MediaRecorder & send to /api/adam/voice/stt
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        startBrowserSpeechRecognition(appendTranscript);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(recordedChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          if (blob.size === 0) return;

          setIsTranscribingStt(true);
          try {
            const formData = new FormData();
            formData.append("audio", blob, "voice-input.webm");
            const res = await authFetch("/api/adam/voice/stt", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              const data = (await res.json()) as { text?: string };
              if (data.text?.trim()) {
                appendTranscript(data.text.trim());
              }
            } else {
              setStatusBanner({
                kind: "info",
                text: "Google STT key not configured on server; switched to Local Browser Speech Recognition.",
              });
              setVoiceEngine("browser");
              startBrowserSpeechRecognition(appendTranscript);
            }
          } catch {
            startBrowserSpeechRecognition(appendTranscript);
          } finally {
            setIsTranscribingStt(false);
          }
        };

        setIsRecordingStt(true);
        recorder.start();
      } catch {
        startBrowserSpeechRecognition(appendTranscript);
      }
    },
    [authFetch, isRecordingStt, startBrowserSpeechRecognition, voiceEngine],
  );

  // --- File & Image Attachments ---
  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>, target: "chat" | "idea") => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const loaded = await Promise.all(
        Array.from(fileList).map((f) => readFileAsAttachment(f)),
      );
      if (target === "chat") {
        setChatAttachments((prev) => [...prev, ...loaded]);
      } else {
        setIdeaAttachments((prev) => [...prev, ...loaded]);
      }
      e.target.value = "";
    },
    [],
  );

  const removeAttachment = useCallback(
    (id: string, target: "chat" | "idea") => {
      const setter =
        target === "chat" ? setChatAttachments : setIdeaAttachments;
      setter((prev) => {
        const found = prev.find((item) => item.id === id);
        if (found?.previewUrl) {
          URL.revokeObjectURL(found.previewUrl);
        }
        return prev.filter((item) => item.id !== id);
      });
    },
    [],
  );

  // --- Chat Threads Management ---
  const loadChatThreads = useCallback(async () => {
    try {
      const res = await authFetch("/api/adam/chat/threads");
      if (res.ok) {
        const data = (await res.json()) as {
          threads: Array<{
            id: string;
            title: string;
            summary?: string | null;
            updatedAt: string | number;
            createdAt: string | number;
          }>;
        };
        const mapped: ChatThreadSummary[] = (data.threads || []).map((t) => ({
          id: t.id,
          title: t.title,
          summary: t.summary,
          updatedAt: new Date(t.updatedAt).getTime(),
          createdAt: new Date(t.createdAt).getTime(),
        }));
        setChatThreads(mapped);
        return mapped;
      }
    } catch {
      // ignore
    }
    return [];
  }, [authFetch]);

  const selectChatThread = useCallback(
    async (threadId: string) => {
      try {
        activeThreadIdRef.current = threadId;
        setActiveThreadId(threadId);
        const res = await authFetch(`/api/adam/chat/threads/${threadId}`);
        if (res.ok) {
          const data = (await res.json()) as {
            thread: { id: string; title: string };
            messages: Array<{
              id: string;
              role: "user" | "model" | "assistant";
              content: string;
              attachments?: ClientAttachment[];
            }>;
          };
          const mapped: StudioChatMessage[] = (data.messages || []).map(
            (m) => ({
              role: m.role === "model" ? "assistant" : "user",
              content: m.content,
              attachments: m.attachments,
            }),
          );
          if (mapped.length > 0) {
            setMessages(mapped);
          } else {
            setMessages([
              {
                role: "assistant",
                content:
                  "Hi! I'm Adam. This is a fresh conversation thread. What are we brainstorming or drafting today?",
              },
            ]);
          }
        }
      } catch {
        // ignore
      }
    },
    [authFetch],
  );

  const startNewChatThread = useCallback(() => {
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setChatInput("");
    setChatAttachments([]);
    setMessages([
      {
        role: "assistant",
        content:
          "Hi! I'm Adam, your Dear Creative editorial agent. You can chat with me by text or voice, upload images or reference files, paste rough ideas for me to turn into a newsletter draft, or configure my Monday morning schedule.",
      },
    ]);
  }, []);

  const renameChatThread = useCallback(
    async (threadId: string, newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      try {
        const res = await authFetch(`/api/adam/chat/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        if (res.ok) {
          setChatThreads((prev) =>
            prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t)),
          );
          setEditingThreadId(null);
        }
      } catch {
        // ignore
      }
    },
    [authFetch],
  );

  const deleteChatThread = useCallback(
    async (threadId: string) => {
      if (
        !confirm("Are you sure you want to delete this conversation thread?")
      ) {
        return;
      }
      try {
        const res = await authFetch(`/api/adam/chat/threads/${threadId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setChatThreads((prev) => prev.filter((t) => t.id !== threadId));
          if (activeThreadIdRef.current === threadId) {
            startNewChatThread();
          }
        }
      } catch {
        // ignore
      }
    },
    [authFetch, startNewChatThread],
  );

  // --- Send Chat to Adam ---
  const sendChatMessage = useCallback(
    async (options: { forceCreateDraft?: boolean } = {}) => {
      const trimmed = chatInput.trim();
      const promptText =
        trimmed ||
        (options.forceCreateDraft
          ? "Please turn our discussion and attached references into a draft newsletter issue in the approval queue."
          : "");
      if (!promptText && chatAttachments.length === 0) return;

      const userMessage: StudioChatMessage = {
        role: "user",
        content:
          promptText ||
          `Uploaded ${chatAttachments.length} attachment(s) for review.`,
        attachments: chatAttachments.map((a) => ({
          name: a.name,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      const currentAttachments = [...chatAttachments];
      setChatInput("");
      setChatAttachments([]);
      setIsSendingChat(true);
      setStatusBanner(null);

      try {
        const res = await authFetch("/api/adam/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: activeThreadIdRef.current || undefined,
            message: userMessage.content,
            history: messages,
            attachments: currentAttachments,
            forceCreateDraft: Boolean(options.forceCreateDraft),
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          threadId?: string;
          createdDraft?: {
            postId: string;
            approvalId: string;
            slug: string;
            title: string;
          } | null;
          error?: string;
        };

        if (!res.ok) {
          setStatusBanner({
            kind: "error",
            text: data.error || "Could not reach Adam.",
          });
          return;
        }

        if (data.threadId) {
          activeThreadIdRef.current = data.threadId;
          setActiveThreadId(data.threadId);
        }
        void loadChatThreads();

        const replyText =
          data.reply || "I processed your request.";
        const nextMessages: StudioChatMessage[] = [
          ...updatedMessages,
          { role: "assistant", content: replyText },
        ];
        setMessages(nextMessages);

        if (autoSpeakReplies) {
          void speakText(replyText, nextMessages.length - 1);
        }

        if (data.createdDraft) {
          setStatusBanner({
            kind: "success",
            text: `Adam created draft "${data.createdDraft.title}" in the Approval Queue!`,
          });
          await loadStudioData();
        }
      } catch {
        setStatusBanner({
          kind: "error",
          text: "Network error while communicating with Adam.",
        });
      } finally {
        setIsSendingChat(false);
      }
    },
    [
      authFetch,
      autoSpeakReplies,
      chatAttachments,
      chatInput,
      loadChatThreads,
      loadStudioData,
      messages,
      speakText,
    ],
  );

  const handleChatKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendChatMessage();
      }
    },
    [sendChatMessage],
  );

  // --- Submit Idea or Rough Draft ---
  const submitIdea = useCallback(
    async (mode: "draft_now" | "queue") => {
      if (!ideaContent.trim()) {
        setStatusBanner({
          kind: "error",
          text: "Paste an idea or rough draft first.",
        });
        return;
      }

      setIsSubmittingIdea(true);
      setStatusBanner(null);

      try {
        const res = await authFetch("/api/adam/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: ideaTitle.trim() || null,
            rawContent: ideaContent.trim(),
            attachments: ideaAttachments,
            mode,
          }),
        });

        const data = (await res.json()) as {
          outcome?: "queued" | "drafted";
          draft?: { title: string; slug: string };
          error?: string;
        };

        if (!res.ok) {
          setStatusBanner({
            kind: "error",
            text: data.error || "Failed to submit idea.",
          });
          return;
        }

        setIdeaTitle("");
        setIdeaContent("");
        setIdeaAttachments([]);
        await loadStudioData();

        if (data.outcome === "drafted" && data.draft) {
          setStatusBanner({
            kind: "success",
            text: `Adam turned your idea into draft "${data.draft.title}"! Review and approve it in the Approval Queue.`,
          });
          setActiveTab("approvals");
        } else {
          setStatusBanner({
            kind: "success",
            text: "Saved to the Idea Backlog. Adam will use it on the next scheduled run (or click 'Draft Now' anytime).",
          });
        }
      } catch {
        setStatusBanner({
          kind: "error",
          text: "Network error while saving idea.",
        });
      } finally {
        setIsSubmittingIdea(false);
      }
    },
    [authFetch, ideaAttachments, ideaContent, ideaTitle, loadStudioData],
  );

  const handleIdeaAction = useCallback(
    async (
      ideaId: string,
      action: "draft_now" | "update_status",
      status?: "queued" | "archived",
    ) => {
      setDraftingIdeaId(ideaId);
      setStatusBanner(null);
      try {
        const res = await authFetch("/api/adam/ideas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId, action, status }),
        });
        const data = (await res.json()) as {
          draft?: { title: string };
          error?: string;
        };
        if (!res.ok) {
          setStatusBanner({
            kind: "error",
            text: data.error || "Could not update idea.",
          });
          return;
        }
        await loadStudioData();
        if (action === "draft_now" && data.draft) {
          setStatusBanner({
            kind: "success",
            text: `Adam drafted "${data.draft.title}" into the Approval Queue!`,
          });
          setActiveTab("approvals");
        }
      } finally {
        setDraftingIdeaId(null);
      }
    },
    [authFetch, loadStudioData],
  );

  // --- Approve / Reject Post ---
  const handleApprovalDecision = useCallback(
    async (postId: string, decision: "approve" | "reject") => {
      setActingOnPostId(postId);
      setStatusBanner(null);
      try {
        const res = await authFetch(`/api/approvals/${postId}/${decision}`, {
          method: "POST",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setStatusBanner({
            kind: "error",
            text: data.error || `Failed to ${decision} post.`,
          });
          return;
        }
        await loadStudioData();
        setStatusBanner({
          kind: "success",
          text:
            decision === "approve"
              ? "Post approved and published to Dear Creative!"
              : "Draft rejected.",
        });
      } finally {
        setActingOnPostId(null);
      }
    },
    [authFetch, loadStudioData],
  );

  // --- Save & Run Schedule ---
  const handleSaveSchedule = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setIsSavingSchedule(true);
      setStatusBanner(null);
      try {
        const res = await authFetch("/api/adam/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: scheduleEnabled,
            cronExpression: scheduleCron,
            timezone: scheduleTimezone,
            instructions: scheduleInstructions,
          }),
        });
        const data = (await res.json()) as {
          schedule?: AdamScheduleRecord;
          error?: string;
        };
        if (!res.ok) {
          setStatusBanner({
            kind: "error",
            text: data.error || "Failed to update schedule.",
          });
          return;
        }
        if (data.schedule) {
          setSchedule(data.schedule);
        }
        setStatusBanner({
          kind: "success",
          text: "Schedule settings saved.",
        });
      } finally {
        setIsSavingSchedule(false);
      }
    },
    [
      authFetch,
      scheduleCron,
      scheduleEnabled,
      scheduleInstructions,
      scheduleTimezone,
    ],
  );

  const handleRunScheduleNow = useCallback(async () => {
    setIsRunningSchedule(true);
    setStatusBanner(null);
    try {
      const res = await authFetch("/api/adam/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        outcome?: string;
        draft?: { title: string; slug: string } | null;
        error?: string;
      };
      if (!res.ok) {
        setStatusBanner({
          kind: "error",
          text: data.error || "Scheduled draft run failed.",
        });
        return;
      }
      await loadStudioData();
      if (data.draft) {
        setStatusBanner({
          kind: "success",
          text: `Scheduled run complete: Adam drafted "${data.draft.title}" into the Approval Queue!`,
        });
      } else {
        setStatusBanner({
          kind: "info",
          text: `Scheduled run outcome: ${data.outcome ?? "completed"}`,
        });
      }
    } finally {
      setIsRunningSchedule(false);
    }
  }, [authFetch, loadStudioData]);

  // --- Upload Banner Image to Lens Grove ---
  const handleUploadBannerToGrove = useCallback(
    async (file: File) => {
      setIsUploadingBanner(true);
      setStatusBanner(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await authFetch("/api/admin/upload-banner", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string; details?: string };
          throw new Error(err.details || err.error || "Lens Grove upload failed");
        }
        const data = (await res.json()) as { url: string; uri: string };
        const bannerUrl = data.url;
        setEditPostBanner(bannerUrl);
        // Prepend or update banner markdown and html
        setEditPostMarkdown((prev) => {
          const clean = prev.replace(
            /^!\[(?:Banner|Cover|Header)\]\([^\s)]+\)\n\n?/i,
            "",
          );
          return `![Banner](${bannerUrl})\n\n${clean}`;
        });
        setEditPostHtml((prev) => {
          const clean = prev.replace(
            /^<img[^>]*class=["']dear-post-banner["'][^>]*>\s*/i,
            "",
          );
          return `<img src="${bannerUrl}" alt="${editPostTitle}" class="dear-post-banner" />\n${clean}`;
        });
        setStatusBanner({
          kind: "success",
          text: `Banner uploaded to Lens Grove Storage successfully! (${bannerUrl})`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setStatusBanner({
          kind: "error",
          text: `Lens Grove upload failed: ${msg}`,
        });
      } finally {
        setIsUploadingBanner(false);
      }
    },
    [authFetch, editPostTitle],
  );

  // --- Save Edited Post (Published or Draft) ---
  const handleSaveEditedPost = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedEditPostId) {
        setStatusBanner({
          kind: "error",
          text: "Select a post from the list to edit first.",
        });
        return;
      }
      if (!editPostTitle.trim() || !editPostSlug.trim()) {
        setStatusBanner({
          kind: "error",
          text: "Title and slug are required.",
        });
        return;
      }

      setIsSavingPost(true);
      setStatusBanner(null);

      try {
        const payload =
          editPostMode === "html"
            ? {
                title: editPostTitle.trim(),
                slug: editPostSlug.trim(),
                status: editPostStatus,
                teaserText: editPostTeaser.trim() || null,
                emailSubject: editPostEmailSubject.trim() || null,
                bodyHtml: editPostHtml,
                syncEmailWithBody: true,
              }
            : {
                title: editPostTitle.trim(),
                slug: editPostSlug.trim(),
                status: editPostStatus,
                teaserText: editPostTeaser.trim() || null,
                emailSubject: editPostEmailSubject.trim() || null,
                markdown: editPostMarkdown,
                syncEmailWithBody: true,
              };

        const res = await authFetch(`/api/adam/posts/${selectedEditPostId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = (await res.json()) as {
          post?: AdminPostRecord;
          error?: string;
        };

        if (!res.ok || !data.post) {
          setStatusBanner({
            kind: "error",
            text: data.error || "Failed to save post updates.",
          });
          return;
        }

        selectPostForEditing(data.post);
        await loadStudioData();
        setStatusBanner({
          kind: "success",
          text: `Saved changes to "${data.post.title}" (/posts/${data.post.slug})!`,
        });
      } catch {
        setStatusBanner({
          kind: "error",
          text: "Network error while saving post.",
        });
      } finally {
        setIsSavingPost(false);
      }
    },
    [
      authFetch,
      editPostEmailSubject,
      editPostHtml,
      editPostMarkdown,
      editPostMode,
      editPostSlug,
      editPostStatus,
      editPostTeaser,
      editPostTitle,
      loadStudioData,
      selectPostForEditing,
      selectedEditPostId,
    ],
  );

  // --- Ask Adam to Fix Missing Headers & Formatting on Selected Post ---
  const handleAskAdamToFixFormatting = useCallback(async () => {
    const sourceContent =
      editPostMode === "html"
        ? htmlToMarkdown(editPostHtml)
        : editPostMarkdown;

    if (!sourceContent.trim()) {
      setStatusBanner({
        kind: "error",
        text: "Post body is empty — nothing to format.",
      });
      return;
    }

    setIsPolishingPost(true);
    setStatusBanner(null);

    try {
      const prompt = [
        `Please clean up and restore missing section headers (## and ###) and Markdown formatting for this existing Dear Creative post titled "${editPostTitle}".`,
        `Rules:`,
        `- Keep the author's original wording, links, images, and arguments intact.`,
        `- Ensure clear ## and ### section headings where sections transition.`,
        `- Remove any leftover scraping artifacts (like ",postPreview:" or duplicate link card text).`,
        `- Return ONLY the cleaned Markdown body without wrapping it in a code fence and do NOT create a new draft in the queue.`,
        ``,
        sourceContent,
      ].join("\n");

      const res = await authFetch("/api/adam/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          createDraftIfProposed: false,
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        error?: string;
      };

      if (!res.ok || !data.reply) {
        setStatusBanner({
          kind: "error",
          text: data.error || "Adam could not format this post right now.",
        });
        return;
      }

      const cleanedReply = data.reply
        .replace(/^```(?:markdown|md)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      setEditPostMarkdown(cleanedReply);
      setEditPostHtml(ensureArticleHtml(cleanedReply));
      setEditPostMode("markdown");
      setStatusBanner({
        kind: "success",
        text: "Adam restored section headers and cleaned up formatting! Review in Markdown or Preview mode, then click Save.",
      });
    } catch {
      setStatusBanner({
        kind: "error",
        text: "Network error while asking Adam to format post.",
      });
    } finally {
      setIsPolishingPost(false);
    }
  }, [authFetch, editPostHtml, editPostMarkdown, editPostMode, editPostTitle]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-zinc-500">Loading Adam Editorial Studio…</p>
      </div>
    );
  }

  const pendingApprovalsCount = approvals.filter(
    (a) => a.status === "pending",
  ).length;
  const queuedIdeasCount = ideas.filter((i) => i.status === "queued").length;
  const isSignedIn = authenticated || Boolean(studioToken.trim());

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-3xl shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          🔒
        </div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span>Private Editorial Studio &amp; Approvals</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign In to Access Adam Studio
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Adam Studio, Approvals, and post editing are restricted to the owner of Dear Creative.
          Please sign in with Privy or enter your Studio Key to continue.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {privyConfigured && !privyTimedOut ? (
            <button
              type="button"
              onClick={login}
              className="w-full sm:w-auto rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign in with Privy
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setShowTokenPrompt(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span>🔑</span>
            <span>Enter Studio Key</span>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <Link
            href="/"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Return to Public Site
          </Link>
        </div>

        {/* Studio Token Modal Dialog */}
        {showTokenPrompt ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-left backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                <h3 className="text-base font-semibold">
                  Studio Key Authentication
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTokenPrompt(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  ✕
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Enter the <code>ADAM_API_TOKEN</code> configured in your{" "}
                <code>.env.local</code> to access Adam Studio without Privy.
              </p>
              <form
                onSubmit={(e) => {
                  handleSaveStudioToken(e);
                  setShowTokenPrompt(false);
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label
                    htmlFor="modal-studio-token-input-gated"
                    className="mb-1 block text-xs font-medium"
                  >
                    ADAM_API_TOKEN
                  </label>
                  <input
                    id="modal-studio-token-input-gated"
                    type="password"
                    value={studioTokenInput}
                    onChange={(e) => setStudioTokenInput(e.target.value)}
                    placeholder="Paste your secret token here…"
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs focus:border-zinc-900 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTokenPrompt(false)}
                    className="rounded-full px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-zinc-900 px-5 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Save &amp; Continue
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Studio Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              Private Editorial Studio
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Adam — Dear Creative Agent
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Multimodal chat, file &amp; image analysis, Google/local voice (STT
            &amp; TTS), ideas-to-drafts pipeline, published post editor, and
            Monday morning schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isSignedIn ? (
            <>
              {privyConfigured && !privyTimedOut ? (
                <button
                  type="button"
                  onClick={login}
                  className="rounded-full bg-zinc-900 px-5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Sign in with Privy
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setShowTokenPrompt(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                title="Connect with ADAM_API_TOKEN"
              >
                <span>🔑</span>
                <span>Studio Key</span>
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {adminStatus.isAdmin
                  ? studioToken && !authenticated
                    ? "Verified Admin (Studio Key)"
                    : "Verified Admin"
                  : adminStatus.checked
                    ? "Invalid Token / Admin Required"
                    : "Verifying session…"}
              </span>
              <button
                type="button"
                onClick={() => void loadStudioData()}
                className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {/* Studio Token Modal Dialog */}
      {showTokenPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <h3 className="text-base font-semibold">
                Studio Key Authentication
              </h3>
              <button
                type="button"
                onClick={() => setShowTokenPrompt(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Enter the <code>ADAM_API_TOKEN</code> configured in your{" "}
              <code>.env.local</code> to access Adam Studio without Privy.
            </p>
            <form
              onSubmit={(e) => {
                handleSaveStudioToken(e);
                setShowTokenPrompt(false);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label
                  htmlFor="modal-studio-token-input"
                  className="mb-1 block text-xs font-medium"
                >
                  ADAM_API_TOKEN
                </label>
                <input
                  id="modal-studio-token-input"
                  type="password"
                  value={studioTokenInput}
                  onChange={(e) => setStudioTokenInput(e.target.value)}
                  placeholder="Paste your secret token here…"
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs focus:border-zinc-900 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTokenPrompt(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!studioTokenInput.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Connect Studio
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Status Alert Banner */}
      {statusBanner ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-6 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            statusBanner.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
              : statusBanner.kind === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="ml-4 text-xs underline opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Navigation Tabs */}
      <nav
        aria-label="Adam Studio Sections"
        className="mt-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800"
      >
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          aria-current={activeTab === "chat" ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "chat"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
        >
          Chat with Adam
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ideas")}
          aria-current={activeTab === "ideas" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "ideas"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
        >
          <span>Ideas &amp; Rough Drafts</span>
          {queuedIdeasCount > 0 ? (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {queuedIdeasCount} queued
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("posts")}
          aria-current={activeTab === "posts" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "posts"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
        >
          <span>Edit Posts</span>
          {adminPosts.length > 0 ? (
            <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-xs font-semibold">
              {adminPosts.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          aria-current={activeTab === "approvals" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "approvals"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
        >
          <span>Approval Queue</span>
          {pendingApprovalsCount > 0 ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {pendingApprovalsCount} pending
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          aria-current={activeTab === "schedule" ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "schedule"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
        >
          Schedule (Monday Issue)
        </button>
      </nav>

      {/* TAB 1: CHAT + MULTIMODAL UPLOADS + VOICE */}
      {activeTab === "chat" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            {/* Thread Header Bar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800/80">
              <div className="flex max-w-full items-center gap-1.5 overflow-x-auto py-0.5">
                <button
                  type="button"
                  onClick={startNewChatThread}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    activeThreadId === null
                      ? "bg-zinc-900 text-white shadow-2xs dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                  title="Start a fresh conversation thread"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>New Chat</span>
                </button>

                {chatThreads.map((thread) => {
                  const isActive = activeThreadId === thread.id;
                  const isEditing = editingThreadId === thread.id;

                  if (isEditing) {
                    return (
                      <div
                        key={thread.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500 bg-amber-50/50 px-2 py-0.5 dark:bg-amber-950/30"
                      >
                        <input
                          type="text"
                          value={editingThreadTitle}
                          onChange={(e) => setEditingThreadTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void renameChatThread(thread.id, editingThreadTitle);
                            } else if (e.key === "Escape") {
                              setEditingThreadId(null);
                            }
                          }}
                          className="w-28 bg-transparent text-xs font-medium text-zinc-900 outline-hidden dark:text-zinc-100"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void renameChatThread(thread.id, editingThreadTitle)
                          }
                          className="text-[10px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
                        >
                          Save
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={thread.id}
                      className={`group relative inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
                        isActive
                          ? "border-zinc-900 bg-zinc-900 font-medium text-white shadow-2xs dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void selectChatThread(thread.id)}
                        className="max-w-[130px] truncate text-left"
                        title={thread.title}
                      >
                        {thread.title}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingThreadId(thread.id);
                          setEditingThreadTitle(thread.title);
                        }}
                        className={`p-0.5 opacity-0 transition group-hover:opacity-100 hover:text-amber-500 ${
                          isActive
                            ? "text-zinc-400 hover:text-white dark:text-zinc-600 dark:hover:text-zinc-900"
                            : ""
                        }`}
                        title="Rename conversation"
                      >
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteChatThread(thread.id);
                        }}
                        className={`p-0.5 opacity-0 transition group-hover:opacity-100 hover:text-rose-500 ${
                          isActive
                            ? "text-zinc-400 hover:text-white dark:text-zinc-600 dark:hover:text-zinc-900"
                            : ""
                        }`}
                        title="Delete conversation"
                      >
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 text-[11px] text-zinc-400">
                {activeThreadId ? (
                  <span>
                    Thread: <code className="font-mono">{activeThreadId.slice(7, 15)}</code>
                  </span>
                ) : (
                  <span>New Session</span>
                )}
              </div>
            </div>

            {/* Conversation Thread */}
            <div className="max-h-[460px] min-h-[320px] flex-1 space-y-4 overflow-y-auto pr-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs opacity-70">
                      <span className="font-semibold">
                        {msg.role === "user" ? "You" : "Adam"}
                      </span>
                      {msg.role === "assistant" ? (
                        <button
                          type="button"
                          onClick={() => void speakText(msg.content, idx)}
                          aria-pressed={speakingMessageIdx === idx}
                          aria-label={
                            speakingMessageIdx === idx
                              ? "Stop speaking"
                              : "Listen to Adam read this response aloud"
                          }
                          title={
                            speakingMessageIdx === idx
                              ? "Stop speaking"
                              : "Listen (TTS)"
                          }
                          className={`inline-flex items-center gap-1 rounded-md p-1 transition hover:opacity-100 ${
                            speakingMessageIdx === idx
                              ? "text-emerald-600 dark:text-emerald-400 font-medium"
                              : "hover:text-zinc-900 dark:hover:text-zinc-100"
                          }`}
                        >
                          {speakingMessageIdx === idx ? (
                            <>
                              <svg
                                className="h-4 w-4 animate-pulse"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                              </svg>
                              <span className="text-[11px]">Stop</span>
                            </>
                          ) : (
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            </svg>
                          )}
                        </button>
                      ) : null}
                    </div>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none space-y-2"
                      dangerouslySetInnerHTML={{
                        __html:
                          renderMarkdownToSafeHtml(msg.content) || msg.content,
                      }}
                    />
                    {msg.attachments && msg.attachments.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.attachments.map((att, attIdx) => (
                          <span
                            key={attIdx}
                            className="rounded-md bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10"
                          >
                            📎 {att.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Attached Files / Images Preview Bar */}
            {chatAttachments.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                {chatAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {att.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <span aria-hidden="true">📄</span>
                    )}
                    <span className="max-w-[140px] truncate font-medium">
                      {att.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id, "chat")}
                      aria-label={`Remove ${att.name}`}
                      className="ml-1 text-zinc-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Chat Input Box */}
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <label htmlFor="adam-chat-input" className="sr-only">
                Message Adam (Markdown supported)
              </label>
              <textarea
                id="adam-chat-input"
                rows={3}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Talk to Adam in plain text or Markdown, paste notes, or upload images/files… (Press Enter to send, Shift+Enter for new line)"
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-sm focus:border-zinc-900 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Hidden file input controlled by dropdown */}
                  <input
                    ref={chatFileInputRef}
                    id={chatFileInputId}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,text/*,.md,.mdx,.csv,.json,audio/*"
                    onChange={(e) => void handleFileSelect(e, "chat")}
                    className="sr-only"
                  />
                  <StudioUploadMenu
                    isOpen={chatUploadMenuOpen}
                    onToggle={() => setChatUploadMenuOpen((prev) => !prev)}
                    onSelectAccept={handleSelectChatAccept}
                  />

                  {/* Microphone STT Button */}
                  <button
                    type="button"
                    onClick={() => void toggleVoiceRecording("chat")}
                    aria-pressed={isRecordingStt}
                    disabled={isTranscribingStt}
                    className={`inline-flex items-center justify-center rounded-full p-2.5 transition ${
                      isRecordingStt
                        ? "bg-red-600 text-white shadow-md animate-pulse ring-4 ring-red-400/30"
                        : isTranscribingStt
                          ? "border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          : "border border-zinc-300 bg-white text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                    title={
                      isTranscribingStt
                        ? "Transcribing voice…"
                        : isRecordingStt
                          ? "Stop recording"
                          : "Speak to Adam (Voice STT)"
                    }
                  >
                    {isTranscribingStt ? (
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                    ) : isRecordingStt ? (
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                        <span className="text-[11px] font-semibold">Recording…</span>
                      </div>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Draft Issue from Chat */}
                  <button
                    type="button"
                    disabled={isSendingChat}
                    onClick={() =>
                      void sendChatMessage({ forceCreateDraft: true })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    title="Draft issue from chat into approval queue"
                  >
                    <svg
                      className="h-3.5 w-3.5 text-zinc-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>Draft Issue</span>
                  </button>

                  {/* Send Button */}
                  <button
                    type="button"
                    disabled={
                      isSendingChat ||
                      (!chatInput.trim() && chatAttachments.length === 0)
                    }
                    onClick={() => void sendChatMessage()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    title="Send message (Enter)"
                  >
                    {isSendingChat ? (
                      <span>Sending…</span>
                    ) : (
                      <>
                        <span>Send</span>
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Voice & Multimodal Settings Sidebar */}
          <aside className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <div>
              <h2 className="text-base font-semibold">Voice &amp; Audio</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure Adam&apos;s spoken replies and persona.
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="voice-engine-select"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Voice Engine
              </label>
              <select
                id="voice-engine-select"
                value={voiceEngine}
                onChange={(e) =>
                  setVoiceEngine(e.target.value as VoiceEngineMode)
                }
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="google">Google Voice (Gemini STT &amp; TTS)</option>
                <option value="browser">Browser Voice (Web Speech)</option>
              </select>
            </div>

            {voiceEngine === "google" ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="google-voice-persona"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Adam&apos;s Persona
                </label>
                <select
                  id="google-voice-persona"
                  value={googleVoiceName}
                  onChange={(e) => setGoogleVoiceName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="Puck">Puck (Warm)</option>
                  <option value="Charon">Charon (Editorial)</option>
                  <option value="Fenrir">Fenrir (Crisp)</option>
                  <option value="Aoede">Aoede (Expressive)</option>
                </select>
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <input
                id="auto-speak-toggle"
                type="checkbox"
                checked={autoSpeakReplies}
                onChange={(e) => setAutoSpeakReplies(e.target.checked)}
                className="h-4 w-4 rounded accent-zinc-900"
              />
              <label
                htmlFor="auto-speak-toggle"
                className="text-xs text-zinc-700 dark:text-zinc-300"
              >
                Speak Adam&apos;s replies aloud (TTS)
              </label>
            </div>

            <div className="border-t border-zinc-200 pt-3 text-[11px] text-zinc-400 dark:border-zinc-800">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">
                Accepted Uploads:
              </span>{" "}
              Images (PNG, JPG, WebP) · Docs (PDF) · Text &amp; Markdown
            </div>
          </aside>
        </section>
      ) : null}

      {/* TAB 2: IDEAS & ROUGH DRAFTS */}
      {activeTab === "ideas" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Paste Idea / Rough Draft Composer */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-lg font-semibold">
              Paste an Idea or Rough Draft (Markdown Supported)
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Write or paste Markdown (`#`, `**bold**`, `- lists`, `&gt; quotes`,
              `[links](https://...)`). Adam will turn it into a formatted Dear
              Creative issue in your Approval Queue, or queue it for Monday
              morning.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="idea-title-input"
                  className="block text-xs font-medium"
                >
                  Working Title (optional)
                </label>
                <input
                  id="idea-title-input"
                  type="text"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="e.g. Why independent creators own the next decade"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIdeaEditorMode("write")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        ideaEditorMode === "write"
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      Write Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdeaEditorMode("preview")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        ideaEditorMode === "preview"
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      Live Preview
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void toggleVoiceRecording("idea")}
                    className="text-xs font-medium underline"
                  >
                    {isRecordingStt
                      ? "⏹ Stop Dictation"
                      : "🎤 Dictate with Voice"}
                  </button>
                </div>

                {/* Quick Markdown Formatting Toolbar */}
                {ideaEditorMode === "write" ? (
                  <div className="mt-2 flex flex-wrap gap-1 rounded-t-xl border border-b-0 border-zinc-300 bg-zinc-100 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev}\n## Section Heading\n`)
                      }
                      className="rounded px-2 py-0.5 font-mono hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev}\n### Subheading\n`)
                      }
                      className="rounded px-2 py-0.5 font-mono hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      H3
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev} **bold** `)
                      }
                      className="rounded px-2 py-0.5 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev} *italic* `)
                      }
                      className="rounded px-2 py-0.5 italic hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev}\n> Key quote\n`)
                      }
                      className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      &ldquo;Quote&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev}\n- List item\n`)
                      }
                      className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      • List
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent(
                          (prev) => `${prev} [link text](https://example.com) `,
                        )
                      }
                      className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      🔗 Link
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent(
                          (prev) => `${prev} [button: Read More →](https://creativeplatform.xyz) `,
                        )
                      }
                      className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      title="Insert Button"
                    >
                      🔘 Button
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent(
                          (prev) => `${prev} [share: Share this Issue ↗](https://twitter.com/intent/tweet?text=Check%20out%20this%20issue%20of%20Dear%20Creative) `,
                        )
                      }
                      className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      title="Insert Share Button"
                    >
                      📢 Share
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent(
                          (prev) => `${prev} [subscribe: Subscribe to Dear Creative →](/#subscribe) `,
                        )
                      }
                      className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      title="Insert Subscribe Button"
                    >
                      ✉️ Subscribe
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdeaContent((prev) => `${prev}\n\`\`\`\ncode\n\`\`\`\n`)
                      }
                      className="rounded px-2 py-0.5 font-mono hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {"</>"}
                    </button>
                  </div>
                ) : null}

                {ideaEditorMode === "write" ? (
                  <>
                    <label htmlFor="idea-body-input" className="sr-only">
                      Idea, Outline, or Rough Draft (Markdown)
                    </label>
                    <textarea
                      id="idea-body-input"
                      rows={8}
                      value={ideaContent}
                      onChange={(e) => setIdeaContent(e.target.value)}
                      placeholder="Write or paste Markdown (# Headings, **bold**, - bullet points, > quotes, [links](https://...))…"
                      className="w-full rounded-b-xl border border-zinc-300 bg-zinc-50 p-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </>
                ) : (
                  <div
                    className="prose prose-sm dark:prose-invert mt-2 min-h-[200px] max-w-none rounded-xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950"
                    dangerouslySetInnerHTML={{
                      __html:
                        renderMarkdownToSafeHtml(ideaContent) ||
                        "<p><em>Nothing to preview yet — switch to Write Markdown to add content.</em></p>",
                    }}
                  />
                )}
              </div>

              {/* Idea Reference Attachments */}
              <div>
                <input
                  id={ideaFileInputId}
                  ref={ideaFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,text/*,.md,.mdx,.csv,.json"
                  onChange={(e) => void handleFileSelect(e, "idea")}
                  className="sr-only"
                />
                <StudioUploadMenu
                  isOpen={ideaUploadMenuOpen}
                  onToggle={() => setIdeaUploadMenuOpen((prev) => !prev)}
                  onSelectAccept={handleSelectIdeaAccept}
                />

                {ideaAttachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ideaAttachments.map((att) => (
                      <span
                        key={att.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        📎 {att.name}
                        {att.textContent ? (
                          <button
                            type="button"
                            onClick={() =>
                              setIdeaContent((prev) =>
                                prev.trim()
                                  ? `${prev.trim()}\n\n${att.textContent}`
                                  : (att.textContent ?? ""),
                              )
                            }
                            className="ml-1 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                          >
                            Insert into Editor
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id, "idea")}
                          className="text-zinc-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingIdea || !ideaContent.trim()}
                  onClick={() => void submitIdea("draft_now")}
                  className="rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {isSubmittingIdea
                    ? "Adam is working…"
                    : "✨ Turn Into Post for Approval Now"}
                </button>
                <button
                  type="button"
                  disabled={isSubmittingIdea || !ideaContent.trim()}
                  onClick={() => void submitIdea("queue")}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Save to Backlog (For Monday Schedule)
                </button>
              </div>
            </div>
          </div>

          {/* Saved Ideas Backlog */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-lg font-semibold">Ideas &amp; Drafts Backlog</h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Queued ideas are automatically picked up by Adam on his scheduled
              Monday run, or you can convert any idea immediately.
            </p>

            {ideas.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">
                No ideas saved yet. Paste an idea or rough draft on the left to
                get started.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {ideas.map((idea) => (
                  <li
                    key={idea.id}
                    className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            idea.status === "queued"
                              ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                              : idea.status === "drafted"
                                ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {idea.status}
                        </span>
                        <h3 className="mt-1 font-medium">{idea.title}</h3>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {new Date(idea.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-3 text-xs text-zinc-600 dark:text-zinc-400">
                      {idea.rawContent}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {idea.status === "queued" ? (
                        <>
                          <button
                            type="button"
                            disabled={draftingIdeaId === idea.id}
                            onClick={() =>
                              void handleIdeaAction(idea.id, "draft_now")
                            }
                            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            {draftingIdeaId === idea.id
                              ? "Drafting…"
                              : "Have Adam Draft This Now"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleIdeaAction(
                                idea.id,
                                "update_status",
                                "archived",
                              )
                            }
                            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400"
                          >
                            Archive
                          </button>
                        </>
                      ) : idea.status === "archived" ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleIdeaAction(
                              idea.id,
                              "update_status",
                              "queued",
                            )
                          }
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium"
                        >
                          Re-queue for Schedule
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab("approvals")}
                          className="text-xs font-medium underline"
                        >
                          View in Approval Queue →
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {/* TAB 2.5: EDIT PUBLISHED & DRAFT POSTS */}
      {activeTab === "posts" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Left Column: Post Browser */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Posts &amp; Archive</h2>
              <span className="text-xs text-zinc-500">
                {adminPosts.length} total
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Select any published post or draft to fix missing headers, clean
              formatting, or update its title and body.
            </p>

            <div className="mt-3 space-y-2">
              <input
                type="search"
                value={postSearchQuery}
                onChange={(e) => setPostSearchQuery(e.target.value)}
                placeholder="Search by title or slug…"
                aria-label="Search posts by title or slug"
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <div className="flex gap-1">
                {(["all", "published", "draft"] as const).map((statusOpt) => (
                  <button
                    key={statusOpt}
                    type="button"
                    onClick={() => setPostStatusFilter(statusOpt)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize ${
                      postStatusFilter === statusOpt
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {statusOpt}
                  </button>
                ))}
              </div>
            </div>

            {adminPosts.length === 0 ? (
              <p className="mt-6 text-xs text-zinc-500">
                {authenticated
                  ? "No posts loaded yet."
                  : "Sign in with Privy to load and edit posts."}
              </p>
            ) : (
              <ul className="mt-4 max-h-[600px] space-y-2 overflow-y-auto pr-1">
                {adminPosts
                  .filter((p) => {
                    if (
                      postStatusFilter !== "all" &&
                      p.status !== postStatusFilter
                    ) {
                      return false;
                    }
                    const q = postSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      p.title.toLowerCase().includes(q) ||
                      p.slug.toLowerCase().includes(q)
                    );
                  })
                  .map((post) => {
                    const isSelected = selectedEditPostId === post.id;
                    return (
                      <li key={post.id}>
                        <button
                          type="button"
                          onClick={() => selectPostForEditing(post)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? "border-zinc-900 bg-zinc-100/90 dark:border-zinc-100 dark:bg-zinc-800/80"
                              : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                post.status === "published"
                                  ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                                  : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                              }`}
                            >
                              {post.status}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {post.publishedAt
                                ? new Date(
                                    post.publishedAt,
                                  ).toLocaleDateString()
                                : "Draft"}
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs font-semibold">
                            {post.title}
                          </p>
                          <code className="mt-1 block truncate text-[11px] text-zinc-500">
                            /posts/{post.slug}
                          </code>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          {/* Right Column: Post Editor */}
          <form
            onSubmit={(e) => void handleSaveEditedPost(e)}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedEditPostId ? "Edit Post" : "Select a Post to Edit"}
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Edit in Markdown or HTML, restore missing section headers
                  (H2/H3), preview live, and save directly to Dear Creative.
                </p>
              </div>
              {editPostSlug ? (
                <Link
                  href={`/posts/${editPostSlug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-3.5 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  View Post Page ↗
                </Link>
              ) : null}
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="edit-post-title"
                    className="block text-xs font-medium"
                  >
                    Post Title
                  </label>
                  <input
                    id="edit-post-title"
                    type="text"
                    required
                    value={editPostTitle}
                    onChange={(e) => setEditPostTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-post-status"
                    className="block text-xs font-medium"
                  >
                    Status
                  </label>
                  <select
                    id="edit-post-status"
                    value={editPostStatus}
                    onChange={(e) =>
                      setEditPostStatus(
                        e.target.value === "draft" ? "draft" : "published",
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-post-slug"
                    className="block text-xs font-medium"
                  >
                    URL Slug
                  </label>
                  <input
                    id="edit-post-slug"
                    type="text"
                    required
                    value={editPostSlug}
                    onChange={(e) => setEditPostSlug(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-post-subject"
                    className="block text-xs font-medium"
                  >
                    Email Subject
                  </label>
                  <input
                    id="edit-post-subject"
                    type="text"
                    value={editPostEmailSubject}
                    onChange={(e) => setEditPostEmailSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-post-teaser"
                  className="block text-xs font-medium"
                >
                  Subtitle / Teaser Excerpt
                </label>
                <input
                  id="edit-post-teaser"
                  type="text"
                  value={editPostTeaser}
                  onChange={(e) => setEditPostTeaser(e.target.value)}
                  placeholder="Short subtitle shown under the title and on the posts index…"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>

              {/* Post Banner & Thumbnail (Lens Grove) */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      <span>Post Banner &amp; Thumbnail</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        Lens Grove Storage
                      </span>
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Upload to decentralized Lens Grove Drive/Storage or enter an image URL. This image acts as the square thumbnail in the feed and hero banner on the article.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={bannerFileInputRef}
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleUploadBannerToGrove(file);
                        }
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={isUploadingBanner || !selectedEditPostId}
                      onClick={() => bannerFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span>☁️</span>
                      <span>
                        {isUploadingBanner
                          ? "Uploading to Grove…"
                          : "Upload Banner (Lens Grove)"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid items-center gap-4 sm:grid-cols-4">
                  {/* Square Thumbnail Preview */}
                  <div className="flex flex-col items-center gap-1 sm:items-start">
                    <span className="text-[10px] font-medium text-zinc-400">
                      Thumbnail (1:1)
                    </span>
                    <div className="relative aspect-square h-20 w-20 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 sm:h-24 sm:w-24 dark:border-zinc-800 dark:bg-zinc-900">
                      {editPostBanner ? (
                        <img
                          src={editPostBanner}
                          alt="Thumbnail preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-zinc-400">
                          Square Thumbnail
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hero Banner Preview & URL Input */}
                  <div className="space-y-2 sm:col-span-3">
                    <div className="relative aspect-[21/9] max-h-36 w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                      {editPostBanner ? (
                        <img
                          src={editPostBanner}
                          alt="Hero banner preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                          Widescreen Hero Banner
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editPostBanner}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setEditPostBanner(val);
                          if (val) {
                            setEditPostMarkdown((prev) => {
                              const clean = prev.replace(
                                /^!\[(?:Banner|Cover|Header)\]\([^\s)]+\)\n\n?/i,
                                "",
                              );
                              return `![Banner](${val})\n\n${clean}`;
                            });
                          }
                        }}
                        placeholder="https://api.grove.storage/… or image URL"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs text-zinc-800 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                      />
                      {editPostBanner ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditPostBanner("");
                            setEditPostMarkdown((prev) =>
                              prev.replace(
                                /^!\[(?:Banner|Cover|Header)\]\([^\s)]+\)\n\n?/i,
                                "",
                              ),
                            );
                            setEditPostHtml((prev) =>
                              prev.replace(
                                /^<img[^>]*class=["']dear-post-banner["'][^>]*>\s*/i,
                                "",
                              ),
                            );
                          }}
                          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                          title="Reset Banner"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-2.5">
                      <p className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Or pick from historic <em>Dear Creative</em> banner editions:
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {PAST_ISSUE_BANNERS.map((banner) => {
                          const isSelected = editPostBanner === banner.src;
                          return (
                            <button
                              key={banner.slug}
                              type="button"
                              onClick={() => {
                                setEditPostBanner(banner.src);
                                setEditPostMarkdown((prev) => {
                                  const clean = prev.replace(
                                    /^!\[(?:Banner|Cover|Header)\]\([^\s)]+\)\n\n?/i,
                                    "",
                                  );
                                  return `![Banner](${banner.src})\n\n${clean}`;
                                });
                                setEditPostHtml((prev) => {
                                  const clean = prev.replace(
                                    /^<img[^>]*class=["']dear-post-banner["'][^>]*>\s*/i,
                                    "",
                                  );
                                  return `<img src="${banner.src}" alt="${banner.alt}" class="dear-post-banner w-full rounded-2xl mb-8 object-cover max-h-[420px]" />\n\n${clean}`;
                                });
                              }}
                              className={`group relative overflow-hidden rounded-md border text-left transition ${
                                isSelected
                                  ? "border-amber-500 ring-2 ring-amber-500/40"
                                  : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                              }`}
                              title={banner.title}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={banner.src}
                                alt={banner.alt}
                                className="h-12 w-full object-cover"
                              />
                              <div className="truncate bg-zinc-950/85 px-1.5 py-1 text-[10px] font-medium text-zinc-200">
                                {banner.title.split("•")[0]?.trim() || banner.slug}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editor Mode & Formatting Toolbar */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                    <button
                      type="button"
                      onClick={() => {
                        if (editPostMode === "html") {
                          setEditPostMarkdown(htmlToMarkdown(editPostHtml));
                        }
                        setEditPostMode("markdown");
                      }}
                      className={`rounded-md px-3 py-1 font-medium ${
                        editPostMode === "markdown"
                          ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      Markdown Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editPostMode !== "html") {
                          setEditPostHtml(ensureArticleHtml(editPostMarkdown));
                        }
                        setEditPostMode("html");
                      }}
                      className={`rounded-md px-3 py-1 font-medium ${
                        editPostMode === "html"
                          ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      HTML Source
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditPostMode("preview")}
                      className={`rounded-md px-3 py-1 font-medium ${
                        editPostMode === "preview"
                          ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      Live Preview
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isPolishingPost || !selectedEditPostId}
                    onClick={() => void handleAskAdamToFixFormatting()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  >
                    {isPolishingPost
                      ? "Adam is fixing headers & formatting…"
                      : "✨ Ask Adam to Restore Headers & Formatting"}
                  </button>
                </div>

                {editPostMode === "markdown" ? (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5 rounded-t-xl border border-b-0 border-zinc-300 bg-zinc-100 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}## Section Heading\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert H2 Header"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}### Subheading\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert H3 Header"
                      >
                        H3
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown((prev) => `${prev} **bold**`)
                        }
                        className="rounded px-2 py-0.5 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Bold"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown((prev) => `${prev} *italic*`)
                        }
                        className="rounded px-2 py-0.5 italic hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Italic"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}> Key quote or takeaway\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Blockquote"
                      >
                        ❝ Quote
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}- List item\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Bullet List"
                      >
                        • List
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev} [Link text](https://creativeplatform.xyz)`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Link"
                      >
                        🔗 Link
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}[button: Explore Now →](https://creativeplatform.xyz)\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Custom Button"
                      >
                        🔘 Button
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}[share: Share on X ↗](https://twitter.com/intent/tweet?text=Check%20out%20this%20issue%20from%20Dear%20Creative)\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Share Button"
                      >
                        📢 Share
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}[subscribe: Subscribe to Dear Creative →](/#subscribe)\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Subscribe Button"
                      >
                        ✉️ Subscribe
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPostMarkdown(
                            (prev) =>
                              `${prev}${prev.endsWith("\n") || !prev ? "" : "\n\n"}---\n\n`,
                          )
                        }
                        className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        title="Insert Divider"
                      >
                        ― Divider
                      </button>
                    </div>
                    <textarea
                      id="edit-post-markdown"
                      aria-label="Post Markdown Content"
                      rows={16}
                      value={editPostMarkdown}
                      onChange={(e) => {
                        setEditPostMarkdown(e.target.value);
                        setEditPostHtml(ensureArticleHtml(e.target.value));
                      }}
                      placeholder="Write or edit post content using Markdown (## Heading, ### Subheading, **bold**, - list, [Link](https://...))…"
                      className="w-full rounded-b-xl border border-zinc-300 bg-zinc-50 p-3.5 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </>
                ) : editPostMode === "html" ? (
                  <textarea
                    id="edit-post-html"
                    aria-label="Post HTML Source"
                    rows={16}
                    value={editPostHtml}
                    onChange={(e) => setEditPostHtml(e.target.value)}
                    placeholder="<p>Dear Creative,</p><h2>Section Heading</h2>..."
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3.5 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
                  />
                ) : (
                  <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950">
                    <header className="mb-6 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                      <h3 className="text-2xl font-semibold tracking-tight">
                        {editPostTitle || "Untitled Post"}
                      </h3>
                      {editPostTeaser ? (
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {editPostTeaser}
                        </p>
                      ) : null}
                    </header>
                    <div
                      className="prose prose-zinc dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html:
                          ensureArticleHtml(
                            editPostMode === "preview"
                              ? editPostMarkdown || editPostHtml
                              : editPostHtml,
                          ) || "<p><em>No content yet.</em></p>",
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingPost || !selectedEditPostId}
                  className="rounded-xl bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSavingPost ? "Saving Changes…" : "Save & Update Post"}
                </button>
                {editPostSlug ? (
                  <span className="text-xs text-zinc-500">
                    Saving immediately revalidates{" "}
                    <code>/posts/{editPostSlug}</code> and <code>/posts</code>.
                  </span>
                ) : null}
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {/* TAB 3: APPROVAL QUEUE */}
      {activeTab === "approvals" ? (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Editorial Approval Queue
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Review drafts created by Adam. Approving a post publishes it to
                Dear Creative and unlocks the 48-hour delivery gate.
              </p>
            </div>
          </div>

          {approvals.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">
              No drafts in the approval queue yet. Ask Adam to draft an issue in
              Chat or paste an idea in Ideas &amp; Rough Drafts.
            </p>
          ) : (
            <ul className="mt-6 space-y-4">
              {approvals.map((item) => {
                const isExpanded = expandedPostId === item.postId;
                return (
                  <li
                    key={item.postId}
                    className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                              item.status === "pending"
                                ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                                : item.status === "approved"
                                  ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {item.status}
                          </span>
                          <code className="text-xs text-zinc-500">
                            /{item.slug}
                          </code>
                          <span className="text-xs text-zinc-400">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="mt-1.5 text-lg font-semibold">
                          {item.title}
                        </h3>
                        {item.teaserText ? (
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            {item.teaserText}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const match = adminPosts.find(
                              (p) => p.id === item.postId || p.slug === item.slug,
                            );
                            if (match) {
                              selectPostForEditing(match);
                            } else {
                              requestedSlugRef.current = item.slug;
                            }
                            setActiveTab("posts");
                          }}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          ✎ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPostId(isExpanded ? null : item.postId)
                          }
                          aria-expanded={isExpanded}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {isExpanded ? "Hide Preview" : "Preview Full Post"}
                        </button>

                        {item.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              disabled={actingOnPostId === item.postId}
                              onClick={() =>
                                void handleApprovalDecision(
                                  item.postId,
                                  "approve",
                                )
                              }
                              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {actingOnPostId === item.postId
                                ? "Approving…"
                                : "Approve & Publish"}
                            </button>
                            <button
                              type="button"
                              disabled={actingOnPostId === item.postId}
                              onClick={() =>
                                void handleApprovalDecision(
                                  item.postId,
                                  "reject",
                                )
                              }
                              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
                            >
                              Reject
                            </button>
                          </>
                        ) : item.status === "approved" ? (
                          <Link
                            href={`/posts/${item.slug}`}
                            className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            View Published Post →
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-xs font-medium text-zinc-500">
                          Email Subject:{" "}
                          <span className="text-zinc-900 dark:text-zinc-100">
                            {item.emailSubject || item.title}
                          </span>
                        </p>
                        <div
                          className="prose prose-sm dark:prose-invert mt-3 max-w-none border-t border-zinc-200 pt-3 dark:border-zinc-800"
                          dangerouslySetInnerHTML={{
                            __html:
                              item.bodyHtml ||
                              item.emailHtml ||
                              "<p><em>No HTML body stored.</em></p>",
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {/* TAB 4: SCHEDULE (REGULAR MONDAY DRAFTING) */}
      {activeTab === "schedule" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(e) => void handleSaveSchedule(e)}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <h2 className="text-lg font-semibold">
              Automated Issue Drafting Schedule
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Configure when Adam automatically drafts the next Dear Creative
              issue into the Approval Queue (default: Every Monday at 9:00 AM).
            </p>

            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <input
                  id="schedule-enabled"
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="h-4 w-4 rounded accent-zinc-900"
                />
                <label
                  htmlFor="schedule-enabled"
                  className="text-sm font-medium"
                >
                  Enable scheduled automatic drafting
                </label>
              </div>

              <div>
                <label
                  htmlFor="schedule-preset"
                  className="block text-xs font-medium"
                >
                  Schedule Preset
                </label>
                <select
                  id="schedule-preset"
                  value={
                    SCHEDULE_PRESETS.some((p) => p.cron === scheduleCron)
                      ? scheduleCron
                      : "custom"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "custom") {
                      setScheduleCron(e.target.value);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {SCHEDULE_PRESETS.map((preset) => (
                    <option key={preset.cron} value={preset.cron}>
                      {preset.label} ({preset.cron})
                    </option>
                  ))}
                  <option value="custom">Custom Cron Expression</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="schedule-cron"
                    className="block text-xs font-medium"
                  >
                    Cron Expression (5-field)
                  </label>
                  <input
                    id="schedule-cron"
                    type="text"
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>

                <div>
                  <label
                    htmlFor="schedule-tz"
                    className="block text-xs font-medium"
                  >
                    Timezone
                  </label>
                  <input
                    id="schedule-tz"
                    type="text"
                    value={scheduleTimezone}
                    onChange={(e) => setScheduleTimezone(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="schedule-instructions"
                  className="block text-xs font-medium"
                >
                  Standing Editorial Instructions for Scheduled Issues
                </label>
                <textarea
                  id="schedule-instructions"
                  rows={4}
                  value={scheduleInstructions}
                  onChange={(e) => setScheduleInstructions(e.target.value)}
                  placeholder="Instructions for tone, recurring sections, or themes when Adam drafts Monday issues…"
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingSchedule}
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isSavingSchedule ? "Saving…" : "Save Schedule Settings"}
              </button>
            </div>
          </form>

          {/* Schedule Status & Manual Trigger */}
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-lg font-semibold">
              Scheduled Run Status &amp; Manual Trigger
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              When triggered (by Cloud Scheduler on Monday mornings or manually
              below), Adam checks your <strong>Ideas Backlog</strong> first. If
              no ideas are queued, he autonomously drafts a fresh issue.
            </p>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs space-y-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-4">
                <span className="text-zinc-500">Current Schedule:</span>
                <div className="text-right">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatCronToHuman(
                      schedule?.cronExpression ?? scheduleCron,
                      schedule?.timezone ?? scheduleTimezone,
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                    {schedule?.cronExpression ?? scheduleCron} ({schedule?.timezone ?? scheduleTimezone})
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Queued Ideas Ready:</span>
                <span className="font-semibold">{queuedIdeasCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Last Run Status:</span>
                <span className="font-semibold uppercase">
                  {schedule?.lastRunStatus ?? "idle"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Last Run Time:</span>
                <span>
                  {schedule?.lastRunAt
                    ? new Date(schedule.lastRunAt).toLocaleString()
                    : "Never run"}
                </span>
              </div>
              {schedule?.lastRunMessage ? (
                <p className="border-t border-zinc-200 pt-2 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  {schedule.lastRunMessage}
                </p>
              ) : null}
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isRunningSchedule}
                onClick={() => void handleRunScheduleNow()}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isRunningSchedule
                  ? "Adam is drafting the scheduled issue…"
                  : "▶ Run Scheduled Issue Draft Now"}
              </button>
            </div>

            <div className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Cloud Scheduler Endpoint:
              </p>
              <code className="mt-1 block rounded bg-zinc-100 p-2 text-[11px] dark:bg-zinc-950">
                POST /api/adam/schedule (Authorization: Bearer $ADAM_API_TOKEN)
              </code>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
