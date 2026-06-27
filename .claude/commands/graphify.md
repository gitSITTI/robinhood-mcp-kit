---
description: Build (or refresh) the knowledge graph for robinhood-mcp-kit and push the result into OB1 + SosaClaw open_brain.
---

# `/graphify` — robinhood-mcp-kit

Runs the real Graphify skill on this repo (tree-sitter AST + NetworkX + Leiden) and writes outputs into `docs/graph/`.

## What it does

1. Invokes the globally installed `graphify` skill (from `safishamsi/graphify`):
   ```bash
   graphify scan .
   ```
   Produces under `docs/graph/`:
   - `repo-graph.json` (canonical, deterministic ordering)
   - `repo-graph.html` (vis.js viewer)
   - `repo-graph.mmd` (Mermaid)

2. Regenerates `docs/agent-index.md` from the graph (skills, services, ports, commands).

3. Pushes a public-safe summary to OB1 via `ob1-bridge`:
   ```bash
   python /home/user/twohittz-source-hub/tools/scaffold/post_graph_capture.py --repo robinhood-mcp-kit
   ```

## Honors `.graphify-ignore`

Patterns in `.graphify-ignore` at the repo root are excluded from the scan. Matches the existing `gitignore` syntax.

## See also

- Runbook: `docs/runbooks/graphify.md`
- Master cross-repo graph: `twohittz-source-hub/docs/master-graph/`
