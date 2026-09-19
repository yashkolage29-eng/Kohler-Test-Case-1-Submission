// C7 — Compatibility (OPT §5): a HARD pair-level rule. Every pair of bound SKUs
// must be an edge in the curated compatibility graph (SCHEMA §7.6: veto > force
// > default, symmetric closure), and the bound SKU set must satisfy the typed
// feature-constraint set (OPT §2.3 — required tags covered by the candidate,
// forbidden tags carried by no bound fixture). Mounting (ADR-019, SCHEMA §3.3):
// exactly-one mounting tag per SKU is a catalog invariant — C7 verifies it
// deterministically but is NOT the wall-construction authority: `wall_mount`
// implies a carrier wall, a geometry/input concern recorded as a measured delta
// and a config note only. No short-circuit: all failing pairs and constraints
// are enumerated. Pure functions, sorted order throughout.

import type { FixtureBinding } from "../contracts/candidate.js";
import type { CatalogState } from "../catalog/schema.js";
import type { FeatureConstraints } from "../contracts/input.js";
import type { FeatureTag } from "../contracts/vocab.js";
import { MOUNTING_TAGS } from "../contracts/vocab.js";
import type { RuleId, RuleVerdict } from "../contracts/receipt.js";
import type { Config } from "../config/config-types.js";
import { C7_CONFIG } from "../config/rules.js";

/** Typed feature-constraint input (OPT §5 C7 row). Derived from
 *  InputSet.featureConstraints (required only there); forbidden tags are an
 *  explicit engine-level input (relaxations may target either list). */
export interface C7FeatureSet {
  required: FeatureTag[];
  forbidden: FeatureTag[];
}

/** Map the InputSet taste→feature constraints (OPT §2.3) onto the C7 form. */
export function c7FeatureSet(fc: FeatureConstraints): C7FeatureSet {
  return { required: [...fc.requiredFeatures].sort(), forbidden: [] };
}

function sortBindingsBySku(bindings: FixtureBinding[]): FixtureBinding[] {
  return [...bindings].sort((a, b) => (a.fixture.skuId < b.fixture.skuId ? -1 : a.fixture.skuId > b.fixture.skuId ? 1 : 0));
}

export function evaluateC7(
  bindings: FixtureBinding[],
  catalog: CatalogState,
  features: C7FeatureSet,
  config?: Config,
): RuleVerdict {
  const valuesUsed = { ...(config?.rules.C7.values ?? C7_CONFIG.values) };
  const deltas: Record<string, number> = {
    pairsChecked: 0,
    incompatiblePairs: 0,
    failedFeatureConstraints: 0,
    wallMountFixtures: 0,
  };
  const reasons: string[] = [];
  const graph = catalog.compatibilityGraph;

  const sorted = sortBindingsBySku(bindings);
  const ids = sorted.map((b) => b.fixture.skuId);

  // Pair-level graph membership (SCHEMA §7.6). Unknown ids (dangling bindings)
  // surface once each; every pair touching an unknown counts as incompatible.
  const unknown = new Set<string>();
  for (const id of ids) {
    if (!graph.has(id)) {
      unknown.add(id);
      reasons.push(`c7-sku-not-in-graph:${id}`);
    }
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      deltas.pairsChecked += 1;
      const [a, b] = [ids[i], ids[j]];
      if (unknown.has(a) || unknown.has(b)) {
        deltas.incompatiblePairs += 1;
        continue;
      }
      if (!graph.get(a)?.includes(b)) {
        reasons.push(`c7-incompatible-pair:${a}/${b}`);
        deltas.incompatiblePairs += 1;
      }
    }
  }

  // Feature-constraint set: required tags covered by at least one bound
  // fixture; forbidden tags carried by no bound fixture.
  const tags = sorted.map((b) => new Set(b.fixture.featureTags));
  for (const tag of features.required) {
    if (!tags.some((t) => t.has(tag))) {
      reasons.push(`c7-missing-required:${tag}`);
      deltas.failedFeatureConstraints += 1;
    }
  }
  for (let i = 0; i < features.forbidden.length; i++) {
    const tag = features.forbidden[i];
    for (let k = 0; k < sorted.length; k++) {
      if (tags[k].has(tag)) {
        reasons.push(`c7-forbidden-tag:${tag}:${sorted[k].fixture.skuId}`);
        deltas.failedFeatureConstraints += 1;
      }
    }
  }

  // Mounting invariant (ADR-019): exactly one mounting tag per SKU.
  for (const b of sorted) {
    const mountTags = b.fixture.featureTags.filter((t) => (MOUNTING_TAGS as readonly string[]).includes(t));
    if (mountTags.length !== 1) {
      reasons.push(`c7-mounting-tags:${b.fixture.skuId}=${mountTags.length}`);
      deltas.failedFeatureConstraints += 1;
    } else if (mountTags[0] === "wall_mount") {
      deltas.wallMountFixtures += 1; // consequence note: requires a carrier wall (geometry authority)
    }
  }

  return {
    ruleId: "C7" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation:
      reasons.length === 0
        ? "c7-pass:pair-graph-and-feature-constraints-ok"
        : reasons.join(";"),
  };
}
