---
status: accepted
---

# Freeze connector versions in the Workflow Bundle manifest

## Decision
The Workflow Bundle's `connectors.json` manifest freezes resolved connector versions at bundle-build time, rather than re-resolving `^`-range specs on every run.

## Context
A locked workflow version is meant to be an immutable snapshot — the bundle already freezes the workflow definition and compiled code, so letting connector ranges silently float to newer patches under a "locked" version is the more surprising behavior.

## Why
Freezing makes a locked version byte-reproducible forever and drops the per-connector `getConnector` round-trips at run time. It needs no new freeze logic: connector versions are already pinned to exact values (`workflowConnectorUtil.getExactVersion`) before a version locks — on every edit and every import (import decomposes into edit sub-operations). A dedicated lock-time util was prototyped and found redundant against this path.

## Consequences
Locked workflows stop auto-picking-up newer connector patches from `^`-ranges; to get a newer version, re-lock (a new workflow version builds a fresh bundle). Hard to reverse — bundles are immutable, content-addressed by `workflowVersionId`. Draft versions are unaffected (they always resolve connectors live).
