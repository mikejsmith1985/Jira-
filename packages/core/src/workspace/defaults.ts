// defaults.ts — The three numbers that shape a retrieval, named once.
//
// Article IV forbids magic numbers, but the real reason these live here is that
// all three are user-configurable and all three are shown on screen. A literal
// buried in a fetch loop can be neither displayed nor changed, and a limit the
// user cannot see is a limit they will eventually mistake for a total.

/**
 * How many issues one retrieval may fetch before it stops and says so.
 *
 * Not a hard ceiling on what Jira holds — a retrieval that stops here reports
 * `truncated`, and every figure derived from it announces itself as a floor.
 */
export const DEFAULT_RETRIEVAL_CEILING = 2_000;

/**
 * Issues requested per page.
 *
 * Jira Data Center clamps a request above its configured maximum **silently**
 * rather than rejecting it, so this stays comfortably below the common default
 * of 1,000. Paging never trusts the length of a returned page anyway; it follows
 * Jira's own reported total.
 */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * Characters allowed in one prompt part.
 *
 * Microsoft Copilot's input accepts roughly 18,000. This sits below that so the
 * user's own appended question still fits, which means dividing a prompt is the
 * normal case rather than an edge case.
 */
export const DEFAULT_TRANSFER_BUDGET_CHARACTERS = 15_000;

/** The assistant's observed input limit, above which a paste is refused outright. */
export const ASSISTANT_INPUT_LIMIT_CHARACTERS = 18_000;
