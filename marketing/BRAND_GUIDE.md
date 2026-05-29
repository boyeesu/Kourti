# Kourti Legal Brand Guide

> **AI-Powered Legal Management Platform**  
> Last Updated: January 2026

---

## Table of Contents

1. [Brand Overview](#brand-overview)
2. [Color Palette](#color-palette)
3. [Typography](#typography)
4. [Visual Elements](#visual-elements)
5. [Component Styles](#component-styles)
6. [Animation Guidelines](#animation-guidelines)
7. [Usage Examples](#usage-examples)

---

## Brand Overview

Kourti Legal is an AI-powered legal management platform designed to help legal professionals streamline their workflows. The brand identity reflects **professionalism**, **innovation**, and **trust** through a sophisticated dark theme with elegant blue-lavender accents.

### Brand Personality

- **Modern & Innovative** – Cutting-edge AI technology
- **Professional & Trustworthy** – Legal industry standards
- **Elegant & Premium** – High-end user experience
- **Accessible & Approachable** – User-friendly design

---

## Color Palette

### Primary Colors

#### Background Colors

| Color Name     | HSL Value     | Hex Equivalent | Usage                    |
| -------------- | ------------- | -------------- | ------------------------ |
| **Background** | `240 10% 4%`  | `#09090B`      | Main page background     |
| **Card**       | `240 10% 6%`  | `#0E0E11`      | Card backgrounds, panels |
| **Secondary**  | `240 10% 12%` | `#1C1C21`      | Secondary backgrounds    |

#### Foreground Colors

| Color Name           | HSL Value  | Hex Equivalent | Usage                        |
| -------------------- | ---------- | -------------- | ---------------------------- |
| **Foreground**       | `0 0% 98%` | `#FAFAFA`      | Primary text                 |
| **Muted Foreground** | `0 0% 55%` | `#8C8C8C`      | Secondary text, placeholders |

---

### Accent Colors

#### Primary Blue-Lavender Gradient

The signature Kourti Legal gradient creates a distinctive, premium feel:

| Color Name        | HSL Value     | Hex Equivalent | Usage                |
| ----------------- | ------------- | -------------- | -------------------- |
| **Primary**       | `215 70% 76%` | `#AFC8F0`      | Primary accent, CTAs |
| **Primary Light** | `215 65% 70%` | `#79A5EA`      | Gradient endpoints   |
| **Accent**        | `215 65% 70%` | `#79A5EA`      | Highlights, icons    |

**Gradient Definition:**

```css
background: linear-gradient(135deg, #afc8f0 0%, #79a5ea 100%);
```

---

### Semantic Colors

| Color Name      | HSL Value     | Hex Equivalent | Usage                         |
| --------------- | ------------- | -------------- | ----------------------------- |
| **Success**     | `145 50% 50%` | `#40BF80`      | Success states, confirmations |
| **Warning**     | `45 70% 50%`  | `#D9A621`      | Warning states, alerts        |
| **Destructive** | `0 62% 50%`   | `#CF3333`      | Error states, deletions       |

---

### Pastel Icon Colors

These soft, muted colors are used for feature icons and visual accents:

| Color Name        | HSL Value     | Hex Equivalent | Usage        |
| ----------------- | ------------- | -------------- | ------------ |
| **Pastel Blue**   | `210 60% 75%` | `#99C2E6`      | Blue icons   |
| **Pastel Green**  | `145 50% 65%` | `#7DCC99`      | Green icons  |
| **Pastel Yellow** | `45 70% 70%`  | `#E6C266`      | Yellow icons |
| **Pastel Purple** | `270 50% 70%` | `#B399CC`      | Purple icons |
| **Pastel Pink**   | `330 50% 75%` | `#E699BF`      | Pink icons   |
| **Pastel Cyan**   | `180 50% 65%` | `#66CCCC`      | Cyan icons   |

---

### Border & Input Colors

| Color Name | HSL Value     | Hex Equivalent | Usage             |
| ---------- | ------------- | -------------- | ----------------- |
| **Border** | `240 10% 18%` | `#2A2A31`      | Borders, dividers |
| **Input**  | `240 10% 18%` | `#2A2A31`      | Form inputs       |
| **Ring**   | `215 70% 76%` | `#AFC8F0`      | Focus rings       |

---

## Typography

### Font Families

| Category    | Font Stack                                                  | Usage                    |
| ----------- | ----------------------------------------------------------- | ------------------------ |
| **Display** | `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif` | Headings (h1-h6), titles |
| **Body**    | `'Inter', system-ui, -apple-system, sans-serif`             | Body text, paragraphs    |

### Google Fonts Import

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');
```

### Typography Scale

| Element     | Font Family       | Weight         | Letter Spacing | Line Height |
| ----------- | ----------------- | -------------- | -------------- | ----------- |
| **h1-h6**   | Plus Jakarta Sans | 700 (Bold)     | -0.02em        | 1.2         |
| **Body**    | Inter             | 400 (Regular)  | -0.01em        | 1.6         |
| **Buttons** | Inter             | 600 (Semibold) | -0.01em        | 1.4         |

### Font Weight Reference

| Weight Name | Value | Usage           |
| ----------- | ----- | --------------- |
| Light       | 300   | Subtle text     |
| Regular     | 400   | Body text       |
| Medium      | 500   | Emphasized text |
| Semibold    | 600   | Buttons, labels |
| Bold        | 700   | Headings        |
| Extra Bold  | 800   | Hero titles     |

---

## Visual Elements

### Border Radius

| Size     | Value             | Usage                   |
| -------- | ----------------- | ----------------------- |
| **sm**   | `0.5rem (8px)`    | Small buttons, badges   |
| **md**   | `0.625rem (10px)` | Medium components       |
| **lg**   | `0.75rem (12px)`  | Default radius          |
| **xl**   | `1rem (16px)`     | Cards, panels           |
| **2xl**  | `1.5rem (24px)`   | Navigation, modals      |
| **full** | `9999px`          | Pills, circular buttons |

---

### Shadows

| Shadow Name    | CSS Value                               | Usage              |
| -------------- | --------------------------------------- | ------------------ |
| **Card**       | `0 4px 24px -4px hsl(0 0% 0% / 0.4)`    | Card elevations    |
| **Glow**       | `0 0 40px -10px hsl(215 70% 76% / 0.3)` | Accent glow        |
| **Glow Large** | `0 0 60px -15px hsl(215 70% 76% / 0.4)` | Feature highlights |

---

### Gradient Patterns

#### Text Gradient

```css
.text-gradient {
  background: linear-gradient(135deg, #afc8f0 0%, #79a5ea 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

#### Gradient Border

```css
.gradient-border::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: linear-gradient(135deg, hsl(215 70% 82% / 0.5) 0%, hsl(215 65% 70% / 0.3) 100%);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
```

---

### Background Patterns

#### Dot Pattern

```css
.bg-dot-pattern {
  background-image: radial-gradient(circle at 1px 1px, hsl(0 0% 100% / 0.03) 1px, transparent 0);
  background-size: 24px 24px;
}
```

#### Grid Pattern

```css
.bg-grid-pattern {
  background-image:
    linear-gradient(hsl(0 0% 100% / 0.02) 1px, transparent 1px),
    linear-gradient(90deg, hsl(0 0% 100% / 0.02) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

#### Radial Glow

```css
.bg-radial-glow {
  background: radial-gradient(
    ellipse 80% 50% at 50% -20%,
    hsl(215 65% 70% / 0.15) 0%,
    transparent 70%
  );
}
```

---

## Component Styles

### Buttons

#### Primary Button

- **Background:** `#FAFAFA` (foreground color)
- **Text:** `#09090B` (background color)
- **Border Radius:** Full (pill shape)
- **Padding:** `0.75rem 1.5rem` (12px 24px)
- **Shadow:** `0 2px 8px -2px hsl(0 0% 0% / 0.4)`
- **Hover:** Lift effect with enhanced shadow

#### Secondary Button

- **Background:** Transparent
- **Text:** `#FAFAFA` (foreground)
- **Border:** `1px solid #2A2A31`
- **Border Radius:** Full (pill shape)
- **Hover:** Border transitions to primary color, subtle background tint

#### Gradient Border Button

- **Gradient Border:** `#AFC8F0` to `#79A5EA`
- **Background:** Transparent
- **Text:** Foreground color

---

### Cards

#### Dark Card

```css
.card-dark {
  background: hsl(240 10% 6%); /* #0E0E11 */
  border: 1px solid hsl(240 10% 18%); /* #2A2A31 */
  border-radius: 0.75rem; /* 12px */
  box-shadow: 0 4px 24px -4px hsl(0 0% 0% / 0.4);
}
```

#### Card Hover State

- **Border Color:** Primary with 30% opacity
- **Transform:** `translateY(-2px) scale(1.02)`
- **Shadow:** Enhanced with primary glow

---

### Navigation

- **Background:** `hsl(240 10% 4% / 0.8)` with backdrop blur
- **Border:** `1px solid` border color at 50% opacity
- **Border Radius:** `1rem` (2xl)
- **Shadow:** `0 4px 24px -8px hsl(0 0% 0% / 0.4)`

---

### Chat Bubbles

#### User Bubble

- **Background:** Primary gradient (`#AFC8F0` → `#79A5EA`)
- **Text:** Background color (dark)
- **Border Radius:** `1rem` with `0.375rem` bottom-right

#### Agent Bubble

- **Background:** Card color (`#0E0E11`)
- **Border:** Border color (`#2A2A31`)
- **Text:** Foreground color
- **Border Radius:** `1rem` with `0.375rem` bottom-left

---

## Animation Guidelines

### Transition Timing

| Type        | Duration  | Easing   |
| ----------- | --------- | -------- |
| **Fast**    | 150ms     | ease-out |
| **Default** | 200ms     | ease-out |
| **Smooth**  | 300ms     | ease-out |
| **Slow**    | 600-800ms | ease-out |

### Animation Library

#### Fade In

```css
@keyframes fade-in {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Duration: 0.6s ease-out */
```

#### Slide Up

```css
@keyframes slide-up {
  0% {
    opacity: 0;
    transform: translateY(40px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Duration: 0.8s ease-out */
```

#### Scale In

```css
@keyframes scale-in {
  0% {
    opacity: 0;
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
/* Duration: 0.4s ease-out */
```

#### Float (Continuous)

```css
@keyframes float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}
/* Duration: 3s ease-in-out infinite */
```

#### Glow Pulse (Continuous)

```css
@keyframes glow-pulse {
  0%,
  100% {
    box-shadow: 0 0 20px hsl(215 70% 76% / 0.3);
  }
  50% {
    box-shadow: 0 0 40px hsl(215 70% 76% / 0.5);
  }
}
/* Duration: 2s ease-in-out infinite */
```

---

### Hover Effects

| Effect    | Transform          | Shadow             | Transition |
| --------- | ------------------ | ------------------ | ---------- |
| **Lift**  | `translateY(-2px)` | Enhanced depth     | 200ms      |
| **Scale** | `scale(1.02)`      | -                  | 200ms      |
| **Glow**  | -                  | Primary color glow | 300ms      |

---

## Usage Examples

### CSS Variables Setup

Include these CSS variables in your `:root` for consistent theming:

```css
:root {
  /* Background */
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;

  /* Cards */
  --card: 240 10% 6%;
  --card-foreground: 0 0% 98%;

  /* Primary (Blue-Lavender) */
  --primary: 215 70% 76%;
  --primary-foreground: 240 10% 4%;
  --primary-light: 215 65% 70%;
  --primary-glow: 215 70% 76%;

  /* Secondary */
  --secondary: 240 10% 12%;
  --secondary-foreground: 0 0% 98%;

  /* Muted */
  --muted: 240 10% 12%;
  --muted-foreground: 0 0% 55%;

  /* Accent */
  --accent: 215 65% 70%;
  --accent-foreground: 240 10% 4%;

  /* Semantic */
  --success: 145 50% 50%;
  --warning: 45 70% 50%;
  --destructive: 0 62% 50%;

  /* Borders */
  --border: 240 10% 18%;
  --input: 240 10% 18%;
  --ring: 215 70% 76%;

  /* Radius */
  --radius: 0.75rem;

  /* Pastel Colors */
  --pastel-blue: 210 60% 75%;
  --pastel-green: 145 50% 65%;
  --pastel-yellow: 45 70% 70%;
  --pastel-purple: 270 50% 70%;
  --pastel-pink: 330 50% 75%;
  --pastel-cyan: 180 50% 65%;
}
```

### Using Colors with HSL

```css
/* Using with Tailwind */
.element {
  background-color: hsl(var(--primary));
}

/* Direct HSL usage */
.element {
  background-color: hsl(215 70% 76%);
}

/* With opacity */
.element {
  background-color: hsl(215 70% 76% / 0.5);
}
```

---

## Quick Reference

### Primary Hex Colors

| Purpose          | Hex Code  |
| ---------------- | --------- |
| Background       | `#09090B` |
| Card             | `#0E0E11` |
| Text             | `#FAFAFA` |
| Primary Accent   | `#AFC8F0` |
| Secondary Accent | `#79A5EA` |
| Border           | `#2A2A31` |
| Success          | `#40BF80` |
| Warning          | `#D9A621` |
| Error            | `#CF3333` |

### Key Gradient

```
Primary Gradient: #AFC8F0 → #79A5EA
Direction: 135° (top-left to bottom-right)
```

---

## Brand Assets

| Asset   | Location                                     |
| ------- | -------------------------------------------- |
| Logo    | `/public/logo.png`                           |
| Favicon | `/public/favicon.ico`, `/public/favicon.png` |
| Mascot  | `/public/mascot.png`                         |

---

_This brand guide is maintained as part of the Kourti Legal codebase. For any updates or clarifications, please refer to the source files in `src/index.css` and `tailwind.config.ts`._

---

**© 2026 Kourti Legal. All Rights Reserved.**
