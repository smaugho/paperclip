# DSPA-1505: Stale In-Progress Detection — Instruction File Changes

## Summary

Added stale `in_progress` detection workflows to all 6 agent WORKFLOWS.md files.

**Staleness thresholds:**
- **24–48h:** Warn / ping assignee
- **>48h:** Escalate / correct status to `blocked` or `todo`

---

## Changes Applied

| Agent | Type | Change Summary |
|-------|------|----------------|
| PSE (f2e9fa2f) | IC | Added Registry entry #8, Step 4d reference in Standard Heartbeat, full Workflow: In-Progress Self-Check section |
| PE (915d5bae) | IC | Added Registry entry #4b, Step 6 reference in Get Assignments, full Workflow: In-Progress Self-Check section |
| PFE (6b733806) | IC | Added Registry entry #1b, Step 4c reference in Standard Heartbeat, full Workflow: In-Progress Self-Check section |
| DSO (ce6f0942) | IC | Added Registry entry #2b, prose reference in Section 2, full Workflow 2b: In-Progress Self-Check section |
| TL (b29ce3eb) | Manager | Updated Step 3 of Engineering Oversight (4c) with 24h/48h thresholds, added Workflow: Stale In-Progress Scan section |
| Director (49893ba7) | Manager | Added Step 5b to Organizational Health Check, added Workflow: Stale In-Progress Scan (Director) section |

---

## IC Workflow: In-Progress Self-Check

Each IC agent's workflow follows this pattern:

- **Trigger:** Every heartbeat, after inbox fetch, before checkout
- **Age < 24h:** No action
- **Age 24–48h:** Post brief progress update comment
- **Age > 48h:** Post comment + transition to `blocked` (if stuck) or `todo` (if deferred)
- **Standard Process Template:** Objective, Trigger, Preconditions, Inputs, Mermaid Diagram, Checklist, Validation, Blocked/Escalation, Exit Criteria

---

## Manager Workflow: Stale In-Progress Scan

Each manager agent's workflow follows this pattern:

- **Trigger:** Every heartbeat, inside Organizational Health Check / Engineering Oversight
- **Age < 24h:** No action
- **Age 24–48h:** Post check-in ping via wake-triggering agent mention
- **Age > 48h:** Post escalation comment; PATCH to `blocked` if genuinely stalled; escalate to Director/board if unresolvable
- **Standard Process Template:** Objective, Trigger, Preconditions, Inputs, Mermaid Diagram, Checklist, Validation, Blocked/Escalation, Exit Criteria

---

## Agent Instruction Files (direct edits, not git-tracked)

All instruction files live at:
```
~/.paperclip/instances/default/companies/345df744-cfc3-460b-8d58-752094a8aea3/agents/{agent-id}/instructions/WORKFLOWS.md
```

Changes applied directly to each file. Verified: no existing workflow content removed.
