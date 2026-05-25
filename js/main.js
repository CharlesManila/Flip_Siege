import {
  advanceAI,
  buyArmoryItem,
  chooseTrophy,
  completeScrapPurchase,
  confirmArmoryDone,
  advanceCalamityStep,
  humanMustPlay,
  needsHumanTrophyPick,
  newGame,
  playHumanCard,
  skipArmory,
  validateScrapPurchase,
} from "./game.js";
import { bindHandClicks, renderBoard } from "./ui.js";

let game = null;
let tickTimer = null;

function closeDialogs() {
  document.getElementById("trophy-dialog")?.close();
  document.getElementById("scrap-dialog")?.close();
  document.getElementById("rules-dialog")?.close();
}

function startGame() {
  try {
    clearTimeout(tickTimer);
    closeDialogs();
    const follow = document.querySelector('input[name="follow"]:checked')?.value || "must";
    game = newGame({ followMode: follow, seed: Date.now(), cooldownMechanic: true });
    document.getElementById("screen-setup")?.classList.add("hidden");
    document.getElementById("screen-game")?.classList.remove("hidden");
    document.body.classList.remove("in-match", "your-turn");
    render();
    scheduleAI();
  } catch (err) {
    console.error(err);
    alert(`Could not start game: ${err.message}`);
  }
}

function scheduleAI() {
  clearTimeout(tickTimer);
  tickTimer = setTimeout(tick, 520);
}

function tick() {
  if (!game || game.phase === "gameover") return;
  if (game.phase === "calamity_reveal") {
    if (game.calamityReveal?.step === "defend" && !humanMustPlay(game)) {
      advanceAI(game);
    }
    render();
    if (game.phase === "calamity_reveal" && game.calamityReveal?.step === "defend" && !humanMustPlay(game)) {
      scheduleAI();
    }
    return;
  }
  if (game.phase === "playing" && !humanMustPlay(game)) {
    advanceAI(game);
  } else if (game.phase === "trophy_pick") {
    advanceAI(game);
  }
  render();
  if (game.phase === "trophy_pick") return;
  if (game.phase === "playing" && !humanMustPlay(game)) scheduleAI();
}

function render() {
  renderBoard(game, {
    onBuy: onBuy,
    onTrophy: onTrophy,
    onScrapConfirm: onScrapConfirm,
    onScrapCancel: onScrapCancel,
    onCalamityContinue: () => {
      if (!game) return;
      advanceCalamityStep(game);
      render();
      scheduleAI();
    },
  });
}

function onTrophy(cardId) {
  if (!chooseTrophy(game, cardId)) return;
  render();
  scheduleAI();
}

function afterHumanPlay() {
  render();
  if (game.phase === "trophy_pick") {
    if (needsHumanTrophyPick(game)) return;
    advanceAI(game);
    render();
  }
  if (game.phase !== "trophy_pick") scheduleAI();
}

function onBuy(key) {
  let permColor = document.querySelector("#perm-color")?.value || "green";
  if (key.startsWith("perm_") && !game.teams[0].permanent) {
    const perm = key.slice(5);
    if (perm === "purge") {
      permColor = prompt("Purge which color? (green/blue/red/yellow)", "green") || "green";
    }
    const r = buyArmoryItem(game, key, permColor);
    if (!r.ok) alert(r.msg);
    else render();
    return;
  }
  if (key.startsWith("scrap")) {
    const v = validateScrapPurchase(game, key);
    if (!v.ok) {
      alert(v.msg);
      return;
    }
    game.pendingScrap = { key, count: v.count, selected: new Set() };
    render();
    return;
  }
  const r = buyArmoryItem(game, key);
  if (!r.ok) alert(r.msg);
  else render();
}

function onScrapConfirm(key, cardIds) {
  const r = completeScrapPurchase(game, key, cardIds);
  if (!r.ok) {
    alert(r.msg);
    return false;
  }
  render();
  return true;
}

function onScrapCancel() {
  render();
}

function onPlayCard(cardId) {
  if (!humanMustPlay(game)) return;
  if (playHumanCard(game, cardId)) afterHumanPlay();
}

document.getElementById("btn-start")?.addEventListener("click", startGame);

document.getElementById("btn-play-again")?.addEventListener("click", startGame);

document.getElementById("btn-end-armory")?.addEventListener("click", () => {
  if (!game || game.phase !== "armory") return;
  skipArmory(game);
  confirmArmoryDone(game);
  render();
  scheduleAI();
});

document.getElementById("btn-new")?.addEventListener("click", () => {
  clearTimeout(tickTimer);
  closeDialogs();
  game = null;
  document.getElementById("screen-setup")?.classList.remove("hidden");
  document.getElementById("screen-game")?.classList.add("hidden");
  document.body.classList.remove("in-match", "your-turn");
});

bindHandClicks(onPlayCard);

document.getElementById("btn-rules")?.addEventListener("click", () => {
  document.getElementById("rules-dialog")?.showModal();
});
document.getElementById("btn-close-rules")?.addEventListener("click", () => {
  document.getElementById("rules-dialog")?.close();
});
