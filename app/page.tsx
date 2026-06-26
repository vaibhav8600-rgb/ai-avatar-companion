"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "@/components/AvatarStage";
import StatusIndicator from "@/components/StatusIndicator";
import MicButton from "@/components/MicButton";
import ChatTranscript from "@/components/ChatTranscript";
import ChatView from "@/components/ChatView";
import SettingsPanel from "@/components/SettingsPanel";
import CameraPanel from "@/components/CameraPanel";
import PermissionSetup from "@/components/PermissionSetup";
import ErrorBoundary from "@/components/ErrorBoundary";
import { sendChat } from "@/lib/apiClient";
import { useCamera, type CameraFacingMode } from "@/lib/useCamera";
import {
  analyzeImage,
  makeThumbnail,
  buildRecognitionPrompt,
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
import {
  createRecognizer,
  isSpeechRecognitionSupported,
} from "@/lib/speechRecognition";
import {
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
  primeSpeechSynthesis,
} from "@/lib/speechSynthesis";
import { useSimliAvatar } from "@/lib/useSimliAvatar";
import {
  playServerTts,
  stopServerTts,
  primeTtsAudio,
  isTtsAudioSupported,
} from "@/lib/ttsAudio";
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
  loadPreferredCamera,
} from "@/lib/memoryManager";
import type { AvatarState, ChatMessage, UserMemory } from "@/types";

const ASSISTANT_NAME = "Mira"; // mirrors ASSISTANT_NAME default; UI label only

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

  // ----- live video avatar (Simli) -----
  // Speaking/idle state is driven by the avatar's own audio events. Falls back
  // to the static image + browser speech when Simli isn't configured.
  const liveAvatar = useSimliAvatar({
    onSpeaking: () => setAvatarState("speaking"),
    // Only a real end-of-speech returns us to idle. We must NOT reset from
    // "thinking" here: clear()/barge-in emits an async "silent" that can land
    // during the next turn's "thinking" and would otherwise flicker the label.
    onSilent: () => setAvatarState((s) => (s === "speaking" ? "idle" : s)),
    onError: (m) => console.warn("Live avatar:", m),
  });
  // Live mode is "active" while connecting or streaming — AvatarStage shows a
  // loader until the face actually starts playing.
  const liveActive =
    liveAvatarEnabled &&
    (liveAvatar.status === "connecting" || liveAvatar.status === "ready");
  const liveAvatarSupported = liveAvatar.status !== "unconfigured";

  // Speak a reply through the browser's built-in voice (fallback path).
  const speakWithBrowser = useCallback(
    (text: string) => {
      if (!isSpeechSynthesisSupported()) {
        setAvatarState("idle");
        return;
      }
      setAvatarState("speaking");
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

  // ----- restore persistence on mount -----
  useEffect(() => {
    setMemory(loadMemory());
    setMessages(loadHistory());
    setTtsModel(loadTtsModel());
    setGeminiVoice(loadGeminiVoice());
    setKnownPersonRecognition(loadKnownPersonRecognition());
    setLiveVisionEnabled(loadLiveVision());
    setAutoCaptureVision(loadAutoCaptureVision());
  }, []);

  useEffect(() => {
    saveKnownPersonRecognition(knownPersonRecognition);
  }, [knownPersonRecognition]);

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
    saveLiveVision(liveVisionEnabled);
  }, [liveVisionEnabled]);

  useEffect(() => {
    saveAutoCaptureVision(autoCaptureVision);
  }, [autoCaptureVision]);

  useEffect(() => {
    saveTtsModel(ttsModel);
  }, [ttsModel]);

  useEffect(() => {
    saveGeminiVoice(geminiVoice);
  }, [geminiVoice]);

  useEffect(() => {
    saveMemory(memory);
  }, [memory]);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Reset error after a short delay so the UI doesn't stay stuck on error
  useEffect(() => {
    if (avatarState !== "error") return;
    const t = setTimeout(() => setAvatarState("idle"), 3500);
    return () => clearTimeout(t);
  }, [avatarState]);

  // Connect the live avatar early (so her idle face is already streaming by the
  // time she first speaks) — or tear the stream down when switched to image
  // mode, so we don't keep billing for an unused stream. No-op when Simli
  // isn't configured.
  useEffect(() => {
    if (liveAvatarEnabled && viewMode === "call") {
      void liveAvatar.ensureConnected();
    } else {
      // Image mode or text chat — drop the stream so we don't keep billing.
      liveAvatar.stop();
    }
  }, [liveAvatarEnabled, viewMode, liveAvatar.ensureConnected, liveAvatar.stop]);

  // ----- Mira Vision: speak + respond helpers -----
  // Immediately silence any current speech (browser TTS, Gemini TTS audio, and
  // the Simli buffer).
  const interruptSpeech = useCallback(() => {
    stopSpeaking();
    stopServerTts();
    liveAvatar.clear();
  }, [liveAvatar.clear]);

  // THE single voice pipeline used by every reply (chat + all vision flows +
  // errors): interrupt any current speech, then speak via Simli (live mode) or
  // Gemini TTS (still mode), falling back to the browser's Web Speech API if
  // the TTS chain fails. Returns to idle when done.
  const voiceReply = useCallback(
    async (text: string) => {
      interruptSpeech();
      const live = liveAvatarEnabled ? await liveAvatar.ensureConnected() : false;
      if (live) {
        // Stay in "thinking" through TTS generation/buffering — Simli emits its
        // own "speaking" event when audio actually starts (wired in the hook).
        try {
          await liveAvatar.speak(text, ttsModel, geminiVoice);
        } catch {
          liveAvatar.clear();
          speakWithBrowser(text);
        }
        return;
      }

      // Still mode: keep "thinking" while the TTS is fetched; flip to "speaking"
      // only when audio actually begins (onPlay).
      if (isTtsAudioSupported()) {
        try {
          await playServerTts({
            text,
            model: ttsModel,
            voice: geminiVoice,
            volume,
            onPlay: () => setAvatarState("speaking"),
          });
          // Only settle to idle if we're still the speaking turn (a new mic
          // press / vision command may have moved us on).
          setAvatarState((s) => (s === "speaking" ? "idle" : s));
          return;
        } catch {
          // Every TTS model failed — fall back to the browser voice.
        }
      }
      speakWithBrowser(text);
    },
    [interruptSpeech, liveAvatarEnabled, ttsModel, geminiVoice, volume, liveAvatar.ensureConnected, liveAvatar.speak, liveAvatar.clear, speakWithBrowser],
  );

  /** Add an assistant message and speak it. */
  const speakMiraResponse = useCallback(
    (text: string) => {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: text, timestamp: new Date().toISOString() },
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
      const result = await analyzeImage(frame, "recognition", prompt);
      pendingVisionContextRef.current = result.description;
      const match = matchMemory(result, memories, "object");
      if (match && match.confidence >= 0.6) {
        setAvatarState("recognized");
        speakMiraResponse(`That looks like your ${spokenLabel(match.memory.label)}. ${result.description}`);
      } else if (match) {
        setAvatarState("uncertain");
        speakMiraResponse(`I see something similar to your ${spokenLabel(match.memory.label)}, but I'm not fully sure. ${result.description}`);
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
  }, [camera, speakMiraResponse]);

  const handleTeachObjectSave = useCallback(
    async (frame: string, label: string, notes: string) => {
      setVisionBusy(true);
      setAvatarState("learning");
      try {
        const result = await analyzeImage(frame, "object", `Describe this object the user calls "${label}".`);
        const thumb = await makeThumbnail(frame);
        const description = [result.description, notes && `Notes: ${notes}`].filter(Boolean).join(" ");
        await saveVisualMemory({ type: "object", label, description, thumbnailBase64: thumb, tags: [] });
        speakMiraResponse(`Got it, I'll remember this as your ${spokenLabel(label)}.`);
      } catch {
        speakMiraResponse("Sorry, I couldn't save that object. Try again?");
      } finally {
        setVisionBusy(false);
        setAvatarState("idle");
      }
    },
    [speakMiraResponse],
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
        speakMiraResponse(`Okay — I've saved ${name} as a known person, with your consent. You can remove this anytime in Settings.`);
      } catch {
        speakMiraResponse("Sorry, I couldn't save that.");
      } finally {
        setVisionBusy(false);
        setAvatarState("idle");
      }
    },
    [speakMiraResponse],
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
        const affirmative = /\b(yes|yeah|yep|sure|ok|okay|confirm|do it|please|go ahead|save)\b/i.test(ans);
        if (pending.kind === "object-label") {
          // Keep a leading "my"; only drop a/an/the. Spoken form strips "my".
          const label = ans.replace(/[.?!,]+$/g, "").replace(/^(a|an|the)\s+/i, "").trim();
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
          speakMiraResponse(`I can remember known people only with permission. Should I save this person as ${name}?`);
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
            const result = await analyzeImage(frame, "scene", "Describe what you see, briefly and naturally.");
            pendingVisionContextRef.current = result.description;
            setVisionStatus("Camera ready");
            return "chat"; // let /api/chat phrase the reply with the camera context
          } catch (err) {
            setAvatarState("idle");
            setVisionStatus("Camera ready");
            speakMiraResponse(err instanceof Error ? err.message : "Sorry, I couldn't see clearly.");
            return "done";
          }
        }

        case "recognize_current_view": {
          setVisionStatus("Recognizing");
          setAvatarState("recognizing");
          setVisionBusy(true);
          try {
            const memories = await listMemories();
            const result = await analyzeImage(frame, "recognition", buildRecognitionPrompt(memories, "object"));
            pendingVisionContextRef.current = result.description;
            const match = matchMemory(result, memories, "object");
            if (match && match.confidence >= 0.6) {
              setAvatarState("recognized");
              speakMiraResponse(`That looks like your ${spokenLabel(match.memory.label)}.`);
            } else if (match) {
              setAvatarState("uncertain");
              speakMiraResponse(`It looks similar to your ${spokenLabel(match.memory.label)}, but I'm not fully sure.`);
            } else {
              setAvatarState("idle");
              speakMiraResponse("I don't recognize this yet. You can say “Remember this as…” and I'll save it.");
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
          speakMiraResponse(`I can remember known people only with permission. Should I save this person as ${det.label}?`);
          return "done";
        }

        case "recognize_known_person": {
          if (!knownPersonRecognition) {
            speakMiraResponse("Known-person recognition is off. You can turn it on in Settings → Mira Vision.");
            setVisionStatus("Camera ready");
            return "done";
          }
          setVisionStatus("Recognizing");
          setAvatarState("recognizing");
          setVisionBusy(true);
          try {
            const memories = await listMemories();
            const result = await analyzeImage(frame, "recognition", buildRecognitionPrompt(memories, "person"));
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
            speakMiraResponse("Which one should I forget? Say its name, like “forget my keyboard.”");
          }
          return "done";
        }

        default:
          return "chat";
      }
    },
    [camera, knownPersonRecognition, handleTeachObjectSave, handleTeachPersonSave, handleForget, speakMiraResponse, interruptSpeech],
  );

  // ----- core flow: send a user turn to the AI -----
  // `speak` is true for the voice call and false for the text chat, which is
  // a quiet, text-only conversation over the same history.
  const sendUserMessage = useCallback(
    async (text: string, opts?: { speak?: boolean }) => {
      const shouldSpeak = opts?.speak ?? true;
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInterimText("");

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

      try {
        const response = await sendChat(
          {
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            memory,
            visionContext,
          },
          abortRef.current.signal,
        );

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
        const msg = err instanceof Error ? err.message : "Connection failed";
        setErrorMessage(msg);
        setAvatarState("error");
      }
    },
    [messages, memory, autoCaptureVision, liveVisionEnabled, routeVisionTurn, voiceReply],
  );

  // ----- mic actions -----
  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setErrorMessage("Microphone speech recognition isn't supported in this browser. Type your message instead.");
      setAvatarState("error");
      return;
    }

    // Stop any currently-playing audio so she doesn't talk over the user.
    interruptSpeech();

    wasManualStopRef.current = false;
    const recognizer = createRecognizer(
      {
        onPartial: (t) => setInterimText(t),
        onFinal: (t) => {
          setInterimText("");
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
        onEnd: () => {
          // If still in listening (no final text triggered a state change), return to idle.
          setAvatarState((s) => (s === "listening" ? "idle" : s));
        },
      },
      // Click-to-talk: finalize after a ~1.6s pause so mid-sentence pauses don't
      // cut you off. Push-to-talk: the button release ends the turn (no timer).
      { silenceMs: pushToTalk ? 0 : 1600 },
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
    if (pushToTalk) {
      startListening();
    } else {
      if (avatarState === "listening") {
        stopListening();
      } else if (avatarState === "speaking") {
        interruptSpeech();
        setAvatarState("idle");
      } else {
        startListening();
      }
    }
  }, [avatarState, pushToTalk, startListening, stopListening, interruptSpeech]);

  const handleMicRelease = useCallback(() => {
    if (pushToTalk) {
      stopListening();
    }
  }, [pushToTalk, stopListening]);

  // ----- text fallback -----
  const handleSubmitText = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!textDraft.trim()) return;
      const text = textDraft;
      setTextDraft("");
      // Unlock mobile speech within this gesture before the async reply.
      primeSpeechSynthesis();
      primeTtsAudio();
      interruptSpeech();
      void sendUserMessage(text);
    },
    [textDraft, sendUserMessage, interruptSpeech],
  );

  // ----- stop speaking -----
  const handleStopSpeaking = useCallback(() => {
    interruptSpeech();
    setAvatarState("idle");
  }, [interruptSpeech]);

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

  // ----- text chat (WhatsApp-style, voice off) -----
  const handleChatSend = useCallback(
    (text: string) => {
      // Stop any voice playback so the two modes don't talk over each other.
      interruptSpeech();
      void sendUserMessage(text, { speak: false });
    },
    [sendUserMessage, interruptSpeech],
  );

  const openChat = useCallback(() => {
    interruptSpeech();
    if (avatarState === "listening") stopListening();
    setViewMode("chat");
  }, [avatarState, stopListening, interruptSpeech]);

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

  return (
    <ErrorBoundary>
      <main className="relative min-h-dvh flex flex-col">
        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-signal-400 to-signal-600" />
            <div className="leading-tight">
              <p className="font-display font-semibold text-cream-50 tracking-tight">
                {assistantDisplayName}
              </p>
              <p className="text-[10px] tracking-[0.18em] uppercase text-cream-100/35">
                by Vaibhav Rajput
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openCamera()}
              className="grid place-items-center h-9 w-9 rounded-full hover:bg-white/[0.06] text-cream-100/70"
              aria-label="Open camera (Mira Vision)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>

            <button
              type="button"
              onClick={openChat}
              className="grid place-items-center h-9 w-9 rounded-full hover:bg-white/[0.06] text-cream-100/70"
              aria-label="Open chat"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="grid place-items-center h-9 w-9 rounded-full hover:bg-white/[0.06] text-cream-100/70"
              aria-label="Open settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Stage */}
        <section className="relative z-0 flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-6 overflow-y-auto">
          <AvatarStage
            state={avatarState}
            interimText={interimText}
            videoRef={liveAvatar.videoRef}
            audioRef={liveAvatar.audioRef}
            liveActive={liveActive}
          />

          <div className="mt-8">
            <StatusIndicator state={avatarState} assistantName={assistantDisplayName} />
          </div>

          {errorMessage && avatarState === "error" && (
            <p className="mt-4 max-w-md text-center text-sm text-red-300/80 animate-fade-up">
              {errorMessage}
            </p>
          )}
        </section>

        {/* Bottom controls */}
        <footer className="relative z-10 shrink-0 px-4 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-col items-center gap-4">
              {/* Big primary mic */}
              <div className="flex items-center gap-4">
                {avatarState === "speaking" && (
                  <button
                    type="button"
                    onClick={handleStopSpeaking}
                    className="px-3 py-1.5 rounded-full text-xs uppercase tracking-wider bg-white/[0.04] border border-white/[0.08] text-cream-100/70 hover:bg-white/[0.08]"
                  >
                    Stop
                  </button>
                )}
                <MicButton
                  state={avatarState}
                  onPress={handleMicPress}
                  onRelease={handleMicRelease}
                  pushToTalk={pushToTalk}
                />
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTranscriptOpen((v) => !v)}
                    className="px-3 py-1.5 rounded-full text-xs uppercase tracking-wider bg-white/[0.04] border border-white/[0.08] text-cream-100/70 hover:bg-white/[0.08]"
                  >
                    {transcriptOpen ? "Hide" : "Show"}
                  </button>
                )}
              </div>

              {/* Text fallback */}
              <form onSubmit={handleSubmitText} className="w-full max-w-lg">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] focus-within:border-signal-500/40 transition-colors">
                  <input
                    type="text"
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    placeholder="Or type a message…"
                    className="flex-1 bg-transparent text-sm text-cream-100 placeholder:text-cream-100/30 focus:outline-none"
                    disabled={avatarState === "thinking"}
                  />
                  <button
                    type="submit"
                    disabled={!textDraft.trim() || avatarState === "thinking"}
                    className="text-xs uppercase tracking-wider text-signal-400 hover:text-signal-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </form>

              <p className="text-[11px] text-cream-100/30 text-center max-w-md leading-relaxed">
                Mira is a virtual AI assistant. Your microphone is only used while
                you&apos;re speaking. Conversations are stored locally in this browser.
              </p>

              <p className="text-[10px] uppercase tracking-[0.2em] text-cream-100/25">
                Crafted by Vaibhav Rajput
              </p>
            </div>
          </div>
        </footer>

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
          onClose={() => setSettingsOpen(false)}
          memory={memory}
          onMemoryChange={setMemory}
          volume={volume}
          onVolumeChange={setVolume}
          voiceName={voiceName}
          onVoiceChange={setVoiceName}
          pushToTalk={pushToTalk}
          onPushToTalkChange={setPushToTalk}
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
        />
      </main>
    </ErrorBoundary>
  );
}
