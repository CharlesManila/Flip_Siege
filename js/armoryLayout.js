/**
 * Clickable regions on assets/armory-board.png (percent of image box).
 * Tune left/top/width/height if art shifts.
 */
export const ARMORY_BOARD_SRC = "assets/armory-board.png";

/** @type {Record<string, { l: number, t: number, w: number, h: number, group?: string }>} */
export const ARMORY_HOTSPOTS = {
  repair: { l: 3, t: 18, w: 16, h: 18, group: "visit" },
  scrap_1: { l: 3, t: 36, w: 16, h: 14, group: "visit" },
  scrap_2: { l: 3, t: 50, w: 16, h: 14, group: "visit" },

  war_drums: { l: 19, t: 16, w: 13, h: 16, group: "round" },
  boiling_oil: { l: 32, t: 16, w: 13, h: 16, group: "round" },
  march_tax: { l: 45, t: 16, w: 13, h: 16, group: "round" },
  sally_gate: { l: 19, t: 34, w: 13, h: 16, group: "round" },
  siege_breaker: { l: 32, t: 34, w: 14, h: 16, group: "round" },
  iron_curtain: { l: 47, t: 34, w: 14, h: 16, group: "round" },

  perm_sigil: { l: 4, t: 68, w: 17, h: 26, group: "perm" },
  perm_mastery: { l: 22, t: 68, w: 17, h: 26, group: "perm" },
  perm_crest: { l: 40, t: 68, w: 17, h: 26, group: "perm" },
  perm_creed: { l: 58, t: 68, w: 17, h: 26, group: "perm" },
  perm_purge: { l: 76, t: 68, w: 17, h: 26, group: "perm" },
};

export const ARMORY_HOTSPOT_ORDER = [
  "repair",
  "scrap_1",
  "scrap_2",
  "war_drums",
  "boiling_oil",
  "march_tax",
  "sally_gate",
  "siege_breaker",
  "iron_curtain",
  "perm_sigil",
  "perm_mastery",
  "perm_crest",
  "perm_creed",
  "perm_purge",
];
