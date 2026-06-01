/**
 * Four-slot Armory worker draft — pick order = upcoming trick 1 (alternating teams).
 */
import {
  pickPermanentChoice,
  pickPermanentColor,
  scoreArmoryWorkerPick,
} from "./ai.js";
import {
  ARMORY_GLOBAL_EXCLUSIVE,
  ARMORY_SLOTS,
  BENCH_MAX_PER_ARMORY,
  PERMANENT_COSTS,
  PERMANENT_UNLOCK_ROUND,
  armoryPickOrder,
  blueDefenseTierCost,
  canAfford,
  fourSlotBuffKey,
  isSlotOccupiedForPlayer,
  legalFourSlotChoices,
  payStash,
  repairCost,
  redCullCost,
  applyRedCullToCooldown,
  resourceTotals,
  yellowAttackTierCost,
} from "./rules.js";
import { recordHumanArmoryBuy } from "./playLog.js";

export function startArmoryDraft(game, onComplete) {
  game.phase = "armory";
  game.subphase = "armory_draft";
  game.armoryOnComplete = onComplete;
  game.armoryDraft = {
    pickOrder: armoryPickOrder(game),
    pickIndex: 0,
    occupied: {},
    teamBenchBuys: [0, 0],
  };
  for (const p of game.players) {
    p.workerSlot = null;
    p.lastWorkerSlot = null;
  }
  game.log.push("Armory — worker draft (4 picks, trick-1 order).");
  advanceArmoryDraft(game, true);
}

export function armoryDraftPlayerId(game) {
  const d = game.armoryDraft;
  if (!d || d.pickIndex >= d.pickOrder.length) return null;
  return d.pickOrder[d.pickIndex];
}

export function humanArmoryDraftTurn(game) {
  const pid = armoryDraftPlayerId(game);
  if (pid == null) return null;
  const p = game.players[pid];
  return p.human ? p : null;
}

function clearWorkerFromBoard(game, player) {
  const d = game.armoryDraft;
  if (player.workerSlot && d.occupied[player.workerSlot] === player.id) {
    delete d.occupied[player.workerSlot];
  }
  player.lastWorkerSlot = player.workerSlot;
  player.workerSlot = null;
}

function placeWorker(game, player, slot) {
  const d = game.armoryDraft;
  if (player.workerSlot && d.occupied[player.workerSlot] === player.id) {
    delete d.occupied[player.workerSlot];
  }
  player.lastWorkerSlot = player.workerSlot;
  player.workerSlot = slot;
  if (ARMORY_GLOBAL_EXCLUSIVE.has(slot)) {
    d.occupied[slot] = player.id;
  }
}

export function benchCardById(team, cardId) {
  const i = team.reserve.findIndex((c) => c.id === cardId);
  if (i < 0) return false;
  const c = team.reserve.splice(i, 1)[0];
  if (!team.cooldownIds) team.cooldownIds = new Set();
  team.cooldownIds.add(c.id);
  return true;
}

export function benchReserveSmart(team, n) {
  const sorted = [...team.reserve].sort((a, b) => a.tr - b.tr || a.mr - b.mr);
  for (let i = 0; i < n && sorted.length; i++) {
    benchCardById(team, sorted.shift().id);
  }
}

export function applyFourSlotPurchase(game, teamId, slot, choice, rng) {
  const team = game.teams[teamId];
  const d = game.armoryDraft;
  let cost = null;
  if (slot === "green" && choice?.heal) cost = repairCost(choice.heal);
  else if (slot === "red" && choice?.cull) cost = redCullCost(choice.cull.value, choice.cull.mode);
  else if (slot === "yellow" && choice?.tier) cost = yellowAttackTierCost(choice.tier, game.round);
  else if (slot === "blue" && choice?.tier) cost = blueDefenseTierCost(choice.tier, game.round);
  if (!cost || !canAfford(team, cost)) return false;
  if (slot === "red" && d.teamBenchBuys[teamId] >= BENCH_MAX_PER_ARMORY) return false;

  if (!payStash(team, cost)) return false;

  if (slot === "green" && choice?.heal) {
    team.castleHp = Math.min(team.castleMax, team.castleHp + choice.heal);
  } else if (slot === "red" && choice?.cull) {
    const cooled = applyRedCullToCooldown(team, choice.cull);
    if (cooled <= 0) return false;
    d.teamBenchBuys[teamId] += 1;
  } else {
    const buff = fourSlotBuffKey(slot, choice);
    if (buff) team.pendingBuffs.add(buff);
  }
  return true;
}

function tryPermanentDuringDraft(game, teamId, rng) {
  const team = game.teams[teamId];
  if (team.permanent || game.round < PERMANENT_UNLOCK_ROUND) return false;
  const opts = Object.keys(PERMANENT_COSTS).filter((k) => canAfford(team, PERMANENT_COSTS[k]));
  if (!opts.length) return false;
  const style = game.armoryStyles[teamId];
  const threshold = style === "saver" ? 22 : 18;
  const resSum = Object.values(resourceTotals(team)).reduce((a, b) => a + b, 0);
  if (resSum < threshold) return false;
  if (style === "saver" && rng() > 0.55) return false;
  if (style !== "saver" && rng() > 0.35) return false;
  const choice = pickPermanentChoice(team, opts, rng);
  if (!payStash(team, PERMANENT_COSTS[choice])) return false;
  team.permanent = choice;
  team.permanentColor = pickPermanentColor(team);
  if (choice === "purge") {
    team.purgedColors.add(team.permanentColor);
    for (const c of team.deck) {
      if (c.color === team.permanentColor) team.removedIds.add(c.id);
    }
  }
  game.log.push(
    `${teamId === 0 ? "Your team" : "Enemies"} bought Permanent: ${choice} (${team.permanentColor}).`,
  );
  return true;
}

function formatPickLabel(slot, choice) {
  if (!choice) return "";
  if (slot === "green" && choice.heal) return `+${choice.heal} HP`;
  if (slot === "red" && choice.cull) {
    if (choice.cull.mode === "both") return "cool ranks 1-2 (M/T)";
    return `cool rank ${choice.cull.value} (M/T)`;
  }
  if (slot === "yellow" && choice.tier) return choice.tier === "high" ? "Siege Breaker" : "War Drums";
  if (slot === "blue" && choice.tier) return choice.tier === "high" ? "Iron Curtain" : "Boiling Oil";
  return "";
}

function aiPickWorker(game, pid) {
  const player = game.players[pid];
  const team = game.teams[player.teamId];
  const rng = game.rng;
  const d = game.armoryDraft;

  if (tryPermanentDuringDraft(game, player.teamId, rng)) {
    clearWorkerFromBoard(game, player);
    return;
  }

  const legal = [];
  for (const slot of ARMORY_SLOTS) {
    if (player.lastWorkerSlot === slot) continue;
    if (isSlotOccupiedForPlayer(game, slot, player)) continue;
    for (const choice of legalFourSlotChoices(game, team, slot)) {
      legal.push({ slot, choice });
    }
  }

  let best = null;
  let bestScore = -1e9;
  for (const entry of legal) {
    const sc = scoreArmoryWorkerPick(game, team, player.teamId, entry.slot, entry.choice);
    if (sc > bestScore) {
      bestScore = sc;
      best = entry;
    }
  }

  if (!best || bestScore < 8) {
    clearWorkerFromBoard(game, player);
    return;
  }

  const old = player.workerSlot;
  placeWorker(game, player, best.slot);
  const ok = applyFourSlotPurchase(game, player.teamId, best.slot, best.choice, rng);
  if (!ok) {
    player.workerSlot = old;
    if (old && ARMORY_GLOBAL_EXCLUSIVE.has(old)) d.occupied[old] = pid;
    clearWorkerFromBoard(game, player);
    return;
  }
  const label = formatPickLabel(best.slot, best.choice);
  game.log.push(`${player.name} → ${best.slot}${label ? ` (${label})` : ""}.`);
}

export function advanceArmoryDraft(game, singleStep = false) {
  const d = game.armoryDraft;
  if (!d) return;

  while (d.pickIndex < d.pickOrder.length) {
    const pid = d.pickOrder[d.pickIndex];
    const player = game.players[pid];
    if (player.human) return;
    aiPickWorker(game, pid);
    d.pickIndex += 1;
    if (singleStep) return;
  }

  if (d.pickIndex >= d.pickOrder.length) {
    game.log.push("Armory draft complete.");
    game.armoryDraft = null;
    game.subphase = null;
    game.armoryOnComplete?.(game);
  }
}

export function armoryDraftPass(game) {
  const pid = armoryDraftPlayerId(game);
  if (pid == null) return false;
  const player = game.players[pid];
  if (!player.human) return false;
  clearWorkerFromBoard(game, player);
  game.log.push(`${player.name} passes.`);
  game.armoryDraft.pickIndex += 1;
  advanceArmoryDraft(game, true);
  return true;
}

export function pickArmoryWorker(game, slot, choice) {
  const pid = armoryDraftPlayerId(game);
  if (pid == null) return { ok: false, msg: "Not your draft turn." };
  const player = game.players[pid];
  if (!player.human) return { ok: false, msg: "Not your turn." };
  if (player.lastWorkerSlot === slot) {
    return { ok: false, msg: "Cannot return to the same station you just left." };
  }
  if (isSlotOccupiedForPlayer(game, slot, player)) {
    return { ok: false, msg: "That station is occupied." };
  }

  const team = game.teams[player.teamId];
  const legal = legalFourSlotChoices(game, team, slot);
  const match = legal.find((c) => JSON.stringify(c) === JSON.stringify(choice));
  if (!match) return { ok: false, msg: "Illegal purchase." };

  const old = player.workerSlot;
  placeWorker(game, player, slot);
  const ok = applyFourSlotPurchase(game, player.teamId, slot, choice, game.rng);
  if (!ok) {
    player.workerSlot = old;
    return { ok: false, msg: "Cannot afford or illegal." };
  }
  const label = formatPickLabel(slot, choice);
  game.log.push(`You → ${slot}${label ? ` (${label})` : ""}.`);
  recordHumanArmoryBuy(game, `slot_${slot}`, { choice });
  game.armoryDraft.pickIndex += 1;
  advanceArmoryDraft(game, true);
  return { ok: true };
}
