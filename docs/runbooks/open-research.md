# Runbook — Open Research (robinhood-mcp-kit)

## When

- You need a thorough, cited answer to a research question.
- You want the answer captured into your second brain (Obsidian vault + OB1) automatically.

## Run

From inside this repo's Claude Code session:

```
/open-research <question>
```

The slash command runs both `/deep-research` and `/research-deep`, merges the outputs, and writes one note.

Or directly:

```bash
cd /home/user/twohittz-source-hub
python -m open_research "<question>" \
  --repo robinhood-mcp-kit \
  --deep /tmp/deep-report.md \
  --karpathy /tmp/karpathy-note.md \
  --classification public
```

## Verify

```bash
ls /home/user/robinhood-mcp-kit/docs/research/
# Expect: <YYYY-MM-DD>-<slug>.md with frontmatter, two H2 sections.
```

## Classification

- **public** (default) — public sources, no account data. Goes to OB1 / Supabase.
- **private** — anything that touches account info, trading strategy specifics, or secrets. Goes to SosaClaw open_brain (LAN-only).
