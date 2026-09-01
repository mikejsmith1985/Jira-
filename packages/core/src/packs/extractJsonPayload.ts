// extractJsonPayload.ts — Getting JSON out of what a chat assistant actually
// returns.
//
// Copilot is reached by copy and paste. There is no structured-output mode, no
// system prompt and no way to regression-test a reply, so the JSON that comes
// back is usually valid and occasionally not — wrapped in a code fence,
// prefaced with a sentence, or carrying one of three recurring defects.
//
// This repairs only what is well understood, and is a strict no-op on
// already-valid JSON. Anything still unreadable afterwards is reported and
// counted rather than quietly discarded: a round trip that silently dropped
// four items is a round trip whose output cannot be trusted.

/** Thrown when the reply contains no JSON object at all. */
export class NoJsonFoundError extends Error {
  constructor() {
    super("No JSON object was found in the reply.");
    this.name = "NoJsonFoundError";
  }
}

/** Strips markdown code fences, which assistants add whether asked to or not. */
function stripCodeFences(text: string): string {
  return text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
}

/** Narrows the text to the outermost braces, discarding surrounding prose. */
function sliceToOutermostObject(text: string): string {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) throw new NoJsonFoundError();
  return text.slice(firstBrace, lastBrace + 1);
}

/**
 * Repairs the three defects assistants actually produce.
 *
 * Walks the text once, tracking whether it is inside a string, so a fix applied
 * to prose is never applied to structure. Deliberately conservative: it does not
 * try to salvage arbitrary broken JSON, because a plausible repair of something
 * genuinely malformed would invent content.
 */
function repairJsonPayload(text: string): string {
  const repaired: string[] = [];
  let isInsideString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";

    if (isEscaped) {
      repaired.push(character);
      isEscaped = false;
      continue;
    }

    if (character === "\\") {
      repaired.push(character);
      isEscaped = true;
      continue;
    }

    if (character === '"') {
      if (!isInsideString) {
        isInsideString = true;
        repaired.push(character);
        continue;
      }

      // A quote inside a string closes it only when what follows is structure.
      // Otherwise the assistant quoted something inside its own text, and the
      // quote must be escaped rather than treated as a terminator.
      const rest = text.slice(index + 1);
      const isClosing = /^\s*[,:}\]]/.test(rest) || /^\s*$/.test(rest);
      if (isClosing) {
        isInsideString = false;
        repaired.push(character);
      } else {
        repaired.push('\\"');
      }
      continue;
    }

    // A raw newline or tab inside a string is invalid JSON; assistants emit them
    // when a description spans lines.
    if (isInsideString && (character === "\n" || character === "\r" || character === "\t")) {
      repaired.push(character === "\t" ? "\\t" : "\\n");
      continue;
    }

    repaired.push(character);
  }

  // A trailing comma before a closing brace or bracket.
  return repaired.join("").replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Extracts a JSON object from an assistant's reply.
 *
 * @throws {NoJsonFoundError} when the reply contains no object at all.
 * @throws {SyntaxError} when what was found could not be repaired into JSON.
 */
export function extractJsonPayload(replyText: string): unknown {
  const sliced = sliceToOutermostObject(stripCodeFences(replyText));

  try {
    // Valid JSON is returned untouched; the repair pass never runs on it.
    return JSON.parse(sliced);
  } catch {
    return JSON.parse(repairJsonPayload(sliced));
  }
}
