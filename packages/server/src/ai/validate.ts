// Hand-rolled strict validators for AI output (T-013, SYS-ARCH §6.2, ADR-013/014).
// No zod — zero-runtime-deps posture (ADR-011). Every validator returns a typed
// value or null; AI output that fails validation never reaches the caller and the
// adapter falls back to the deterministic offline twin.

import {
  FEATURE_TAGS,
  FINISH_FAMILIES,
  FIXTURE_CLASSES,
  type FeatureConstraints,
  type FeatureTag,
  type FinishFamily,
  type FixtureClass,
  type DecisionReceipt,
  type RelaxationMenu,
} from "@kolher/engine";

/** Prompt-injection tripwire: explicit instruction-override phrasing. */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /<\s*script\b/i,
  /system\s*:/i,
];

export function isInjectionSafe(text: string): boolean {
  return !INJECTION_PATTERNS.some((p) => p.test(text));
}

function isFeatureTag(v: unknown): v is FeatureTag {
  return (FEATURE_TAGS as readonly string[]).includes(v as string);
}
function isFinishFamily(v: unknown): v is FinishFamily {
  return (FINISH_FAMILIES as readonly string[]).includes(v as string);
}
function isFixtureClass(v: unknown): v is FixtureClass {
  return (FIXTURE_CLASSES as readonly string[]).includes(v as string);
}

/**
 * Strict parse of an AI-produced FeatureConstraints candidate (SYS-ARCH §6.2 schema
 * validation). Dedupes + sorts against the CLOSED vocabularies, drops unknown values,
 * coerces classCountRanges to {min,max} ints ≥ 0 or drops them. Returns null when
 * nothing valid survived (caller must fall back — never forward empty garbage).
 */
export function parseFeatureConstraints(raw: unknown): FeatureConstraints | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const req = Array.isArray(o.requiredFeatures)
    ? [...new Set(o.requiredFeatures.filter(isFeatureTag))].sort()
    : [];
  const finishes = Array.isArray(o.finishFamilies)
    ? [...new Set(o.finishFamilies.filter(isFinishFamily))].sort()
    : [];
  const classes = Array.isArray(o.preferredClasses)
    ? [...new Set(o.preferredClasses.filter(isFixtureClass))].sort()
    : [];

  const classCountRanges: FeatureConstraints["classCountRanges"] = {};
  if (typeof o.classCountRanges === "object" && o.classCountRanges !== null) {
    for (const [k, v] of Object.entries(o.classCountRanges as Record<string, unknown>)) {
      if (!isFixtureClass(k) || typeof v !== "object" || v === null) continue;
      const r = v as Record<string, unknown>;
      const min = Number.isInteger(r.min) && (r.min as number) >= 0 ? (r.min as number) : null;
      const max = Number.isInteger(r.max) && (r.max as number) >= 0 ? (r.max as number) : null;
      if (min !== null && max !== null && min <= max) classCountRanges[k] = { min, max };
    }
  }

  // Nothing valid survived → reject outright (no invented empty constraints).
  if (req.length === 0 && finishes.length === 0 && classes.length === 0) return null;

  const tone = typeof o.tone === "string" && o.tone.length <= 400 && isInjectionSafe(o.tone)
    ? o.tone
    : undefined;

  return {
    requiredFeatures: req as FeatureTag[],
    preferredClasses: classes as FixtureClass[],
    finishFamilies: finishes as FinishFamily[],
    classCountRanges,
    ...(tone !== undefined ? { tone } : {}),
  };
}

function normalizeNums(text: string): Set<string> {
  // Strip INR thousand separators, then extract every integer/decimal token.
  const flat = text.replace(/,/g, "");
  const out = new Set<string>();
  for (const m of flat.matchAll(/\d+(?:\.\d+)?/g)) {
    out.add(m[0]);
    out.add(m[0].replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")); // 12.50 ≡ 12.5
  }
  return out;
}

/**
 * Receipt-binding guard (ADR-014): a narration is valid only if every number it
 * mentions appears somewhere in the receipt JSON. Guards invented facts; the
 * tolerance normalizes INR comma formatting on both sides.
 */
export function validateNarration(text: string, receipt: DecisionReceipt): boolean {
  if (typeof text !== "string" || text.length === 0 || text.length > 8000) return false;
  if (!isInjectionSafe(text)) return false;
  const allowed = normalizeNums(JSON.stringify(receipt));
  for (const n of normalizeNums(text)) if (!allowed.has(n)) return false;
  return true;
}

/**
 * Tradeoff rephrase guard (OPT §12.1, ADR-014): each output string must not introduce
 * digits absent from the corresponding tradeoffDelta. Rephrase-only, never add facts.
 */
export function validateTradeoffs(arr: unknown, menu: RelaxationMenu): string[] | null {
  if (!Array.isArray(arr) || arr.length === 0 || arr.length !== menu.length) return null;
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (typeof s !== "string" || s.length === 0 || s.length > 2000) return null;
    if (!isInjectionSafe(s)) return null;
    const allowed = normalizeNums(menu[i]?.tradeoffDelta ?? "");
    for (const n of normalizeNums(s)) if (!allowed.has(n)) return null;
    out.push(s);
  }
  return out;
}

/** Décor fixture list: ≤20 items of exactly {fixtureClass, modelId}, non-empty strings ≤80 chars. */
export function isDecorFixtures(raw: unknown): raw is Array<{ fixtureClass: string; modelId: string }> {
  const short = (v: unknown): boolean => typeof v === "string" && v.length > 0 && v.length <= 80;
  return Array.isArray(raw) && raw.length <= 20 && raw.every((f) =>
    typeof f === "object" && f !== null && !Array.isArray(f) &&
    Object.keys(f).every((k) => k === "fixtureClass" || k === "modelId") &&
    short((f as Record<string, unknown>).fixtureClass) && short((f as Record<string, unknown>).modelId));
}

/** Photo upload: base64 PNG/JPEG data URL within the request body bound. */
export const MAX_PHOTO_DATA_URL_CHARS = 1_000_000;
export function isPhotoDataUrl(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length <= MAX_PHOTO_DATA_URL_CHARS && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw);
}
