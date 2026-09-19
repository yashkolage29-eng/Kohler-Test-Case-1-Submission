// Deterministic offline twin of the AI adapter (T-013, SYS-ARCH §6.3, ADR-013).
// Fixed English keyword lexicon mapped onto the CLOSED vocabularies of
// engine/contracts/vocab.ts. Unknown words are ignored, never invented. Every
// output passes the same validators as NIM output (validate.ts).

import {
  type DecisionReceipt,
  type FeatureConstraints,
  type FinishFamily,
  type FixtureClass,
  type FeatureTag,
  type RelaxationMenu,
} from "@kolher/engine";
import { parseFeatureConstraints } from "./validate.js";

/** Keyword → closed-vocab lexicon. Word boundaries, lowercase, substring-safe. */
const FEATURE_LEXICON: ReadonlyArray<readonly [RegExp, FeatureTag]> = [
  [/\brain(s)?\b/, "rain_shower"],
  [/\bthermostat(ic)?\b/, "thermostatic"],
  [/\btouch(e)?less\b/, "touchless"],
  [/\bbidet\b/, "bidet"],
  [/\bsmart\b/, "smart"],
  [/\bheated\b/, "heated_seat"],
  [/\bself[- ]?clean(ing)?\b/, "self_cleaning"],
  [/\bdual[- ]?flush\b/, "dual_flush"],
  [/\blow[- ]?flow\b|\bwater[- ]?saver\b|\beco\b|\bwaterefficient\b/, "low_flow"],
  [/\bsingle[- ]?lever\b/, "single_lever"],
  [/\bcomfort[- ]?height\b/, "comfort_height"],
  [/\belongated\b/, "elongated"],
  [/\brimless\b|\bno[- ]?overflow\b/, "overflow_none"],
  [/\bsoft[- ]?clos(e|ing)\b/, "soft_close"],
  [/\bfloor[- ]?mount(ed)?\b/, "floor_mount"],
  [/\bwall[- ]?mount(ed)?\b|\bwall[- ]?hung\b/, "wall_mount"],
  [/\bdeck[- ]?mount(ed)?\b/, "deck_mount"],
  [/\bfreestanding\b|\bfree[- ]?standing\b/, "freestanding"],
];

const FINISH_LEXICON: ReadonlyArray<readonly [RegExp, FinishFamily]> = [
  [/\bmatte[- ]?black\b/, "matte_black"],
  [/\bbrushed[- ]?nickel\b/, "brushed_nickel"],
  [/\bbrushed[- ]?gold\b|\bgold\b|\bbrass\b/, "brushed_gold"],
  [/\bchrome\b|\bpolished\b|\bsilver\b/, "chrome"],
  [/\bstone\b|\bmarble\b|\bgranite\b/, "stone"],
  [/\bwhite\b/, "white"],
];

const CLASS_LEXICON: ReadonlyArray<readonly [RegExp, FixtureClass]> = [
  [/\btoilet(s)?\b|\bwc\b/, "toilet"],
  [/\bbasin(s)?\b|\bsink(s)?\b/, "basin"],
  [/\bfaucet(s)?\b|\btap(s)?\b|\bshowerhead(s)?\b/, "faucet"],
  [/\bshower(s)?\b/, "shower"],
  [/\btub(s)?\b|\bbath(tub)?(s)?\b|\bsoaking\b/, "tub"],
  [/\bvanit(y|ies)\b/, "vanity"],
  [/\baccessor(y|ies)\b|\btowel\b|\bmirror\b|\bgrab\b/, "accessory"],
];

function collect<V>(text: string, lex: ReadonlyArray<readonly [RegExp, V]>): V[] {
  const lower = text.toLowerCase();
  const hits = new Set<V>();
  for (const [re, v] of lex) if (re.test(lower)) hits.add(v);
  return [...hits].sort() as V[];
}

/** Offline taste→features: closed-vocab only; null when nothing valid survived. */
export function offlineTasteToFeatures(text: string): FeatureConstraints | null {
  return parseFeatureConstraints({
    requiredFeatures: collect(text, FEATURE_LEXICON),
    finishFamilies: collect(text, FINISH_LEXICON),
    preferredClasses: collect(text, CLASS_LEXICON),
    classCountRanges: {},
  });
}

/** Receipt-bound template narration: renders receipt fields via fixed templates. */
export function offlineNarr(receipt: DecisionReceipt): string {
  const top = receipt.topK?.[0];
  const parts: string[] = [];
  if (top) {
    parts.push(
      `Top recommendation ${top.candidateId} scored ${String(top.total)} across ${String(Object.keys(receipt.scoreMatrix ?? {}).length)} scored candidates.`
    );
  } else {
    parts.push("No candidate could be confirmed against the hard rules.");
  }
  const failed = (receipt.firedRuleTrace ?? []).filter((v) => !v.pass);
  if (failed.length > 0) {
    parts.push(`Rules that did not pass: ${failed.map((v) => v.ruleId).join(", ")}.`);
  }
  if (receipt.constraintsTension?.length) {
    parts.push(`Constraints in tension: ${receipt.constraintsTension.join("; ")}.`);
  }
  if (receipt.dataGaps?.length) {
    parts.push(`Catalog gaps surfaced honestly: ${receipt.dataGaps.join("; ")}.`);
  }
  if (receipt.relaxationMenu?.length) {
    parts.push(
      `${String(receipt.relaxationMenu.length)} relaxation option(s) exist if you want to trade something off.`
    );
  }
  return parts.join(" ");
}

/** Offline tradeoffs: rephrase label prefix only; tradeoffDelta content unchanged. */
export function offlineTradeoffs(menu: RelaxationMenu): string[] {
  return menu.map((m, i) => `Option ${String(i + 1)} (${m.kind}): ${m.tradeoffDelta}`);
}
