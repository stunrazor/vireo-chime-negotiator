// Push-to-speak mic for the approver name (Muse Voice Transcribe).
//
// Click once to start, click again to stop — never hold-to-talk. The clip
// is converted to 16 kHz mono WAV in the browser (the API's required
// format) and posted as base64 JSON. Speech becomes text only; the human
// still reviews the name in the field and clicks Approve.
import { useEffect, useRef, useState } from "react";
import { transcribeVoice } from "@/lib/negotiator-api";
import "./mic-button.css";

type MicState = "idle" | "listening" | "working";

const MAX_SECONDS = 30;
const TARGET_SAMPLE_RATE = 16000;

type MicButtonProps = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onStatus: (message: string | null) => void;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function encodeWavMono16k(decoded: AudioBuffer): ArrayBuffer {
  // Mix to mono, resample to 16 kHz by linear interpolation, 16-bit PCM.
  const channels = decoded.numberOfChannels;
  const length = decoded.length;
  const mixed = new Float32Array(length);
  for (let c = 0; c < channels; c += 1) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < length; i += 1) mixed[i] += data[i] / channels;
  }
  const ratio = decoded.sampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.max(1, Math.floor(length / ratio));
  const resampled = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(length - 1, lo + 1);
    const frac = pos - lo;
    resampled[i] = mixed[lo] * (1 - frac) + mixed[hi] * frac;
  }
  const dataBytes = outLength * 2;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < outLength; i += 1) {
    const clamped = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return wav;
}

function wavToBase64(wav: ArrayBuffer): string {
  const bytes = new Uint8Array(wav);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function blobToWavB64(blob: Blob): Promise<string> {
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) throw new Error("voice_audio_unsupported");
  const ctx = new AudioCtor();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return wavToBase64(encodeWavMono16k(decoded));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

const stateLabels: Record<MicState, string> = {
  idle: "Dictate the approver name by voice",
  listening: "Listening — click again to stop",
  working: "Transcribing your voice",
};

export function MicButton({ disabled = false, onTranscript, onStatus }: MicButtonProps) {
  const [state, setState] = useState<MicState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(
    () => () => {
      clearTimer();
      try {
        recorderRef.current?.stop();
      } catch {
        // Already stopped; unmount just releases the mic.
      }
      stopTracks();
    },
    [],
  );

  async function finish(blob: Blob) {
    setState("working");
    onStatus("Transcribing…");
    try {
      const result = await transcribeVoice(await blobToWavB64(blob), "approver.wav");
      if (result.source === "muse-voice-transcribe" && result.text) {
        onTranscript(result.text);
        onStatus(`Heard: ${result.text}`);
      } else {
        onStatus(result.detail ?? "Voice transcription unavailable — type the name instead.");
      }
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "transcribe_failed");
    } finally {
      setState("idle");
    }
  }

  function stopListening() {
    clearTimer();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop below runs finish()
    } else {
      stopTracks();
      setState("idle");
      onStatus(null);
    }
  }

  async function startListening() {
    const mimeType = pickMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      onStatus("Voice input isn't supported in this browser — type the name instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setState("idle");
          onStatus("Heard nothing — try again or type the name.");
          return;
        }
        void finish(blob);
      };
      recorder.start();
      setState("listening");
      onStatus("Listening… speak now, then click the mic again to stop.");
      timerRef.current = window.setTimeout(stopListening, MAX_SECONDS * 1000);
    } catch {
      stopTracks();
      setState("idle");
      onStatus("Microphone unavailable — allow access or type the name instead.");
    }
  }

  function onClick() {
    if (disabled || state === "working") return;
    if (state === "listening") {
      stopListening();
      return;
    }
    void startListening();
  }

  return (
    <button
      type="button"
      className="voice-mic"
      data-state={state}
      onClick={onClick}
      disabled={disabled || state === "working"}
      aria-label={stateLabels[state]}
      title={stateLabels[state]}
    >
      <span aria-hidden="true" className="voice-mic__ring" />
      <span aria-hidden="true" className="voice-mic__ring voice-mic__ring--delayed" />
      <svg className="voice-mic__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" />
        <path
          d="M5.5 11.5a6.5 6.5 0 0 0 13 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M12 18v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
