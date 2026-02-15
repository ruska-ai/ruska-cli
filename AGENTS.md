# ruska-ai/ruska-cli AGENTS.md

## Metadata

```yml
github_repo_url: 'https://github.com/ruska-ai/ruska-cli'
npm_repo_url: 'https://www.npmjs.com/package/@ruska/cli'
parent_repo: 'https://github.com/ruska-ai/orchestra'
```

## Dev environment tips

- _READ_ the `./package.json` scripts.
- _USE_ the `tree` command to view project structure for new sessions.

## Testing instructions

- Find the CI plan in the .github/workflows folder.
- _READ_ the `./package.json` scripts.
- When test verified passing, we should _ALWAYS_ validate expectations via the CLI before marking complete.

## PR instructions

- Title format: FROM [feat-branch] TO [target-branch]
- Branch format: [feat|bug|chore|doc]/[issue#]-[shortdesc]
- Always run `npm lint` and `npm test` before committing.
