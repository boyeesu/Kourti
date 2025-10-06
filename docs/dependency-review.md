# Dependency Review

This document captures the quick audit that was performed while fixing the blank screen issue.

## High priority findings

- **`next-themes`** – React context provider from `next-themes` was still imported in `src/components/ui/sonner.tsx`, but the app switched to a custom `ThemeProvider` (`src/hooks/useTheme.tsx`). Because no `ThemeProvider` from `next-themes` was present in the tree, calling `useTheme()` from that package threw a runtime error during render, which resulted in the blank screen. The dependency has been removed and the toaster now consumes the local theme context instead.

## Medium / low priority observations

- **`lovable-tagger`** – Only used in `vite.config.ts` to add metadata during builds. It pulls in a full copy of `esbuild` and increases install size, but it remains opt-in for Lovable’s tooling and does not currently break the app.
- **`terser`** – Bundled as a direct dependency even though Vite 5 already ships with Terser. It is safe but redundant; can be moved to a dev dependency or removed if minification configuration is delegated to Vite.

No other packages were found to cause direct runtime failures during this pass, but the list above should be revisited periodically alongside the usual dependency update workflow.
