/** Core Flip-Siege rules (matches simulate_stash_2v2.py). v0.5: v2 schedule, alternating siege, calamity. */
import { COLORS } from "./data/cards.js";

export const CASTLE_HP_MUST = 60;
export const CASTLE_HP_MAY = 68;
/** Max cards resting after last round (FIFO); official cooldown cap. */
export const COOLDOWN_MAX_PER_TEAM = 10;
export const CASTLE_DESTROY_MIN_ROUND = 1;
export const BUYS_PER_ARMORY = 2;
export const SCRAP_MAX_PER_ARMORY = 1;
export const PERMANENT_UNLOCK_ROUND = 4;
export const SIEGE_SOAK = 0;
export const TIER_R5 = 5;
export const TIER_R6 = 10;
export const FINISHER_BASE = 9;
export const ROUND_BUFF_BASE = 2;

export const VISIT_COSTS = {
  repair: { green: 3 },
  scrap_1: { green: 3 },
  scrap_2: { green: 5 },
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
  march_tax: "+1 Stash value on each off-color your team plays.",
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
  scrap_1: "Scrap reserve (1 card)",
  scrap_2: "Scrap reserve (2 cards)",
};

export const VISIT_DESCRIPTIONS = {
  repair: "Heal +2 HP now (cannot exceed starting HP).",
  scrap_1: "Remove 1 card from your reserve permanently (uses 1 purchase).",
  scrap_2: "Remove 2 cards from reserve permanently (uses 1 purchase).",
};

/** UI badge: how long the effect lasts. */
export const SHOP_DURATION = {
  repair: "instant",
  scrap_1: "instant",
  scrap_2: "instant",
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

/** Cards dealt each player (round 1 = 7 … round 5+ = 11). */
export function cardsDealt(round) {
  if (round < 1) return 7;
  return round >= 5 ? 11 : round + 6;
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

export function isCalamityRound(round) {
  return maxTricks(round) % 2 === 1;
}

export function isCalamityTrick(tricksPlayed, round, players) {
  const mt = maxTricks(round);
  if (mt % 2 === 0) return false;
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

export function stashTotals(team) {
  const t = { green: 0, blue: 0, red: 0, yellow: 0 };
  for (const p of team.stash) t[p.card.color] += p.value;
  return t;
}

export function canAfford(team, cost) {
  const t = stashTotals(team);
  return COLORS.every((c) => t[c] >= (cost[c] || 0));
}

/** Pay stash; returns removed pieces for recycle. */
export function payStash(team, cost, game, teamId) {
  if (!canAfford(team, cost)) return false;
  const paid = [];
  for (const color of COLORS) {
    const need = cost[color] || 0;
    if (need <= 0) continue;
    const pool = team.stash
      .filter((p) => p.card.color === color)
      .sort((a, b) => a.value - b.value);
    let total = 0;
    const use = [];
    for (const p of pool) {
      use.push(p);
      total += p.value;
      if (total >= need) break;
    }
    for (const p of use) {
      const i = team.stash.indexOf(p);
      if (i >= 0) team.stash.splice(i, 1);
      paid.push(p);
      if (p.source === "trophy") {
        game.teams[1 - teamId].borrowedOut.delete(p.card.id);
      }
    }
  }
  return paid;
}

export function recyclePaid(paid) {
  return paid.map((p) => p.card);
}

export function livingPool(team, useCooldown = false) {
  const inStash = new Set(team.stash.map((p) => p.card.id));
  return team.deck.filter(
    (c) =>
      !team.removedIds.has(c.id) &&
      !inStash.has(c.id) &&
      !team.borrowedOut.has(c.id) &&
      !team.purgedColors.has(c.color) &&
      (!useCooldown || !team.cooldownIds?.has(c.id)),
  );
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
