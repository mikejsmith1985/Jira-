// packRegistry.ts — Every pack, derived from its own declaration.
//
// Adding a pack means writing one file and adding it to this array. There is no
// second catalogue, no identifier union to keep in step and no user-interface
// list to remember — which is the same discipline the check registry follows,
// and for the same reason: the predecessor required four hand-synced lists and
// one of its checks fell out of the fourth, so it ran on every scan and was
// filtered out of every result.

import { ASK_ANYTHING_PACK } from "./definitions/askAnything.js";
import type { PromptPack } from "./promptPack.js";

/** Every pack this build ships. */
export const ALL_PROMPT_PACKS: readonly PromptPack[] = [ASK_ANYTHING_PACK];

/** Finds a pack by its identifier, or undefined when nothing declares it. */
export function findPromptPack(packId: string): PromptPack | undefined {
  return ALL_PROMPT_PACKS.find((pack) => pack.packId === packId);
}
