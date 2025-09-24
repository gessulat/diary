# Repository Guidelines

## Project Structure & Module Organization
The app is a Next.js TypeScript project. Route entries live in `pages/`, with nested folders for multi-step flows (for example, `pages/day/`). Shared UI and logic sit in `components/` and `lib/`; look for platform abstractions such as `lib/Tokens.stylex.ts` and `components/Button.tsx` when reusing patterns. Global styles and StyleX tokens reside in `styles/` and `lib/Tokens.stylex.ts`, while static assets (icons, manifest) live under `public/`.

## Build, Test, and Development Commands
Install deps with `pnpm install` (enable pre/post scripts via `pnpm config set enable-pre-post-scripts true`). Use `pnpm dev` for the live-reloading Next server, `pnpm build` for production bundles, and `pnpm start` to serve the compiled output. Keep the bundle clean with `pnpm cleanNext` before a fresh build. Run `pnpm lint` for ESLint + StyleX checks and `pnpm format` to apply Prettier to TS/TSX/MD files.

## Coding Style & Naming Conventions
Stick to TypeScript with strict typing; prefer exported types in `lib/Types.ts` for shared contracts. Components use functional React patterns and StyleX for styling—group styles via `create()` and avoid inline CSS strings. File names are PascalCase for components, camelCase for utilities, kebab-case for routes, matching the existing folders. Indentation is two spaces, and optional chaining/nullish coalescing is preferred over defensive conditionals.

## Testing Guidelines
Automated tests are not yet wired into the repo; when adding them, colocate `*.test.ts(x)` beside the code or under a `__tests__/` folder and document the runner in your PR. Until a test runner lands, provide manual verification notes (e.g. "pnpm dev" steps) in PRs and keep changes lint-clean. Aim to cover date math and editor behavior when introducing regressions-prone logic.

## Commit & Pull Request Guidelines
Follow the existing short, imperative commit style (`Add indexNoteStart`, `Fix types`). Squash noisy fixups locally. Each PR should describe the intent, list manual QA steps, and link any relevant issues. Include screenshots or GIFs for UI changes, note any schema migrations, and highlight follow-up work. Always run `pnpm lint` (and any new tests) before asking for review.

## Environment & Security Notes
Respect the local-first posture: avoid logging sensitive note content and ensure new APIs stay within the Next API routes or Evolu client abstractions. Check `next.config.js` before adding environment variables, and document required `.env` entries in your PR description.
