/** Flip-Siege deck — 40 unique faces per team (from card_list.csv, red backs). */
export const COLORS = ["green", "blue", "red", "yellow"];

export const COLOR_META = {
  green: { monster: "Goblin", tower: "Bow", emoji: "👺", towerEmoji: "🏹" },
  blue: { monster: "Orc", tower: "Cavalry", emoji: "👹", towerEmoji: "🐴" },
  red: { monster: "Imp", tower: "Cannon", emoji: "😈", towerEmoji: "💣" },
  yellow: { monster: "Slime", tower: "Wall", emoji: "🫠", towerEmoji: "🧱" },
};

/** @typedef {{ id: string, color: string, mr: number, tr: number }} Card */

/** @returns {Card[]} */
export function buildDeck() {
  const ranks = [
    [1, 2], [2, 4], [3, 4], [4, 7], [5, 7], [6, 7], [7, 1], [8, 10], [9, 2], [10, 1],
  ];
  const prefixes = { green: "GR", blue: "BL", red: "RD", yellow: "YL" };
  /** @type {Card[]} */
  const deck = [];
  for (const color of COLORS) {
    ranks.forEach(([mr, tr], i) => {
      deck.push({
        id: `${prefixes[color]}-${String(i + 1).padStart(2, "0")}`,
        color,
        mr,
        tr,
      });
    });
  }
  return deck;
}

export function cloneCard(c) {
  return { ...c };
}

export function cardLabel(c, siege) {
  const m = COLOR_META[c.color];
  if (siege) return `${m.monster} ${c.mr}`;
  return `${m.tower} ${c.tr}`;
}
