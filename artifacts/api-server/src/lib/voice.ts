// Muse Voice Transcribe for the approver name (Meta Model API).
//
// Contract (Meta model cookbook 06_muse_voice + dev.meta.ai speech-to-text):
// POST https://api.meta.ai/v1/asr/transcribe, model
// "muse-voice-transcribe-1.0", multipart body with a JSON "request" part
// ({model, audioEncoding: "WAV", mode: "PUSH_TO_TALK"}) plus the "audio"
// part, Authorization: Bearer <META_MODEL_API_KEY>. Audio must be
// RIFF/WAVE mono 16-bit PCM at 16/24 kHz; caps are 32 MB / 10 minutes.
// The transcript comes back in `transcript`.
//
// The browser records and converts to 16 kHz mono WAV client-side, so this
// module needs no audio toolchain. The model ONLY transcribes speech to
// text — it never approves or pays. Any failure (no key, network, bad
// payload) reports setup-required/unavailable with no invented text.
export const VOICE_TRANSCRIBE_URL = "https://api.meta.ai/v1/asr/transcribe";
export const VOICE_MODEL = "muse-voice-transcribe-1.0";
const API_KEY_ENV_VAR = "META_MODEL_API_KEY";

// Server caps: 32 MB body / 10 minutes of audio. Oversized uploads are
// rejected locally instead of sending a request the server would refuse.
export const VOICE_MAX_BYTES = 32 * 1024 * 1024;

export type VoiceConfig = { apiKey: string };

export function voiceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VoiceConfig | null {
  const apiKey = env[API_KEY_ENV_VAR] ?? "";
  return apiKey ? { apiKey } : null;
}

export function buildVoiceRequestPart(): {
  model: string;
  audioEncoding: string;
  mode: string;
} {
  return { model: VOICE_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK" };
}

export function decodeAudioB64(raw: string): Buffer {
  let text = (raw ?? "").trim();
  if (!text) throw new Error("voice_audio_missing");
  if (text.includes(",")) text = text.split(",", 2)[1] ?? ""; // data: URL prefix
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new Error("voice_audio_not_base64");
  }
  const audio = Buffer.from(text, "base64");
  if (audio.length === 0) throw new Error("voice_audio_missing");
  if (audio.length > VOICE_MAX_BYTES) throw new Error("voice_audio_too_large");
  return audio;
}

export type VoiceSource = "muse-voice-transcribe" | "setup-required" | "unavailable";

export type VoiceResult =
  | { source: "muse-voice-transcribe"; model: string; text: string }
  | { source: "setup-required" | "unavailable"; model: string; text: null; detail: string };

async function fetchTranscript(
  cfg: VoiceConfig,
  audio: Buffer,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("request", JSON.stringify(buildVoiceRequestPart()));
  const bytes = Uint8Array.from(audio);
  form.append(
    "audio",
    new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" }),
    filename,
  );
  const res = await fetch(VOICE_TRANSCRIBE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`voice_transcribe_failed:${res.status}`);
  const data = (await res.json().catch(() => null)) as { transcript?: unknown } | null;
  const transcript = data?.transcript;
  if (typeof transcript !== "string" || !transcript.trim()) {
    throw new Error("voice_transcribe_no_transcript");
  }
  return transcript.trim();
}

export async function transcribeAudio(
  cfg: VoiceConfig | null,
  audio: Buffer,
  filename: string,
): Promise<VoiceResult> {
  if (!cfg) {
    return {
      source: "setup-required",
      model: VOICE_MODEL,
      text: null,
      detail: `No API key: set ${API_KEY_ENV_VAR} to transcribe with ${VOICE_MODEL}.`,
    };
  }
  try {
    const text = await fetchTranscript(cfg, audio, filename);
    return { source: "muse-voice-transcribe", model: VOICE_MODEL, text };
  } catch {
    return {
      source: "unavailable",
      model: VOICE_MODEL,
      text: null,
      detail: "Muse Voice Transcribe call failed; no transcript produced.",
    };
  }
}
