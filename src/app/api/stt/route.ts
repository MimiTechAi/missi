import { NextRequest, NextResponse } from "next/server";

// Voxtral STT - Mistral's own Speech-to-Text
// Replaces browser SpeechRecognition with Mistral-native transcription
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioBlob = formData.get("audio") as Blob;
    const language = (formData.get("language") as string) || undefined;

    if (!audioBlob) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Build FormData for Mistral Voxtral API
    const mistralForm = new FormData();
    mistralForm.append("model", "voxtral-mini-latest");
    mistralForm.append(
      "file",
      new Blob([await audioBlob.arrayBuffer()], { type: "audio/webm" }),
      "recording.webm"
    );
    if (language) {
      mistralForm.append("language", language);
    }

    const response = await fetch(
      "https://api.mistral.ai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: mistralForm,
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Voxtral STT error:", response.status, err);
      return NextResponse.json(
        { error: "Voxtral transcription failed", details: err },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({
      text: result.text || "",
      language: result.language,
      duration: result.duration,
      model: "voxtral-mini-latest",
    });
  } catch (error) {
    console.error("STT route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
