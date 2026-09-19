// SCHEMA §7.3 — central veto edges (T-004). The CompatOverrides type carries no
// per-veto note field, so justifications are inline comments.
//
// Genuine product-pair conflicts curated here: a full vanity SKU already includes
// its own top + integrated basin (§6.2 canonical composition cabinet+top+basin),
// so it can never coexist with a freestanding pedestal basin or a wall-hung basin
// at the same basin position — a double-basin conflict. These pairs are
// white-ware × white-ware, i.e. default-ok under §7.2, so each veto is effective
// (not disjoint → no VETO_DISJOINT data-gap). Vessel/undermount basins are NOT
// vetoed against vanities: vessel-on-vanity and undermount-in-vanity are real
// installation patterns; final placement authority stays with engine/rules (§3.3).
import type { CompatOverrides } from "../schema.js";

export const COMPAT_OVERRIDES: CompatOverrides = {
  vetoes: [
    // K-2359-8-0 Archer pedestal basin × every vanity (pedestal stands at the basin position).
    ["K-2359-8-0", "K-99521-TK"],
    ["K-2359-8-0", "K-99522-TK"],
    ["K-2359-8-0", "K-99523-TK"],
    ["K-2359-8-0", "K-99526-TK"],
    ["K-2359-8-0", "K-2604-F69"],
    ["K-2359-8-0", "K-2606-F69"],
    ["K-2359-8-0", "K-2608-F69"],
    // K-2005-0 Kingston wall-hung basin × every vanity (wall-hung lav over a vanity cabinet).
    ["K-2005-0", "K-99521-TK"],
    ["K-2005-0", "K-99522-TK"],
    ["K-2005-0", "K-99523-TK"],
    ["K-2005-0", "K-99526-TK"],
    ["K-2005-0", "K-2604-F69"],
    ["K-2005-0", "K-2606-F69"],
    ["K-2005-0", "K-2608-F69"],
    // K-1999-0 Brenham wall-hung basin × every vanity (same conflict class).
    ["K-1999-0", "K-99521-TK"],
    ["K-1999-0", "K-99522-TK"],
    ["K-1999-0", "K-99523-TK"],
    ["K-1999-0", "K-99526-TK"],
    ["K-1999-0", "K-2604-F69"],
    ["K-1999-0", "K-2606-F69"],
    ["K-1999-0", "K-2608-F69"],
  ],
};

