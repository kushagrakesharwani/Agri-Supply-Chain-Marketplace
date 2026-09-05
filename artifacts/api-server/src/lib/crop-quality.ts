type QualityGrade = "Good" | "Medium" | "Poor";

export type CropQualityAssessment = {
  grade: QualityGrade;
  reason: string;
};

const GEMINI_MODEL = "gemini-3.6-flash";

export async function assessTomatoQuality(
  image: Buffer,
  mimeType: string,
): Promise<CropQualityAssessment> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "Assess this tomato crop photo for marketplace listing quality.",
                  'Return only JSON in this exact shape: {"grade":"Good|Medium|Poor","reason":"one short sentence"}.',
                  "Use Good for fresh, healthy-looking tomatoes with no obvious defects; Medium for acceptable produce with minor visible issues; Poor for significant spoilage, damage, or quality concerns.",
                  "Do not infer details that are not visible in the image.",
                ].join(" "),
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: image.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini quality request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no quality assessment");

  const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as {
    grade?: unknown;
    reason?: unknown;
  };
  if (
    (parsed.grade !== "Good" && parsed.grade !== "Medium" && parsed.grade !== "Poor") ||
    typeof parsed.reason !== "string" ||
    parsed.reason.trim().length === 0
  ) {
    throw new Error("Gemini returned an invalid quality assessment");
  }

  return { grade: parsed.grade, reason: parsed.reason.trim().slice(0, 300) };
}