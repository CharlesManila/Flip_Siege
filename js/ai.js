/**
 * Competitive AI — context-aware trick play, calamity defense, and armory.
 * Uses real assault/block/stash values (matches simulate_stash_2v2 heuristics).
 */
import { COLORS } from "./data/cards.js";
import {
  BUYS_PER_ARMORY,
  CALAMITY_PREP_MIN_RESERVE,
  PERMANENT_COSTS,
  PERMANENT_UNLOCK_ROUND,
  ROUND_COSTS,
  ROUND_MIN,
  VISIT_COSTS,
  assaultValue,
  blockValue,
  canAfford,
  canFollow,
  payStash,
  recyclePaid,
  scaleCombat,
  stashTotals,
  stashValue,
} from "./rules.js";

function rand(rng) {
  return rng();
}

function stashSum(team) {
  return team.stash.reduce((s, p) => s + p.value, 0);
}

function combatContrib(card, led, team, round, siege) {
  const ctx = siege
    ? { isFirstSiegeTrick: !team.warDrumsUsed }
    : { isFirstDefenseTrick: !team.boilingOilUsed };
  const raw = siege
    ? assaultValue(card, led, team, round, ctx)
    : blockValue(card, led, team, round, ctx);
  return scaleCombat(raw, round);
}

/** Assault/block already on the table this trick. */
function trickTotals(game, led) {
  const rn = game.round;
  let assault = 0;
  let block = 0;
  for (const { player, card, siege } of game.trickPlays || []) {
    const team = game.teams[player.teamId];
    if (siege) assault += combatContrib(card, led, team, rn, true);
    else block += combatContrib(card, led, team, rn, false);
  }
  return { assault, block };
}

function styleBias(style, siege) {
  if (style === "combat" || style === "aggressive") return siege ? 1.15 : 1.1;
  if (style === "defensive") return siege ? 0.88 : 1.12;
  if (style === "economist") return siege ? 1.05 : 0.95;
  return 1;
}

function scoreCardPlay(game, player, card, led, siege, isLead) {
  const team = game.teams[player.teamId];
  const rn = game.round;
  const style = player.aiStyle || "balanced";
  const bias = styleBias(style, siege);
  const off = card.color !== led;
  const { assault, block } = trickTotals(game, led);

  if (off) {
    let stash = stashValue(card, siege);
    if (team.marchTax) stash += 1;
    let score = stash * 11;
    if (siege) {
      if (assault >= 6) score += 4;
      if (style === "defensive") score += card.mr * 0.5;
    } else {
      const gap = assault - block;
      if (gap > 0) score += Math.min(gap, 8) * 1.5;
      if (style === "defensive" && card.tr >= 5) score += 3;
    }
    if (isLead) score -= 6;
    return score * bias;
  }

  const contrib = combatContrib(card, led, team, rn, siege);
  let score = contrib * 12;

  if (siege) {
    if (isLead) score += contrib * 3 + card.mr;
    else if (assault + contrib >= block + 2) score += 5;
    if (style === "defensive" && !isLead && card.mr >= 7) score -= contrib * 4;
    if (style === "combat" || style === "aggressive") score += card.mr * 0.4;
  } else {
    const gap = assault - block;
    if (gap > 0) {
      score += Math.min(contrib, gap) * 18;
      if (contrib >= gap) score += 8;
    } else {
      score += contrib * 4;
      if (style === "defensive") score += contrib * 2;
      else if (style === "economist" && contrib <= 2) score -= contrib * 3;
    }
    if (style === "defensive" && card.tr >= 6) score += 2;
  }

  return score * bias + rand(game.rng) * 0.35;
}

function pickBest(hand, scoreFn) {
  let best = hand[0];
  let bestS = scoreFn(best);
  for (let i = 1; i < hand.length; i++) {
    const s = scoreFn(hand[i]);
    if (s > bestS) {
      best = hand[i];
      bestS = s;
    }
  }
  return best;
}

function pickFollowMaySmart(game, player, led, siege) {
  const hand = player.hand;
  const opts = canFollow(hand, led);
  const off = hand.filter((c) => c.color !== led);
  const style = player.aiStyle || "balanced";

  if (opts.length && off.length) {
    const follow = pickBest(opts, (c) =>
      scoreCardPlay(game, player, c, led, siege, false),
    );
    const dump = pickBest(off, (c) =>
      scoreCardPlay(game, player, c, led, siege, false),
    );
    const fScore = scoreCardPlay(game, player, follow, led, siege, false);
    const dScore = scoreCardPlay(game, player, dump, led, siege, false);
    const { assault, block } = trickTotals(game, led);

    let dumpChance = 0.38;
    if (style === "economist") dumpChance = 0.55;
    if (style === "defensive" && !siege) dumpChance = 0.48;

    const siegePiling = siege && assault >= 5;
    const defenseHopeless = !siege && assault - block >= 6;
    if (dScore > fScore * 1.08 || siegePiling || defenseHopeless) {
      if (rand(game.rng) < dumpChance + (dScore > fScore * 1.25 ? 0.25 : 0)) {
        return dump;
      }
    }
    return follow;
  }

  if (opts.length) {
    return pickBest(opts, (c) => scoreCardPlay(game, player, c, led, siege, false));
  }
  if (off.length) {
    return pickBest(off, (c) => scoreCardPlay(game, player, c, led, siege, false));
  }
  return hand[Math.floor(rand(game.rng) * hand.length)];
}

function pickLeadSmart(game, player) {
  const hand = player.hand;
  const style = player.aiStyle || "balanced";
  const team = game.teams[player.teamId];
  const siege = player.teamId === game.siegerTeam;

  if (siege && team.sallyGate && !game.sallyUsed) {
    game.sallyUsed = true;
    const colors = [...new Set(hand.map((c) => c.color))];
    const best = colors.reduce((bestC, col) => {
      const sum = hand.filter((c) => c.color === col).reduce((s, c) => s + c.mr, 0);
      const bestSum = hand
        .filter((c) => c.color === bestC)
        .reduce((s, c) => s + c.mr, 0);
      return sum > bestSum ? col : bestC;
    }, colors[0]);
    const cards = hand.filter((c) => c.color === best);
    return pickBest(cards, (c) => scoreCardPlay(game, player, c, c.color, true, true));
  }

  if (style === "economist") {
    const counts = {};
    for (const c of hand) counts[c.color] = (counts[c.color] || 0) + 1;
    const bestColor = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const pool = hand.filter((c) => c.color === bestColor);
    return pickBest(pool.length ? pool : hand, (c) =>
      scoreCardPlay(game, player, c, c.color, siege, true),
    );
  }

  if (style === "defensive" && !siege) {
    const mid = [...hand].sort((a, b) => a.mr - b.mr);
    const c = mid[Math.floor(mid.length / 2)];
    return scoreCardPlay(game, player, c, c.color, false, true) >= 0 ? c : hand[0];
  }

  return pickBest(hand, (c) =>
    scoreCardPlay(game, player, c, c.color, siege, true),
  );
}

/** Defending team trophy: best tower, prefer led-color siege monsters within block. */
export function pickTrophyDefender(eligible, rng) {
  if (!eligible.length) return null;
  const score = (e) => e.card.tr * 100 - e.card.mr + (e.assaultContrib || 0) * 2;
  let best = eligible[0];
  for (const e of eligible) {
    if (score(e) > score(best)) best = e;
    else if (score(e) === score(best) && rand(rng) > 0.5) best = e;
  }
  return best.card;
}

export function pickCard(game, player, led, siege, isLead) {
  if (isLead) return pickLeadSmart(game, player);
  if (game.followMode === "may") {
    return pickFollowMaySmart(game, player, led, siege);
  }
  const opts = canFollow(player.hand, led);
  const pool = opts.length ? opts : player.hand;
  return pickBest(pool, (c) => scoreCardPlay(game, player, c, led, siege, false));
}

/** Calamity tower-up: maximize block on led color, else stash dump. */
export function pickCalamityCard(game, player, led) {
  const team = game.teams[player.teamId];
  const rn = game.round;
  const ledCards = canFollow(player.hand, led);
  if (ledCards.length) {
    return pickBest(ledCards, (c) => blockValue(c, led, team, rn, { isFirstDefenseTrick: false }));
  }
  return pickBest(player.hand, (c) => {
    let v = stashValue(c, false);
    if (team.marchTax) v += 1;
    return v * 10 + c.tr;
  });
}

function dominantDeckColor(team) {
  const pool = team.deck.filter(
    (c) => !team.removedIds.has(c.id) && !team.purgedColors.has(c.color),
  );
  if (!pool.length) return COLORS[0];
  const counts = {};
  for (const c of pool) counts[c.color] = (counts[c.color] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function pickPermanentChoice(team, options, rng) {
  const dom = dominantDeckColor(team);
  const order = ["sigil", "creed", "crest", "mastery", "purge"];
  for (const key of order) {
    if (!options.includes(key)) continue;
    if (key === "purge" && rand(rng) < 0.15) return key;
    if (key === "sigil" || key === "creed" || key === "crest" || key === "mastery") {
      return key;
    }
  }
  return options[Math.floor(rand(rng) * options.length)];
}

function needsReservePrep(team, round) {
  return team.reserve.length < CALAMITY_PREP_MIN_RESERVE && (round === 1 || round === 3);
}

function armoryPriority(style, team, round, rng) {
  const low = team.castleHp < team.castleMax * 0.45;
  const critical = team.castleHp < team.castleMax * 0.3;
  const thin = team.reserve.length < CALAMITY_PREP_MIN_RESERVE;
  const deep = team.reserve.length > 8;
  const finishers = round >= 5 ? ["siege_breaker", "iron_curtain"] : [];
  const actions = [];

  if (critical) actions.push("repair", "repair");
  else if (low) actions.push("repair");

  if (needsReservePrep(team, round) && team.reserve.length >= 1) {
    actions.push("scrap_1", "scrap_1");
  } else if (style === "thinner" && team.reserve.length >= 1) {
    actions.push("scrap_1");
  } else if (deep && style !== "combat" && rand(rng) < 0.35) {
    actions.push("scrap_1");
  }

  if (style === "combat") {
    actions.push("war_drums", "boiling_oil", "march_tax", ...finishers);
  } else if (style === "thinner") {
    actions.push("march_tax", "war_drums", "boiling_oil", ...finishers);
  } else {
    actions.push("war_drums", "boiling_oil", "march_tax", ...finishers);
  }

  return shuffle([...new Set(actions)], rng);
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPermanentColor(team) {
  return dominantDeckColor(team);
}

function scrapReserveSmart(team, n) {
  const sorted = [...team.reserve].sort((a, b) => a.tr - b.tr || a.mr - b.mr);
  for (let i = 0; i < n && sorted.length; i++) {
    const c = sorted.shift();
    const idx = team.reserve.findIndex((x) => x.id === c.id);
    if (idx >= 0) {
      team.reserve.splice(idx, 1);
      team.removedIds.add(c.id);
    }
  }
}

export function runArmoryAI(game, teamId) {
  const team = game.teams[teamId];
  const style = game.armoryStyles[teamId];
  const rng = game.rng;
  let buys = 0;
  let scrapBuys = 0;
  const log = [];
  const totalStash = stashSum(team);

  const tryPerm = () => {
    if (team.permanent || buys >= BUYS_PER_ARMORY || game.round < PERMANENT_UNLOCK_ROUND) {
      return false;
    }
    const opts = Object.keys(PERMANENT_COSTS).filter((k) => canAfford(team, PERMANENT_COSTS[k]));
    if (!opts.length || totalStash < 16) return false;
    if (game.round === 4 && totalStash < 20 && rand(rng) > 0.55) return false;
    if (rand(rng) > 0.52) return false;
    const choice = pickPermanentChoice(team, opts, rng);
    const paid = payStash(team, PERMANENT_COSTS[choice], game, teamId);
    if (!paid) return false;
    game.recycle.push(...recyclePaid(paid));
    team.permanent = choice;
    team.permanentColor = pickPermanentColor(team);
    if (choice === "purge") {
      team.purgedColors.add(team.permanentColor);
      for (const c of team.deck) {
        if (c.color === team.permanentColor) team.removedIds.add(c.id);
      }
    }
    buys++;
    log.push(`perm:${choice}`);
    return true;
  };

  const tryVisit = (key) => {
    const cost = VISIT_COSTS[key];
    if (!cost || buys >= BUYS_PER_ARMORY) return false;
    if (key.startsWith("scrap") && scrapBuys >= 1) return false;
    if (!canAfford(team, cost)) return false;
    if (key === "scrap_1" && team.reserve.length < 1) return false;
    if (key === "scrap_2" && team.reserve.length < 2) return false;
    const paid = payStash(team, cost, game, teamId);
    if (!paid) return false;
    game.recycle.push(...recyclePaid(paid));
    if (key === "repair") team.castleHp = Math.min(team.castleMax, team.castleHp + 2);
    else if (key === "scrap_1") scrapReserveSmart(team, 1);
    else if (key === "scrap_2") scrapReserveSmart(team, 2);
    if (key.startsWith("scrap")) scrapBuys++;
    buys++;
    log.push(key);
    return true;
  };

  const tryRound = (key) => {
    if ((ROUND_MIN[key] || 1) > game.round) return false;
    if (buys >= BUYS_PER_ARMORY || !canAfford(team, ROUND_COSTS[key])) return false;
    const paid = payStash(team, ROUND_COSTS[key], game, teamId);
    if (!paid) return false;
    game.recycle.push(...recyclePaid(paid));
    team.pendingBuffs.add(key);
    team.skipBlueDeal = true;
    buys++;
    log.push(key);
    return true;
  };

  const canBuyFinisher = (key) => {
    if (game.round < 5) return false;
    const cost = ROUND_COSTS[key];
    if (!canAfford(team, cost)) return false;
    const t = stashTotals(team);
    const need = Object.values(cost).reduce((a, b) => a + b, 0);
    const have = Object.values(t).reduce((a, b) => a + b, 0);
    return have >= need + 4;
  };

  tryPerm();
  while (buys < BUYS_PER_ARMORY) {
    let done = false;
    const order = armoryPriority(style, team, game.round, rng);

    if (game.round >= 5) {
      for (const k of ["siege_breaker", "iron_curtain"]) {
        if (canBuyFinisher(k) && tryRound(k)) {
          done = true;
          break;
        }
      }
    }

    if (!done) {
      for (const act of order) {
        if (act === "repair" && tryVisit("repair")) {
          done = true;
          break;
        }
        if (act === "scrap_1" && tryVisit("scrap_1")) {
          done = true;
          break;
        }
        if (ROUND_COSTS[act] && tryRound(act)) {
          done = true;
          break;
        }
      }
    }
    if (!done) break;
  }
  return log;
}

export const PLAYER_STYLES = {
  human: "balanced",
  ally: "defensive",
  enemy0: "combat",
  enemy1: "economist",
};
