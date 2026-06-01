/** Calamity trick — both teams defend deck siege (round 3 & every round 5+). */
import { cloneCard, COLOR_META } from "./data/cards.js";
import {
  CALAMITY_ASSAULT_MULT,
  CALAMITY_EMPTY_RESERVE_EXTRA,
  CALAMITY_PREP_MIN_RESERVE,
  CALAMITY_RESERVE_BLOCK_CAP,
  CALAMITY_RESERVE_BLOCK_PER,
  CALAMITY_UNDERPREP_PER_CARD,
  blockValue,
  isSigilElite,
  scaleCombat,
  scaledBuff,
  FINISHER_BASE,
  ROUND_BUFF_BASE,
  SIEGE_SOAK,
  CASTLE_DESTROY_MIN_ROUND,
} from "./rules.js";

export function calamityAssaultFromRanks(rank1, rank2) {
  return Math.floor((rank1 + rank2) * CALAMITY_ASSAULT_MULT);
}

export function calamityReservePrep(team, round) {
  const depth = team.reserve.length;
  let blockBonus = 0;
  let extra = 0;
  if (team.reserve.length) {
    const top = team.reserve.slice(0, 3);
    const wall = Math.max(...top.map((c) => scaleCombat(c.tr, round)));
    blockBonus += Math.floor(wall / 3);
  }
  if (depth >= CALAMITY_PREP_MIN_RESERVE) {
    const over = depth - CALAMITY_PREP_MIN_RESERVE + 1;
    blockBonus += Math.min(CALAMITY_RESERVE_BLOCK_CAP, over * CALAMITY_RESERVE_BLOCK_PER);
  } else {
    extra = (CALAMITY_PREP_MIN_RESERVE - depth) * CALAMITY_UNDERPREP_PER_CARD;
    if (depth === 0) extra += CALAMITY_EMPTY_RESERVE_EXTRA;
  }
  return { blockBonus, extra };
}

/** Top reserve monster for calamity flip (removed until returned after resolve). */
function takeReserveTop(game, preferredTeam) {
  for (const tid of [preferredTeam, 1 - preferredTeam]) {
    const team = game.teams[tid];
    if (team.reserve.length) {
      return { card: team.reserve.shift(), teamId: tid };
    }
  }
  return null;
}

/** Flipped deck monsters were not played — return to top of reserve (no cooldown). */
export function returnCalamityDeckCards(game, c1Team, c2Team, c1, c2) {
  if (c1) game.teams[c1Team].reserve.unshift(c1);
  if (c2) game.teams[c2Team].reserve.unshift(c2);
}

/** Flip deck monsters; player chooses tower defenses in a follow-up step. */
export function startCalamityTrick(game) {
  const deck1Team = game.blindReserveTeam;
  game.blindReserveTeam = 1 - game.blindReserveTeam;
  const deck2Team = 1 - deck1Team;
  const t1 = takeReserveTop(game, deck1Team);
  const t2 = takeReserveTop(game, deck2Team);
  if (!t1 || !t2) return null;
  const c1 = t1.card;
  const c2 = t2.card;

  const led = c1.color;
  const assault = calamityAssaultFromRanks(c1.mr, c2.mr);

  game.log.push(
    `Calamity: ${COLOR_META[led]?.monster || led} ${c1.mr} + ${c2.mr} = ${assault} assault. Both teams defend (tower-up).`,
  );

  return {
    step: "deck",
    deck1Team,
    deck2Team,
    c1Team: t1.teamId,
    c2Team: t2.teamId,
    c1: cloneCard(c1),
    c2: cloneCard(c2),
    led,
    assault,
    rankSum: c1.mr + c2.mr,
    teamResults: null,
  };
}

/** Play order: your team (you, ally), then enemies. */
export function calamityDefendOrder(game) {
  const order = [];
  for (const tid of [0, 1]) {
    for (const p of game.players.filter((x) => x.teamId === tid)) {
      order.push(p.id);
    }
  }
  return order;
}

/** After all four defense cards are played, resolve block and damage. */
export function resolveCalamityFromPlays(game, trickPlays) {
  const rn = game.round;
  const led = game.calamityReveal.led;
  const assault = game.calamityReveal.assault;
  const teamResults = [];

  for (const teamId of [0, 1]) {
    const team = game.teams[teamId];
    const firstDef = !team.boilingOilUsed;
    const { blockBonus, extra: prepExtra } = calamityReservePrep(team, rn);
    let block = blockBonus;
    let sigilElite = false;
    const defenses = [];

    for (const { player, card } of trickPlays.filter((t) => t.player.teamId === teamId)) {
      const contrib = scaleCombat(
        blockValue(card, led, team, rn, { isFirstDefenseTrick: firstDef }),
        rn,
      );
      block += contrib;
      if (contrib > 0 && isSigilElite(card, team)) sigilElite = true;
      defenses.push({
        playerId: player.id,
        playerName: player.name,
        human: player.human,
        card: cloneCard(card),
        contrib,
      });
    }

    if (sigilElite) {
      if (team.activeBuffs.has("boiling_oil")) team.boilingOilUsed = true;
      if (team.activeBuffs.has("iron_curtain")) team.ironCurtainUsed = true;
    } else {
      if (!team.boilingOilUsed && team.activeBuffs.has("boiling_oil")) {
        block += scaledBuff(ROUND_BUFF_BASE, rn);
        team.boilingOilUsed = true;
      }
      if (!team.ironCurtainUsed && team.activeBuffs.has("iron_curtain")) {
        block += scaledBuff(FINISHER_BASE, rn);
        team.ironCurtainUsed = true;
      }
    }
    let damage = Math.max(0, assault + prepExtra - block - SIEGE_SOAK);
    if (CASTLE_DESTROY_MIN_ROUND > 1 && rn < CASTLE_DESTROY_MIN_ROUND) {
      damage = Math.min(damage, Math.max(0, team.castleHp - 1));
    }
    team.castleHp -= damage;

    const who = teamId === 0 ? "Your team" : "Enemies";
    game.log.push(`${who} block ${block} → ${damage} calamity damage.`);

    teamResults.push({
      teamId,
      label: who,
      block,
      prepExtra,
      reservePrep: blockBonus,
      damage,
      defenses,
    });
  }

  return teamResults;
}
