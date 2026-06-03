/**
 * Competitive AI — EV-based trick play, calamity defense, and armory.
 * Uses one-ply trick simulation (perfect info) + reserve/calamity math.
 */
import { COLORS } from "./data/cards.js";
import { calamityReservePrep } from "./calamity.js";
import {
  BUYS_PER_ARMORY,
  CALAMITY_PREP_MIN_RESERVE,
  PERMANENT_COSTS,
  PERMANENT_UNLOCK_ROUND,
  ROUND_COSTS,
  ROUND_MIN,
  VISIT_COSTS,
  redCullCount,
  redCullCost,
  applyRedCullToCooldown,
  redCullFromVisitKey,
  repairCost,
  assaultValue,
  blockValue,
  canAfford,
  canFollow,
  FINISHER_BASE,
  isCalamityRound,
  maxTricks,
  isSigilElite,
  payStash,
  recyclePaid,
  ROUND_BUFF_BASE,
  scaleCombat,
  scaledBuff,
  stashTotals,
  stashValue,
} from "./rules.js";

const JITTER = 0.08;
const HP_VALUE = 1.15;
const LETHAL_BONUS = 800;
const CALAMITY_LETHAL_BONUS = 1200;

function rand(rng) {
  return rng();
}

function resourceSum(team) {
  const t = stashTotals(team);
  return (t.green || 0) + (t.blue || 0) + (t.red || 0) + (t.yellow || 0);
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

function trickTotalsFrom(plays, game, led) {
  const rn = game.round;
  let assault = 0;
  let block = 0;
  for (const { player, card, siege } of plays) {
    const team = game.teams[player.teamId];
    if (siege) assault += combatContrib(card, led, team, rn, true);
    else block += combatContrib(card, led, team, rn, false);
  }
  return { assault, block };
}

/** Damage to the defending team's castle from a resolved trick line. */
function trickDamageToDefender(game, led, plays) {
  const { assault, block } = trickTotalsFrom(plays, game, led);
  return Math.max(0, assault - block);
}

function defenderTeamId(game) {
  return 1 - game.siegerTeam;
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

/** Fast opponent model for trick simulation (no nested lookahead). */
function pickSimulationCard(game, player, led, siege, plays) {
  const team = game.teams[player.teamId];
  const rn = game.round;
  const hand = player.hand;
  const opts = canFollow(hand, led);
  const off = hand.filter((c) => c.color !== led);
  const { assault, block } = trickTotalsFrom(plays, game, led);
  const gap = assault - block;

  if (siege) {
    const pool = opts.length ? opts : hand;
    return pickBest(pool, (c) => combatContrib(c, led, team, rn, true));
  }

  if (gap > 0 && opts.length) {
    return pickBest(opts, (c) => {
      const b = combatContrib(c, led, team, rn, false);
      const cover = Math.min(b, gap);
      return cover * 50 + b;
    });
  }

  if (gap <= 0 && off.length && opts.length) {
    const follow = pickBest(opts, (c) => combatContrib(c, led, team, rn, false));
    const dump = pickBest(off, (c) => {
      let v = stashValue(c, false);
      if (team.marchTax) v += 1;
      return v * 12;
    });
    const fB = combatContrib(follow, led, team, rn, false);
    const dV =
      (team.marchTax ? stashValue(dump, false) + 1 : stashValue(dump, false)) * 11 -
      fB * 4;
    if (dV > 2 || gap <= -3) return dump;
    return follow;
  }

  const pool = opts.length ? opts : hand;
  return pickBest(pool, (c) => {
    if (c.color !== led) {
      let v = stashValue(c, false);
      if (team.marchTax) v += 1;
      return v * 10;
    }
    return combatContrib(c, led, team, rn, false) * (gap > 0 ? 14 : 3);
  });
}

function simulateTrickToEnd(game, led, plays, fromStep) {
  const order = game.trickOrder;
  const sim = [...plays];
  for (let i = fromStep; i < order.length; i++) {
    const p = game.players[order[i]];
    if (!p.hand.length) continue;
    const siege = p.teamId === game.siegerTeam;
    const card = pickSimulationCard(game, p, led, siege, sim);
    sim.push({ player: p, card, siege });
  }
  return trickDamageToDefender(game, led, sim);
}

function castleFinishWeight(game, damage, playerTeam) {
  const defId = defenderTeamId(game);
  const defHp = game.teams[defId].castleHp;
  if (playerTeam === game.siegerTeam && damage >= defHp) return 1.8;
  if (playerTeam === defId && defHp <= 12) return 1.5;
  return 1;
}

/**
 * Expected value of playing `card` for this player (higher = better).
 * Negative EV = damage to our castle when we defend.
 */
function evaluateCardEV(game, player, card, led, siege, isLead) {
  const team = game.teams[player.teamId];
  const rn = game.round;
  const defId = defenderTeamId(game);
  const myTeam = player.teamId;
  const off = card.color !== led;

  const plays = [
    ...game.trickPlays,
    { player, card, siege: off ? false : siege },
  ];
  if (off) {
    plays[plays.length - 1].siege = false;
  }

  const ledFinal = led || card.color;
  const damage = simulateTrickToEnd(game, ledFinal, plays, game.trickStep + 1);
  const finW = castleFinishWeight(game, damage, myTeam);

  if (off) {
    let stash = stashValue(card, siege);
    if (team.marchTax) stash += 1;
    let ev = stash * 9;
    const { assault, block } = trickTotalsFrom(plays, game, ledFinal);
    const gap = assault - block;
    if (!siege && gap > 0) ev += Math.min(gap, 10) * 1.2;
    if (siege && assault >= 5) ev += 3;
    if (myTeam === defId && gap > 0) ev -= gap * HP_VALUE * 0.35;
    if (isLead) ev -= 5;
    return ev + rand(game.rng) * JITTER;
  }

  const contrib = combatContrib(card, ledFinal, team, rn, siege);
  const { assault, block } = trickTotalsFrom(
    game.trickPlays,
    game,
    ledFinal,
  );
  const gap = assault - block;

  if (myTeam === defId) {
    const hp = game.teams[defId].castleHp;
    let ev = -damage * HP_VALUE * finW;
    if (gap > 0) {
      const cover = Math.min(contrib, gap);
      ev += cover * HP_VALUE * 2.2;
      if (contrib >= gap) ev += LETHAL_BONUS * 0.15;
      if (damage === 0 && contrib >= gap) ev += 12;
    }
    if (damage > 0 && contrib > 0) ev += Math.min(contrib, damage) * HP_VALUE;
    return ev + rand(game.rng) * JITTER;
  }

  let ev = damage * HP_VALUE * finW;
  if (siege) {
    ev += contrib * 1.4;
    if (isLead) ev += contrib * 0.5;
    if (gap + contrib >= block + 3) ev += 6;
    if (game.teams[defId].castleHp <= damage + 4) ev += 25;
  }
  return ev + rand(game.rng) * JITTER;
}

function legalCards(game, player, led, siege, isLead) {
  if (isLead) return player.hand;
  if (game.followMode === "must") {
    const opts = canFollow(player.hand, led);
    return opts.length ? opts : player.hand;
  }
  return player.hand;
}

function pickByEV(game, player, led, siege, isLead) {
  const pool = legalCards(game, player, led, siege, isLead);
  return pickBest(pool, (c) =>
    evaluateCardEV(game, player, c, led, siege, isLead),
  );
}

function pickFollowMaySmart(game, player, led, siege) {
  const hand = player.hand;
  const opts = canFollow(hand, led);
  const off = hand.filter((c) => c.color !== led);

  if (opts.length && off.length) {
    const followOnly = pickBest(opts, (c) =>
      evaluateCardEV(
        game,
        player,
        c,
        led,
        siege,
        false,
      ),
    );
    const dump = pickBest(off, (c) =>
      evaluateCardEV(game, player, c, led, siege, false),
    );
    const fEv = evaluateCardEV(game, player, followOnly, led, siege, false);
    const dEv = evaluateCardEV(game, player, dump, led, siege, false);
    if (dEv > fEv + 1.5) return dump;
    return followOnly;
  }

  return pickByEV(game, player, led, siege, false);
}

function pickLeadSmart(game, player) {
  const hand = player.hand;
  const team = game.teams[player.teamId];
  const siege = player.teamId === game.siegerTeam;

  if (siege && team.sallyGate && !game.sallyUsed) {
    game.sallyUsed = true;
    const colors = [...new Set(hand.map((c) => c.color))];
    const best = colors.reduce((bestC, col) => {
      const sum = hand
        .filter((c) => c.color === col)
        .reduce((s, c) => s + c.mr, 0);
      const bestSum = hand
        .filter((c) => c.color === bestC)
        .reduce((s, c) => s + c.mr, 0);
      return sum > bestSum ? col : bestC;
    }, colors[0]);
    const cards = hand.filter((c) => c.color === best);
    return pickByEV(game, player, best, true, true);
  }

  return pickByEV(game, player, null, siege, true);
}

function calamityBlockWithCard(game, teamId, led, trickPlays, card, player) {
  const team = game.teams[teamId];
  const rn = game.round;
  const firstDef = !team.boilingOilUsed;
  const { blockBonus, extra: prepExtra } = calamityReservePrep(team, rn);
  let block = blockBonus;
  let sigilElite = false;

  const allPlays = [...(trickPlays || [])];
  if (card && player) allPlays.push({ player, card, siege: false });

  for (const { card: c } of allPlays.filter((t) => t.player.teamId === teamId)) {
    const contrib = scaleCombat(
      blockValue(c, led, team, rn, { isFirstDefenseTrick: firstDef }),
      rn,
    );
    block += contrib;
    if (contrib > 0 && isSigilElite(c, team)) sigilElite = true;
  }

  if (!sigilElite) {
    if (!team.boilingOilUsed && team.activeBuffs?.has("boiling_oil")) {
      block += scaledBuff(ROUND_BUFF_BASE, rn);
    }
    if (!team.ironCurtainUsed && team.activeBuffs?.has("iron_curtain")) {
      block += scaledBuff(FINISHER_BASE, rn);
    }
  }

  const assault = game.calamityReveal?.assault ?? 10;
  const damage = Math.max(0, assault + prepExtra - block);
  return { block, damage, prepExtra };
}

/** Calamity tower-up: minimize expected calamity damage (reserve prep + walls). */
export function pickCalamityCard(game, player, led) {
  const team = game.teams[player.teamId];
  const rn = game.round;
  const assault = game.calamityReveal?.assault ?? 10;
  const { extra: prepExtra } = calamityReservePrep(team, rn);
  const hp = team.castleHp;

  const ledCards = canFollow(player.hand, led);
  const candidates = ledCards.length ? ledCards : player.hand;

  return pickBest(candidates, (c) => {
    const { damage, block } = calamityBlockWithCard(
      game,
      player.teamId,
      led,
      game.trickPlays || [],
      c,
      player,
    );
    let ev = -damage * HP_VALUE * 3;
    if (damage === 0) ev += 40;
    if (hp <= assault + prepExtra && damage < hp) ev += CALAMITY_LETHAL_BONUS * 0.2;
    if (damage >= hp) ev -= CALAMITY_LETHAL_BONUS;
    if (c.color === led) ev += block * 0.5;
    else {
      let v = stashValue(c, false);
      if (team.marchTax) v += 1;
      ev += v * 4;
    }
    return ev;
  });
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
  return pickByEV(game, player, led, siege, false);
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

export function pickPermanentChoice(team, options, rng) {
  for (const key of ["sigil", "creed", "crest", "mastery", "purge"]) {
    if (!options.includes(key)) continue;
    if (key === "purge" && rand(rng) < 0.12) return key;
    if (key !== "purge") return key;
  }
  return options[Math.floor(rand(rng) * options.length)];
}

function nextRoundIsCalamity(round) {
  return isCalamityRound(round + 1);
}

function greenAfterPay(team, cost) {
  const t = stashTotals(team);
  return (t.green || 0) - (cost.green || 0);
}

function armoryActionScore(game, team, teamId, key) {
  const hp = team.castleHp;
  const max = team.castleMax;
  const round = game.round;
  const t = stashTotals(team);
  const nextCal = nextRoundIsCalamity(round);

  if (key === "repair") {
    if (hp >= max - 1) return -5;
    const missing = max - hp;
    if (hp < max * 0.25) return 90 + missing;
    if (hp < max * 0.45) return 55 + missing * 0.5;
    if (nextCal && hp < max * 0.7) return 35;
    return 12;
  }

  if (key === "red_cull_1" || key === "red_cull_2" || key === "red_cull_both") {
    const cull = redCullFromVisitKey(key);
    const n = redCullCount(team, cull);
    if (n <= 0) return -20;
    let s = 6 + Math.min(12, n * 2);
    if (team.reserve.length < CALAMITY_PREP_MIN_RESERVE && nextCal) s -= 20;
    else if (nextCal && key === "red_cull_both") s -= 12;
    else if (nextCal && key === "red_cull_2") s -= 6;
    return s;
  }

  if (key === "boiling_oil") {
    let s = 42;
    if (hp < max * 0.5) s += 15;
    if (nextCal) s += 20;
    if ((t.blue || 0) < 8) s -= 25;
    return s;
  }

  if (key === "war_drums") {
    let s = 38;
    if ((t.green || 0) < 4 && hp < max * 0.55) s -= 30;
    return s;
  }

  if (key === "march_tax") return 32;

  if (key === "siege_breaker" || key === "iron_curtain") {
    return round >= 5 && hp > max * 0.2 ? 48 : -10;
  }

  return 10;
}

/** Four-slot worker draft EV (slot + choice dict). */
export function scoreArmoryWorkerPick(game, team, teamId, slot, choice) {
  const hp = team.castleHp;
  const max = team.castleMax;
  const round = game.round;
  const t = stashTotals(team);
  const nextCal = nextRoundIsCalamity(round);

  if (slot === "green" && choice?.heal) {
    const heal = Math.min(choice.heal, max - hp);
    if (heal <= 0) return -20;
    const cost = repairCost(choice.heal);
    const costG = cost?.green ?? 99;
    let s = heal * 22;
    if (hp < max * 0.25) s += 50;
    if (hp < max * 0.45) s += 30;
    if (nextCal && hp < max * 0.65) s += 25;
    if (hp > max * 0.72) s -= 28;
    return s - costG * 4;
  }
  if (slot === "red" && choice?.cull) {
    const n = redCullCount(team, choice.cull);
    if (n <= 0) return -20;
    let s = 8 + Math.min(14, n * 2);
    if (team.reserve.length < CALAMITY_PREP_MIN_RESERVE && nextCal) s -= 22;
    else if (nextCal && choice.cull.mode === "both") s -= 14;
    else if (nextCal && choice.cull.value === 2) s -= 8;
    const cost = redCullCost(choice.cull.value, choice.cull.mode);
    const costR = cost.red || 0;
    return s - costR * 2.5;
  }
  if (slot === "yellow" && choice?.tier) {
    const mt = maxTricks(game.round + 1);
    const siegeTricks = Math.max(1, Math.floor(mt / 2));
    if (choice.tier === "high") {
      if (round < 5 || hp <= max * 0.15) return -15;
      let s = 40 + siegeTricks * 14;
      if (nextCal) s += 12;
      return s;
    }
    let s = 44 + siegeTricks * 14;
    if ((t.yellow || 0) < 7) s -= 6;
    return s;
  }
  if (slot === "blue" && choice?.tier) {
    const mt = maxTricks(game.round + 1);
    const defTricks = Math.max(1, Math.floor(mt / 2));
    if (choice.tier === "high") {
      if (round < 5) return -15;
      let s = 55 + defTricks * 16;
      if (hp < max * 0.5) s += 15;
      if (nextCal) s += 36;
      return s;
    }
    let s = 54 + defTricks * 16;
    if (hp < max * 0.5) s += 16;
    if (nextCal) s += 36;
    if ((t.blue || 0) < 7) s -= 5;
    return s;
  }
  return -20;
}

function armoryCandidates(game, team, style) {
  const round = game.round;
  const nextCal = nextRoundIsCalamity(round);
  const hp = team.castleHp;
  const max = team.castleMax;
  const t = stashTotals(team);
  const list = [];

  if (hp < max * 0.5 && (t.green || 0) >= 3) list.push("repair");
  if (hp < max * 0.3 && (t.green || 0) >= 3) list.push("repair");
  if (team.reserve.length > 10 && (t.red || 0) >= 3) {
    const cull = { value: 1, mode: "band" };
    if (redCullCount(team, cull) > 0) list.push("red_cull_1");
  }
  if (team.reserve.length > 10 && (t.red || 0) >= 7) {
    const cull = { value: 2, mode: "band" };
    if (redCullCount(team, cull) > 0) list.push("red_cull_2");
  }
  if (team.reserve.length > 12 && (t.red || 0) >= 11) {
    const cull = { value: 2, mode: "both" };
    if (redCullCount(team, cull) > 0) list.push("red_cull_both");
  }

  if (canAfford(team, ROUND_COSTS.boiling_oil) && (ROUND_MIN.boiling_oil || 1) <= round) {
    list.push("boiling_oil");
  }
  if (canAfford(team, ROUND_COSTS.war_drums) && (ROUND_MIN.war_drums || 1) <= round) {
    list.push("war_drums");
  }
  if (canAfford(team, ROUND_COSTS.march_tax) && (ROUND_MIN.march_tax || 1) <= round) {
    list.push("march_tax");
  }
  if (round >= 5) {
    if (canAfford(team, ROUND_COSTS.siege_breaker)) list.push("siege_breaker");
    if (canAfford(team, ROUND_COSTS.iron_curtain)) list.push("iron_curtain");
  }

  if (style === "economist") {
    const i = list.indexOf("march_tax");
    if (i >= 0) {
      list.splice(i, 1);
      list.unshift("march_tax");
    }
  }

  return [...new Set(list)];
}

export function pickPermanentColor(team) {
  return dominantDeckColor(team);
}

function aiRedCullFromReserve(team, key) {
  const cull = redCullFromVisitKey(key);
  if (!cull) return 0;
  return applyRedCullToCooldown(team, cull);
}

export function runArmoryAI(game, teamId) {
  const team = game.teams[teamId];
  const style = game.armoryStyles[teamId];
  const rng = game.rng;
  let buys = 0;
  let benchBuys = 0;
  const log = [];
  const totalStash = resourceSum(team);

  const tryPerm = () => {
    if (team.permanent || buys >= BUYS_PER_ARMORY || game.round < PERMANENT_UNLOCK_ROUND) {
      return false;
    }
    const opts = Object.keys(PERMANENT_COSTS).filter((k) => canAfford(team, PERMANENT_COSTS[k]));
    if (!opts.length || totalStash < 18) return false;
    if (game.round === 4 && totalStash < 22 && rand(rng) > 0.45) return false;
    if (team.castleHp < team.castleMax * 0.4 && rand(rng) > 0.35) return false;
    const choice = pickPermanentChoice(team, opts, rng);
    const paid = payStash(team, PERMANENT_COSTS[choice]);
    if (!paid) return false;
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
    if (key.startsWith("red_cull") && benchBuys >= 1) return false;
    if (!canAfford(team, cost)) return false;
    if (key === "repair" && greenAfterPay(team, cost) < 0 && team.castleHp > team.castleMax * 0.6) {
      return false;
    }
    if (key.startsWith("red_cull")) {
      const cull = redCullFromVisitKey(key);
      if (redCullCount(team, cull) <= 0) return false;
    }
    const paid = payStash(team, cost);
    if (!paid) return false;
    if (key === "repair") team.castleHp = Math.min(team.castleMax, team.castleHp + 2);
    else if (key.startsWith("red_cull")) {
      aiRedCullFromReserve(team, key);
      benchBuys++;
    }
    buys++;
    log.push(key);
    return true;
  };

  const tryRound = (key) => {
    if ((ROUND_MIN[key] || 1) > game.round) return false;
    if (buys >= BUYS_PER_ARMORY || !canAfford(team, ROUND_COSTS[key])) return false;
    const cost = ROUND_COSTS[key];
    if ((cost.blue || 0) >= 10 && (cost.green || 0) === 0) {
      const g = stashTotals(team).green || 0;
      if (g < 4 && team.castleHp < team.castleMax * 0.55) return false;
    }
    const paid = payStash(team, ROUND_COSTS[key]);
    if (!paid) return false;
    team.pendingBuffs.add(key);
    team.skipBlueDeal = true;
    buys++;
    log.push(key);
    return true;
  };

  tryPerm();
  const excluded = new Set();
  while (buys < BUYS_PER_ARMORY) {
    const candidates = armoryCandidates(game, team, style).filter((k) => !excluded.has(k));
    let bestKey = null;
    let bestScore = -Infinity;
    for (const key of candidates) {
      const sc = armoryActionScore(game, team, teamId, key);
      if (sc > bestScore) {
        bestScore = sc;
        bestKey = key;
      }
    }
    if (!bestKey || bestScore < 5) break;

    let done = false;
    if (bestKey === "repair" || bestKey.startsWith("bench")) {
      done = tryVisit(bestKey);
    } else if (ROUND_COSTS[bestKey]) {
      done = tryRound(bestKey);
    }
    if (!done) {
      excluded.add(bestKey);
      continue;
    }
  }
  return log;
}

export const PLAYER_STYLES = {
  human: "balanced",
  ally: "defensive",
  enemy0: "combat",
  enemy1: "economist",
};
