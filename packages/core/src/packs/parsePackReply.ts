// parsePackReply.ts — Reading a reply without believing it.
//
// The assistant has no structured-output mode and its quality varies between
// sessions, so the tool controls what it sends and what it accepts, and nothing
// else. Every rung of this ladder exists because the alternative is a value
// nobody chose reaching Jira:
//
//  - A reply from a different pack is rejected whole, not partly ingested.
//  - An invented issue key is dropped and SHOWN, because a silent drop is a
//    result that quietly covers fewer issues than it claims.
//  - A value outside a declared set becomes null rather than a nearest match.
//  - An omitted field means "no opinion", never false and never empty — an
//    assistant that says nothing about a checkbox must not untick it.
//  - Anything unreadable is counted, because a round trip that silently
//    discarded four items is one whose output cannot be trusted.

import { extractJsonPayload } from "./extractJsonPayload.js";
import type { PackFieldSpec, PromptPack, ValidatedFieldValue, ValidatedItem } from "./promptPack.js";
import type { PromptChunk } from "./buildPromptChunks.js";

/** Why a whole reply was refused. */
export type ReplyRejection =
  | { readonly kind: "wrong-pack"; readonly detail: string }
  | { readonly kind: "unreadable"; readonly detail: string }
  | { readonly kind: "wrong-envelope"; readonly detail: string };

/** An honest account of what the reply contained. */
export interface PackReplyResult {
  readonly items: readonly ValidatedItem[];
  /** Keys the assistant used that were not in this part. Dropped, and shown. */
  readonly unknownKeys: readonly string[];
  /** Items that could not be read at all. */
  readonly unparsedCount: number;
  readonly duplicateKeys: readonly string[];
  /** Values shortened to fit a declared maximum, named so nothing is silently cut. */
  readonly truncatedFields: readonly { readonly issueKey: string; readonly fieldName: string }[];
  readonly rejection: ReplyRejection | null;
}

/** An empty result carrying one rejection. */
function rejectWholeReply(rejection: ReplyRejection): PackReplyResult {
  return {
    items: [],
    unknownKeys: [],
    unparsedCount: 0,
    duplicateKeys: [],
    truncatedFields: [],
    rejection,
  };
}

/** Validates one field value against its declared shape. */
function validateFieldValue(
  spec: PackFieldSpec,
  rawValue: unknown,
): { value: ValidatedFieldValue; wasTruncated: boolean } {
  // Omission and explicit null both mean "no opinion". Neither may become a value.
  if (rawValue === null || rawValue === undefined) return { value: null, wasTruncated: false };

  switch (spec.kind) {
    case "text": {
      const text = String(rawValue);
      const wasTruncated = text.length > spec.maxLength;
      return { value: wasTruncated ? text.slice(0, spec.maxLength) : text, wasTruncated };
    }
    case "enum": {
      const candidate = String(rawValue);
      // Not a nearest match: an unrecognised value is an absence of an answer.
      const isAllowed = spec.allowedValues.includes(candidate);
      return { value: isAllowed ? candidate : null, wasTruncated: false };
    }
    case "number": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) return { value: null, wasTruncated: false };
      if (spec.minimum !== undefined && parsed < spec.minimum) return { value: null, wasTruncated: false };
      if (spec.maximum !== undefined && parsed > spec.maximum) return { value: null, wasTruncated: false };
      return { value: parsed, wasTruncated: false };
    }
    case "boolean":
      // Tri-state on purpose. Only a real boolean is an opinion.
      return { value: typeof rawValue === "boolean" ? rawValue : null, wasTruncated: false };
    case "issueKeyList":
      return {
        value: Array.isArray(rawValue) ? rawValue.map(String) : null,
        wasTruncated: false,
      };
  }
}

/**
 * Reads one reply for one part.
 *
 * Every count in the result is surfaced by the panel. They are part of the
 * answer, not diagnostics hidden behind a log.
 */
export function parsePackReply(
  pack: PromptPack,
  replyText: string,
  chunk: PromptChunk,
): PackReplyResult {
  let payload: unknown;
  try {
    payload = extractJsonPayload(replyText);
  } catch (error) {
    return rejectWholeReply({
      kind: "unreadable",
      detail: error instanceof Error ? error.message : "The reply could not be read as JSON.",
    });
  }

  if (payload === null || typeof payload !== "object") {
    return rejectWholeReply({ kind: "wrong-envelope", detail: "The reply was not a JSON object." });
  }

  const envelope = payload as { packId?: unknown; items?: unknown };

  // The guard that catches a reply pasted into the wrong surface. Rejecting the
  // whole thing is deliberate: a partial ingest from the wrong job would apply
  // suggestions nobody asked for.
  if (typeof envelope.packId !== "string") {
    return rejectWholeReply({
      kind: "wrong-envelope",
      detail: 'The reply has no "packId", so there is no way to tell which task it answers.',
    });
  }

  if (envelope.packId !== pack.packId) {
    return rejectWholeReply({
      kind: "wrong-pack",
      detail: `This reply answers "${envelope.packId}", but it was pasted into "${pack.packId}".`,
    });
  }

  if (!Array.isArray(envelope.items)) {
    return rejectWholeReply({
      kind: "wrong-envelope",
      detail: 'The reply has no "items" array.',
    });
  }

  const whitelist = new Set(chunk.issueKeyWhitelist);
  const seenKeys = new Set<string>();
  const items: ValidatedItem[] = [];
  const unknownKeys: string[] = [];
  const duplicateKeys: string[] = [];
  const truncatedFields: { issueKey: string; fieldName: string }[] = [];
  let unparsedCount = 0;

  for (const rawItem of envelope.items) {
    if (rawItem === null || typeof rawItem !== "object") {
      unparsedCount += 1;
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const issueKey = typeof item.key === "string" ? item.key : "";

    if (issueKey.length === 0) {
      unparsedCount += 1;
      continue;
    }

    if (!whitelist.has(issueKey)) {
      unknownKeys.push(issueKey);
      continue;
    }

    if (seenKeys.has(issueKey)) {
      duplicateKeys.push(issueKey);
    }
    seenKeys.add(issueKey);

    const values: Record<string, ValidatedFieldValue> = {};
    for (const spec of pack.itemSchema.fields) {
      const validated = validateFieldValue(spec, item[spec.name]);
      values[spec.name] = validated.value;
      if (validated.wasTruncated) truncatedFields.push({ issueKey, fieldName: spec.name });
    }

    // Last one wins for a duplicate, but the duplication is reported either way.
    const existingIndex = items.findIndex((candidate) => candidate.issueKey === issueKey);
    if (existingIndex >= 0) items.splice(existingIndex, 1);
    items.push({ issueKey, values });
  }

  return { items, unknownKeys, unparsedCount, duplicateKeys, truncatedFields, rejection: null };
}
