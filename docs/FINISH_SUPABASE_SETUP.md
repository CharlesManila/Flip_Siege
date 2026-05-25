# Finish Supabase logging (2 minutes)

The database table **`finished_games`** is already created on your project.

## Turn on logging on the live game (one paste)

1. Open Supabase → **Project Settings** → **API**
2. Copy **anon public** (long key starting with `eyJ`)
3. Open: https://github.com/CharlesManila/Flip_Siege/actions/workflows/pages.yml
4. Click **Run workflow** → paste the anon key → **Run workflow**
5. Wait ~1 minute for the green checkmark
6. Hard-refresh https://charlesmanila.github.io/Flip_Siege/ — you should see the stats checkbox

## Or from PowerShell (paste key when prompted)

```powershell
gh workflow run "Deploy Flip-Siege Play" --repo CharlesManila/Flip_Siege -f supabase_anon_key="PASTE_ANON_KEY_HERE"
```

## Verify

Play a full game to the end, then Supabase → **Table Editor** → `finished_games`.
