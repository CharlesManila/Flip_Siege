import {
  advanceArmoryDraft,
  armoryDraftPass,
  humanArmoryDraftTurn,
  pickArmoryWorker,
} from "./armoryDraft.js";
import {
  advanceAI,
  chooseTrophy,
  completeBenchPurchase,
  advanceCalamityStep,
  humanMustPlay,
  needsHumanTrophyPick,
  newGame,
  playHumanCard,
} from "./game.js";
import {
  isPlayLogAvailable,
  playLogOptInDefault,
  savePlayLogOptIn,
} from "./playLog.js";
import { bindHandClicks, renderBoard } from "./ui.js";

let game = null;
let tickTimer = null;

function closeDialogs() {
  document.getElementById("trophy-dialog")?.close();
  document.getElementById("scrap-dialog")?.close();
  document.getElementById("rules-dialog")?.close();
}

function initPlayLogCheckbox() {
  const wrap = document.getElementById("play-log-opt-wrap");
  const cb = document.getElementById("opt-play-log");
  if (!wrap || !cb) return;
  if (isPlayLogAvailable()) {
    wrap.classList.remove("hidden");
    cb.checked = playLogOptInDefault();
  }
}

function startGame() {
  try {
    clearTimeout(tickTimer);
    closeDialogs();
    const follow = document.querySelector('input[name="follow"]:checked')?.value || "must";
    const optIn = document.getElementById("opt-play-log")?.checked ?? playLogOptInDefault();
    savePlayLogOptIn(optIn);
    game = newGame({
      followMode: follow,
      seed: Date.now(),
      cooldownMechanic: true,
      playLogOptIn: optIn && isPlayLogAvailable(),
    });
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
  if (game.phase === "armory" && game.subphase === "armory_draft" && !humanArmoryDraftTurn(game)) {
    advanceArmoryDraft(game, true);
    render();
    if (game.phase === "armory" && game.subphase === "armory_draft" && !humanArmoryDraftTurn(game)) {
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
  if (game.phase === "armory" && game.subphase === "armory_draft") return;
  if (game.phase === "playing" && !humanMustPlay(game)) scheduleAI();
}

function render() {
  renderBoard(game, {
    onArmoryPass: () => {
      armoryDraftPass(game);
      render();
      scheduleAI();
    },
    onArmoryWorker: (slot, choice) => {
      const r = pickArmoryWorker(game, slot, choice);
      if (r?.ok) {
        // Advance AI picks immediately and re-render, so the draft doesn't feel "stuck".
        if (game.phase === "armory" && game.subphase === "armory_draft") {
          advanceArmoryDraft(game, true);
        }
        render();
        scheduleAI();
      }
      return r;
    },
    onTrophy: onTrophy,
    onBenchConfirm: onBenchConfirm,
    onBenchCancel: onBenchCancel,
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

function onBenchConfirm(key, cardIds) {
  const teamId = game.pendingBench?.teamId ?? 0;
  const r = completeBenchPurchase(game, key, cardIds, teamId);
  if (!r.ok) {
    alert(r.msg);
    return false;
  }
  render();
  scheduleAI();
  return true;
}

function onBenchCancel() {
  game.pendingBench = null;
  render();
}

function onPlayCard(cardId) {
  if (!humanMustPlay(game)) return;
  if (playHumanCard(game, cardId)) afterHumanPlay();
}

initPlayLogCheckbox();
document.getElementById("btn-start")?.addEventListener("click", startGame);

document.getElementById("btn-play-again")?.addEventListener("click", startGame);


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
