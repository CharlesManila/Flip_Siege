/** Core Flip-Siege rules (matches simulate_stash_2v2.py). v0.5: v2 schedule, alternating siege, calamity. */
import { COLORS } from "./data/cards.js";

export const CASTLE_HP_MUST = 60;
export const CASTLE_HP_MAY = 68;
/** Max cards resting after last round (FIFO); official cooldown cap. */
export const COOLDOWN_MAX_PER_TEAM = 10;
export const CASTLE_DESTROY_MIN_ROUND = 1;
export const BUYS_PER_ARMORY = 2;
export const BENCH_MAX_PER_ARMORY = 1;
/** @deprecated */ export const SCRAP_MAX_PER_ARMORY = BENCH_MAX_PER_ARMORY;
export const PERMANENT_UNLOCK_ROUND = 4;
export const SIEGE_SOAK = 0;
export const TIER_R5 = 5;
export const TIER_R6 = 10;
export const FINISHER_BASE = 9;
export const ROUND_BUFF_BASE = 2;

/** Four-slot worker board (matches sim lowered costs). */
export const ARMORY_SLOTS = ["green", "yellow", "blue", "red"];
export const ARMORY_GLOBAL_EXCLUSIVE = new Set(["red", "blue"]);
export const GREEN_REPAIR_BASE = 4;
export const GREEN_REPAIR_MULT = 2.2;
export const RED_BENCH_BASE = 3;
export const RED_BENCH_MULT = 2.35;
export const MAX_REPAIR_PER_VISIT = 6;
export const MAX_BENCH_PER_VISIT = 3;
export const FOUR_SLOT_PICK_THRESHOLD = 8;

/** Off-color play earns floor(rank/2) resources (1 → 0, 10 → 5). */
export function offColorResourceGain(faceValue) {
  return Math.floor(faceValue / 2);
}

/** Trophy (killed assault): same curve as off-color. */
export function trophyResourceGain(faceValue) {
  return Math.floor(faceValue / 2);
}

/** Max total resources per team (all colors); excess income is lost. */
export const TEAM_RESOURCE_CAP = 28;

export function emptyResources() {
  return { green: 0, blue: 0, red: 0, yellow: 0 };
}

export function ensureTeamResources(team) {
  if (!team.resources) team.resources = emptyResources();
  return team.resources;
}

export const YELLOW_ATTACK_TIERS = {
  low: { buff: "war_drums", cost: { yellow: 10 }, minRound: 1 },
  high: { buff: "siege_breaker", cost: { yellow: 18 }, minRound: 5 },
};
export const BLUE_DEFENSE_TIERS = {
  low: { buff: "boiling_oil", cost: { blue: 10 }, minRound: 1 },
  high: { buff: "iron_curtain", cost: { blue: 18 }, minRound: 5 },
};

export function repairCost(heal) {
  const g = Math.max(1, Math.round(GREEN_REPAIR_BASE * GREEN_REPAIR_MULT ** (heal - 1)));
  return { green: g };
}

export function benchCost(n) {
  const r = Math.max(1, Math.round(RED_BENCH_BASE * RED_BENCH_MULT ** (n - 1)));
  return { red: r };
}

export function redCullCost(value, mode) {
  if (value === 1 && mode === "band") return { red: 3 };
  if (value === 2 && mode === "band") return { red: 7 };
  return { red: 11 };
}

export function redCullMatches(card, cull) {
  if (!cull) return false;
  const { value, mode } = cull;
  if (mode === "both") return card.mr <= 2 || card.tr <= 2;
  if (value === 1) return card.mr === 1 || card.tr === 1;
  return card.mr === 2 || card.tr === 2;
}

export function redCullCount(team, cull) {
  return (team.reserve || []).filter((c) => redCullMatches(c, cull)).length;
}

export function applyRedCullToCooldown(team, cull) {
  let cooled = 0;
  if (!team.cooldownIds) team.cooldownIds = new Set();
  for (const c of team.reserve || []) {
    if (!redCullMatches(c, cull)) continue;
    team.cooldownIds.add(c.id);
    cooled++;
  }
  return cooled;
}

export function redCullFromVisitKey(key) {
  if (key === "red_cull_1") return { value: 1, mode: "band" };
  if (key === "red_cull_2") return { value: 2, mode: "band" };
  if (key === "red_cull_both") return { value: 2, mode: "both" };
  return null;
}

export function maxRepairHeal(team) {
  const missing = team.castleMax - team.castleHp;
  if (missing <= 0) return 0;
  return Math.min(MAX_REPAIR_PER_VISIT, missing);
}

export function yellowAttackTierCost(tier, round) {
  const t = YELLOW_ATTACK_TIERS[tier];
  return round >= t.minRound ? t.cost : null;
}

export function blueDefenseTierCost(tier, round) {
  const t = BLUE_DEFENSE_TIERS[tier];
  return round >= t.minRound ? t.cost : null;
}

export function yellowAttackTierKey(tier) {
  return YELLOW_ATTACK_TIERS[tier]?.buff;
}

export function blueDefenseTierKey(tier) {
  return BLUE_DEFENSE_TIERS[tier]?.buff;
}

export function fourSlotBuffKey(slot, choice) {
  if (slot === "yellow" && choice?.tier) return yellowAttackTierKey(choice.tier);
  if (slot === "blue" && choice?.tier) return blueDefenseTierKey(choice.tier);
  return null;
}

export function applyPaidColorSkip(team, cost) {
  if (!team.skipColorsDeal) team.skipColorsDeal = new Set();
  for (const [color, amount] of Object.entries(cost)) {
    if (amount > 0 && COLORS.includes(color)) team.skipColorsDeal.add(color);
  }
}

/** Siege lead → defender → siege partner → defender (alternating teams). */
export function trickPlayOrder(game, leaderId, sieger) {
  const def = 1 - sieger;
  const sp = game.players.filter((p) => p.teamId === sieger);
  const partner = sp[0].id === leaderId ? sp[1].id : sp[0].id;
  const dt = game.players.filter((p) => p.teamId === def);
  return [leaderId, dt[0].id, partner, dt[1].id];
}

/** Worker draft order = trick 1 of upcoming round (before firstSieger flips). */
export function armoryPickOrder(game) {
  const nextSieger = 1 - game.firstSieger;
  const st = game.players.filter((p) => p.teamId === nextSieger);
  return trickPlayOrder(game, st[0].id, nextSieger);
}

export function isSlotOccupiedForPlayer(game, slot, player) {
  const takers = game.players.filter((p) => p.workerSlot === slot);
  if (ARMORY_GLOBAL_EXCLUSIVE.has(slot)) return takers.length > 0;
  return takers.some((p) => p.teamId === player.teamId);
}

export function legalFourSlotChoices(game, team, slot) {
  const rn = game.round;
  const out = [];
  if (slot === "green") {
    for (let heal = 1; heal <= maxRepairHeal(team); heal++) {
      const cost = repairCost(heal);
      if (canAfford(team, cost)) out.push({ heal });
    }
  } else if (slot === "red") {
    const options = [
      { cull: { value: 1, mode: "band" } },
      { cull: { value: 2, mode: "band" } },
      { cull: { value: 2, mode: "both" } },
    ];
    for (const o of options) {
      if (redCullCount(team, o.cull) <= 0) continue;
      if (canAfford(team, redCullCost(o.cull.value, o.cull.mode))) out.push(o);
    }
  } else if (slot === "yellow") {
    for (const tier of ["low", "high"]) {
      if (yellowAttackTierCost(tier, rn) && canAfford(team, yellowAttackTierCost(tier, rn))) {
        out.push({ tier });
      }
    }
  } else if (slot === "blue") {
    for (const tier of ["low", "high"]) {
      if (blueDefenseTierCost(tier, rn) && canAfford(team, blueDefenseTierCost(tier, rn))) {
        out.push({ tier });
      }
    }
  }
  return out;
}

/** Add resources (capped by TEAM_RESOURCE_CAP total, not per color). */
export function addResources(team, color, amount, source) {
  if (amount <= 0) return 0;
  const gain = Math.min(amount, resourceCapRoom(team));
  if (gain <= 0) return 0;
  const r = ensureTeamResources(team);
  r[color] = (r[color] || 0) + gain;
  if (!team.resourceLog) team.resourceLog = { trophy: 0, off_color: 0 };
  team.resourceLog[source === "trophy" ? "trophy" : "off_color"] += gain;
  return gain;
}

/** Legacy 2-buy visit list (four-slot worker draft is official). */
export const VISIT_COSTS = {
  repair: { green: 3 },
  red_cull_1: { red: 3 },
  red_cull_2: { red: 7 },
  red_cull_both: { red: 11 },
};

export const ROUND_COSTS = {
  war_drums: { blue: 10 },
  boiling_oil: { blue: 10 },
  march_tax: { blue: 12 },
  sally_gate: { blue: 10 },
  siege_breaker: { blue: 14 },
  iron_curtain: { blue: 14 },
};

export const ROUND_MIN = {
  war_drums: 1,
  boiling_oil: 1,
  march_tax: 1,
  sally_gate: 1,
  siege_breaker: 5,
  iron_curtain: 5,
};

export const ROUND_LABELS = {
  war_drums: "War Drums",
  boiling_oil: "Boiling Oil",
  march_tax: "March Tax",
  sally_gate: "Sally Gate",
  siege_breaker: "Siege Breaker",
  iron_curtain: "Iron Curtain",
};

export const ROUND_DESCRIPTIONS = {
  war_drums: "+2 Assault on your first siege trick (+ combat tier round 5+).",
  boiling_oil: "+2 Block on your first defense trick (+ tier round 5+).",
  march_tax: "+1 resource on each off-color your team plays.",
  sally_gate: "On your first lead, led color may differ from your lead monster.",
  siege_breaker: "+9 Assault on first siege trick (+ tier). Unlocks round 5 Armory.",
  iron_curtain: "+9 Block on first defense trick (+ tier). Unlocks round 5 Armory.",
};

export const PERMANENT_COSTS = {
  sigil: { green: 7, blue: 10, red: 7, yellow: 7 },
  mastery: { green: 6, blue: 8, red: 6, yellow: 6 },
  crest: { green: 5, blue: 12, red: 5, yellow: 6 },
  creed: { green: 5, blue: 12, red: 6, yellow: 5 },
  purge: { green: 8, blue: 8, red: 8, yellow: 8 },
};

export const PERMANENT_NAMES = {
  sigil: "Royal Sigil",
  mastery: "Color Mastery",
  crest: "Warlord's Crest",
  creed: "Bulwark Creed",
  purge: "Great Purge",
};

export const PERMANENT_DESCRIPTIONS = {
  sigil:
    "Elite ranks 1–3: 2× (rank + combat tier + first-trick Drums/Breaker or Oil/Curtain) when led.",
  mastery: "+1 Assault and +1 Block on your color when led (+ tier on later rounds).",
  crest: "+2 Assault on your color when led (+ tier on later rounds).",
  creed: "+2 Block on your color when led (+ tier on later rounds).",
  purge: "Remove all 10 cards of your color from your deck for the rest of the match.",
};

export const VISIT_LABELS = {
  repair: "Repair castle",
  red_cull_1: "Red depth — cool rank 1",
  red_cull_2: "Red depth — cool rank 2",
  red_cull_both: "Red depth — cool ranks 1 & 2",
};

export const VISIT_DESCRIPTIONS = {
  repair: "Heal +2 HP now (cannot exceed starting HP).",
  red_cull_1: "All reserve cards with monster or tower rank 1 skip next deal (lower depth prep, better deal quality).",
  red_cull_2: "All reserve cards with monster or tower rank 2 skip next deal.",
  red_cull_both: "All reserve cards with rank 1 or 2 skip next deal (strongest tradeoff).",
};

/** UI badge: how long the effect lasts. */
export const SHOP_DURATION = {
  repair: "instant",
  red_cull_1: "instant",
  red_cull_2: "instant",
  red_cull_both: "instant",
  war_drums: "round",
  boiling_oil: "round",
  march_tax: "round",
  sally_gate: "round",
  siege_breaker: "round",
  iron_curtain: "round",
  sigil: "permanent",
  mastery: "permanent",
  crest: "permanent",
  creed: "permanent",
  purge: "permanent",
};

export const SHOP_DURATION_LABEL = {
  instant: "This visit",
  round: "Next round only",
  permanent: "Rest of game",
};

/** v2 deal: 7, 7, 8, 9, 10 (round 5+ stays at 10). Matches simulate_stash_2v2.py. */
export const V2_HAND_BY_ROUND = [7, 7, 8, 9, 10];

/** Cards dealt each player. */
export function cardsDealt(round) {
  if (round < 1) return V2_HAND_BY_ROUND[0];
  const idx = Math.min(round - 1, V2_HAND_BY_ROUND.length - 1);
  return V2_HAND_BY_ROUND[idx];
}

/** Max tricks = dealt − 1 (round ends at 1 card left). */
export function maxTricks(round) {
  return cardsDealt(round) - 1;
}

/** @deprecated alias */
export function handSize(round) {
  return cardsDealt(round);
}

/** Sieging team alternates each trick; swaps which team leads trick 1 each round. */
export function siegerTeamForTrick(firstSieger, tricksPlayed) {
  return (firstSieger + tricksPlayed) % 2;
}

export const CALAMITY_ASSAULT_MULT = 1;
export const CALAMITY_PREP_MIN_RESERVE = 9;
export const CALAMITY_RESERVE_BLOCK_PER = 1;
export const CALAMITY_RESERVE_BLOCK_CAP = 7;
export const CALAMITY_UNDERPREP_PER_CARD = 1;
export const CALAMITY_EMPTY_RESERVE_EXTRA = 5;

/** Calamity last trick on round 3 and every round 5+. */
export function isCalamityRound(round) {
  return round === 3 || round >= 5;
}

export function isCalamityTrick(tricksPlayed, round, players) {
  if (!isCalamityRound(round)) return false;
  const mt = maxTricks(round);
  if (tricksPlayed === mt - 1) return true;
  const hs = players.map((p) => p.hand.length);
  return hs.length === 4 && Math.min(...hs) === 2 && Math.max(...hs) === 2;
}

export function armoryTier(round) {
  if (round <= 4) return 0;
  if (round === 5) return TIER_R5;
  if (round === 6) return TIER_R6;
  return TIER_R6 + 1 + (round - 7);
}

export function cardCombatFactor(round) {
  return { 1: 65, 2: 78, 3: 88 }[round] ?? 100;
}

export function scaleCombat(v, round) {
  const f = cardCombatFactor(round);
  return f >= 100 ? v : Math.floor((v * f) / 100);
}

export function scaledBuff(base, round) {
  return base + armoryTier(round);
}

/** Monster ranks 1–3 of Sigil color (elite identity). */
export function isSigilElite(card, team) {
  return (
    team.permanent === "sigil" &&
    team.permanentColor === card.color &&
    card.mr <= 3
  );
}

function sigilEliteSiegeBuffs(team, round, isFirstSiegeTrick) {
  if (!isFirstSiegeTrick || !team.activeBuffs) return 0;
  let b = 0;
  if (team.activeBuffs.has("war_drums")) b += scaledBuff(ROUND_BUFF_BASE, round);
  if (team.activeBuffs.has("siege_breaker")) b += scaledBuff(FINISHER_BASE, round);
  return b;
}

function sigilEliteDefenseBuffs(team, round, isFirstDefenseTrick) {
  if (!isFirstDefenseTrick || !team.activeBuffs) return 0;
  let b = 0;
  if (team.activeBuffs.has("boiling_oil")) b += scaledBuff(ROUND_BUFF_BASE, round);
  if (team.activeBuffs.has("iron_curtain")) b += scaledBuff(FINISHER_BASE, round);
  return b;
}

/**
 * @param {{ isFirstSiegeTrick?: boolean }} [ctx]
 */
export function assaultValue(card, led, team, round, ctx = null) {
  if (card.color !== led) return 0;
  const tier = armoryTier(round);
  if (isSigilElite(card, team)) {
    let base = card.mr + tier;
    if (ctx?.isFirstSiegeTrick) {
      base += sigilEliteSiegeBuffs(team, round, true);
    }
    return base * 2;
  }
  let flat = 0;
  if (team.permanent === "mastery" && team.permanentColor === led) {
    flat = 1 + Math.floor(tier / 2);
  } else if (team.permanent === "crest" && team.permanentColor === led) {
    flat = 2 + tier;
  }
  return card.mr + flat;
}

/**
 * @param {{ isFirstDefenseTrick?: boolean }} [ctx]
 */
export function blockValue(card, led, team, round, ctx = null) {
  if (card.color !== led) return 0;
  const tier = armoryTier(round);
  if (isSigilElite(card, team)) {
    let base = card.tr + tier;
    if (ctx?.isFirstDefenseTrick) {
      base += sigilEliteDefenseBuffs(team, round, true);
    }
    return base * 2;
  }
  let flat = 0;
  if (team.permanent === "mastery" && team.permanentColor === led) {
    flat = 1 + Math.floor(tier / 2);
  } else if (team.permanent === "creed" && team.permanentColor === led) {
    flat = 2 + tier;
  }
  return card.tr + flat;
}

export function stashValue(card, siege) {
  return siege ? card.mr : card.tr;
}

export function canFollow(hand, led) {
  return hand.filter((c) => c.color === led);
}

export function resourceTotals(team) {
  const r = ensureTeamResources(team);
  return { green: r.green || 0, blue: r.blue || 0, red: r.red || 0, yellow: r.yellow || 0 };
}

export function resourceTotal(team) {
  return Object.values(resourceTotals(team)).reduce((a, b) => a + b, 0);
}

export function resourceCapRoom(team) {
  return Math.max(0, TEAM_RESOURCE_CAP - resourceTotal(team));
}

/** @deprecated alias */
export function stashTotals(team) {
  return resourceTotals(team);
}

export function canAfford(team, cost) {
  const t = resourceTotals(team);
  return COLORS.every((c) => t[c] >= (cost[c] || 0));
}

/** Pay from resource tracker (no cards leave the deck). */
export function payStash(team, cost) {
  if (!canAfford(team, cost)) return false;
  const r = ensureTeamResources(team);
  for (const c of COLORS) {
    const need = cost[c] || 0;
    if (need > 0) r[c] -= need;
  }
  return true;
}

export function recyclePaid(paid) {
  return paid.map((p) => p.card);
}

export function livingPool(team, useCooldown = false) {
  const benched = new Set((team.benched || []).map((c) => c.id));
  return team.deck.filter(
    (c) =>
      !team.removedIds.has(c.id) &&
      !benched.has(c.id) &&
      !team.purgedColors.has(c.color) &&
      (!useCooldown || !team.cooldownIds?.has(c.id)),
  );
}

/** After a deal, benched cards return to the top of reserve (pool-safe). */
export function returnBenchedToReserve(team) {
  if (!team.benched?.length) return;
  for (let i = team.benched.length - 1; i >= 0; i--) {
    team.reserve.unshift(team.benched[i]);
  }
  team.benched = [];
}

/** Card was played to a trick this round (cooldown rules). */
export function markPlayedThisRound(team, cardId) {
  if (!team.playedThisRound) team.playedThisRound = [];
  team.playedThisRound.push(cardId);
}

/** End of round: last round's plays sit out the next deal only (capped). */
export function rotateRoundCooldown(game) {
  if (!game.cooldownMechanic) return;
  for (const t of game.teams) {
    let played = [...(t.playedThisRound ?? [])];
    if (COOLDOWN_MAX_PER_TEAM != null && played.length > COOLDOWN_MAX_PER_TEAM) {
      played = played.slice(-COOLDOWN_MAX_PER_TEAM);
    }
    t.cooldownIds = new Set(played);
    t.playedThisRound = [];
  }
}

/** @deprecated — use isCalamityTrick(tricksPlayed, round, players) */
export function isBlindTrick(tricksPlayed, maxTricks, players) {
  if (maxTricks % 2 === 0) return false;
  if (tricksPlayed === maxTricks - 1) return true;
  const hs = players.map((p) => p.hand.length);
  return hs.length === 4 && Math.min(...hs) === 2 && Math.max(...hs) === 2;
}

export function roundEnds(tricksPlayed, maxTricks, players) {
  if (tricksPlayed >= maxTricks) return true;
  return players.some((p) => p.hand.length === 1);
}
