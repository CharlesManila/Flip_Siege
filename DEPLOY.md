# Host Flip-Siege Play (free, play anywhere)

Static files only — no server code. Works on phones and laptops.

**Before every deploy:** sync the rulebook so the in-game link matches the official rules:

```powershell
cd themes/flip-siege/play
.\scripts\sync-rulebook.ps1
```

Canonical rules: `themes/flip-siege/rules/rulebook.html`  
Hosted copy: `play/rules/rulebook.html`

---

## Option A — GitHub Pages (recommended)

### 1. Create a GitHub repo for the play client

Use a **new empty repo** on GitHub (e.g. `flip-siege-play`).  
Upload **only the contents of** `themes/flip-siege/play/` as the repo root (not the whole `BG` folder).

### 2. Push from your PC

```powershell
cd C:\Users\USER\Downloads\BG\themes\flip-siege\play
.\scripts\sync-rulebook.ps1
git init
git add .
git commit -m "Flip-Siege play client + rulebook"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/flip-siege-play.git
git push -u origin main
```

### 3. Turn on Pages

1. GitHub repo → **Settings** → **Pages**
2. **Build and deployment** → Source: **GitHub Actions**
3. Wait for the **Deploy Flip-Siege Play** workflow to finish (Actions tab).

Your game will be at:

`https://YOUR_USERNAME.github.io/flip-siege-play/`

Share that URL. Open **Full rulebook** in-game to confirm `.../rules/rulebook.html` loads.

### 4. Updates

After changing rules or code:

```powershell
.\scripts\sync-rulebook.ps1
git add -A
git commit -m "Update rules and game"
git push
```

Pages redeploys in ~1–2 minutes.

---

## Option B — Netlify Drop (no Git)

1. Run `.\scripts\sync-rulebook.ps1`
2. Zip the **contents** of `play/` (index.html at zip root)
3. [https://app.netlify.com/drop](https://app.netlify.com/drop) → drag the zip
4. Netlify gives a random URL like `https://something.netlify.app`

---

## Option C — Cloudflare Pages

1. Connect the same GitHub repo as Option A
2. Build command: *(leave empty)*
3. Output directory: `/`
4. Add build command optional: `bash scripts/sync-rulebook.sh`

---

## Monorepo (whole `BG` folder on GitHub)

If the repo root is `BG/`, use the workflow at `.github/workflows/deploy-flip-siege-play.yml` in the repo root (see parent folder). It publishes `themes/flip-siege/play/` and syncs the rulebook automatically.

---

## Checklist

- [ ] `play/rules/rulebook.html` exists and matches `rules/rulebook.html`
- [ ] In-game links use `rules/rulebook.html` (not `../rules/...`)
- [ ] Quick rules mention calamity + player defense
- [ ] You open the hosted URL on a phone once to verify modules load (HTTPS)

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Rulebook 404 | Run `sync-rulebook.ps1` and redeploy |
| Blank game / module error | Must use HTTPS hosting, not `file://` |
| Old rules on site | Hard-refresh (Ctrl+F5) after deploy |
