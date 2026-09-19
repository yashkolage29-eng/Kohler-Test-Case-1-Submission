// Load-time validation & quarantine pipeline (SCHEMA §9 steps 2–7) and graph construction
// entry points. Everything here is deterministic: first failing check per SKU, one quarantine
// record per SKU, fixpoint reference integrity, veto > force > default precedence.

import type {
  CatalogState,
  Category,
  CompatOverrides,
  Finish,
  GeoPrimitive,
  GeometryDescriptor,
  LoadReport,
  QuarantineReason,
  QuarantineRecord,
  SKU,
  WaterMeta,
} from "./schema.js";
import { ANCHORS, CATEGORY_BY_CLASS, CATEGORIES, FIXTURE_CLASSES, PART_VOCAB } from "./schema.js";
import { FEATURE_TAGS, MOUNTING_TAGS } from "../contracts/vocab.js";
import { compatibilityGraph, defaultOk, substituteMap } from "./graph.js";
import { canonicalJson } from "../contracts/canonical.js";
import { sha256Hex } from "./hash.js";

export interface CatalogInput {
  catalogVersion: string;
  finishes: readonly Finish[];
  skus: readonly unknown[];
  overrides: CompatOverrides;
}

interface Pass1 {
  sku?: SKU;
  record?: QuarantineRecord;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => isStr(x));

/** mm storage values carry max one decimal place (SCHEMA §2.1). */
const isMmValue = (v: unknown): v is number =>
  isNum(v) && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

const isDimLike = (v: unknown): v is { w: number; d: number; h: number } =>
  isObj(v) && isNum(v.w) && isNum(v.d) && isNum(v.h);

const WET_CLASSES: ReadonlySet<string> = new Set(["toilet", "faucet", "shower"]);

/** Primitive AABB extents from its anchor offset (§6.1/§6.3). */
function primitiveAabb(p: GeoPrimitive): {
  min: [number, number, number];
  max: [number, number, number];
} {
  if (p.kind.shape === "box") {
    const { w, d, h } = p.kind.sizeMm;
    return {
      min: [p.offsetMm.x, p.offsetMm.y, p.offsetMm.z],
      max: [p.offsetMm.x + w, p.offsetMm.y + h, p.offsetMm.z + d],
    };
  }
  const r = p.kind.radiusMm;
  return {
    min: [p.offsetMm.x - r, p.offsetMm.y, p.offsetMm.z - r],
    max: [p.offsetMm.x + r, p.offsetMm.y + p.kind.hMm, p.offsetMm.z + r],
  };
}

function categoryValid(raw: Record<string, unknown>, cls: string, category: string): boolean {
  if (!CATEGORIES.includes(category as Category)) return false;
  if (cls === "toilet") {
    if (category === "Toilets") return true;
    if (category === "Smart Toilets") {
      // lenient look-ahead at raw tags — structural tag checks happen later in field order
      const tags = raw.feature_tags;
      return Array.isArray(tags) && tags.includes("smart");
    }
    return false;
  }
  return category === CATEGORY_BY_CLASS[cls as keyof typeof CATEGORY_BY_CLASS];
}

function checkWater(cls: string, water: WaterMeta): QuarantineReason | null {
  if (cls === "toilet") {
    if (!isMmValue(water.flushLiters) || (water.flushLiters as number) <= 0) return "BAD_WATER_META";
    if (water.flushLightLiters !== undefined) {
      if (!water.dualFlush) return "BAD_WATER_META";
      if (!isMmValue(water.flushLightLiters) || (water.flushLightLiters as number) <= 0) {
        return "BAD_WATER_META";
      }
    }
    if (water.dualFlush !== undefined && typeof water.dualFlush !== "boolean") return "BAD_WATER_META";
    return null;
  }
  // faucet / shower
  if (!isMmValue(water.flowRateLpm) || (water.flowRateLpm as number) <= 0) return "BAD_WATER_META";
  return null;
}

/** Step 2–5: structural validation in §5.2 field order — first failing check wins. */
function validateSkuStructural(
  raw: Record<string, unknown>,
  finishIds: ReadonlySet<string>,
  seenIds: ReadonlySet<string>,
): Pass1 {
  const rec = (m: string, reason: QuarantineReason, detail: string): Pass1 => ({
    record: { model_id: m, reason, detail },
  });

  // model_id
  if (raw.model_id === undefined) return rec("?", "MISSING_FIELD", "model_id is mandatory");
  if (!isStr(raw.model_id)) return rec("?", "BAD_TYPE", "model_id must be a string");
  const id: string = raw.model_id;
  if (id === "") return rec("?", "MISSING_FIELD", "model_id must be non-empty");
  if (seenIds.has(id)) return rec(id, "DUPLICATE_ID", "model_id already seen (first kept)");

  // name
  if (raw.name === undefined) return rec(id, "MISSING_FIELD", "name is mandatory");
  if (!isStr(raw.name)) return rec(id, "BAD_TYPE", "name must be a string");
  if (raw.name === "") return rec(id, "MISSING_FIELD", "name must be non-empty");

  // fixture_class + category (§3.5)
  if (raw.fixture_class === undefined) return rec(id, "MISSING_FIELD", "fixture_class is mandatory");
  if (!isStr(raw.fixture_class) || !FIXTURE_CLASSES.includes(raw.fixture_class as never)) {
    return rec(id, "BAD_ENUM", "fixture_class must be one of the §3.1 closed set");
  }
  const cls = raw.fixture_class;
  if (raw.category === undefined) return rec(id, "MISSING_FIELD", "category is mandatory");
  if (!isStr(raw.category) || !categoryValid(raw, cls, raw.category)) {
    return rec(id, "BAD_ENUM", "category must match fixture_class per §3.5 mapping");
  }

  // dim
  if (raw.dim === undefined) return rec(id, "MISSING_FIELD", "dim is mandatory");
  if (!isObj(raw.dim)) return rec(id, "BAD_TYPE", "dim must be an object {w,d,h}");
  if (!isDimLike(raw.dim) || !isMmValue(raw.dim.w) || !isMmValue(raw.dim.d) || !isMmValue(raw.dim.h)) {
    return rec(id, "BAD_TYPE", "dim fields w/d/h must be finite mm numbers");
  }
  const dim = raw.dim as { w: number; d: number; h: number };
  if (dim.w <= 0 || dim.d <= 0 || dim.h <= 0 || dim.w > 2500 || dim.d > 2500 || dim.h > 2500) {
    return rec(id, "BAD_NUMBER", "dim values must be > 0 and <= 2500 mm");
  }

  // finish_options
  if (raw.finish_options === undefined) return rec(id, "MISSING_FIELD", "finish_options is mandatory");
  if (!Array.isArray(raw.finish_options)) return rec(id, "BAD_TYPE", "finish_options must be an array");
  const fo = raw.finish_options;
  if (fo.length === 0) return rec(id, "MISSING_FIELD", "finish_options must be non-empty");
  if (!isStrArr(fo)) return rec(id, "BAD_TYPE", "finish_options entries must be strings");
  const unknownFinish = fo.find((f) => !finishIds.has(f));
  if (unknownFinish !== undefined) {
    return rec(id, "UNKNOWN_FINISH", `finish ${unknownFinish} is not in the finishes table`);
  }

  // price
  if (raw.price === undefined) return rec(id, "MISSING_FIELD", "price is mandatory");
  if (!isNum(raw.price)) return rec(id, "BAD_TYPE", "price must be a number");
  if (!Number.isInteger(raw.price) || raw.price < 1) {
    return rec(id, "BAD_NUMBER", "price must be an integer >= 1 (INR)");
  }

  // priceByFinish
  let priceByFinish: Record<string, number> | undefined;
  if (raw.priceByFinish !== undefined) {
    if (!isObj(raw.priceByFinish)) return rec(id, "BAD_TYPE", "priceByFinish must be an object");
    priceByFinish = {};
    for (const [k, v] of Object.entries(raw.priceByFinish)) {
      if (!fo.includes(k) || !isNum(v) || !Number.isInteger(v) || v < 1) {
        return rec(id, "BAD_NUMBER", `priceByFinish entry ${k} must be a finish option with integer price >= 1`);
      }
      priceByFinish[k] = v;
    }
  }

  // geometry_descriptor (structure + §6.3 bbox, tolerance ±10 mm)
  if (raw.geometry_descriptor === undefined) {
    return rec(id, "MISSING_FIELD", "geometry_descriptor is mandatory");
  }
  if (!isObj(raw.geometry_descriptor)) {
    return rec(id, "BAD_TYPE", "geometry_descriptor must be an object");
  }
  const gd = raw.geometry_descriptor;
  if (gd.anchor === undefined) {
    return rec(id, "MISSING_FIELD", "geometry_descriptor.anchor is mandatory");
  }
  if (!isStr(gd.anchor) || !ANCHORS.includes(gd.anchor as never)) {
    return rec(id, "BAD_ENUM", "geometry_descriptor.anchor must be a §6 anchor");
  }
  if (gd.primitives === undefined) {
    return rec(id, "MISSING_FIELD", "geometry_descriptor.primitives is mandatory");
  }
  if (!Array.isArray(gd.primitives) || gd.primitives.length === 0) {
    return rec(id, "MISSING_FIELD", "geometry_descriptor.primitives must be a non-empty array");
  }
  const parts = PART_VOCAB[cls as keyof typeof PART_VOCAB];
  const prims: GeoPrimitive[] = [];
  for (const p of gd.primitives) {
    if (!isObj(p)) return rec(id, "BAD_TYPE", "primitive must be an object");
    if (!isStr(p.part) || !parts.includes(p.part)) {
      return rec(id, "BAD_ENUM", `primitive part ${String(p.part)} is not in the ${cls} vocabulary`);
    }
    if (!isObj(p.kind)) return rec(id, "BAD_TYPE", "primitive.kind must be an object");
    const kind = p.kind;
    if (kind.shape === "box") {
      const sz = kind.sizeMm;
      if (!isDimLike(sz) || !isMmValue(sz.w) || !isMmValue(sz.d) || !isMmValue(sz.h) ||
        sz.w <= 0 || sz.d <= 0 || sz.h <= 0) {
        return rec(id, "BAD_NUMBER", "primitive box sizeMm must be positive mm numbers");
      }
    } else if (kind.shape === "cylinder") {
      if (!isMmValue(kind.radiusMm) || (kind.radiusMm as number) <= 0 ||
        !isMmValue(kind.hMm) || (kind.hMm as number) <= 0) {
        return rec(id, "BAD_NUMBER", "primitive cylinder radiusMm/hMm must be positive mm numbers");
      }
    } else {
      return rec(id, "BAD_ENUM", "primitive kind.shape must be box or cylinder");
    }
    if (!isObj(p.offsetMm) || !isMmValue(p.offsetMm.x) || !isMmValue(p.offsetMm.y) || !isMmValue(p.offsetMm.z)) {
      return rec(id, "BAD_NUMBER", "primitive offsetMm must be mm numbers");
    }
    if ((p.offsetMm as { y: number }).y < 0 || (p.offsetMm as { z: number }).z < 0) {
      return rec(id, "BAD_NUMBER", "primitive offsetMm y and z must be >= 0 (§6.1)");
    }
    prims.push(p as unknown as GeoPrimitive);
  }
  // bbox containment: union of primitive AABBs ⊆ dim, tolerance ±10 mm (§6.3)
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of prims) {
    const a = primitiveAabb(p);
    if (a.min[0] < minX) minX = a.min[0];
    if (a.min[1] < minY) minY = a.min[1];
    if (a.min[2] < minZ) minZ = a.min[2];
    if (a.max[0] > maxX) maxX = a.max[0];
    if (a.max[1] > maxY) maxY = a.max[1];
    if (a.max[2] > maxZ) maxZ = a.max[2];
  }
  const TOL = 10;
  // Anchor origin may sit at the fixture edge (floor-back-center, §13.1) or at the center
  // of the mounting surface (deck-center, §13.3); accept either convention per axis:
  // window = [−span/2 − TOL, span + TOL] covers both while still bounding gross violations.
  const inRange = (min: number, max: number, span: number): boolean =>
    min >= -span / 2 - TOL && max <= span + TOL;
  if (
    !inRange(minX, maxX, dim.w) ||
    !inRange(minZ, maxZ, dim.d) ||
    minY < -TOL || maxY > dim.h + TOL
  ) {
    return rec(id, "GEOMETRY_BBOX_MISMATCH", "primitive union exceeds dim bounding box beyond ±10 mm");
  }

  // water (§5.1)
  if (WET_CLASSES.has(cls)) {
    if (raw.water === undefined) return rec(id, "BAD_WATER_META", `water is mandatory for ${cls}`);
    if (!isObj(raw.water)) return rec(id, "BAD_WATER_META", "water must be an object");
    const waterReason = checkWater(cls, raw.water as WaterMeta);
    if (waterReason) return rec(id, waterReason, `water metadata invalid for ${cls}`);
  }

  // feature_tags (§3.3 + exactly one mounting tag)
  if (raw.feature_tags === undefined) return rec(id, "MISSING_FIELD", "feature_tags is mandatory");
  if (!Array.isArray(raw.feature_tags)) return rec(id, "BAD_TYPE", "feature_tags must be an array");
  const tags = raw.feature_tags;
  if (tags.length === 0) return rec(id, "MISSING_FIELD", "feature_tags must be non-empty");
  if (!isStrArr(tags)) return rec(id, "BAD_TYPE", "feature_tags entries must be strings");
  const badTag = tags.find((t) => !FEATURE_TAGS.includes(t as never));
  if (badTag !== undefined) {
    return rec(id, "BAD_ENUM", `feature tag ${badTag} is not in the §3.3 closed set`);
  }
  const mountings = tags.filter((t) => MOUNTING_TAGS.includes(t as never));
  if (mountings.length !== 1) {
    return rec(id, "BAD_MOUNTING", `exactly one mounting tag required, found ${mountings.length}`);
  }

  // compatibility — mandatory, may be []; refs checked in step 6
  if (raw.compatibility === undefined) return rec(id, "MISSING_FIELD", "compatibility is mandatory");
  if (!Array.isArray(raw.compatibility)) return rec(id, "BAD_TYPE", "compatibility must be an array");
  if (!isStrArr(raw.compatibility)) return rec(id, "BAD_TYPE", "compatibility entries must be strings");

  // substitutionIds — optional; refs checked in step 6
  if (raw.substitutionIds !== undefined && !isStrArr(raw.substitutionIds)) {
    return rec(id, "BAD_TYPE", "substitutionIds entries must be strings");
  }

  const sku: SKU = {
    model_id: id,
    name: raw.name,
    category: raw.category as Category,
    fixture_class: cls as SKU["fixture_class"],
    dim: { w: dim.w, d: dim.d, h: dim.h },
    finish_options: fo,
    price: raw.price,
    priceByFinish,
    image_ref: isStr(raw.image_ref) ? raw.image_ref : undefined,
    geometry_descriptor: gd as unknown as GeometryDescriptor,
    water: isObj(raw.water) ? (raw.water as WaterMeta) : undefined,
    feature_tags: tags as SKU["feature_tags"],
    compatibility: raw.compatibility,
    substitutionIds: raw.substitutionIds !== undefined ? (raw.substitutionIds as string[]) : undefined,
    evidence: raw.evidence as SKU["evidence"],
  };
  return { sku };
}

function validSources(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((source) => {
    if (!isObj(source) || !isStr(source.url) || !isStr(source.checkedOn) ||
      !isStr(source.note) || !source.note.trim()) return false;
    if (!/^https:\/\/(?:www\.kohler\.co\.in|techcomm\.kohler\.com)\/[^\s]+$/.test(source.url)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checkedOn)) return false;
    const date = new Date(source.checkedOn);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === source.checkedOn;
  });
}

function verifiedValue(fact: unknown, expected: unknown): boolean {
  if (!isObj(fact) || fact.status !== "verified" || !validSources(fact.sources)) return false;
  try {
    return canonicalJson(fact.value) === canonicalJson(expected);
  } catch {
    return false;
  }
}

function checkEvidence(raw: Record<string, unknown>): string | null {
  const evidence = raw.evidence;
  if (!isObj(evidence)) return "identity and dimensions require official source evidence";
  if (!verifiedValue(evidence.identity, { model_id: raw.model_id, name: raw.name, fixture_class: raw.fixture_class })) {
    return "identity unverified or evidence does not match authored identity";
  }
  if (!verifiedValue(evidence.dimensions, raw.dim)) return "dimensions unverified or evidence does not match authored dimensions";
  if (!isStr(evidence.planningNote) || !evidence.planningNote.trim()) return "planning assumptions must be labelled";
  if (isObj(evidence.price) && evidence.price.status === "estimated" &&
    isStr(evidence.price.note) && evidence.price.note.trim()) return null;
  if (!verifiedValue(evidence.price, { base: raw.price, byFinish: raw.priceByFinish })) {
    return "price requires matching evidence or an explicit estimate label";
  }
  return null;
}

function dataGap(r: QuarantineRecord): string {
  return `${r.model_id}: ${r.reason} ${r.detail}`;
}

/** Full pipeline (SCHEMA §9 steps 2–10). Pure function of `input`. */
export function buildCatalog(input: CatalogInput): { state: CatalogState; report: LoadReport } {
  const finishIds = new Set(input.finishes.map((f) => f.id));
  const finishFamily = new Map(input.finishes.map((f) => [f.id, f.family] as const));

  // Steps 2–5: structural validation in field order; uniqueness — first raw occurrence kept.
  const seenIds = new Set<string>();
  const pass1: Pass1[] = [];
  const rawIds = new Set<string>();
  for (const r of input.skus) {
    if (!isObj(r)) {
      pass1.push({ record: { model_id: "?", reason: "BAD_TYPE", detail: "SKU record must be an object" } });
      continue;
    }
    const res = validateSkuStructural(r, finishIds, seenIds);
    pass1.push(res);
    if (res.sku) {
      seenIds.add(res.sku.model_id);
      rawIds.add(res.sku.model_id);
    }
  }

  const quarantined = new Set<string>();
  const records: QuarantineRecord[] = [];
  const survivors = new Map<string, SKU>();
  for (const p of pass1) {
    if (p.record) records.push(p.record);
    else if (p.sku) survivors.set(p.sku.model_id, p.sku);
  }

  for (const sku of [...survivors.values()]) {
    const failure = checkEvidence(sku as unknown as Record<string, unknown>);
    if (failure) {
      records.push({ model_id: sku.model_id, reason: "UNVERIFIED_EVIDENCE", detail: failure });
      quarantined.add(sku.model_id);
      survivors.delete(sku.model_id);
    }
  }

  // Step 6: reference integrity to fixpoint — a survivor referencing itself, an unknown id,
  // or a quarantined id is quarantined (SELF_REFERENCE / DANGLING_REF / BAD_SUBSTITUTE).
  let changed = true;
  while (changed) {
    changed = false;
    for (const sku of [...survivors.values()]) {
      let record: QuarantineRecord | null = null;
      for (const ref of sku.compatibility) {
        if (ref === sku.model_id) {
          record = { model_id: sku.model_id, reason: "SELF_REFERENCE", detail: "compatibility references self" };
        } else if (!rawIds.has(ref)) {
          record = { model_id: sku.model_id, reason: "DANGLING_REF", detail: `compatibility references unknown id ${ref}` };
        } else if (quarantined.has(ref)) {
          record = { model_id: sku.model_id, reason: "DANGLING_REF", detail: `compatibility references quarantined id ${ref}` };
        }
        if (record) break;
      }
      if (!record && sku.substitutionIds) {
        for (const ref of sku.substitutionIds) {
          if (ref === sku.model_id) {
            record = { model_id: sku.model_id, reason: "SELF_REFERENCE", detail: "substitutionIds references self" };
          } else if (!rawIds.has(ref)) {
            record = { model_id: sku.model_id, reason: "DANGLING_REF", detail: `substitutionIds references unknown id ${ref}` };
          } else if (quarantined.has(ref)) {
            record = { model_id: sku.model_id, reason: "DANGLING_REF", detail: `substitutionIds references quarantined id ${ref}` };
          } else {
            const other = survivors.get(ref);
            if (other && other.fixture_class !== sku.fixture_class) {
              record = {
                model_id: sku.model_id,
                reason: "BAD_SUBSTITUTE",
                detail: `substitute ${ref} is of class ${other.fixture_class}, not ${sku.fixture_class}`,
              };
            }
          }
          if (record) break;
        }
      }
      if (record) {
        records.push(record);
        quarantined.add(sku.model_id);
        survivors.delete(sku.model_id);
        changed = true;
      }
    }
  }

  // Step 7: override-graph consistency (§7.4). Vetoes are edges — they never quarantine.
  const gaps: string[] = [];
  for (const sku of survivors.values()) {
    if (sku.evidence?.price.status === "estimated") {
      gaps.push(`${sku.model_id}: ESTIMATED_PRICE INR ${sku.price}; finish overrides are estimates too. ${sku.evidence.price.note}`);
    }
  }
  const vetoPairs = new Set<string>();
  for (const [a, b] of input.overrides.vetoes) {
    if (!isStr(a) || !isStr(b)) {
      gaps.push("?: BAD_TYPE veto endpoint must be a string id");
      continue;
    }
    if (a === b) {
      gaps.push(`${a}: VETO_SELF ignored (veto references self)`);
      continue;
    }
    if (!rawIds.has(a) || !rawIds.has(b)) {
      gaps.push(`${a},${b}: VETO_DANGLING ignored (endpoint unknown)`);
      continue;
    }
    if (quarantined.has(a) || quarantined.has(b)) {
      gaps.push(`${a},${b}: VETO_QUARANTINED ignored (endpoint quarantined)`);
      continue;
    }
    vetoPairs.add(pairKey(a, b));
  }

  const forcedPairs = new Set<string>();
  const authoredSubs: [string, string][] = [];
  for (const sku of survivors.values()) {
    for (const ref of sku.compatibility) {
      if (survivors.has(ref)) forcedPairs.add(pairKey(sku.model_id, ref));
    }
    for (const ref of sku.substitutionIds ?? []) {
      if (survivors.has(ref)) authoredSubs.push([sku.model_id, ref]);
    }
  }

  const skus = [...survivors.values()];
  const byId = new Map(skus.map((s) => [s.model_id, s] as const));

  // veto wins over force; redundant force / disjoint veto → data-gap only (§7.4)
  for (const key of vetoPairs) {
    const [a, b] = unpair(key);
    if (forcedPairs.has(key)) {
      gaps.push(`${a},${b}: VETO_WINS pair also forced — veto wins`);
    } else if (!defaultOk(byId.get(a) as SKU, byId.get(b) as SKU, finishFamily)) {
      gaps.push(`${a},${b}: VETO_DISJOINT pair not otherwise compatible — kept as authored`);
    }
  }
  for (const key of forcedPairs) {
    if (vetoPairs.has(key)) continue;
    const [a, b] = unpair(key);
    if (defaultOk(byId.get(a) as SKU, byId.get(b) as SKU, finishFamily)) {
      gaps.push(`${a},${b}: REDUNDANT_FORCE pair already default-ok`);
    }
  }

  // Step 8: build graph + substitutes over survivors only (§7.6, §8).
  const graph = compatibilityGraph(skus, forcedPairs, vetoPairs, finishFamily);
  const subs = substituteMap(skus, authoredSubs);
  for (const [src, ref] of authoredSubs) {
    const s = byId.get(src) as SKU;
    const t = byId.get(ref) as SKU;
    if (t.dim.w * t.dim.d > s.dim.w * s.dim.d) {
      gaps.push(`${src}: LARGER_FOOTPRINT substitute ${ref} has a larger footprint than the source`);
    }
  }

  // Step 9: canonicalize (SCHEMA §11).
  for (const s of skus) {
    s.finish_options = sortedUnique(s.finish_options);
    s.feature_tags = sortedUnique(s.feature_tags) as SKU["feature_tags"];
    s.compatibility = sortedUnique(s.compatibility);
    if (s.substitutionIds) s.substitutionIds = sortedUnique(s.substitutionIds);
  }
  skus.sort((a, b) => (a.model_id < b.model_id ? -1 : a.model_id > b.model_id ? 1 : 0));

  records.sort((x, y) =>
    x.model_id < y.model_id ? -1 : x.model_id > y.model_id ? 1 : x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0,
  );
  const dataGaps = sortedUnique([...records.map(dataGap), ...gaps]);

  const catalogHash = sha256Hex(
    canonicalJson(catalogCanonicalForm(input.catalogVersion, input.finishes, skus, input.overrides)),
  );
  const snapshotId = `${input.catalogVersion}#${catalogHash.slice(0, 8)}`;

  const state: CatalogState = { skus, compatibilityGraph: graph, substitutes: subs, dataGaps };
  const report: LoadReport = {
    loadedCount: skus.length,
    quarantinedCount: records.length,
    dataGaps,
    records,
    catalogVersion: input.catalogVersion,
    snapshotId,
    catalogHash,
  };
  return { state, report };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function unpair(key: string): [string, string] {
  const i = key.indexOf("\u0000");
  return [key.slice(0, i), key.slice(i + 1)];
}

function sortedUnique(arr: string[]): string[] {
  return [...new Set(arr)].sort();
}

/** Hash input: canonical catalog form (SCHEMA §11). Maps excluded; arrays sorted. */
function catalogCanonicalForm(
  catalogVersion: string,
  finishes: readonly Finish[],
  skus: SKU[],
  overrides: CompatOverrides,
): unknown {
  return {
    catalogVersion,
    finishes: [...finishes]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((f) => ({ ...f })),
    skus: skus.map((s) => ({
      ...s,
      geometry_descriptor: {
        anchor: s.geometry_descriptor.anchor,
        primitives: [...s.geometry_descriptor.primitives].sort((a, b) =>
          a.part < b.part ? -1 : a.part > b.part ? 1 : 0,
        ),
      },
    })),
    vetoes: [...new Set(overrides.vetoes.map(([a, b]) => pairKey(a, b)))]
      .sort()
      .map(unpair),
  };
}





