<!--
Fill this in so a reviewer (or an AI agent picking up the work later) understands
the change without reading every line of the diff.
-->

## What & why

<!-- One or two sentences. What does this change do and why? -->

## Type of change

- [ ] Cloudflare Worker (`chatgpt-app/`)
- [ ] PowerShell scripts (`scripts/`)
- [ ] Client configs (`configs/`)
- [ ] Skills / evals (`skills/`)
- [ ] Docs (`docs/`)
- [ ] CI / scaffolding / tooling
- [ ] Other

## Safety checklist

- [ ] No secrets added; `.env*` still ignored (`SECURITY.md`)
- [ ] `cd chatgpt-app && npm run check` passes (if Worker touched)
- [ ] Tracked JSON still valid
- [ ] Trade-safety flow (prepare/review before place) preserved
- [ ] `CHANGELOG.md` updated (or N/A)

## Notes for the next maintainer

<!-- Anything non-obvious: assumptions, follow-ups, things deliberately left out. -->
