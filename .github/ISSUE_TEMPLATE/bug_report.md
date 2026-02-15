---
name: Bug report
about: Report a bug using user stories to describe broken behavior and impact
title: "bug(<scope>): As a <role> when I <action>, <broken behavior> happens"
labels: bug
---

Please describe bugs with user stories first, then provide reproduction details.

This keeps impact, expected behavior, and implementation scope clear.

## Context: Metadata
Include workflow metadata and constraints for a clean implementation flow.

**IMPORTANT**: _ALWAYS_ verify dev environment metadata first.

```yml
pull_request_title: "FROM bug/[issue#]-[shortdesc] TO development"
branch: "bug/[issue#]-[shortdesc]"
worktree_path: "$WORKSPACE/.worktrees/bug-[issue#]"
```

## Broken User Stories
Define how the system is broken using user stories.

- As a user, when I ..., ... happens instead of ...
- As an admin, when I ..., ... fails and I cannot ...

## Expected Behavior
Describe the correct behavior for each broken story.

- When ..., the CLI should ...
- The system should not ...

## Reproduction Steps
Provide deterministic steps to reproduce the bug.

1. Run `...`
2. Execute `...`
3. Observe `...`

## Impact
Explain severity, who is affected, and current workaround (if any).

- Severity: High/Medium/Low
- Affected users: ...
- Workaround: ...

## CLI Version
Which CLI version are you running?

e.g. 0.1.7

## Acceptance Criteria
Define measurable conditions that confirm the bug is fixed.

- [ ] Root cause is identified and documented.
- [ ] Existing and new tests pass.
- [ ] Bug scenario is validated manually in CLI.
- [ ] Related documentation is updated.
