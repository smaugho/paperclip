# Contributing Guide

Thanks for wanting to contribute!

We really appreciate both small fixes and thoughtful larger changes.

## Two Paths to Get Your Pull Request Accepted

### Path 1: Small, Focused Changes (Fastest way to get merged)

- Pick **one** clear thing to fix/improve
- Touch the **smallest possible number of files**
- Make sure the change is very targeted and easy to review
- All automated checks pass (including Greptile comments)
- No new lint/test failures

These almost always get merged quickly when they're clean.

### Path 2: Bigger or Impactful Changes

- **First** talk about it in Discord → #dev channel  
  → Describe what you're trying to solve  
  → Share rough ideas / approach
- Once there's rough agreement, build it
- In your PR include:
  - Before / After screenshots (or short video if UI/behavior change)
  - Clear description of what & why
  - Proof it works (manual testing notes)
  - All tests passing
  - All Greptile + other PR comments addressed

PRs that follow this path are **much** more likely to be accepted, even when they're large.

## General Rules (both paths)

- Write clear commit messages
- Keep PR title + description meaningful
- One PR = one logical change (unless it's a small related group)
- Run tests locally first
- Be kind in discussions 😄

## Writing a Good PR message

Please include a "thinking path" at the top of your PR message that explains from the top of the project down to what you fixed. E.g.:

### Thinking Path Example 1:

> - Paperclip orchestrates ai-agents for zero-human companies
> - There are many types of adapters for each LLM model provider
> - But LLM's have a context limit and not all agents can automatically compact their context
> - So we need to have an adapter-specific configuration for which adapters can and cannot automatically compact their context
> - This pull request adds per-adapter configuration of compaction, either auto or paperclip managed
> - That way we can get optimal performance from any adapter/provider in Paperclip

### Thinking Path Example 2:

> - Paperclip orchestrates ai-agents for zero-human companies
> - But humans want to watch the agents and oversee their work
> - Human users also operate in teams and so they need their own logins, profiles, views etc.
> - So we have a multi-user system for humans
> - But humans want to be able to update their own profile picture and avatar
> - But the avatar upload form wasn't saving the avatar to the file storage system
> - So this PR fixes the avatar upload form to use the file storage service
> - The benefit is we don't have a one-off file storage for just one aspect of the system, which would cause confusion and extra configuration

Then have the rest of your normal PR message after the Thinking Path.

This should include details about what you did, why you did it, why it matters & the benefits, how we can verify it works, and any risks.

Please include screenshots if possible if you have a visible change. (use something like the [agent-browser skill](https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md) or similar to take screenshots). Ideally, you include before and after screenshots.

## Upstream PR Readiness

Fork PRs (on your fork) may reference internal context to help your team review.
However, when a PR is promoted to the upstream `paperclipai/paperclip` repo, the
description **must be self-contained**. Upstream reviewers have no access to your
internal tracker, so references to it are noise at best and confusing at worst.

**Rule:** Upstream PR descriptions must not contain:

- Internal issue IDs (e.g. `DSPA-123`, `ACME-456`, or any `PREFIX-NUMBER` tracker references)
- Private instance URLs (e.g. `https://your-instance.paperclip.ing/...`)
- Local-only configuration context (e.g. references to local branches, local agent names, or internal process details)

Instead, describe the motivation in plain prose that any open-source contributor
can understand.

### Before / After Example

**Before (fork PR — contains internal context):**

> ## Why
>
> Phase 1 / Packet 1 of the digest generator architecture
> ([DSPA-811](/DSPA/issues/DSPA-811)). The downstream digest skill needs this
> route to enumerate board activity before generating a digest.

**After (upstream PR — self-contained):**

> ## Why
>
> The digest generator needs a data source for board-authored content.
> No route currently exposes board-authored issues and comments within a
> time window. This is the first step toward automated digest generation.

The thinking path, what-changed, verification, and risks sections stay the same —
only strip tracker IDs, private URLs, and instance-specific references from the
prose.

Questions? Just ask in #dev — we're happy to help.

Happy hacking!
