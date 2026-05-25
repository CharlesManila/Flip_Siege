# Copy canonical rulebook into play/rules/ (required before deploy).
$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$src = Join-Path $root "rules\rulebook.html"
$dst = Join-Path $PSScriptRoot "..\rules\rulebook.html"
if (-not (Test-Path $src)) {
  Write-Error "Canonical rulebook not found: $src"
}
Copy-Item -Force $src $dst
Write-Host "Synced rulebook -> play/rules/rulebook.html"
