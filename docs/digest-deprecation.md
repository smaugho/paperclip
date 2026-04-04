# Digest Feature Deprecation — 2026-04-04

Board directive from PR #63 comments (smaugho, 2026-04-04): digest feature deprecated.

## Changes Applied to Agent Instruction Files

### Director (49893ba7)
- **AGENTS.md**: Removed "Board Reporting Obligations" section (Board Digest charter + rules). Replaced with simple status reporting obligations.
- **WORKFLOWS.md**: Removed Workflow 6 (Board Digest, ~354 lines). Removed Board Digest from periodic workflow table and scheduling rules. Renumbered workflows 7-14 → 6-13.
- **SOUL.md**: Removed "hourly board digests" cadence rule, removed "digest documents" from voice guidelines.
- **TOOLS.md**: Removed `digest-reconcile.mjs` from validation scripts. Updated PR tracking rule.

### Technical Lead (b29ce3eb)
- **AGENTS.md**: Renamed "Technical digest" → "Technical status report".
- **WORKFLOWS.md**: Renamed/updated Technical Status Digest workflow → Technical Status Report (9 occurrences).
- **SOUL.md**: Updated "digest format" → "status report format", "status digest" → "status report".

### PSE (f2e9fa2f)
- **SOUL.md**: Updated "periodic digest" → "periodic update" in Report Contract guidance.

### DSO (ce6f0942)
- **All files**: No references found — already clean.

## Git Artifacts Cleaned
- Local branch `agent/prompt-systems-engineer` deleted. It contained an unmerged commit (3d6fa0dd) adding `scripts/digest-validate.mjs`. This script was never pushed to origin or merged.
