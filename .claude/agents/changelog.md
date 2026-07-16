---
name: changelog
description: Generate a formatted changelog between the two most recent git tags, grouped by category based on the project's commit message convention.
---

When invoked, generate a changelog for the SPulse project by following these steps:

1. Run `git tag --sort=-v:refname | head -2` to get the current and previous tags.
2. Run `git log --pretty=format:"%s" <prev>..<curr>` to list commit subjects between them.
   - If there is no previous tag, use all commits up to the current tag.
3. Categorize each commit using the project's convention (see below). Skip "Bump version" lines entirely — they are noise.
4. Format the output as Markdown (see template below).
5. Print the result to the conversation. Also ask whether to write it to `CHANGELOG.md` (append at the top).

## Commit Category Rules

| Prefix | Category |
|---|---|
| `Add` | Features |
| `Fix` | Bug Fixes |
| `Update`, `Improve`, `Refactor` | Improvements |
| `Bump version …` | **Skip** |
| anything else | Other Changes |

Matching is case-insensitive on the first word only.

## Output Template

```
## [v1.x.x] — YYYY-MM-DD

### Features
- Add sensitivity slider to control visualizer amplitude reactivity

### Bug Fixes
- Fix export modal not closing after user cancels

### Improvements
- Update background thumbnail to refresh canvas immediately on load
```

Omit any section that has no entries.
Use today's date for the date field.
The version comes from the current git tag.
