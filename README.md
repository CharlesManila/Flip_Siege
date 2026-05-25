# Flip-Siege — Browser Playtest

2v2 vs AI: **you + ally** vs **two enemies**. Official rules: Stash, **card cooldown**, Armory tiers, ~50/50 round 4 vs 5+.

## Run locally

ES modules need a local server (not `file://`):

```bash
cd themes/flip-siege/play
python -m http.server 8080
```

Open http://localhost:8080

**Rules:** [Full rulebook](rules/rulebook.html) · in-game **Quick rules** button.

Before deploy or after editing rules: `.\scripts\sync-rulebook.ps1` (or `npm run sync:rules`).

## Play online (free hosting)

See **[DEPLOY.md](DEPLOY.md)** — GitHub Pages, Netlify, or Cloudflare. Push this folder to GitHub and enable Pages for a permanent HTTPS link.

## Controls

- **Start:** must-follow (**60 HP**) or may-follow (**68 HP**). Alternating siege; calamity rounds 2 & 4. Cooldown on (max 10 resting per team).
- **Tricks:** click a highlighted card when it is your turn (lead or follow).
- **Armory:** buy up to 2 items, then **Done shopping**.

## Card cooldown

Every card **played to a trick** sits out the **next deal only** (max **10** per team), then returns. Castle panels show **resting** / **played this round**.

## Implemented

- Deals 7→11, tricks = deal−1, alternating siege, calamity last trick (rounds 2 & 4)
- Card cooldown (official), must / may follow, combat tier spike r5+
- Stash, trophies, Recycle payments, Permanents (r4+), finishers (r5+)
- Competitive AI (combat / economist enemies, balanced ally)

## Simplified vs tabletop

- Deck-exhaustion win optional rule **off**
- Blue tax on round buys **on** (skip blue next deal)
- Sally Gate: AI picks best color; you get the buff if bought
