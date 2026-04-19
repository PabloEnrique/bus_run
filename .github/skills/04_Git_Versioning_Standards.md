# 04 — Git Versioning Standards: Hot Bus Drive

| Field        | Value                        |
| ------------ | ---------------------------- |
| **Project**  | Hot Bus Drive                |
| **Platform** | GitHub                       |
| **Revision** | 1.0.0                        |
| **Date**     | 2026-04-18                   |

---

## Table of Contents

1. [Branching Strategy](#1-branching-strategy)
2. [Conventional Commits](#2-conventional-commits)
3. [Branch Lifecycle](#3-branch-lifecycle)
4. [Pull Request Protocol](#4-pull-request-protocol)
5. [Tagging & Semantic Versioning](#5-tagging--semantic-versioning)
6. [Pre-commit Hooks & CI Checks](#6-pre-commit-hooks--ci-checks)
7. [`.gitignore` Reference](#7-gitignore-reference)
8. [Quick-Reference Cheat Sheet](#8-quick-reference-cheat-sheet)

---

## 1. Branching Strategy

This project follows a **Git Flow** branching model adapted for a small team.

### 1.1 Permanent Branches

| Branch      | Purpose                         | Protection Rules                                     |
| ----------- | ------------------------------- | ---------------------------------------------------- |
| `main`      | Production-ready code           | Protected. Merge via PR only. Requires 1 approval + passing CI. No direct pushes. |
| `develop`   | Integration branch              | Protected. Merge via PR only. CI must pass.          |

### 1.2 Ephemeral Branches

| Pattern                         | Base Branch | Merges Into          | Purpose                                                  |
| ------------------------------- | ----------- | -------------------- | -------------------------------------------------------- |
| `feature/<scope>/<short-desc>`  | `develop`   | `develop`            | New functionality.                                       |
| `fix/<scope>/<short-desc>`      | `develop`   | `develop`            | Bug fixes during development.                            |
| `hotfix/<short-desc>`           | `main`      | `main` AND `develop` | Critical production fixes.                               |
| `release/<version>`             | `develop`   | `main` AND `develop` | Pre-release stabilisation (optional, use when needed).   |
| `refactor/<scope>/<short-desc>` | `develop`   | `develop`            | Code restructuring with no behaviour change.             |
| `docs/<short-desc>`             | `develop`   | `develop`            | Documentation-only changes.                              |

### 1.3 Naming Rules

- All branch names are **lowercase**, using **hyphens** as word separators.
- `<scope>` matches the commit scopes defined in §2.2 (e.g., `portal`, `garage`, `physics`, `network`).
- `<short-desc>` is 2–4 hyphenated words describing the change (e.g., `vehicle-purchase`, `weight-transfer-fix`).
- Maximum branch name length: **60 characters**.

**Examples:**

```
feature/garage/vehicle-purchase
feature/physics/pacejka-tire-model
fix/network/reconnect-timeout
hotfix/race-results-persist
refactor/portal/auth-middleware
release/0.2.0
docs/api-contracts
```

---

## 2. Conventional Commits

Every commit message in this project **MUST** follow the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) specification.

### 2.1 Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Rules:**

1. `<type>` is **mandatory** and must be one of the allowed types (§2.2).
2. `<scope>` is **mandatory** for this project.
3. `<description>` starts with a **lowercase** letter, does **not** end with a period, and is written in the **imperative mood** ("add", not "added" or "adds").
4. The header line (type + scope + description) must not exceed **72 characters**.
5. The body, if present, is separated from the header by a blank line and wraps at 80 characters.
6. **Breaking changes** are indicated by appending `!` after the scope: `feat(api)!: rename lobby join endpoint`.

### 2.2 Allowed Types and Scopes

#### Types

| Type         | When to Use                                                            |
| ------------ | ---------------------------------------------------------------------- |
| `feat`       | A new feature or user-facing capability.                               |
| `fix`        | A bug fix.                                                             |
| `refactor`   | Code restructuring that neither fixes a bug nor adds a feature.        |
| `perf`       | A performance improvement.                                             |
| `test`       | Adding or correcting tests.                                            |
| `docs`       | Documentation-only changes.                                            |
| `style`      | Formatting, whitespace, semicolons — no logic change.                  |
| `chore`      | Build process, dependency updates, tooling configuration.              |
| `ci`         | CI/CD pipeline configuration changes.                                  |
| `revert`     | Reverts a previous commit. Body must reference the reverted commit hash. |

#### Scopes

| Scope       | Area                                                               |
| ----------- | ------------------------------------------------------------------ |
| `portal`    | Laravel application shell, layouts, shared Inertia middleware.      |
| `auth`      | Authentication, registration, password reset.                      |
| `garage`    | Vehicle management, shop, paint, inventory.                        |
| `lobby`     | Matchmaking, room creation, map voting.                            |
| `race`      | In-race client logic, HUD, input handling.                         |
| `physics`   | Vehicle dynamics formulas, tire model, fuel system.                |
| `network`   | Colyseus server, state schema, rooms, WebSocket communication.     |
| `db`        | Database migrations, seeders, model relationships.                 |
| `assets`    | 3D models, textures, audio files.                                  |
| `ci`        | GitHub Actions, deployment scripts, Docker configuration.          |
| `deps`      | Dependency additions, removals, or updates.                        |

### 2.3 Examples

```bash
# New feature — adding vehicle purchase flow
git commit -m "feat(garage): add vehicle purchase endpoint and Vue page"

# Bug fix — physics formula correction
git commit -m "fix(physics): correct sign in longitudinal weight transfer"

# Refactor — network code cleanup
git commit -m "refactor(network): extract input validation into RaceInputValidator"

# Performance — optimise state sync
git commit -m "perf(network): reduce state payload by delta-encoding positions"

# Database migration
git commit -m "feat(db): add vehicle_specs table with torque curve and BSFC columns"

# Test addition
git commit -m "test(physics): add unit tests for Pacejka lateral force calculation"

# Documentation update
git commit -m "docs(portal): document Inertia shared data contract"

# Breaking change
git commit -m "feat(network)!: replace room join payload with signed JWT token"

# Chore — dependency update
git commit -m "chore(deps): upgrade @colyseus/core to 0.17.2"

# CI pipeline
git commit -m "ci(ci): add GitHub Actions workflow for Laravel test suite"

# Revert
git commit -m "revert(physics): revert tire model changes from abc1234"
```

---

## 3. Branch Lifecycle

### 3.1 Starting a Feature

```bash
# Ensure develop is up to date
git checkout develop
git pull origin develop

# Create the feature branch
git checkout -b feature/garage/vehicle-purchase

# Work, commit frequently
git add app/Http/Controllers/GarageController.php
git commit -m "feat(garage): add vehicle purchase endpoint"

git add resources/js/Pages/Garage/Shop.vue
git commit -m "feat(garage): add shop page with vehicle cards"

# Push to remote daily (at minimum)
git push -u origin feature/garage/vehicle-purchase
```

### 3.2 Finishing a Feature

```bash
# Rebase onto latest develop to resolve conflicts locally
git fetch origin
git rebase origin/develop

# Force-push the rebased branch (only YOUR branch, never shared branches)
git push --force-with-lease

# Open a Pull Request: feature/garage/vehicle-purchase → develop
# After approval and CI pass, squash-merge via GitHub UI
# Delete the remote branch after merge
```

### 3.3 Hotfix Flow

```bash
# Branch from main
git checkout main
git pull origin main
git checkout -b hotfix/race-results-null

# Fix and commit
git add app/Http/Controllers/RaceController.php
git commit -m "fix(race): handle null race results on disconnect"

# Open PR to main — merge after CI
# IMMEDIATELY cherry-pick or merge into develop
git checkout develop
git pull origin develop
git merge hotfix/race-results-null
git push origin develop
```

### 3.4 Release Flow (Optional)

```bash
# Cut release from develop
git checkout develop
git pull origin develop
git checkout -b release/0.2.0

# Stabilise: only fix and docs commits allowed on this branch
git commit -m "fix(lobby): correct player count display"
git commit -m "docs(portal): update changelog for v0.2.0"

# Merge to main
# git checkout main && git merge release/0.2.0 && git push
# Tag: git tag -a v0.2.0 -m "Release 0.2.0: Lobby + Garage"
# Merge back to develop
# git checkout develop && git merge release/0.2.0 && git push
# Delete release branch
```

---

## 4. Pull Request Protocol

### 4.1 PR Title

The PR title **MUST** follow Conventional Commits format, as it becomes the squash-merge commit message:

```
feat(garage): implement vehicle purchase and shop page
```

### 4.2 PR Description Template

```markdown
## Summary
<!-- One paragraph describing what this PR does -->

## Related Documents
<!-- Reference the Skill document section, e.g.: -->
- GDD §3.2 — Pacejka Tire Model
- 02_Web_Architecture §3 — vehicle_specs schema

## Changes
- [ ] List of concrete changes

## Testing
- [ ] How this was tested (manual / automated)

## Screenshots (if UI)
<!-- Attach if applicable -->
```

### 4.3 Merge Strategy

| Target Branch | Merge Method    | Rationale                                    |
| ------------- | --------------- | -------------------------------------------- |
| `develop`     | **Squash merge** | Keeps develop history clean; one commit per feature. |
| `main`        | **Merge commit** | Preserves the merge point for release tagging. |

### 4.4 Review Checklist

- [ ] Commit messages follow Conventional Commits (§2).
- [ ] No `console.log`, `dd()`, `dump()`, or debug artefacts.
- [ ] New database columns have migrations.
- [ ] Physics formulas match `01_Game_Design_Document.md` §3.
- [ ] Server and client physics code are identical (shared module or verified parity).
- [ ] Tests pass locally (`php artisan test`, `npm run test`).

---

## 5. Tagging & Semantic Versioning

### 5.1 Version Format

This project follows **Semantic Versioning 2.0.0** (`MAJOR.MINOR.PATCH`):

| Component | Incremented When                                                    |
| --------- | ------------------------------------------------------------------- |
| `MAJOR`   | Breaking change to the multiplayer protocol or public API.          |
| `MINOR`   | New feature (vehicle, map, mechanic) that is backward-compatible.   |
| `PATCH`   | Bug fix, performance improvement, or documentation correction.      |

### 5.2 Tagging Workflow

```bash
# After merging a release branch (or develop) into main:
git checkout main
git pull origin main
git tag -a v0.2.0 -m "Release 0.2.0: Lobby system + Garage shop"
git push origin v0.2.0
```

### 5.3 Pre-release Tags

For beta or release-candidate builds:

```
v0.3.0-beta.1
v0.3.0-rc.1
```

---

## 6. Pre-commit Hooks & CI Checks

### 6.1 Local Pre-commit Hooks (via Husky + lint-staged)

Install:

```bash
npm install --save-dev husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

**`.husky/commit-msg`:**
```bash
npx --no -- commitlint --edit "$1"
```

**`commitlint.config.js`:**
```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [
      'portal', 'auth', 'garage', 'lobby', 'race',
      'physics', 'network', 'db', 'assets', 'ci', 'deps'
    ]],
    'scope-empty': [2, 'never'],
    'header-max-length': [2, 'always', 72],
  },
};
```

**`package.json` (lint-staged):**
```json
{
  "lint-staged": {
    "*.php": ["./vendor/bin/pint --test"],
    "*.{js,ts,vue}": ["eslint --max-warnings=0"],
    "*.{js,ts,vue,css,md,json}": ["prettier --check"]
  }
}
```

### 6.2 CI Checks (GitHub Actions)

Every PR triggers:

| Check                | Tool                         | Failure = PR blocked |
| -------------------- | ---------------------------- | -------------------- |
| PHP lint & style     | Laravel Pint                 | Yes                  |
| PHP tests            | `php artisan test`           | Yes                  |
| JS/Vue lint          | ESLint                       | Yes                  |
| JS format            | Prettier                     | Yes                  |
| Commit message lint  | commitlint (on PR title)     | Yes                  |
| Type check           | `vue-tsc --noEmit`           | Yes                  |

---

## 7. `.gitignore` Reference

```gitignore
# ── PHP / Laravel ──
/vendor/
.env
.env.backup
.env.production
storage/*.key
storage/framework/cache/*
storage/framework/sessions/*
storage/framework/views/*
bootstrap/cache/*

# ── Node.js ──
node_modules/
dist/
public/build/
public/hot

# ── IDE ──
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
*.swp
*.swo
.DS_Store
Thumbs.db

# ── OS ──
*.log
npm-debug.log*

# ── Game assets (large binaries tracked via Git LFS) ──
# See .gitattributes for LFS patterns

# ── Colyseus server ──
colyseus-server/dist/
colyseus-server/node_modules/

# ── Testing ──
coverage/
.phpunit.result.cache
```

### 7.1 Git LFS

Large binary assets (3D models, textures, audio) **MUST** be tracked via Git LFS:

```gitattributes
*.glb filter=lfs diff=lfs merge=lfs -text
*.gltf filter=lfs diff=lfs merge=lfs -text
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
```

---

## 8. Quick-Reference Cheat Sheet

### Start a Feature

```bash
git checkout develop && git pull origin develop
git checkout -b feature/<scope>/<desc>
```

### Commit

```bash
git add <files>
git commit -m "<type>(<scope>): <description>"
```

### Push & PR

```bash
git push -u origin feature/<scope>/<desc>
# Open PR on GitHub: feature/<scope>/<desc> → develop
```

### After PR Merge

```bash
git checkout develop && git pull origin develop
git branch -d feature/<scope>/<desc>
```

### Tag a Release

```bash
git checkout main && git pull origin main
git tag -a v<MAJOR.MINOR.PATCH> -m "<Release description>"
git push origin v<MAJOR.MINOR.PATCH>
```

### Hotfix

```bash
git checkout main && git pull origin main
git checkout -b hotfix/<desc>
# fix, commit, PR → main, then merge into develop
```

---

*End of Document — 04_Git_Versioning_Standards.md*
