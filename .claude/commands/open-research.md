---
description: Run open-research on a question — combines /deep-research with the Karpathy Obsidian method, writes the merged note to docs/research/, and captures it to OB1.
argument-hint: <research question>
---

# `/open-research` — robinhood-mcp-kit

Combines two research engines and ships the merged output into your knowledge base.

## Pipeline

1. **Karpathy lab note** — run `/research-deep "$ARGUMENTS"` (from `obsidian-second-brain`). Output goes to your Obsidian vault.
2. **Deep-research report** — run `/deep-research $ARGUMENTS`. Output is a cited markdown report.
3. **Merge + capture** — call the bridge:
   ```bash
   python /home/user/twohittz-source-hub/tools/open-research \
     "$ARGUMENTS" \
     --repo robinhood-mcp-kit \
     --deep /tmp/deep-report.md \
     --karpathy /tmp/karpathy-note.md \
     --classification public
   ```
4. Final note lands at `<repo>/docs/research/<YYYY-MM-DD>-<slug>.md` with Obsidian frontmatter and is pushed to OB1 (public) or SosaClaw open_brain (private).

## Classification

Default `public`. Add `--classification private` for anything that contains account numbers, exchange IDs, or strategy-internal data. Scrubber will block public writes that contain secret-shaped values.

## See also

- Runbook: `docs/runbooks/open-research.md`
- Bridge: `twohittz-source-hub/tools/ob1-bridge/`
