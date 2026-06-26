# Runbook — Graphify (robinhood-mcp-kit)

## When

- Whenever the repo's structure changes significantly (new service, new top-level dir, new skill).
- Nightly via `.github/workflows/graphify.yml`.
- On-demand: `/graphify` from inside this repo's Claude Code session.

## Run

```bash
cd /home/user/robinhood-mcp-kit
graphify scan .
```

## Verify

```bash
test -f docs/graph/repo-graph.json
test -f docs/agent-index.md
jq '.nodes | length' docs/graph/repo-graph.json   # expect > 0
```

If OB1 is up, a capture event should appear in OB1's `captures` table with `kind="graph"` and `metadata.source_repo="robinhood-mcp-kit"`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `graphify: command not found` | Re-run `graphify claude install` after installing the skill. |
| OB1 capture missing | `curl http://127.0.0.1:8090/health` — if down, the bridge queues to `tools/ob1-bridge/.queue/`; run `python -m ob1_bridge.queue` to replay. |
| Graph excludes a file you expected | Check `.graphify-ignore`. |
