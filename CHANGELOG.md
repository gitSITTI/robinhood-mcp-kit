# Changelog

All notable changes to this repo. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This repo is not versioned for
release; entries are grouped by date.

## [Unreleased]

### Added — repo workflow & scaffolding QA (2026-06-05)
Brought the repo up to a standard scaffolding/CI baseline. All additive; no
existing Worker, script, config, or doc content was changed.

- **CI:** `.github/workflows/ci.yml` — Worker type-check (`npm run check`,
  blocking), tracked-JSON validation (blocking), PSScriptAnalyzer (advisory).
  Previously the Worker's `tsc` check ran nowhere.
- **Dependabot:** `.github/dependabot.yml` — weekly bumps for `chatgpt-app` npm
  deps (incl. the security-sensitive `@noble/curves`) + GitHub Actions.
- **Governance:** `LICENSE` (proprietary, all rights reserved), `SECURITY.md`,
  `CONTRIBUTING.md`, `.github/CODEOWNERS`, PR template, issue templates.
- **Agent context:** `CLAUDE.md` (canonical architecture/convention guide) and
  `AGENTS.md` (cross-tool pointer) so any LLM can continue the work.
- **Web sessions:** `.claude/settings.json` + `.claude/session-start.sh`
  SessionStart hook runs `npm ci` in `chatgpt-app/` on Claude Code (web) start.
- **Editor/commit hygiene:** `.editorconfig`, `.pre-commit-config.yaml`.
