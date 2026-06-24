"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "@/components/AvatarStage";
import StatusIndicator from "@/components/StatusIndicator";
import MicButton from "@/components/MicButton";
import ChatTranscript from "@/components/ChatTranscript";
import SettingsPanel from "@/components/SettingsPanel";
import ErrorBoundary from "@/components/ErrorBoundary";
import { sendChat } from "@/lib/apiClient";
import {
  createRecognizer,
  isSpeechRecognitionSupported,
} from "@/lib/speechRecognition";
import {
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
} from "@/lib/speechSynthesis";
import { useSimliAvatar } from "@/lib/useSimliAvatar";
import {
  loadMemory,
  saveMemory,
  loadHistory,
  saveHistory,
  clearHistory,
  clearMemory,
} from "@/lib/memoryManager";
import type { AvatarState, ChatMessage, UserMemory } from "@/types";

const ASSISTANT_NAME = "Mira"; // mirrors ASSISTANT_NAME default; UI label only

export default function Page() {
  // ----- core state -----
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interimText, setInterimText] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ----- user-configurable settings -----
  const [memory, setMemory] = useState<UserMemory>({});
  const [volume, setVolume] = useState(1);
  const [voiceName, setVoiceName] = useState<string | undefined>(undefined);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [liveAvatarEnabled, setLiveAvatarEnabled] = useState(true);

  // ----- refs (don't trigger re-renders) -----
  const recognizerRef = useRef<ReturnType<typeof createRecognizer> | null>(null);
  const wasManualStopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ----- live video avatar (Simli) -----
  // Speaking/idle state is driven by the avatar's own audio events. Falls back
  // to the static image + browser speech when Simli isn't configured.
  const liveAvatar = useSimliAvatar({
    onSpeaking: () => setAvatarState("speaking"),
    onSilent: () => setAvatarState((s) => (s === "speaking" ? "idle" : s)),
    onError: (m) => console.warn("Live avatar:", m),
  });
  const liveReady = liveAvatarEnabled && liveAvatar.status === "ready";
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
  }, []);

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
    if (liveAvatarEnabled) {
      void liveAvatar.ensureConnected();
    } else {
      liveAvatar.stop();
    }
  }, [liveAvatarEnabled, liveAvatar.ensureConnected, liveAvatar.stop]);

  // ----- core flow: send a user turn to the AI -----
  const sendUserMessage = useCallback(
    async (text: string) => {
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
      setAvatarState("thinking");

      // Cancel any in-flight request from a previous turn.
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const response = await sendChat(
          {
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            memory,
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

        // Speak the reply. Prefer the live lip-synced avatar; if it isn't
        // available (or fails), fall back to the browser's built-in voice.
        const live = liveAvatarEnabled ? await liveAvatar.ensureConnected() : false;
        if (live) {
          setAvatarState("speaking");
          try {
            await liveAvatar.speak(reply);
            // The avatar's "silent" event returns us to idle when it finishes.
          } catch (speakErr) {
            console.warn("Live avatar speak failed, using browser voice:", speakErr);
            speakWithBrowser(reply);
          }
        } else {
          speakWithBrowser(reply);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Connection failed";
        setErrorMessage(msg);
        setAvatarState("error");
      }
    },
    [messages, memory, liveAvatarEnabled, liveAvatar.ensureConnected, liveAvatar.speak, speakWithBrowser],
  );

  // ----- mic actions -----
  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setErrorMessage("Microphone speech recognition isn't supported in this browser. Type your message instead.");
      setAvatarState("error");
      return;
    }

    // Stop any currently-playing audio so she doesn't talk over the user.
    stopSpeaking();
    liveAvatar.clear();

    wasManualStopRef.current = false;
    const recognizer = createRecognizer({
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
    });

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
  }, [sendUserMessage, liveAvatar.clear]);

  const stopListening = useCallback(() => {
    wasManualStopRef.current = true;
    try {
      recognizerRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const handleMicPress = useCallback(() => {
    if (pushToTalk) {
      startListening();
    } else {
      if (avatarState === "listening") {
        stopListening();
      } else if (avatarState === "speaking") {
        stopSpeaking();
        liveAvatar.clear();
        setAvatarState("idle");
      } else {
        startListening();
      }
    }
  }, [avatarState, pushToTalk, startListening, stopListening, liveAvatar.clear]);

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
      stopSpeaking();
      void sendUserMessage(text);
    },
    [textDraft, sendUserMessage],
  );

  // ----- stop speaking -----
  const handleStopSpeaking = useCallback(() => {
    stopSpeaking();
    liveAvatar.clear();
    setAvatarState("idle");
  }, [liveAvatar.clear]);

  // ----- reset -----
  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    stopSpeaking();
    liveAvatar.clear();
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
  }, [liveAvatar.clear]);

  // ----- cleanup on unmount -----
  useEffect(() => {
    return () => {
      stopSpeaking();
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
      <main className="relative min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-signal-400 to-signal-600" />
            <p className="font-display font-semibold text-cream-50 tracking-tight">
              {assistantDisplayName}
            </p>
          </div>

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
        </header>

        {/* Stage */}
        <section className="relative z-0 flex-1 flex flex-col items-center justify-center px-4 pb-32">
          <AvatarStage
            state={avatarState}
            interimText={interimText}
            videoRef={liveAvatar.videoRef}
            audioRef={liveAvatar.audioRef}
            showVideo={liveReady}
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
        <footer className="fixed inset-x-0 bottom-0 z-10 pb-6 px-4">
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
            </div>
          </div>
        </footer>

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
          onResetConversation={handleReset}
        />
      </main>
    </ErrorBoundary>
  );
}
