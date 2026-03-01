import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, language } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
    }

    const voice = voiceId || "EXAVITQu4vr4xnSDxMaL"; // Sarah default
    const lang = (language || "en-US").split("-")[0].toLowerCase();
    const isEnglish = lang === "en";
    const isShort = text.length < 80;

    // eleven_flash_v2_5 = lowest latency (280ms) for English
    // eleven_multilingual_v2 = best quality for other languages
    const modelId = isEnglish ? "eleven_flash_v2_5" : "eleven_multilingual_v2";
    const optimizeLatency = isShort ? 4 : (isEnglish ? 3 : 2);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: modelId,
          voice_settings: {
            stability: 0.48,
            similarity_boost: 0.84,
            style: 0.28,
            use_speaker_boost: true,
          },
          optimize_streaming_latency: optimizeLatency,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs TTS error:", response.status, errText);
      if (response.status === 401) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
      if (response.status === 429) return NextResponse.json({ error: "Rate limited" }, { status: 429 });
      return NextResponse.json({ error: `ElevenLabs ${response.status}` }, { status: response.status });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "TTS timeout" }, { status: 504 });
    }
    console.error("TTS error:", error);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
