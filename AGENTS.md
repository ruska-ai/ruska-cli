# Sample AGENTS.md file

## Dev environment tips
- _READ_ the `./package.json` scripts.

## Testing instructions
- Find the CI plan in the .github/workflows folder.
- _READ_ the `./package.json` scripts.
- When test verified passing, we should _ALWAYS_ validate expectations via the CLI before marking complete.

## PR instructions
- Title format: FROM [feat-branch] TO [target-branch]
- Branch format: [feat|bug|chore|doc]/[issue#]-[shortdesc]
- Always run `npm lint` and `npm test` before committing.