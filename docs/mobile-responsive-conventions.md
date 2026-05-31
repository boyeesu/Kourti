# Mobile Responsive Conventions

How we make Kourti work on a phone. This is the single source of truth — follow it for every
new screen, and bring old screens up to it when you touch them. The goal: a partner reviewing a
contract or checking a deadline from their phone on the move should never hit a layout that
overflows, a control they can't tap, or a panel they can't see.

## Breakpoints (Tailwind defaults)

We design **mobile-first**: unprefixed classes are the phone layout; prefixes scale _up_.

| Prefix | Min width | Typical device            | Use for                            |
| ------ | --------- | ------------------------- | ---------------------------------- |
| (none) | 0px       | phone (portrait)          | the default, always-correct layout |
| `sm:`  | 640px     | phone (landscape)/phablet | first expansion                    |
| `md:`  | 768px     | tablet                    | tablet layout, show desktop nav    |
| `lg:`  | 1024px    | laptop                    | multi-pane / sidebar-open layouts  |
| `xl:`  | 1280px    | desktop                   | wide dashboards                    |

**Rule of thumb:** write the phone layout first with no prefix, then add `md:`/`lg:` to widen it.
Never write a desktop layout and try to shrink it with `max-*:` overrides.

## The rules

### 1. Grids must collapse

A multi-column grid **must** have a single-column (or 2-col) base. Never ship a bare
`grid-cols-2/3/4`.

```tsx
// ❌ wrong — 4 cramped columns on a 375px phone
<div className="grid grid-cols-4 gap-4">

// ✅ right — stacks on phone, expands on tablet+
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
```

For stat-card rows, `grid-cols-2 lg:grid-cols-4` is acceptable (two cards read fine on a phone).

### 2. Dialogs — use the base, don't fight it

`components/ui/dialog.tsx` already gives every dialog a **mobile side-gutter**
(`w-[calc(100%-2rem)]`) and **scroll on short screens** (`max-h-[calc(100dvh-2rem)] overflow-y-auto`).
So you only ever set the _desktop_ max width, and only with a `sm:` prefix:

```tsx
// ✅ right — base handles mobile; this only widens it from sm: up
<DialogContent className="sm:max-w-[600px]">

// ❌ wrong — w-full with no gutter re-breaks the mobile edge
<DialogContent className="w-full max-w-[600px]">
```

For very tall/complex dialogs (multi-step forms, pickers), prefer a **Drawer** (`components/ui/drawer.tsx`)
or **bottom-sheet** (`components/ui/bottom-sheet.tsx`) on mobile — they're easier to reach one-handed.

### 3. Tables — use the `<Table>` primitive

`components/ui/table.tsx` already wraps in `overflow-auto`, so any table built from the primitive
scrolls horizontally on mobile for free. **Do not write raw `<table>` elements** — if you must,
wrap them in `<div className="overflow-x-auto">`.

For the priority data lists (Matters, Clients, Cases), prefer a **card layout on mobile** over a
scrolling table — a horizontally-scrolling 7-column table is technically usable but poor UX. Pattern:

```tsx
{/* phone: stacked cards; tablet+: table */}
<div className="md:hidden space-y-3">{items.map(renderCard)}</div>
<div className="hidden md:block"><Table>…</Table></div>
```

### 4. Split / resizable panels must stack on mobile

Side-by-side `ResizablePanelGroup direction="horizontal"` is unusable below ~768px. Drive direction
off the viewport:

```tsx
const isMobile = useIsMobile(); // hooks/use-mobile.tsx (768px)
<ResizablePanelGroup direction={isMobile ? 'vertical' : 'horizontal'}>
```

Or render a tabbed switcher on mobile (e.g. ReamAI: "Document" / "Analysis" tabs) and the split
panel on desktop. Either is fine; never show two narrow side-by-side panels on a phone.

### 5. Toolbars & button rows wrap

Action rows must `flex flex-wrap gap-2` (or collapse secondary actions into a `DropdownMenu` "⋯"
on mobile). Never assume a horizontal row fits.

### 6. Tap targets ≥ 44px

Interactive elements need a comfortable touch target. Use `size="icon"` buttons (already 40px) or
add `h-11`/`min-h-11` for primary mobile actions. Don't rely on hover-only affordances — anything
behind `hover:` must also be reachable by tap (visible by default, or in a menu).

### 7. No fixed pixel widths that exceed a phone

Avoid `w-[900px]`, `min-w-[700px]`, etc. on containers. Use `max-w-*` (which shrinks) or responsive
widths. Fixed `min-w-*` is only acceptable inside an `overflow-x-auto` scroll region (e.g. wide
table columns).

### 8. Use `100dvh`, not `100vh`

On mobile browsers the URL bar steals viewport height. Use `dvh` (dynamic viewport height) for
full-height layouts so content isn't cut off behind the browser chrome.

## The shared tools

- `hooks/use-mobile.tsx` — `useIsMobile()` (768px). Use for JS-driven layout switches (panel
  direction, tabbed-vs-split). Prefer CSS `md:` prefixes when the switch is purely visual.
- `components/ui/sheet.tsx` — the hamburger nav drawer (already wired in `AppLayout`).
- `components/ui/drawer.tsx` / `components/ui/bottom-sheet.tsx` — mobile-friendly modal alternatives.
- `components/ui/dialog.tsx` — mobile-safe by default (see rule 2).
- `components/ui/table.tsx` — horizontal-scroll-safe by default (see rule 3).
- `components/layout/PageHeader` — already responsive (stacks title/actions on mobile).

## QA checklist (run before merging a mobile change)

Test in Chrome DevTools device emulation at **375px** (iPhone SE) and **768px** (iPad):

- [ ] No horizontal page scroll (content never overflows the viewport width).
- [ ] All forms are single-column and readable; inputs are full-width.
- [ ] Every dialog fits with side gutters and scrolls if tall; close button reachable.
- [ ] Data tables either scroll horizontally or render as cards — no clipped columns.
- [ ] Split/resizable views stack vertically or switch to tabs.
- [ ] Primary actions are tappable (≥44px) and not hidden behind hover.
- [ ] Full-height views use `dvh` and aren't cut off by the browser bar.
