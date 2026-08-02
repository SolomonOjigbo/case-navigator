// The single place CaseMap talks to a language model.
//
// Replaces the Lovable AI gateway (https://ai.gateway.lovable.dev), which was
// tied to the Lovable account that originally owned this project. Every caller
// used the same OpenAI-shaped POST with response_format json_object, so the
// swap is contained here: callers pass a system prompt, a user prompt, and
// optionally one image, and get back parsed JSON.
//
// SERVER ONLY. The *.functions.ts modules ship to the client bundle, so they
// must reach this through a dynamic import inside the handler — never a
// top-level one. Same rule as client.server.ts.
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL } from "./ai-model";

// Claude Opus 5. Thinking is on by default on this model and max_tokens caps
// thinking plus response text together, hence the generous budget below.
export { AI_MODEL };

const MAX_TOKENS = 16000;

// The gateway guaranteed JSON with response_format; the Messages API expresses
// that per-schema. The prompts in ai-prompts.ts already specify their exact
// shapes, so rather than restate every one as a JSON Schema we keep the prompt
// contract and re-assert it here, then tolerate fenced output when parsing.
const JSON_ONLY =
  "\n\nReturn a single valid JSON object and nothing else. No prose before or " +
  "after it, no markdown code fences, no explanation.";

let _client: Anthropic | undefined;

function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY missing");
    }
    _client = new Anthropic();
  }
  return _client;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const SUPPORTED_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * Split a `data:image/png;base64,AAAA` URL into the parts the Messages API
 * wants. The gateway accepted the data URL wholesale via image_url; Anthropic
 * takes media_type and the bare base64 payload separately.
 */
export function parseDataUrl(dataUrl: string): { mediaType: ImageMediaType; data: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("ocr: expected a base64 data URL");
  const mediaType = match[1].toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
    throw new Error(`ocr: unsupported image type ${mediaType}`);
  }
  return { mediaType: mediaType as ImageMediaType, data: match[2] };
}

/**
 * Pull the model's text out of the response. Thinking blocks are returned
 * alongside text blocks and must be skipped — they are not part of the answer.
 */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/** Tolerate a fenced ```json block in case the model wraps its object. */
function stripFence(text: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(text.trim());
  return fenced ? fenced[1].trim() : text.trim();
}

export type ModelCall = {
  system: string;
  user: string;
  /** Optional base64 data URL, for the document OCR path. */
  imageDataUrl?: string;
};

/**
 * Call the model and parse its reply as JSON.
 *
 * Throws on a transport or auth failure — callers already treat that as fatal.
 * A reply that is not JSON throws too; callers that had a parse-error fallback
 * keep it by catching around this.
 */
export async function callModelJSON(call: ModelCall): Promise<unknown> {
  const content: Anthropic.ContentBlockParam[] = [];

  if (call.imageDataUrl) {
    const { mediaType, data } = parseDataUrl(call.imageDataUrl);
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    });
  }
  content.push({ type: "text", text: call.user });

  const message = await client().messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: call.system + JSON_ONLY,
    // Extraction and summarisation over a claimant's own account: accurate
    // reading matters more than latency, but these are not open-ended
    // reasoning tasks, so medium effort rather than the default high.
    output_config: { effort: "medium" },
    messages: [{ role: "user", content }],
  });

  if (message.stop_reason === "refusal") {
    throw new Error("ai: the model declined this request");
  }

  const text = textOf(message);
  if (!text) throw new Error("ai: empty response");
  return JSON.parse(stripFence(text));
}
