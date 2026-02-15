---
name: Feature request
about: Propose a feature with clear context, constraints, and acceptance criteria
title: "feat(<scope>): As a <role> I would like to "
labels: enhancement
---

Please structure feature requests with the same rigor as implementation tickets.

Keep the title in user-story format and provide concrete acceptance criteria.

## Context: Metadata
Include workflow metadata and constraints the implementation must follow.

**IMPORTANT**: _ALWAYS_ verify dev environment metadata first.

```yml
pull_request_title: "FROM feat/[issue#]-[shortdesc] TO development"
branch: "feat/[issue#]-[shortdesc]"
worktree_path: "$WORKSPACE/.worktrees/feat-[issue#]"
```

## User Stories
Define the feature as user stories. This section should drive implementation scope.

- As a user, I would like to ..., so that ...
- As an admin, I would like to ..., so that ...

## Documentation
Add links to references, standards, or examples that should guide implementation.

- https://...
- https://...

## Key Integration Points
Identify files, folders, modules, or interfaces that must be introduced or changed.

- Create/update `...`
- Integrate with `...`

## Development Setup
List command expectations and environment setup notes.

_READ_ the `package.json` scripts.
Commands:
- npm run lint
- npm test

## Design Principles
Capture the implementation principles that should drive decisions.

- Simplicity is beauty, complexity is pain.
- _ALWAYS_ minimize changes while maximizing maintainability.
- Prefer a TDD-oriented workflow where practical.

## Acceptance Criteria
Define measurable completion conditions.

- [ ] Implementation plan is documented.
- [ ] Existing and new tests pass.
- [ ] CLI behavior is validated manually.
- [ ] Documentation reflects latest changes.
