// Maintained test for the Voice Transcribe layer (offline-capable parts
// only; no network, no key). Runner: node --test src/lib/voice.test.ts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_MAX_BYTES,
  VOICE_MODEL,
  VOICE_TRANSCRIBE_URL,
  buildVoiceRequestPart,
  decodeAudioB64,
  transcribeAudio,
  voiceConfigFromEnv,
} from "./voice.ts";

describe("voice transcribe", () => {
  it("builds the deterministic push-to-talk request part", () => {
    assert.deepEqual(buildVoiceRequestPart(), {
      model: VOICE_MODEL,
      audioEncoding: "WAV",
      mode: "PUSH_TO_TALK",
    });
    assert.equal(VOICE_TRANSCRIBE_URL, "https://api.meta.ai/v1/asr/transcribe");
    assert.equal(VOICE_MODEL, "muse-voice-transcribe-1.0");
  });

  it("reads the key from META_MODEL_API_KEY only", () => {
    assert.deepEqual(voiceConfigFromEnv({ META_MODEL_API_KEY: "k" }), { apiKey: "k" });
    assert.equal(voiceConfigFromEnv({}), null);
    assert.equal(voiceConfigFromEnv({ META_MODEL_API_KEY: "" }), null);
  });

  it("decodes base64 audio and tolerates a data URL prefix", () => {
    const decoded = decodeAudioB64("aGk=");
    assert.ok(Buffer.isBuffer(decoded));
    assert.equal(decoded.toString("utf8"), "hi");
    assert.equal(
      decodeAudioB64("data:audio/wav;base64,aGk=").toString("utf8"),
      "hi",
    );
  });

  it("rejects missing, malformed, and oversized uploads with codes", () => {
    assert.throws(() => decodeAudioB64(""), /voice_audio_missing/);
    assert.throws(() => decodeAudioB64("!!!not-base64!!!"), /voice_audio_not_base64/);
    assert.throws(() => decodeAudioB64("abc"), /voice_audio_not_base64/);
    const tooBig = Buffer.alloc(VOICE_MAX_BYTES + 1).toString("base64");
    assert.throws(() => decodeAudioB64(tooBig), /voice_audio_too_large/);
  });

  it("reports setup-required without a key and invents nothing", async () => {
    const result = await transcribeAudio(null, Buffer.from("RIFF"), "clip.wav");
    assert.equal(result.source, "setup-required");
    assert.equal(result.text, null);
    assert.match(result.detail, /META_MODEL_API_KEY/);
  });
});
