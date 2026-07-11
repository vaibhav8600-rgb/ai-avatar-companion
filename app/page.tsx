"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AvatarStage from "@/components/AvatarStage";
import ChatTranscript from "@/components/ChatTranscript";
import ChatView from "@/components/ChatView";
import SettingsPanel from "@/components/SettingsPanel";
import CameraPanel from "@/components/CameraPanel";
import PermissionSetup from "@/components/PermissionSetup";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import { StatusPill, MiraLogo, BuiltByFooter, Skeleton, type PillStatus } from "@/components/ui";
import { fileToAttachment } from "@/lib/imageAttachment";
import ThemeToggle from "@/components/ui/ThemeToggle";
import VoiceMic from "@/components/voice/VoiceMic";
import CaptionBar from "@/components/voice/CaptionBar";
import ThinkingIndicator from "@/components/voice/ThinkingIndicator";
import OfflineBanner from "@/components/voice/OfflineBanner";
import { useVoiceLevel } from "@/lib/useVoiceLevel";
import { sendChat } from "@/lib/apiClient";
import { useCamera, type CameraFacingMode } from "@/lib/useCamera";
import {
  analyzeImage,
  makeThumbnail,
  buildRecognitionPrompt,
  buildCandidates,
  matchMemory,
} from "@/lib/visionClient";
import {
  saveMemory as saveVisualMemory,
  listMemories,
  searchMemories,
  deleteMemory as deleteVisualMemory,
} from "@/lib/visualMemory";
import { detectVisionIntent } from "@/lib/visionIntentRouter";
import {
  isPermissionsInitialized,
  setPermissionsInitialized,
  queryPermissionState,
  resetPermissions,
} from "@/lib/permissionManager";
import { createRecognizer, isSpeechRecognitionSupported } from "@/lib/speechRecognition";
import {
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
  primeSpeechSynthesis,
} from "@/lib/speechSynthesis";
import { useSimliAvatar } from "@/lib/useSimliAvatar";
import { useGeminiLive } from "@/lib/useGeminiLive";
import { formatMemory } from "@/lib/systemPrompt";
import { decodeToSimliPcm, base64ToUint8 } from "@/lib/audio";
import VoiceModePill from "@/components/voice/VoiceModePill";
import {
  streamServerTts,
  playServerTtsChunks,
  stopServerTts,
  primeTtsAudio,
  isTtsAudioSupported,
  createPcmSink,
  type PcmSink,
} from "@/lib/ttsAudio";
import { splitIntoSpeechChunks } from "@/lib/textChunks";
import { perfStart, perfMark, perfFlush } from "@/lib/perf";
import {
  loadMemory,
  saveMemory,
  loadHistory,
  saveHistory,
  clearHistory,
  clearMemory,
  loadTtsModel,
  saveTtsModel,
  loadGeminiVoice,
  saveGeminiVoice,
  loadKnownPersonRecognition,
  saveKnownPersonRecognition,
  loadLiveVision,
  saveLiveVision,
  loadAutoCaptureVision,
  saveAutoCaptureVision,
  loadCaptions,
  saveCaptions,
  loadHandsFree,
  saveHandsFree,
  loadPreferredCamera,
  exportConversation,
  importConversation,
} from "@/lib/memoryManager";
import type { AvatarState, ChatMessage, UserMemory } from "@/types";

const ASSISTANT_NAME = "Mira"; // mirrors ASSISTANT_NAME default; UI label only

// Trailing silence before a click-to-talk turn auto-finalizes (ms). Lower =
// snappier turns, but too low risks cutting the user off mid-sentence. Tune
// against the latency logs from lib/perf.ts. (Was 1600 — the largest fixed
// per-turn delay; see docs/ARCHITECTURE.md latency notes.)
const LISTEN_SILENCE_MS = 900;

// Stream TTS (Deepgram) and play as audio arrives — first word starts in ~1s
// instead of waiting for the whole clip. Flip to false to fall back to the
// buffered chunk player if streaming ever misbehaves.
const USE_TTS_STREAMING = true;

// Labels are stored as the user said them ("my office laptop"); when Mira
// speaks she says "your office laptop" rather than "your my office laptop".
function spokenLabel(label: string): string {
  return label.replace(/^my\s+/i, "");
}

export default function Page() {
  // ----- core state -----
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interimText, setInterimText] = useState("");
  const [textDraft, setTextDraft] = useState("");
  // Optional image attachment for the voice-screen text box (mirrors the chat
  // composer; analyzed via Mira Vision so her spoken reply can reference it).
  const [textImage, setTextImage] = useState<string | null>(null);
  const [textAttaching, setTextAttaching] = useState(false);
  const textFileRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"call" | "chat">("call");

  // ----- user-configurable settings -----
  const [memory, setMemory] = useState<UserMemory>({});
  const [volume, setVolume] = useState(1);
  const [voiceName, setVoiceName] = useState<string | undefined>(undefined);
  const [pushToTalk, setPushToTalk] = useState(false);
  // Default to the still image + browser voice; live video is opt-in (Settings).
  const [liveAvatarEnabled, setLiveAvatarEnabled] = useState(false);
  // User-selected avatar voice model ("" = Auto/server fallback chain).
  const [ttsModel, setTtsModel] = useState("");
  // User-selected Gemini voice persona ("" = server default).
  const [geminiVoice, setGeminiVoice] = useState("");
  // Show Mira's spoken reply as on-screen captions (accessibility).
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [caption, setCaption] = useState("");
  // Hands-free: keep listening across pauses / auto-listen after a reply.
  const [handsFree, setHandsFree] = useState(false);
  // Network + retry state.
  const [isOnline, setIsOnline] = useState(true);
  const [canRetry, setCanRetry] = useState(false);

  // ----- Mira Vision -----
  const [cameraOpen, setCameraOpen] = useState(false);
  const [visionBusy, setVisionBusy] = useState(false);
  const [knownPersonRecognition, setKnownPersonRecognition] = useState(false);
  const [liveVisionEnabled, setLiveVisionEnabled] = useState(true);
  const [autoCaptureVision, setAutoCaptureVision] = useState(true);
  // Short status text for the camera panel ("Looking now", "I need a label", …)
  const [visionStatus, setVisionStatus] = useState("Camera ready");
  // What the camera last saw, injected into the next chat turn (ref avoids
  // re-renders / dependency churn).
  const pendingVisionContextRef = useRef("");
  // Follow-up the next utterance should answer (label / person name / consent).
  const pendingVisionRef = useRef<
    | null
    | { kind: "object-label"; frame: string }
    | { kind: "person-name"; frame: string }
    | { kind: "person-consent"; frame: string; name: string }
  >(null);
  const camera = useCamera();
  // Centralized permission onboarding.
  const [permissionSetupOpen, setPermissionSetupOpen] = useState(false);
  // Live, closure-safe view of whether the camera is actually streaming.
  const cameraActiveRef = useRef(false);
  useEffect(() => {
    cameraActiveRef.current = cameraOpen && camera.status === "active";
  }, [cameraOpen, camera.status]);

  // ----- refs (don't trigger re-renders) -----
  const recognizerRef = useRef<ReturnType<typeof createRecognizer> | null>(null);
  const wasManualStopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // True once the live avatar has actually started speaking this turn (watchdog).
  const spokeRef = useRef(false);
  // Closure-safe mirror of avatarState for timers/watchdogs.
  const avatarStateRef = useRef<AvatarState>("idle");
  // Stable handle so onEnd can re-arm listening without a dependency cycle.
  const startListeningRef = useRef<() => void>(() => {});
  // Consecutive empty auto-restarts (mobile cutoff guard) — capped.
  const autoRestartCountRef = useRef(0);
  // Last user turn + whether it spoke, for the Retry affordance.
  const retryTextRef = useRef("");
  const lastSpeakRef = useRef(true);
  // Live, closure-safe view of hands-free mode.
  const handsFreeRef = useRef(false);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  const MAX_AUTO_RESTART = 3;

  // ----- live video avatar (Simli) -----
  // Speaking/idle state is driven by the avatar's own audio events. Falls back
  // to the static image + browser speech when Simli isn't configured.
  //
  // Smart auto-switch: when the live stream errors mid-session (e.g. the
  // WebRTC connection drops as the browser grabs the mic), tear it down
  // cleanly so the UI falls back to the still image + server/browser voice —
  // instead of keeping a dead client that looks "ready" but can't speak.
  const liveStopRef = useRef<() => void>(() => {});
  const liveAvatar = useSimliAvatar({
    onSpeaking: () => {
      spokeRef.current = true; // watchdog: she actually started talking
      setAvatarState("speaking");
      perfMark("first-audio");
      perfFlush();
    },
    // Only a real end-of-speech returns us to idle. We must NOT reset from
    // "thinking" here: clear()/barge-in emits an async "silent" that can land
    // during the next turn's "thinking" and would otherwise flicker the label.
    // In Live voice mode with the mic engaged, a finished turn returns to
    // "listening" (continuous conversation), not idle. (Refs are read at event
    // time — they're declared just below this hook.)
    onSilent: () =>
      setAvatarState((s) =>
        s === "speaking"
          ? voiceModeRef.current === "live" && liveEngagedRef.current
            ? "listening"
            : "idle"
          : s,
      ),
    onError: (m) => {
      console.warn("Live avatar:", m);
      liveStopRef.current(); // graceful fallback to the still image
    },
  });
  useEffect(() => {
    liveStopRef.current = liveAvatar.stop;
  }, [liveAvatar.stop]);
  // Live mode is "active" while connecting or streaming — AvatarStage shows a
  // loader until the face actually starts playing.
  const liveActive =
    liveAvatarEnabled && (liveAvatar.status === "connecting" || liveAvatar.status === "ready");
  const liveAvatarSupported = liveAvatar.status !== "unconfigured";
  // Stable method handles for effect/callback dependency lists. The hook
  // memoizes each method, but returns a FRESH object every render — depending
  // on `liveAvatar` itself would re-run consumers per render (the eager
  // connect effect would loop connect/stop).
  const {
    ensureConnected: liveAvatarEnsureConnected,
    speakStream: liveAvatarSpeakStream,
    speakChunks: liveAvatarSpeakChunks,
    clear: liveAvatarClear,
    stop: liveAvatarStop,
  } = liveAvatar;

  // ----- voice pipeline mode: Gemini Live (primary) vs classic (fallback) -----
  // "live"    = realtime Gemini Live WebSocket session (server-side STT/VAD,
  //             native audio out) — attempted first when the server has it
  //             configured (ENABLE_GEMINI_LIVE + GOOGLE_API_KEY).
  // "classic" = the existing Web Speech STT → /api/chat → TTS chain. Always
  //             fully functional; every failure path lands here.
  const [voiceMode, setVoiceMode] = useState<"live" | "classic">("classic");
  const voiceModeRef = useRef<"live" | "classic">("classic");
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);
  // Transient, non-alarming note shown when the pipeline switches mid-call.
  const [voiceModeNotice, setVoiceModeNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!voiceModeNotice) return;
    const t = setTimeout(() => setVoiceModeNotice(null), 6000);
    return () => clearTimeout(t);
  }, [voiceModeNotice]);

  // Still-mode playback sink for Live audio (same Web Audio machinery as the
  // classic tiers — stopServerTts()/barge-in cancels it identically).
  const liveSinkRef = useRef<PcmSink | null>(null);
  // Ordered decode→Simli queue (decode is async; chunks must stay in order).
  const liveSimliChainRef = useRef<Promise<void>>(Promise.resolve());
  // True while the user has the live call running (mic engaged) — decides
  // whether a failover re-opens the classic mic to continue the conversation.
  const liveEngagedRef = useRef(false);
  // Memory snapshot the current Live token was minted with — lets Settings
  // close detect a profile change and update the running session in-band.
  const liveMemoryJsonRef = useRef("");

  const geminiLive = useGeminiLive({
    // Model audio: feed the EXACT same playback code the classic chain uses.
    onAudioChunk: (b64, rate) => {
      if (liveAvatarEnabled && liveAvatar.status === "ready") {
        // Simli connected → decode/resample to 16k and lip-sync, in order.
        liveSimliChainRef.current = liveSimliChainRef.current
          .then(async () => {
            const pcm = await decodeToSimliPcm(b64, rate, 16000);
            liveAvatar.sendPcm(pcm);
          })
          .catch(() => {
            // dropped chunk — Simli's own watchdogs/keepalive cover recovery
          });
        return;
      }
      // Still image → push-based PCM sink (created lazily per model turn).
      let sink = liveSinkRef.current;
      if (!sink) {
        try {
          sink = createPcmSink({
            sampleRate: rate,
            volume,
            onFirstPlay: () => {
              setAvatarState("speaking");
              perfMark("first-audio");
              perfFlush();
            },
          });
        } catch {
          return; // no Web Audio — audio is lost this turn, transcripts still flow
        }
        liveSinkRef.current = sink;
      }
      sink.push(base64ToUint8(b64));
    },
    // Transcripts append to the SAME shared history /api/chat reads, so a
    // mid-call failover hands the classic pipeline full context.
    onUserTranscript: (text) => {
      setInterimText("");
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    onUserTranscriptDelta: (textSoFar) => setInterimText(textSoFar),
    onModelTranscript: (text) => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    onModelTranscriptDelta: (textSoFar) => setCaption(textSoFar),
    onTurnComplete: () => {
      const sink = liveSinkRef.current;
      liveSinkRef.current = null;
      // "thinking" is included for TEXT turns sent into the session (camera
      // mode / text box): they enter via thinking and must settle even if
      // audio never started (e.g. no Web Audio).
      const settle = () =>
        setAvatarState((s) =>
          s === "speaking" || s === "thinking"
            ? liveEngagedRef.current
              ? "listening"
              : "idle"
            : s,
        );
      if (sink) {
        // Let the tail of the audio drain, then settle: back to listening
        // (mic still open — continuous conversation) or idle.
        void sink.end().then(settle);
      } else if (!(liveAvatarEnabled && liveAvatar.status === "ready")) {
        // No sink and not routing to Simli — nothing will emit a playback
        // event, so settle now. (Simli path: its own "silent" event settles.)
        settle();
      }
    },
    onInterrupted: () => {
      // Native barge-in (server VAD): stop playback the same way the classic
      // barge-in does, just triggered by the server event.
      liveSinkRef.current?.stop();
      liveSinkRef.current = null;
      liveAvatar.clear();
      setAvatarState((s) => (s === "speaking" ? "listening" : s));
    },
    // Live tool calls — this is how "remember this as…" SAVES in Live mode.
    // The model decides to call; we do the actual persistence (IndexedDB, same
    // store the classic flows use) and hand back a result it speaks from.
    // People stay consent-gated: the tool is declared objects-only server-side.
    onToolCall: async (name, args) => {
      if (name === "save_visual_memory") {
        const label = String(args.label ?? "").trim();
        const description = String(args.description ?? "").trim();
        if (!label) return { ok: false, error: "missing label" };
        const frame = camera.capture();
        if (!frame) {
          return { ok: false, error: "camera is not active — ask the user to open the camera" };
        }
        try {
          const thumb = await makeThumbnail(frame);
          await saveVisualMemory({
            type: "object",
            label,
            description,
            thumbnailBase64: thumb,
            tags: [],
          });
          return { ok: true, saved: label };
        } catch {
          return { ok: false, error: "saving failed" };
        }
      }
      if (name === "forget_visual_memory") {
        const label = String(args.label ?? "").trim();
        if (!label) return { ok: false, error: "missing label" };
        const all = await listMemories();
        const found =
          all.find((m) => m.label.toLowerCase() === label.toLowerCase()) ||
          (await searchMemories(label))[0];
        if (!found) return { ok: false, error: `nothing saved as "${label}"` };
        await deleteVisualMemory(found.id);
        return { ok: true, forgot: found.label };
      }
      return { ok: false, error: "unknown tool" };
    },
    onFailover: (reason) => {
      console.warn(`[voice] Switched to classic voice mode — ${reason}`);
      liveSinkRef.current?.stop();
      liveSinkRef.current = null;
      const wasEngaged = liveEngagedRef.current;
      liveEngagedRef.current = false;
      setVoiceMode("classic");
      setVoiceModeNotice("Live voice ended — continuing on the classic pipeline");
      setAvatarState((s) => (s === "listening" || s === "speaking" ? "idle" : s));
      // Continue the call seamlessly: re-open the classic mic for the next
      // turn. Context is preserved — the Live transcripts are already in
      // `messages`, so the next /api/chat call knows everything said so far.
      if (wasEngaged) {
        setTimeout(() => startListeningRef.current(), 250);
      }
    },
  });
  // Stable method/state handles for dependency lists (same rationale as the
  // liveAvatar destructure above — the hook object is fresh every render).
  const {
    connect: liveConnect,
    disconnect: liveDisconnect,
    startMic: liveStartMic,
    stopMic: liveStopMic,
    sendText: liveSendText,
    micActive: liveMicActive,
  } = geminiLive;

  // Attempt the Live session eagerly while the call view is open (mirrors the
  // Simli eager-connect pattern) so the first mic press has zero added
  // latency. Any failure settles to classic silently — exactly today's UX.
  // The cleanup tears the session down when leaving the call view; returning
  // re-attempts, which is also the "next call" re-entry point after a
  // failover. Cleanup-based on purpose: React StrictMode double-invokes
  // effects in dev (mount → cleanup → mount), and a run-once ref guard here
  // left the second pass permanently disconnected — classic mode forever.
  useEffect(() => {
    if (viewMode !== "call") return;
    let cancelled = false;
    void (async () => {
      // Read persisted context DIRECTLY from the stores, not from React state:
      // this effect runs on first mount BEFORE the restore-persistence effect
      // has populated `memory`/`messages`, and a token minted with empty
      // context left Live-Mira amnesiac (no user name, no history) for the
      // whole session. localStorage/IndexedDB are always current — the save
      // effects persist on every change.
      const memorySnapshot = loadMemory();
      const historySnapshot = loadHistory();
      let visualMemories: { type: string; label: string; description: string }[] = [];
      try {
        visualMemories = (await listMemories()).map((m) => ({
          type: m.type,
          label: m.label,
          description: m.description,
        }));
      } catch {
        // no visual memories — connect without the catalog
      }
      if (cancelled) return;
      const ok = await liveConnect({
        memory: memorySnapshot,
        history: historySnapshot,
        visualMemories,
      });
      if (ok && !cancelled) {
        liveMemoryJsonRef.current = JSON.stringify(memorySnapshot);
        setVoiceMode("live");
        console.info("[voice] Gemini Live session ready — realtime voice active");
      }
    })();
    return () => {
      cancelled = true;
      liveEngagedRef.current = false;
      liveDisconnect();
      setVoiceMode("classic");
    };
  }, [viewMode, liveConnect, liveDisconnect]);

  // ----- Live Vision: camera frames stream straight into the Live session -----
  // While the camera is open in Live mode, Mira SEES through Gemini Live
  // itself: ~1 fps JPEG frames go over the socket as `realtimeInput.video`,
  // and the live mic keeps working — real speech-to-speech about what's in
  // view, no /api/vision round trip. The classic capture→analyze flow remains
  // the fallback (classic voice mode) and still powers the explicit Teach /
  // recognition memory flows.
  useEffect(() => {
    if (
      !cameraOpen ||
      voiceMode !== "live" ||
      geminiLive.status !== "live" ||
      camera.status !== "active"
    ) {
      return;
    }
    const id = setInterval(() => {
      const frame = camera.capture(); // JPEG data-URL, downscaled
      if (frame) geminiLive.sendVideoFrame(frame);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cameraOpen,
    voiceMode,
    geminiLive.status,
    camera.status,
    camera.capture,
    geminiLive.sendVideoFrame,
  ]);

  // Speak a reply through the browser's built-in voice (fallback path).
  const speakWithBrowser = useCallback(
    (text: string) => {
      if (!isSpeechSynthesisSupported()) {
        setAvatarState("idle");
        return;
      }
      setAvatarState("speaking");
      perfMark("first-audio");
      perfFlush();
      speak({
        text,
        voiceName,
        volume,
        onEnd: () => setAvatarState("idle"),
        onError: () => setAvatarState("idle"),
      });
    },
    [voiceName, volume],
  );

  // Keep a closure-safe mirror of the avatar state for timers/watchdogs, and
  // drive hands-free: when she finishes speaking, re-open the mic automatically.
  // Live voice mode is inherently hands-free (its mic stays open across turns),
  // so the classic Web Speech re-arm must not fire there — it would grab the
  // microphone out from under the Live session.
  useEffect(() => {
    const prev = avatarStateRef.current;
    avatarStateRef.current = avatarState;
    if (
      handsFreeRef.current &&
      prev === "speaking" &&
      avatarState === "idle" &&
      !cameraOpen &&
      voiceModeRef.current !== "live"
    ) {
      autoRestartCountRef.current = 0;
      startListeningRef.current();
    }
  }, [avatarState, cameraOpen]);

  // ----- restore persistence on mount -----
  // `hydrated` gates the save effects below. It must be STATE (not a ref): the
  // save effects' first runs happen in the same effects pass as this restore,
  // BEFORE the restored state has committed — so with no gate they write the
  // initial {}/[]/false defaults over the persisted values. A single prod
  // mount self-healed (this effect captured the real values first), but dev
  // StrictMode's second effects pass read localStorage DURING that clobber
  // window — which minted the Live token with empty memory/history ("she
  // doesn't know my name") and reset toggles on dev reloads. As state, the
  // gate only flips after the restored values are committed, so the saves
  // never see pre-hydration defaults at all.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setMemory(loadMemory());
    setMessages(loadHistory());
    setTtsModel(loadTtsModel());
    setGeminiVoice(loadGeminiVoice());
    setKnownPersonRecognition(loadKnownPersonRecognition());
    setLiveVisionEnabled(loadLiveVision());
    setAutoCaptureVision(loadAutoCaptureVision());
    setCaptionsEnabled(loadCaptions());
    setHandsFree(loadHandsFree());
    setHydrated(true);
  }, []);

  // Track online/offline so we can warn instead of failing silently.
  useEffect(() => {
    if (typeof navigator !== "undefined") setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveKnownPersonRecognition(knownPersonRecognition);
  }, [hydrated, knownPersonRecognition]);

  // First-run permission onboarding: show the setup card unless we've already
  // initialized, or the browser already reports camera+mic as granted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isPermissionsInitialized()) return;
      const state = await queryPermissionState();
      if (cancelled) return;
      if (state === "granted") {
        setPermissionsInitialized(true); // already allowed — no need to onboard
        return;
      }
      setPermissionSetupOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveLiveVision(liveVisionEnabled);
  }, [hydrated, liveVisionEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    saveAutoCaptureVision(autoCaptureVision);
  }, [hydrated, autoCaptureVision]);

  useEffect(() => {
    if (!hydrated) return;
    saveTtsModel(ttsModel);
  }, [hydrated, ttsModel]);

  useEffect(() => {
    if (!hydrated) return;
    saveGeminiVoice(geminiVoice);
  }, [hydrated, geminiVoice]);

  useEffect(() => {
    if (!hydrated) return;
    saveCaptions(captionsEnabled);
  }, [hydrated, captionsEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    saveHandsFree(handsFree);
  }, [hydrated, handsFree]);

  useEffect(() => {
    if (!hydrated) return;
    saveMemory(memory);
  }, [hydrated, memory]);

  useEffect(() => {
    if (!hydrated) return;
    saveHistory(messages);
  }, [hydrated, messages]);

  // Reset error after a short delay so the UI doesn't stay stuck on error.
  // Retriable errors stay until the user acts (so the Retry button remains).
  useEffect(() => {
    if (avatarState !== "error" || canRetry) return;
    const t = setTimeout(() => setAvatarState("idle"), 3500);
    return () => clearTimeout(t);
  }, [avatarState, canRetry]);

  // Connect the live avatar early (so her idle face is already streaming by the
  // time she first speaks) — or tear the stream down when switched to image
  // mode, so we don't keep billing for an unused stream. No-op when Simli
  // isn't configured.
  // Only tear down a session this effect actually started: a stray re-run
  // (remount, dev double-invoke) must never disconnect a healthy stream —
  // the SDK's teardown is noisy and, in dev, its console.error summons the
  // click-blocking Next error overlay.
  const liveStartedRef = useRef(false);
  useEffect(() => {
    if (liveAvatarEnabled && viewMode === "call") {
      liveStartedRef.current = true;
      void liveAvatarEnsureConnected();
    } else if (liveStartedRef.current) {
      // Image mode or text chat — drop the stream so we don't keep billing.
      liveStartedRef.current = false;
      liveAvatarStop();
    }
  }, [liveAvatarEnabled, viewMode, liveAvatarEnsureConnected, liveAvatarStop]);

  // ----- Mira Vision: speak + respond helpers -----
  // Immediately silence any current speech (browser TTS, Gemini TTS audio, and
  // the Simli buffer).
  const interruptSpeech = useCallback(() => {
    stopSpeaking();
    stopServerTts(); // also cancels the Live PcmSink (shared generation token)
    // Drop the (now dead) sink reference — pushing Live audio into a stopped
    // sink is a silent no-op, which would mute the next whole model turn.
    liveSinkRef.current = null;
    liveAvatarClear();
  }, [liveAvatarClear]);

  // THE single voice pipeline used by every reply (chat + all vision flows +
  // errors): interrupt any current speech, then speak via Simli (live mode) or
  // Gemini TTS (still mode), falling back to the browser's Web Speech API if
  // the TTS chain fails. Returns to idle when done.
  const voiceReply = useCallback(
    async (text: string) => {
      interruptSpeech();
      // Caption the reply (shown when captions are enabled).
      setCaption(text);
      // Sentence chunks for the buffered (Gemini) fallback only; the streaming
      // path sends the full text and plays it as it arrives.
      const chunks = splitIntoSpeechChunks(text);

      const live = liveAvatarEnabled ? await liveAvatarEnsureConnected() : false;
      if (live) {
        // Stay in "thinking" through TTS — Simli emits its own "speaking" event
        // when audio actually starts (wired in the hook).
        spokeRef.current = false;
        let ok = false;
        // Tier 1: stream Deepgram straight into Simli (fastest).
        if (USE_TTS_STREAMING) {
          try {
            await liveAvatarSpeakStream(text);
            ok = true;
          } catch {
            // fall through to buffered Gemini
          }
        }
        // Tier 2: buffered Gemini chunks.
        if (!ok) {
          try {
            await liveAvatarSpeakChunks(chunks, ttsModel, geminiVoice);
            ok = true;
          } catch {
            // fall through to browser
          }
        }
        if (!ok) {
          liveAvatarClear();
          speakWithBrowser(text);
          return;
        }
        // Watchdog: if Simli accepted audio but never signaled "speaking"
        // (lost event / stalled stream), don't leave the UI stuck on Thinking.
        setTimeout(() => {
          if (!spokeRef.current && avatarStateRef.current === "thinking") {
            liveAvatarClear();
            speakWithBrowser(text);
          }
        }, 5000);
        return;
      }

      // Still mode: keep "thinking" until audio actually begins (onFirstPlay).
      if (isTtsAudioSupported()) {
        const onFirstPlay = () => {
          setAvatarState("speaking");
          perfMark("first-audio");
          perfFlush();
        };
        let ok = false;
        // Tier 1: streaming Deepgram.
        if (USE_TTS_STREAMING) {
          try {
            await streamServerTts({ text, volume, onFirstPlay });
            ok = true;
          } catch {
            // fall through to buffered Gemini
          }
        }
        // Tier 2: buffered Gemini chunks.
        if (!ok) {
          try {
            await playServerTtsChunks({
              chunks,
              model: ttsModel,
              voice: geminiVoice,
              volume,
              onFirstPlay,
            });
            ok = true;
          } catch {
            // fall through to browser
          }
        }
        if (ok) {
          // Only settle to idle if we're still the speaking turn (a new mic
          // press / vision command may have moved us on).
          setAvatarState((s) => (s === "speaking" ? "idle" : s));
          return;
        }
      }
      speakWithBrowser(text);
    },
    [
      interruptSpeech,
      liveAvatarEnabled,
      ttsModel,
      geminiVoice,
      volume,
      liveAvatarEnsureConnected,
      liveAvatarSpeakStream,
      liveAvatarSpeakChunks,
      liveAvatarClear,
      speakWithBrowser,
    ],
  );

  /** Add an assistant message and speak it. */
  const speakMiraResponse = useCallback(
    (text: string) => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        },
      ]);
      void voiceReply(text);
    },
    [voiceReply],
  );

  // Smart default: first time, Vision uses the back camera (objects/desk), the
  // person flow uses the front camera. Once the user has switched, their saved
  // preference wins.
  const openCamera = useCallback(
    async (intent: CameraFacingMode = "environment") => {
      primeSpeechSynthesis();
      primeTtsAudio();
      setCameraOpen(true);
      await camera.start({ facingMode: loadPreferredCamera() ?? intent });
    },
    [camera],
  );

  const closeCamera = useCallback(() => {
    camera.stop();
    setCameraOpen(false);
    pendingVisionRef.current = null;
    pendingVisionContextRef.current = "";
    setVisionStatus("Camera ready");
    setAvatarState((s) =>
      ["looking", "recognizing", "learning", "recognized", "uncertain"].includes(s) ? "idle" : s,
    );
  }, [camera]);

  // "Look" — describe the scene and recognize learned objects.
  const handleLook = useCallback(async () => {
    // Live Vision: she already sees the streamed camera frames — ask inside
    // the session (native audio reply, saved-memory catalog in her prompt).
    // Falls through to the classic capture→analyze flow when not live.
    if (
      voiceModeRef.current === "live" &&
      liveSendText(
        "Describe what you can see in the camera right now, briefly and naturally. " +
          "If it matches one of your saved visual memories, say which one.",
      )
    ) {
      setAvatarState("thinking");
      return;
    }
    const frame = camera.capture();
    if (!frame) {
      speakMiraResponse("I couldn't capture the camera image — is the camera on?");
      return;
    }
    setVisionBusy(true);
    setAvatarState("recognizing");
    try {
      const memories = await listMemories();
      const prompt = buildRecognitionPrompt(memories, "object");
      const result = await analyzeImage(
        frame,
        "recognition",
        prompt,
        buildCandidates(memories, "object"),
      );
      pendingVisionContextRef.current = result.description;
      const match = matchMemory(result, memories, "object");
      if (match && match.confidence >= 0.6) {
        setAvatarState("recognized");
        speakMiraResponse(
          `That looks like your ${spokenLabel(match.memory.label)}. ${result.description}`,
        );
      } else if (match) {
        setAvatarState("uncertain");
        speakMiraResponse(
          `I see something similar to your ${spokenLabel(match.memory.label)}, but I'm not fully sure. ${result.description}`,
        );
      } else {
        setAvatarState("idle");
        speakMiraResponse(result.description);
      }
    } catch (e) {
      setAvatarState("idle");
      speakMiraResponse(e instanceof Error ? e.message : "Sorry, I couldn't analyze that.");
    } finally {
      setVisionBusy(false);
    }
  }, [camera, speakMiraResponse, liveSendText]);

  const handleTeachObjectSave = useCallback(
    async (frame: string, label: string, notes: string) => {
      setVisionBusy(true);
      setAvatarState("learning");
      try {
        const result = await analyzeImage(
          frame,
          "object",
          `Describe this object the user calls "${label}".`,
        );
        const thumb = await makeThumbnail(frame);
        const description = [result.description, notes && `Notes: ${notes}`]
          .filter(Boolean)
          .join(" ");
        await saveVisualMemory({
          type: "object",
          label,
          description,
          thumbnailBase64: thumb,
          tags: [],
        });
        // Live mode: confirm inside the session — she speaks with the Live
        // voice AND now knows the item for the rest of this call (new
        // sessions get it from the token's visual-memory catalog).
        if (!(
          voiceModeRef.current === "live" &&
          liveSendText(
            `[System note: via the Teach button, the user just taught you a new visual memory: "${label}" — ${description}. Briefly confirm you'll remember it.]`,
          )
        )) {
          speakMiraResponse(`Got it, I'll remember this as your ${spokenLabel(label)}.`);
        }
      } catch {
        speakMiraResponse("Sorry, I couldn't save that object. Try again?");
      } finally {
        setVisionBusy(false);
        setAvatarState("idle");
      }
    },
    [speakMiraResponse, liveSendText],
  );

  const handleTeachPersonSave = useCallback(
    async (frames: string[], name: string, context: string) => {
      setVisionBusy(true);
      setAvatarState("learning");
      try {
        const thumbs = await Promise.all(frames.map((f) => makeThumbnail(f)));
        const result = await analyzeImage(
          frames[0],
          "person",
          "Describe generic appearance to help re-recognition later. Do not guess identity.",
        );
        const description = [context, result.description].filter(Boolean).join(" — ");
        await saveVisualMemory({
          type: "person",
          label: name,
          description,
          thumbnailBase64: thumbs[0],
          extraThumbnails: thumbs.slice(1),
          consented: true,
        });
        if (!(
          voiceModeRef.current === "live" &&
          liveSendText(
            `[System note: with explicit consent via the Teach Person button, the user just taught you a known person: "${name}"${description ? ` — ${description}` : ""}. Briefly confirm you'll remember them, and mention they can remove this anytime in Settings.]`,
          )
        )) {
          speakMiraResponse(
            `Okay — I've saved ${name} as a known person, with your consent. You can remove this anytime in Settings.`,
          );
        }
      } catch {
        speakMiraResponse("Sorry, I couldn't save that.");
      } finally {
        setVisionBusy(false);
        setAvatarState("idle");
      }
    },
    [speakMiraResponse, liveSendText],
  );

  const handleForget = useCallback(
    async (label: string) => {
      const exact = (await listMemories()).find(
        (m) => m.label.toLowerCase() === label.toLowerCase(),
      );
      const found = exact || (await searchMemories(label))[0];
      if (found) {
        await deleteVisualMemory(found.id);
        speakMiraResponse(`Okay, I've forgotten ${found.label}.`);
      } else {
        speakMiraResponse(`I don't have anything saved as "${label}".`);
      }
    },
    [speakMiraResponse],
  );

  // ----- Live Vision Conversation: route a spoken/typed turn -----
  // Returns "done" if fully handled (skip chat), or "chat" to continue to the
  // normal /api/chat turn (optionally with a freshly-set camera context).
  const routeVisionTurn = useCallback(
    async (transcript: string): Promise<"done" | "chat"> => {
      // Stop any in-progress speech first so she doesn't talk over herself
      // while the frame is captured and analyzed.
      interruptSpeech();

      // 1) Resolve a pending follow-up (label / name / consent) first.
      const pending = pendingVisionRef.current;
      if (pending) {
        pendingVisionRef.current = null;
        const ans = transcript.trim();
        const affirmative =
          /\b(yes|yeah|yep|sure|ok|okay|confirm|do it|please|go ahead|save)\b/i.test(ans);
        if (pending.kind === "object-label") {
          // Keep a leading "my"; only drop a/an/the. Spoken form strips "my".
          const label = ans
            .replace(/[.?!,]+$/g, "")
            .replace(/^(a|an|the)\s+/i, "")
            .trim();
          if (!label) {
            speakMiraResponse("Okay, never mind.");
          } else {
            await handleTeachObjectSave(pending.frame, label, "");
          }
          setVisionStatus("Camera ready");
          return "done";
        }
        if (pending.kind === "person-name") {
          const name = ans.replace(/[.?!,]+$/g, "").trim();
          if (!name) {
            speakMiraResponse("Okay, never mind.");
            setVisionStatus("Camera ready");
            return "done";
          }
          pendingVisionRef.current = { kind: "person-consent", frame: pending.frame, name };
          setVisionStatus("Confirm to save person");
          speakMiraResponse(
            `I can remember known people only with permission. Should I save this person as ${name}?`,
          );
          return "done";
        }
        if (pending.kind === "person-consent") {
          if (affirmative) {
            await handleTeachPersonSave([pending.frame], pending.name, "");
          } else {
            speakMiraResponse("Okay, I won't save them.");
          }
          setVisionStatus("Camera ready");
          return "done";
        }
      }

      // 2) Classify intent.
      const det = detectVisionIntent(transcript);
      if (det.intent === "normal_chat") return "chat";

      // 3) Capture a frame if the intent needs the camera.
      let frame = "";
      if (det.needsCamera) {
        try {
          frame = await camera.captureCurrentCameraFrame();
        } catch (e) {
          speakMiraResponse(e instanceof Error ? e.message : "I can't see right now.");
          return "done";
        }
      }

      switch (det.intent) {
        case "describe_current_view": {
          setVisionStatus("Looking now");
          setAvatarState("looking");
          try {
            const result = await analyzeImage(
              frame,
              "scene",
              "Describe what you see, briefly and naturally.",
            );
            pendingVisionContextRef.current = result.description;
            setVisionStatus("Camera ready");
            return "chat"; // let /api/chat phrase the reply with the camera context
          } catch (err) {
            setAvatarState("idle");
            setVisionStatus("Camera ready");
            speakMiraResponse(
              err instanceof Error ? err.message : "Sorry, I couldn't see clearly.",
            );
            return "done";
          }
        }

        case "recognize_current_view": {
          setVisionStatus("Recognizing");
          setAvatarState("recognizing");
          setVisionBusy(true);
          try {
            const memories = await listMemories();
            const result = await analyzeImage(
              frame,
              "recognition",
              buildRecognitionPrompt(memories, "object"),
              buildCandidates(memories, "object"),
            );
            pendingVisionContextRef.current = result.description;
            const match = matchMemory(result, memories, "object");
            if (match && match.confidence >= 0.6) {
              setAvatarState("recognized");
              speakMiraResponse(`That looks like your ${spokenLabel(match.memory.label)}.`);
            } else if (match) {
              setAvatarState("uncertain");
              speakMiraResponse(
                `It looks similar to your ${spokenLabel(match.memory.label)}, but I'm not fully sure.`,
              );
            } else {
              setAvatarState("idle");
              speakMiraResponse(
                "I don't recognize this yet. You can say “Remember this as…” and I'll save it.",
              );
            }
          } catch {
            setAvatarState("idle");
            speakMiraResponse("Sorry, I couldn't analyze that.");
          } finally {
            setVisionBusy(false);
            setVisionStatus("Camera ready");
          }
          return "done";
        }

        case "remember_current_object": {
          if (!det.label) {
            pendingVisionRef.current = { kind: "object-label", frame };
            setVisionStatus("I need a label");
            speakMiraResponse("What should I remember this as?");
            return "done";
          }
          setVisionStatus("Remembering object");
          await handleTeachObjectSave(frame, det.label, "");
          setVisionStatus("Camera ready");
          return "done";
        }

        case "remember_current_person": {
          if (!det.label) {
            pendingVisionRef.current = { kind: "person-name", frame };
            setVisionStatus("I need a name");
            speakMiraResponse("Sure — what's their name?");
            return "done";
          }
          // Always confirm before saving a person.
          pendingVisionRef.current = { kind: "person-consent", frame, name: det.label };
          setVisionStatus("Confirm to save person");
          speakMiraResponse(
            `I can remember known people only with permission. Should I save this person as ${det.label}?`,
          );
          return "done";
        }

        case "recognize_known_person": {
          if (!knownPersonRecognition) {
            speakMiraResponse(
              "Known-person recognition is off. You can turn it on in Settings → Mira Vision.",
            );
            setVisionStatus("Camera ready");
            return "done";
          }
          setVisionStatus("Recognizing");
          setAvatarState("recognizing");
          setVisionBusy(true);
          try {
            const memories = await listMemories();
            const result = await analyzeImage(
              frame,
              "recognition",
              buildRecognitionPrompt(memories, "person"),
              buildCandidates(memories, "person"),
            );
            pendingVisionContextRef.current = result.description;
            if (result.peopleCount < 1) {
              setAvatarState("idle");
              speakMiraResponse("I don't see a person right now.");
            } else {
              const match = matchMemory(result, memories, "person");
              if (match && match.confidence >= 0.6) {
                setAvatarState("recognized");
                speakMiraResponse(`That looks like ${match.memory.label}.`);
              } else if (match) {
                setAvatarState("uncertain");
                speakMiraResponse(`This might be ${match.memory.label}, but I'm not fully sure.`);
              } else {
                setAvatarState("idle");
                speakMiraResponse("I see a person, but I don't recognize them.");
              }
            }
          } catch {
            setAvatarState("idle");
            speakMiraResponse("Sorry, I couldn't analyze that.");
          } finally {
            setVisionBusy(false);
            setVisionStatus("Camera ready");
          }
          return "done";
        }

        case "forget_visual_memory": {
          if (det.label) {
            await handleForget(det.label);
          } else {
            speakMiraResponse(
              "Which one should I forget? Say its name, like “forget my keyboard.”",
            );
          }
          return "done";
        }

        default:
          return "chat";
      }
    },
    [
      camera,
      knownPersonRecognition,
      handleTeachObjectSave,
      handleTeachPersonSave,
      handleForget,
      speakMiraResponse,
      interruptSpeech,
    ],
  );

  // ----- core flow: send a user turn to the AI -----
  // `speak` is true for the voice call and false for the text chat, which is
  // a quiet, text-only conversation over the same history.
  const sendUserMessage = useCallback(
    async (text: string, opts?: { speak?: boolean; retry?: boolean; image?: string }) => {
      const shouldSpeak = opts?.speak ?? true;
      const trimmed = text.trim();
      const image = opts?.image;
      if (!trimmed && !image) return;
      // Image-only turns get a sensible default question so the reply has intent.
      const content = trimmed || (image ? "What's in this image?" : "");

      // Remember this turn for the Retry affordance, and clear any prior error.
      retryTextRef.current = content;
      lastSpeakRef.current = shouldSpeak;
      setCanRetry(false);

      // On retry the failed user message is still the last entry; don't re-add it.
      const nextMessages = opts?.retry
        ? messages
        : [
            ...messages,
            {
              id: crypto.randomUUID(),
              role: "user",
              content,
              timestamp: new Date().toISOString(),
              ...(image ? { imageBase64: image } : {}),
            } as ChatMessage,
          ];
      if (!opts?.retry) setMessages(nextMessages);
      setInterimText("");

      // A shared image is analyzed via Mira Vision so the reply can reference
      // it; the description is injected as this turn's vision context.
      if (image) {
        setAvatarState("thinking");
        try {
          const result = await analyzeImage(
            image,
            "scene",
            "Describe what's in this image the user shared, briefly and naturally.",
          );
          pendingVisionContextRef.current = result.description;
        } catch {
          // proceed without vision context if analysis fails
        }
      }

      // Live Vision Conversation: when the camera is active and live vision +
      // auto-capture are on, classify the turn and possibly handle it visually.
      if (liveVisionEnabled && autoCaptureVision && cameraActiveRef.current) {
        const outcome = await routeVisionTurn(trimmed);
        if (outcome === "done") return; // Mira already responded by voice
        // "chat" → fall through; a camera-view context may now be set.
      }

      setAvatarState("thinking");

      // Cancel any in-flight request from a previous turn.
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      // Inject (and consume) any pending "what the camera saw" context.
      const visionContext = pendingVisionContextRef.current || undefined;
      pendingVisionContextRef.current = "";

      // Live voice path: while the realtime session is up, spoken turns that
      // arrive as TEXT (camera mode's classic mic — kept classic so the vision
      // intent router still works — and the voice-screen text box) go straight
      // into the Live session. The reply comes back as native audio + a
      // transcript through the same Live callbacks as mic turns, so Mira keeps
      // ONE consistent voice everywhere. Vision context rides along inline.
      // Falls through to the classic /api/chat chain whenever the session
      // can't take the turn (not live, socket busy dying, etc.).
      if (shouldSpeak && voiceModeRef.current === "live") {
        const liveText = visionContext
          ? `(The camera currently sees: ${visionContext})\n${content}`
          : content;
        if (liveSendText(liveText)) return; // reply arrives via Live events
      }

      try {
        const response = await sendChat(
          {
            // Send only the recent window; the server also bounds this.
            messages: nextMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
            memory,
            visionContext,
          },
          abortRef.current.signal,
        );
        perfMark("chat"); // reply received from /api/chat

        const reply = response.reply;
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: new Date().toISOString(),
        };
        setMessages((m) => [...m, assistantMsg]);

        // Text chat: no voice, just settle back to idle.
        if (!shouldSpeak) {
          setAvatarState("idle");
          return;
        }

        // Speak through the single shared pipeline (Simli → browser fallback).
        await voiceReply(reply);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        const msg = offline
          ? "You're offline. Reconnect and try again."
          : err instanceof Error
            ? err.message
            : "Connection failed";
        setErrorMessage(msg);
        setCanRetry(true); // offer a Retry button
        setAvatarState("error");
      }
    },
    [
      messages,
      memory,
      autoCaptureVision,
      liveVisionEnabled,
      routeVisionTurn,
      voiceReply,
      liveSendText,
    ],
  );

  // ----- mic actions -----
  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setErrorMessage(
        "Microphone speech recognition isn't supported in this browser. Type your message instead.",
      );
      setAvatarState("error");
      return;
    }

    // Stop any currently-playing audio so she doesn't talk over the user.
    interruptSpeech();

    // Clear any leftover transcript from the previous turn so the old text
    // doesn't linger on screen until the user speaks again.
    setInterimText("");

    wasManualStopRef.current = false;
    const recognizer = createRecognizer(
      {
        onPartial: (t) => {
          setInterimText(t);
          autoRestartCountRef.current = 0; // real speech — reset the cutoff guard
        },
        onFinal: (t) => {
          setInterimText("");
          autoRestartCountRef.current = 0;
          perfStart(); // begin latency turn at speech-finalize
          // Push to send. The onend handler will then move out of listening.
          void sendUserMessage(t);
        },
        onError: (msg) => {
          if (msg.toLowerCase().includes("not-allowed") || msg.toLowerCase().includes("denied")) {
            setErrorMessage("Microphone permission was denied. You can still type below.");
          } else {
            setErrorMessage(msg);
          }
          setAvatarState("error");
        },
        onEnd: ({ finalized }) => {
          // The engine ended. If it stopped on its own without capturing anything
          // (a mobile silence cutoff) while we still meant to listen, quietly
          // re-arm the mic so the user isn't dropped mid-thought. Capped to avoid
          // an endless restart loop when there's simply no speech.
          const canReArm =
            !finalized &&
            !wasManualStopRef.current &&
            !pushToTalk &&
            autoRestartCountRef.current < MAX_AUTO_RESTART;
          if (canReArm && avatarStateRef.current === "listening") {
            autoRestartCountRef.current++;
            setTimeout(() => {
              if (!wasManualStopRef.current && avatarStateRef.current === "listening") {
                startListeningRef.current();
              }
            }, 300);
            return;
          }
          // Otherwise settle back to idle (if nothing else moved us on).
          setAvatarState((s) => (s === "listening" ? "idle" : s));
        },
      },
      // Click-to-talk: finalize after a short pause so mid-sentence pauses don't
      // cut you off. Push-to-talk: the button release ends the turn (no timer).
      { silenceMs: pushToTalk ? 0 : LISTEN_SILENCE_MS },
    );

    if (!recognizer) {
      setErrorMessage("Speech recognition not available.");
      setAvatarState("error");
      return;
    }
    recognizerRef.current = recognizer;
    setAvatarState("listening");
    try {
      recognizer.start();
    } catch {
      // start() throws if already started; ignore.
    }
  }, [sendUserMessage, interruptSpeech, pushToTalk]);

  // Keep a stable handle for onEnd / hands-free to re-arm listening.
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    wasManualStopRef.current = true;
    try {
      recognizerRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const handleMicPress = useCallback(() => {
    // Unlock mobile speech within this user gesture so the reply can be spoken
    // later (after the async AI call, which is outside any gesture).
    primeSpeechSynthesis();
    primeTtsAudio();
    autoRestartCountRef.current = 0; // fresh manual turn

    // ----- Live voice mode: the mic press toggles the realtime session's mic.
    // This applies in camera mode too — Live Vision streams the frames into
    // the same session, so speech-to-speech works over what the camera sees.
    if (voiceModeRef.current === "live") {
      if (liveMicActive) {
        // End the live conversation turn-taking: close the mic, silence any
        // tail audio, settle to idle. The session stays open for the next press.
        liveEngagedRef.current = false;
        liveStopMic();
        interruptSpeech();
        liveSinkRef.current = null;
        setAvatarState("idle");
      } else {
        interruptSpeech();
        void liveStartMic().then((ok) => {
          if (ok) {
            liveEngagedRef.current = true;
            setAvatarState("listening");
          } else {
            // Mic capture failed (permission / audio graph / dead socket) —
            // fall back to the classic mic for this turn, no dead air.
            console.warn("[voice] Live mic unavailable — using the classic mic");
            startListening();
          }
        });
      }
      return;
    }

    if (pushToTalk) {
      startListening();
    } else {
      if (avatarState === "listening") {
        stopListening();
      } else if (avatarState === "speaking") {
        interruptSpeech();
        setAvatarState("idle");
      } else if (avatarState === "thinking") {
        // Never lock the user out: abort the in-flight turn and listen again.
        abortRef.current?.abort();
        interruptSpeech();
        startListening();
      } else {
        startListening();
      }
    }
  }, [
    avatarState,
    pushToTalk,
    startListening,
    stopListening,
    interruptSpeech,
    liveMicActive,
    liveStartMic,
    liveStopMic,
  ]);

  const handleMicRelease = useCallback(() => {
    if (pushToTalk) {
      stopListening();
    }
  }, [pushToTalk, stopListening]);

  // ----- text fallback (with optional image attachment) -----
  const handleSubmitText = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = textDraft.trim();
      const image = textImage ?? undefined;
      if (!text && !image) return;
      setTextDraft("");
      setTextImage(null);
      // Unlock mobile speech within this gesture before the async reply.
      primeSpeechSynthesis();
      primeTtsAudio();
      interruptSpeech();
      void sendUserMessage(text, { image });
    },
    [textDraft, textImage, sendUserMessage, interruptSpeech],
  );

  const pickTextImage = useCallback(async (file?: File) => {
    setTextAttaching(true);
    try {
      const scaled = await fileToAttachment(file);
      if (scaled) setTextImage(scaled);
    } catch {
      /* ignore unreadable files */
    } finally {
      setTextAttaching(false);
    }
  }, []);

  // ----- stop speaking -----
  const handleStopSpeaking = useCallback(() => {
    interruptSpeech();
    setAvatarState("idle");
  }, [interruptSpeech]);

  // ----- retry the last failed turn -----
  const handleRetry = useCallback(() => {
    const text = retryTextRef.current;
    if (!text) return;
    setCanRetry(false);
    setErrorMessage(null);
    setAvatarState("idle");
    // The failed user message is still in the transcript; don't duplicate it.
    void sendUserMessage(text, { speak: lastSpeakRef.current, retry: true });
  }, [sendUserMessage]);

  // ----- reset -----
  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    interruptSpeech();
    try {
      recognizerRef.current?.abort();
    } catch {
      // ignore
    }
    setMessages([]);
    setMemory({});
    clearHistory();
    clearMemory();
    setAvatarState("idle");
    setInterimText("");
    setErrorMessage(null);
  }, [interruptSpeech]);

  // ----- conversation backup (export / import JSON) -----
  const handleExportConversation = useCallback(() => {
    const json = exportConversation();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mira-conversation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportConversation = useCallback(
    async (file: File) => {
      try {
        const { messages: imported, memory: importedMemory } = importConversation(
          await file.text(),
        );
        if (
          !confirm(`Import ${imported.length} messages? This replaces the current conversation.`)
        ) {
          return;
        }
        interruptSpeech();
        setMessages(imported); // effect persists it via saveHistory
        if (importedMemory) setMemory(importedMemory);
        setAvatarState("idle");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Couldn't import that file.");
      }
    },
    [interruptSpeech],
  );

  // ----- text chat (WhatsApp-style, voice off) -----
  const handleChatSend = useCallback(
    (text: string, image?: string) => {
      // Stop any voice playback so the two modes don't talk over each other.
      interruptSpeech();
      void sendUserMessage(text, { speak: false, image });
    },
    [sendUserMessage, interruptSpeech],
  );

  const openChat = useCallback(() => {
    interruptSpeech();
    if (avatarState === "listening") stopListening();
    setViewMode("chat");
  }, [avatarState, stopListening, interruptSpeech]);

  // Closing Settings: the Live token's prompt was minted at connect and can't
  // change, so if the saved profile (name etc.) was edited while a session is
  // open, hand her the update in-band — she acknowledges and uses it for the
  // rest of the call. New sessions get it from the token as usual.
  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
    if (voiceModeRef.current !== "live") return;
    const nowJson = JSON.stringify(loadMemory());
    if (nowJson === liveMemoryJsonRef.current) return;
    liveMemoryJsonRef.current = nowJson;
    const lines = formatMemory(loadMemory());
    liveSendText(
      `[System note: the user just updated their saved profile in Settings. Current profile:\n${
        lines || "- (cleared)"
      }\nAcknowledge in one short sentence and use this from now on.]`,
    );
  }, [liveSendText]);

  // ----- cleanup on unmount -----
  useEffect(() => {
    return () => {
      stopSpeaking();
      stopServerTts();
      try {
        recognizerRef.current?.abort();
      } catch {
        // ignore
      }
      abortRef.current?.abort();
    };
  }, []);

  const assistantDisplayName = memory.assistantName || ASSISTANT_NAME;

  // Synthetic amplitude driving the orb pulse + waveforms (lib/useVoiceLevel —
  // decoupled from the audio pipeline on purpose; see the hook's docstring).
  const voiceLevel = useVoiceLevel(avatarState);

  // Map the internal state machine onto the status-pill vocabulary.
  const pillStatus: PillStatus = !isOnline
    ? "offline"
    : avatarState === "listening"
      ? "listening"
      : avatarState === "thinking" ||
          avatarState === "looking" ||
          avatarState === "recognizing" ||
          avatarState === "learning"
        ? "thinking"
        : avatarState === "speaking"
          ? "speaking"
          : avatarState === "error"
            ? "recovering"
            : "ready";

  return (
    <ErrorBoundary>
      <div className="relative sm:grid sm:min-h-dvh sm:place-items-center sm:p-6">
        <div className="relative w-full sm:mx-auto sm:max-w-4xl">
          {/* Neon window frame — the mockups' glowing gradient edge (desktop;
              mobile stays full-bleed for space). Purely decorative. */}
          <div
            aria-hidden
            className="decor-layer absolute -inset-[2px] hidden rounded-[26px] bg-brand-gradient opacity-50 blur-xl animate-border-glow sm:block"
          />
          <div
            aria-hidden
            className="decor-layer absolute -inset-px hidden rounded-[25px] bg-brand-gradient opacity-40 sm:block"
          />
          <main className="relative z-0 flex min-h-dvh w-full flex-col sm:h-[min(92dvh,900px)] sm:min-h-0 sm:overflow-hidden sm:rounded-panel sm:glass">
            <AnimatePresence>
              {!isOnline && (
                <OfflineBanner key="offline" onRetry={canRetry ? handleRetry : undefined} />
              )}
            </AnimatePresence>

            {/* Transient voice-pipeline notice (e.g. Live → Classic failover).
                Informational tone, consistent with the offline banner pattern. */}
            <AnimatePresence>
              {voiceModeNotice && (
                <motion.p
                  key="voice-mode-notice"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="glass absolute left-1/2 top-[calc(4.5rem+env(safe-area-inset-top))] z-30 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-xs text-ink-secondary"
                >
                  {voiceModeNotice}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Top bar: identity on the left, the four global controls on the
                right (transcript · theme · hands-free · settings). */}
            <header className="relative z-20 flex items-center justify-between gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <MiraLogo size={40} />
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <span className="truncate text-xl font-bold leading-none tracking-tight text-ink-primary sm:text-2xl">
                    {assistantDisplayName}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusPill status={pillStatus} />
                    {viewMode === "call" && <VoiceModePill mode={voiceMode} />}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setTranscriptOpen((v) => !v)}
                  aria-label="Toggle transcript"
                  aria-pressed={transcriptOpen}
                  className={`grid h-10 w-10 place-items-center rounded-full glass ${transcriptOpen ? "text-accent-cyan" : "text-ink-secondary hover:text-ink-primary"}`}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6M8 13h8M8 17h5" />
                  </svg>
                </button>
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setHandsFree((v) => !v)}
                  role="switch"
                  aria-checked={handsFree}
                  aria-label="Toggle hands-free mode"
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
                    handsFree
                      ? "border-accent-violet/50 bg-brand-gradient-soft text-ink-primary"
                      : "glass border-white/10 text-ink-secondary hover:text-ink-primary"
                  }`}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12a10 10 0 0 1 20 0" />
                    <path d="M6 12a6 6 0 0 1 12 0" />
                    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                  </svg>
                  <span className="hidden sm:inline">Hands-free</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Open settings"
                  className="grid h-10 w-10 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Stage + controls. One scroll column: m-auto centers the stack
                when there's room and keeps the top reachable (scroll from the
                top) when the viewport is short — small phones included. */}
            <section className="thin-scroll relative z-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
              <div className="m-auto flex w-full flex-col items-center gap-5 py-3">
                <AvatarStage
                  state={avatarState}
                  interimText={interimText}
                  videoRef={liveAvatar.videoRef}
                  audioRef={liveAvatar.audioRef}
                  liveActive={liveActive}
                  levelRef={voiceLevel}
                />

                {/* Camera · mic · chat — kept above the decorative stage layer. */}
                <div className="relative z-10 flex items-center justify-center gap-4 sm:gap-8">
                  <button
                    type="button"
                    onClick={() => openCamera()}
                    className="group flex flex-col items-center gap-1.5 text-ink-secondary transition-colors hover:text-ink-primary"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full glass transition-shadow duration-300 group-hover:shadow-glow-violet sm:h-14 sm:w-14">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </span>
                    <span className="text-xs">Camera</span>
                  </button>

                  <div className="flex flex-col items-center gap-2">
                    <VoiceMic
                      state={avatarState}
                      levelRef={voiceLevel}
                      onPress={handleMicPress}
                      onRelease={handleMicRelease}
                      pushToTalk={pushToTalk}
                    />
                    {avatarState === "speaking" && (
                      <button
                        type="button"
                        onClick={handleStopSpeaking}
                        className="rounded-full glass px-3 py-1 text-xs text-ink-secondary hover:text-ink-primary"
                      >
                        Stop
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={openChat}
                    className="group flex flex-col items-center gap-1.5 text-ink-secondary transition-colors hover:text-ink-primary"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full glass transition-shadow duration-300 group-hover:shadow-glow-violet sm:h-14 sm:w-14">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    <span className="text-xs">Chat</span>
                  </button>
                </div>

                {/* State-driven caption / status zone */}
                <div className="flex min-h-[64px] w-full items-center justify-center">
                  <AnimatePresence mode="wait">
                    {avatarState === "listening" && (
                      <CaptionBar
                        key="listen"
                        mode="listening"
                        text={interimText}
                        levelRef={voiceLevel}
                        assistantName={assistantDisplayName}
                      />
                    )}
                    {avatarState === "thinking" && <ThinkingIndicator key="think" />}
                    {avatarState === "speaking" && captionsEnabled && caption && (
                      <CaptionBar
                        key="speak"
                        mode="speaking"
                        text={caption}
                        levelRef={voiceLevel}
                        assistantName={assistantDisplayName}
                      />
                    )}
                    {avatarState === "error" && errorMessage && (
                      <motion.div
                        key="err"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass flex max-w-md flex-col items-center gap-3 rounded-card border border-status-error/30 px-5 py-4"
                      >
                        <p className="text-center text-sm text-red-300/90">{errorMessage}</p>
                        {canRetry && (
                          <button
                            type="button"
                            onClick={handleRetry}
                            className="rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-medium text-onbrand"
                          >
                            Retry
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Text fallback (with optional image attachment) */}
                <form onSubmit={handleSubmitText} className="w-full max-w-lg">
                  {(textImage || textAttaching) && (
                    <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                      {textAttaching ? (
                        <Skeleton rounded="rounded-lg" className="h-12 w-12" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={textImage!}
                          alt="Attachment preview"
                          className="h-12 w-12 rounded-lg border border-white/10 object-cover"
                        />
                      )}
                      <span className="flex-1 truncate text-xs text-ink-secondary">
                        {textAttaching ? "Preparing image…" : "Image ready — Mira will look at it"}
                      </span>
                      {!textAttaching && (
                        <button
                          type="button"
                          onClick={() => setTextImage(null)}
                          aria-label="Remove attachment"
                          className="grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink-primary"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="glass flex items-center gap-2 rounded-full px-3 py-2 transition-colors focus-within:border-accent-violet/40">
                    <input
                      ref={textFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        void pickTextImage(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Attach image"
                      onClick={() => textFileRef.current?.click()}
                      disabled={avatarState === "thinking"}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:text-accent-violet disabled:opacity-30"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m21.44 11.05-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.33 3.33 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48" />
                      </svg>
                    </button>
                    <input
                      type="text"
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      placeholder={textImage ? "Add a caption…" : "Or type a message…"}
                      className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
                      disabled={avatarState === "thinking"}
                    />
                    <button
                      type="submit"
                      disabled={
                        (!textDraft.trim() && !textImage) ||
                        avatarState === "thinking" ||
                        textAttaching
                      }
                      className="text-xs font-medium uppercase tracking-wider text-accent-cyan hover:text-accent-violet disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Send
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <footer className="relative z-10 shrink-0 px-4 pb-[calc(0.6rem_+_env(safe-area-inset-bottom))] pt-1.5">
              <BuiltByFooter />
            </footer>
          </main>
        </div>
      </div>

      {/* First-run camera + mic permission onboarding */}
      <PermissionSetup
        open={permissionSetupOpen}
        onGranted={() => {
          setPermissionsInitialized(true);
          setPermissionSetupOpen(false);
        }}
        onDismiss={() => setPermissionSetupOpen(false)}
      />

      {/* Mira Vision camera (full-screen overlay) */}
      {cameraOpen && (
        <CameraPanel
          videoRef={camera.videoRef}
          status={camera.status}
          error={camera.error}
          assistantName={assistantDisplayName}
          busy={visionBusy}
          liveVision={liveVisionEnabled && autoCaptureVision}
          visionStatus={visionStatus}
          capture={camera.capture}
          onLook={handleLook}
          onTeachObjectSave={handleTeachObjectSave}
          onTeachPersonSave={handleTeachPersonSave}
          onClose={closeCamera}
          avatarState={avatarState}
          pushToTalk={pushToTalk}
          interimText={interimText}
          onMicPress={handleMicPress}
          onMicRelease={handleMicRelease}
          currentFacingMode={camera.currentFacingMode}
          canSwitchCamera={camera.availableVideoDevices.length > 1}
          isSwitchingCamera={camera.isSwitchingCamera}
          onSwitchCamera={() => void camera.switchCamera()}
        />
      )}

      {/* WhatsApp-style text chat (full-screen overlay) */}
      {viewMode === "chat" && (
        <ChatView
          messages={messages}
          assistantName={assistantDisplayName}
          thinking={avatarState === "thinking"}
          onSend={handleChatSend}
          onBack={() => setViewMode("call")}
        />
      )}

      {/* Side panels */}
      <ChatTranscript
        messages={messages}
        expanded={transcriptOpen}
        onToggle={() => setTranscriptOpen((v) => !v)}
        assistantName={assistantDisplayName}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={handleSettingsClose}
        memory={memory}
        onMemoryChange={setMemory}
        volume={volume}
        onVolumeChange={setVolume}
        voiceName={voiceName}
        onVoiceChange={setVoiceName}
        pushToTalk={pushToTalk}
        onPushToTalkChange={setPushToTalk}
        handsFree={handsFree}
        onHandsFreeChange={setHandsFree}
        captionsEnabled={captionsEnabled}
        onCaptionsChange={setCaptionsEnabled}
        liveAvatarSupported={liveAvatarSupported}
        liveAvatarEnabled={liveAvatarEnabled}
        onLiveAvatarChange={setLiveAvatarEnabled}
        ttsModel={ttsModel}
        onTtsModelChange={setTtsModel}
        geminiVoice={geminiVoice}
        onGeminiVoiceChange={setGeminiVoice}
        knownPersonRecognition={knownPersonRecognition}
        onKnownPersonRecognitionChange={setKnownPersonRecognition}
        liveVisionEnabled={liveVisionEnabled}
        onLiveVisionChange={setLiveVisionEnabled}
        autoCaptureVision={autoCaptureVision}
        onAutoCaptureVisionChange={setAutoCaptureVision}
        onResetPermissions={() => {
          resetPermissions();
          setSettingsOpen(false);
          setPermissionSetupOpen(true);
        }}
        onResetConversation={handleReset}
        onExportConversation={handleExportConversation}
        onImportConversation={handleImportConversation}
      />

      {/* PWA install experience (self-managed via beforeinstallprompt) */}
      <InstallAppPrompt />
    </ErrorBoundary>
  );
}
