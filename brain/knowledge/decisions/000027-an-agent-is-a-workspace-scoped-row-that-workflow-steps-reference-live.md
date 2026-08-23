---
title: An agent is a project-scoped row that workflow steps reference live
icon: 🎯
status: proposed
---

## Decision

An `agent` row holds instructions, tools, model, max steps and structured output. A Run Agent step
stores only `agentId` and the server resolves the config at run start, so editing an agent changes the
next run of every workflow linking it with no republish. **Detach & customise** copies the config inline
and clears `agentId` for steps that must differ.

## Context

Agreed 2026-08-12. The runtime already reads tools off the job payload rather than the workflow version,
and `workflow_version.agentIds` + `extractAgentIds` survive from the deleted 2025 agents module — so a
live reference costs no worker change and "which workflows use this agent" comes free. Project scope
follows the tools: workflow tools resolve by `projectId` and connections match on
`ArrayContains([projectId])`, so a platform-scoped agent would rebuild project scoping inside the row.

## Why

The point of naming an agent is to improve it once. A snapshot lets every workflow drift independently and
turns "make the agent better" back into per-workflow editing — the pain the feature exists to remove. The
rejected alternative was exactly that: dropdown prefills the step, link then gone.

## Consequences

- **It widens unattended authorisation.** Decision 000024 held that configuring a tool on an agent step
  authorises it to run unattended; that authorisation now lives on the agent. We treat editing an agent
  as editing a workflow someone else published — `WRITE_AGENT` gates it, the edit is audit-logged, and the
  editor shows "Used in N workflows" before saving. If too weak in practice, the next move is a per-agent
  "allow unattended writes" flag, not re-litigating the reference.
- **Moving a workflow between projects breaks the link** — the id is project-local, and git sync carries
  connections but not agents. Hence `externalId` on the row from day one; project state must upsert
  agents by `(projectId, externalId)`, and until it does the import must fail loudly.
- Two orphaned tables (`agent`, `agent_run`) from the 2025 module are dropped so the entity can take
  the obvious name. `breaking = true` for rollback safety, no `⛓️‍💥 breaking-change` label.
- **Autonomy stays a workflow** — "Run on a schedule" scaffolds a real workflow with a linked step, so there is
  one execution model and one observability path.
- **Chatting with an agent is a third `AgentRunSource`**, not a nullable-`agentId` check: every gate
  already branches on `source`, and it keeps agent conversations out of the Chat list for free. Unlike
  a workflow step it is **attended** — taint starts `false` and approval must not auto-decline.
