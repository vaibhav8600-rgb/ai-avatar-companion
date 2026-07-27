"use client";

// React hook that owns a Gemini Live API session — the PRIMARY voice pipeline.
// Modeled on lib/useSimliAvatar.ts (connect/stop lifecycle, ref-stable
// callbacks, generation-guarded connects) so it's a drop-in sibling.
//
// Flow:
//   connect()  -> mint an ephemeral token from /api/live-token, open the
//                 WebSocket DIRECTLY to Google (the key never reaches the
//                 browser — only the 1-use token does), send the session
//                 setup, optionally seed recent history as context.
//   startMic() -> stream mic PCM16@16k over the socket (server-side VAD +
//                 STT; no Web Speech involved in Live mode).
//   stopMic()  -> stop capture and send audioStreamEnd so the server doesn't
//                 hold a stale audio buffer.
//   disconnect() -> intentional close (no failover callback).
//
// The hook is TRANSPORT-ONLY on purpose: model audio (base64 PCM @24kHz) is
// handed to the caller via onAudioChunk, and the page routes it through the
// exact same playback code the classic TTS chain uses (Simli sendPcm / the
// ttsAudio PcmSink) — no parallel audio pipeline.
//
// Failure policy (v1): any unexpected close, error, or GoAway flushes the
// transcript buffers into shared history and calls onFailover(reason) — the
// page then continues the call on the classic pipeline. Session resumption is
// deliberately NOT implemented yet (see the task's deferred list); the token
// is minted with sessionResumption enabled so v2 can add it without a server
// change.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, UserMemory } from "@/types";

export type GeminiLiveStatus =
  | "idle" // not yet attempted
  | "connecting"
  | "live" // session open, setup acknowledged
  | "unconfigured" // server says: no key / feature flag off (permanent)
  | "error" // connect failed (may retry on a later call)
  | "closed"; // intentionally disconnected

interface UseGeminiLiveCallbacks {
  /** Model audio: base64 PCM16 (little-endian mono) at `sampleRate`. */
  onAudioChunk?: (base64Pcm: string, sampleRate: number) => void;
  /** A finalized user turn (Gemini's own STT transcription). */
  onUserTranscript?: (text: string) => void;
  /** Growing user transcript ("text so far") — drives the interim caption. */
  onUserTranscriptDelta?: (textSoFar: string) => void;
  /** A finalized model turn (for shared history). */
  onModelTranscript?: (text: string) => void;
  /** Growing model transcript for live captions ("text so far" this turn). */
  onModelTranscriptDelta?: (textSoFar: string) => void;
  /** First audio chunk of a model turn (drive the "speaking" state). */
  onSpeakingStart?: () => void;
  /** Model turn finished (audio all delivered; sink may still be draining). */
  onTurnComplete?: () => void;
  /** Native barge-in: the user's speech interrupted the model. */
  onInterrupted?: () => void;
  /**
   * The model invoked a declared tool (e.g. save_visual_memory). Return the
   * result object; it is sent back as the toolResponse the model speaks from.
   */
  onToolCall?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Session died mid-call — the page fails over to the classic pipeline. */
  onFailover?: (reason: string) => void;
}

// Ephemeral tokens authenticate against the CONSTRAINED bidi method with an
// `access_token` query param (verified against @google/genai's live.connect:
// a token key flips method → BidiGenerateContentConstrained). The regular
// BidiGenerateContent method rejects ephemeral tokens ("unregistered caller").
const LIVE_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/" +
  "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

// Mic capture: PCM16 mono @16kHz is what the Live API expects for input.
const MIC_SAMPLE_RATE = 16000;
// ScriptProcessor block size — ~256ms at 16k. Deprecated API, but universally
// supported and dependency-free; an AudioWorklet is a fine follow-up.
const MIC_BUFFER_SIZE = 4096;
// Server audio output rate (native audio models emit 24kHz PCM).
const OUTPUT_SAMPLE_RATE = 24000;
// Give up on a connect that hasn't acknowledged setup within this window.
const CONNECT_TIMEOUT_MS = 8000;
// Recent turns sent to /api/live-token, which folds them into the token's
// locked systemInstruction. (Seeding them over the socket via
// clientContent{turnComplete:false} hard-closes the session — 1007.)
const SEED_HISTORY_TURNS = 12;

/** Linear-interpolation downsample (mic rate → 16k). */
function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Float32 [-1,1] → PCM16 LE → base64. */
function floatsToPcm16Base64(floats: Float32Array): string {
  const bytes = new Uint8Array(floats.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < floats.length; i++) {
    const s = Math.max(-1, Math.min(1, floats[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

/** Parse "audio/pcm;rate=24000" → 24000 (fallback to the documented default). */
function rateFromMime(mime: string | undefined): number {
  const m = /rate=(\d+)/.exec(mime || "");
  return m ? Number(m[1]) : OUTPUT_SAMPLE_RATE;
}

interface ConnectOptions {
  /** User memory — sent to /api/live-token so the system prompt matches /api/chat. */
  memory?: UserMemory;
  /** Recent shared history, seeded into the session as initial context. */
  history?: ChatMessage[];
  /**
   * Catalog of taught visual memories (labels + text descriptions) so
   * Live-Mira can recognize saved things in the streamed camera frames.
   */
  visualMemories?: { type: string; label: string; description: string }[];
}

export function useGeminiLive(callbacks: UseGeminiLiveCallbacks) {
  const [status, setStatus] = useState<GeminiLiveStatus>("idle");
  const [micActive, setMicActive] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const closingRef = useRef(false); // intentional close → suppress failover
  const generationRef = useRef(0); // bumped on disconnect; stale connects abort
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);

  // Mic capture graph.
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const micActiveRef = useRef(false);

  // Per-turn transcript buffers (flushed into shared history on turn
  // boundaries — and on failover, so a mid-sentence drop loses nothing).
  const inBufRef = useRef("");
  const outBufRef = useRef("");
  const modelTurnActiveRef = useRef(false);

  // Ref-stable callbacks (same pattern as useSimliAvatar).
  const cbRef = useRef(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  });

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  });

  /** Commit the buffered USER transcript (turn boundary: model started). */
  const commitUserTranscript = useCallback(() => {
    const text = inBufRef.current.trim();
    inBufRef.current = "";
    if (text) cbRef.current.onUserTranscript?.(text);
  }, []);

  /** Commit the buffered MODEL transcript (turn complete / interrupted). */
  const commitModelTranscript = useCallback(() => {
    const text = outBufRef.current.trim();
    outBufRef.current = "";
    if (text) cbRef.current.onModelTranscript?.(text);
  }, []);

  /** Flush BOTH buffers (failover / disconnect) — context preservation. */
  const flushTranscripts = useCallback(() => {
    commitUserTranscript();
    commitModelTranscript();
  }, [commitUserTranscript, commitModelTranscript]);

  const stopMic = useCallback(() => {
    micActiveRef.current = false;
    setMicActive(false);
    try {
      micNodeRef.current?.disconnect();
    } catch {
      // already gone
    }
    micNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    // Tell the server the audio stream is done so it doesn't hang onto a
    // stale buffer (per Google's guidance).
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } catch {
        // socket died mid-send; the close handler deals with it
      }
    }
  }, []);

  /** Tear the session down in place. Intentional — no onFailover. */
  const disconnect = useCallback(() => {
    generationRef.current++;
    connectPromiseRef.current = null;
    stopMic();
    flushTranscripts();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      closingRef.current = true;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
    setStatus((s) => (s === "unconfigured" ? s : "closed"));
  }, [stopMic, flushTranscripts]);

  /** Handle one parsed server message. */
  const handleServerMessage = useCallback(
    (msg: Record<string, unknown>) => {
      // GoAway: the server is about to drop us — fail over proactively.
      if (msg.goAway) {
        cbRef.current.onFailover?.("server sent GoAway");
        return;
      }
      // Tool calls: run the app's executor, send the result back — the model
      // then speaks from it ("Got it, I've saved your red mug").
      const toolCall = msg.toolCall as
        | { functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] }
        | undefined;
      if (toolCall?.functionCalls?.length) {
        for (const call of toolCall.functionCalls) {
          void (async () => {
            let response: Record<string, unknown>;
            try {
              response = (await cbRef.current.onToolCall?.(call.name || "", call.args || {})) ?? {
                ok: false,
                error: "no tool handler",
              };
            } catch (err) {
              response = { ok: false, error: err instanceof Error ? err.message : "tool failed" };
            }
            const sock = wsRef.current;
            if (sock && sock.readyState === WebSocket.OPEN) {
              try {
                sock.send(
                  JSON.stringify({
                    toolResponse: {
                      functionResponses: [{ id: call.id, name: call.name, response }],
                    },
                  }),
                );
              } catch {
                // socket died mid-send; the close handler fails us over
              }
            }
          })();
        }
        return;
      }
      const sc = msg.serverContent as
        | {
            modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
            inputTranscription?: { text?: string };
            outputTranscription?: { text?: string };
            interrupted?: boolean;
            turnComplete?: boolean;
          }
        | undefined;
      if (!sc) return;

      if (sc.inputTranscription?.text) {
        inBufRef.current += sc.inputTranscription.text;
        cbRef.current.onUserTranscriptDelta?.(inBufRef.current);
      }
      if (sc.outputTranscription?.text) {
        outBufRef.current += sc.outputTranscription.text;
        cbRef.current.onModelTranscriptDelta?.(outBufRef.current);
      }

      const parts = sc.modelTurn?.parts;
      if (parts) {
        for (const part of parts) {
          const inline = part.inlineData;
          if (!inline?.data) continue;
          // First audio of this model turn: the user's turn is over — commit
          // their transcript now so history stays in spoken order.
          if (!modelTurnActiveRef.current) {
            modelTurnActiveRef.current = true;
            commitUserTranscript();
            cbRef.current.onSpeakingStart?.();
          }
          cbRef.current.onAudioChunk?.(inline.data, rateFromMime(inline.mimeType));
        }
      }

      if (sc.interrupted) {
        modelTurnActiveRef.current = false;
        commitModelTranscript();
        cbRef.current.onInterrupted?.();
      }
      if (sc.turnComplete) {
        modelTurnActiveRef.current = false;
        commitUserTranscript(); // no-audio turns (rare) still keep order
        commitModelTranscript();
        cbRef.current.onTurnComplete?.();
      }
    },
    [commitUserTranscript, commitModelTranscript],
  );

  const doConnect = useCallback(
    async (opts?: ConnectOptions): Promise<boolean> => {
      if (typeof window === "undefined" || typeof WebSocket === "undefined") return false;
      const gen = generationRef.current;
      setStatus("connecting");
      try {
        const res = await fetch("/api/live-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memory: opts?.memory,
            // Recent shared history — the server locks it (with persona +
            // memory) into the token's systemInstruction, the only channel a
            // constrained session actually honors.
            history: (opts?.history || [])
              .slice(-SEED_HISTORY_TURNS)
              .filter((m) => m.content)
              .map((m) => ({ role: m.role, content: m.content })),
            // Taught objects/people (text catalog) — folded into the prompt so
            // she can recognize them in the streamed camera frames.
            visualMemories: opts?.visualMemories || [],
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          token?: string;
          model?: string;
          voice?: string;
          error?: string;
        };

        if (data.error === "gemini_live_not_configured") {
          setStatus("unconfigured");
          return false;
        }
        if (!res.ok || !data.token || !data.model) {
          console.warn("[voice] Gemini Live token unavailable:", data.error || res.status);
          setStatus("error");
          return false;
        }
        if (generationRef.current !== gen) return false; // superseded

        const ok = await new Promise<boolean>((resolve) => {
          let settled = false;
          const settle = (v: boolean) => {
            if (!settled) {
              settled = true;
              resolve(v);
            }
          };

          const ws = new WebSocket(
            `${LIVE_WS_BASE}?access_token=${encodeURIComponent(data.token!)}`,
          );
          wsRef.current = ws;
          closingRef.current = false;

          const timeout = setTimeout(() => {
            closingRef.current = true;
            try {
              ws.close();
            } catch {
              // ignore
            }
            settle(false);
          }, CONNECT_TIMEOUT_MS);

          ws.onopen = () => {
            // BidiGenerateContentSetup: audio-only replies + both-direction
            // transcription so captions/history come for free. The voice is
            // set explicitly (mirroring the token's locked speechConfig) —
            // without it Google falls back to its default MALE voice.
            // NO systemInstruction here: on a constrained session a
            // client-sent one is silently IGNORED — persona/memory/history
            // are locked in the token by /api/live-token instead.
            ws.send(
              JSON.stringify({
                setup: {
                  model: `models/${data.model}`,
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    ...(data.voice
                      ? {
                          speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voice } },
                          },
                        }
                      : {}),
                  },
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                },
              }),
            );
          };

          ws.onmessage = (ev: MessageEvent) => {
            void (async () => {
              let text: string;
              if (typeof ev.data === "string") {
                text = ev.data;
              } else if (ev.data instanceof Blob) {
                text = await ev.data.text();
              } else {
                return;
              }
              let msg: Record<string, unknown>;
              try {
                msg = JSON.parse(text) as Record<string, unknown>;
              } catch {
                return;
              }
              if (msg.setupComplete !== undefined && !settled) {
                clearTimeout(timeout);
                // NOTE: history is NOT seeded here. clientContent with
                // turnComplete:false hard-closes this model's session (1007
                // invalid argument) — context travels inside the token's
                // systemInstruction instead (see the /api/live-token fetch).
                setStatus("live");
                settle(true);
                return;
              }
              handleServerMessage(msg);
            })();
          };

          ws.onerror = () => {
            // onclose always follows; let it decide failover vs connect-fail.
          };

          ws.onclose = (ev: CloseEvent) => {
            clearTimeout(timeout);
            if (wsRef.current === ws) wsRef.current = null;
            if (!settled) {
              // Died during connect → report failure; caller goes classic.
              settle(false);
              return;
            }
            if (closingRef.current || generationRef.current !== gen) return; // intentional
            // Unexpected mid-call drop → preserve context, then fail over.
            // Clear the cached connect promise, otherwise a later connect()
            // would resolve with this dead session's `true` and never reconnect.
            connectPromiseRef.current = null;
            stopMic();
            flushTranscripts();
            setStatus("error");
            cbRef.current.onFailover?.(
              `connection closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ""})`,
            );
          };
        });

        if (!ok) {
          // Make silent failures visible: this covers the connect timeout and
          // a socket that closed before acknowledging setup.
          console.warn(
            "[voice] Gemini Live socket did not reach setupComplete — using classic voice",
          );
          if (statusRef.current === "connecting") setStatus("error");
          return false;
        }
        if (generationRef.current !== gen) {
          disconnect();
          return false;
        }
        return true;
      } catch (err) {
        console.warn("[voice] Gemini Live connect failed:", err);
        setStatus("error");
        return false;
      }
    },
    [handleServerMessage, stopMic, flushTranscripts, disconnect],
  );

  /** Connect once; safe to call repeatedly. Resolves whether Live is usable. */
  const connect = useCallback(
    (opts?: ConnectOptions): Promise<boolean> => {
      if (wsRef.current && statusRef.current === "live") return Promise.resolve(true);
      if (statusRef.current === "unconfigured") return Promise.resolve(false);
      if (!connectPromiseRef.current) {
        connectPromiseRef.current = doConnect(opts).then((ok) => {
          if (!ok) connectPromiseRef.current = null; // allow a later retry
          return ok;
        });
      }
      return connectPromiseRef.current;
    },
    [doConnect],
  );

  /**
   * Send a TEXT user turn into the live session (reply comes back as native
   * audio + transcript through the same callbacks as spoken turns). Used by
   * camera mode, where the mic stays on the classic recognizer for the vision
   * intent router but replies keep the Live voice. Returns false when the
   * session isn't usable so the caller can fall back to the classic chain.
   */
  const sendText = useCallback((text: string): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || statusRef.current !== "live") return false;
    try {
      ws.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: "user", parts: [{ text }] }],
            turnComplete: true,
          },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Stream a camera frame into the live session (Live Vision). Accepts a
   * canvas data-URL or raw base64; sent as `realtimeInput.video`, which is
   * the current wire format (`mediaChunks` is rejected as deprecated).
   * ~1 fps is plenty — the model keeps recent frames as visual context.
   */
  const sendVideoFrame = useCallback((frame: string, mimeType = "image/jpeg"): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || statusRef.current !== "live") return false;
    let data = frame;
    const m = /^data:([^;]+);base64,(.*)$/.exec(frame);
    if (m) {
      mimeType = m[1];
      data = m[2];
    }
    if (!data) return false;
    try {
      ws.send(JSON.stringify({ realtimeInput: { video: { data, mimeType } } }));
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Open the mic and stream PCM16@16k into the session. */
  const startMic = useCallback(async (): Promise<boolean> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (micActiveRef.current) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      // Ask for 16k directly; browsers that ignore the hint get downsampled.
      let ctx: AudioContext;
      try {
        ctx = new AC({ sampleRate: MIC_SAMPLE_RATE });
      } catch {
        ctx = new AC();
      }
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(MIC_BUFFER_SIZE, 1, 1);
      node.onaudioprocess = (e) => {
        if (!micActiveRef.current) return;
        const sock = wsRef.current;
        if (!sock || sock.readyState !== WebSocket.OPEN) return;
        const floats = downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate, MIC_SAMPLE_RATE);
        try {
          sock.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: floatsToPcm16Base64(floats),
                  mimeType: `audio/pcm;rate=${MIC_SAMPLE_RATE}`,
                },
              },
            }),
          );
        } catch {
          // socket died mid-send; the close handler fails us over
        }
      };
      source.connect(node);
      // ScriptProcessor only fires when connected to a destination; a zero-gain
      // sink keeps the graph silent (no local echo of the mic).
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(ctx.destination);

      micStreamRef.current = stream;
      micCtxRef.current = ctx;
      micNodeRef.current = node;
      micActiveRef.current = true;
      setMicActive(true);
      return true;
    } catch (err) {
      console.warn("[voice] Live mic failed:", err);
      return false;
    }
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    status,
    micActive,
    connect,
    disconnect,
    startMic,
    stopMic,
    sendText,
    sendVideoFrame,
    /** Flush partial transcripts into history (used before manual teardown). */
    flushTranscripts,
  };
}
