import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, language } = await req.json();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
    }

    // Sarah — Warm, feminine — perfect for MISSI (name derived from Mistral = feminine)
    // ElevenLabs v2.5 handles multilingual automatically
    const voice = voiceId || "EXAVITQu4vr4xnSDxMaL";

    // Use multilingual model for non-English, flash for English
    const isEnglish = !language || language.startsWith("en");
    const modelId = isEnglish ? "eleven_flash_v2_5" : "eleven_multilingual_v2";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.82,
            style: 0.25,
            use_speaker_boost: true,
          },
          optimize_streaming_latency: isEnglish ? 3 : 2,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs error:", err);
      return NextResponse.json({ error: `ElevenLabs error: ${err}` }, { status: response.status });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
