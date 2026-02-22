# Kourti Brand Guide

## Brand Overview
Kourti is an AI-powered legal management platform. The visual identity conveys **trust**, **innovation**, and **professionalism** through a modern dark interface with soft blue-lavender accents.

---

## Color Palette

### Core Background Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Background** | `#09090B` | `240 10% 4%` | Main dark theme background |
| **Surface** | `#111113` | `240 8% 7%` | Cards, elevated panels |
| **Surface Elevated** | `#18181B` | `240 6% 10%` | Modals, popovers, dropdowns |
| **Muted** | `#1E1E22` | `240 7% 13%` | Subtle backgrounds, hover states |

### Primary Accent - Blue-Lavender Gradient

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Primary Light** | `#AFC8F0` | `216 65% 82%` | Gradient start, highlights |
| **Primary** | `#79A5EA` | `217 71% 70%` | Main accent, links, CTAs |
| **Primary Dark** | `#5B8AD9` | `217 65% 60%` | Hover states |

**Signature Gradient:**
```css
background: linear-gradient(135deg, #AFC8F0 0%, #79A5EA 100%);
```

### Text Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Foreground** | `#FAFAFA` | `0 0% 98%` | Primary text, headings |
| **Muted Foreground** | `#A1A1AA` | `240 5% 65%` | Secondary text, labels |
| **Dim** | `#71717A` | `240 4% 46%` | Placeholder, disabled |

### Border & Structure

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Border** | `#2A2A31` | `240 8% 18%` | Default borders, dividers |
| **Border Subtle** | `#1F1F24` | `240 9% 13%` | Subtle separations |
| **Border Hover** | `#79A5EA` | `217 71% 70%` | Interactive hover states |

### Status Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Success** | `#4ADE80` | `142 69% 58%` | Success states |
| **Warning** | `#FACC15` | `48 96% 53%` | Warnings |
| **Error** | `#F87171` | `0 91% 71%` | Errors, destructive |
| **Info** | `#79A5EA` | `217 71% 70%` | Information (uses primary) |

### Pastel Icon Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Pastel Blue** | `#93C5FD` | `213 93% 78%` | Icon highlights |
| **Pastel Teal** | `#5EEAD4` | `168 76% 64%` | Success icons |
| **Pastel Purple** | `#C4B5FD` | `255 91% 85%` | Feature icons |
| **Pastel Pink** | `#F9A8D4` | `330 81% 82%` | Accent icons |

---

## Typography

### Font Families
```css
/* Headings */
font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;

/* Body */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Scale & Weights

| Element | Size | Weight | Font |
|---------|------|--------|------|
| H1 | 48px / 3rem | 700 | Plus Jakarta Sans |
| H2 | 36px / 2.25rem | 600 | Plus Jakarta Sans |
| H3 | 24px / 1.5rem | 600 | Plus Jakarta Sans |
| H4 | 20px / 1.25rem | 600 | Plus Jakarta Sans |
| Body | 16px / 1rem | 400 | Inter |
| Body Small | 14px / 0.875rem | 400 | Inter |
| Caption | 12px / 0.75rem | 500 | Inter |

---

## Visual Elements

### Border Radius
```css
--radius-sm: 0.375rem;   /* 6px - small elements, badges */
--radius-md: 0.5rem;     /* 8px - buttons, inputs */
--radius-lg: 0.75rem;    /* 12px - cards */
--radius-xl: 1rem;       /* 16px - modals, large cards */
--radius-2xl: 1.5rem;    /* 24px - hero sections */
--radius-full: 9999px;   /* pills, avatars */
```

### Shadows
```css
/* Subtle shadow for cards */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);

/* Default elevation */
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);

/* Prominent elements */
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);

/* Signature glow effect */
--shadow-glow: 0 0 20px rgba(121, 165, 234, 0.15);
--shadow-glow-strong: 0 0 40px rgba(121, 165, 234, 0.25);
```

### Background Patterns
```css
/* Subtle dot pattern overlay */
.pattern-dots {
  background-image: radial-gradient(circle, #2A2A31 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Gradient mesh background */
.gradient-mesh {
  background: 
    radial-gradient(ellipse at 20% 0%, rgba(121, 165, 234, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(175, 200, 240, 0.06) 0%, transparent 50%);
}
```

---

## Component Styles

### Buttons

**Primary Button**
```css
.btn-primary {
  background: linear-gradient(135deg, #AFC8F0 0%, #79A5EA 100%);
  color: #09090B;
  font-weight: 600;
  border-radius: 0.5rem;
  padding: 0.625rem 1.25rem;
  box-shadow: 0 0 20px rgba(121, 165, 234, 0.15);
}

.btn-primary:hover {
  box-shadow: 0 0 30px rgba(121, 165, 234, 0.3);
  transform: translateY(-1px);
}
```

**Secondary Button**
```css
.btn-secondary {
  background: transparent;
  color: #FAFAFA;
  border: 1px solid #2A2A31;
  border-radius: 0.5rem;
}

.btn-secondary:hover {
  border-color: #79A5EA;
  background: rgba(121, 165, 234, 0.08);
}
```

**Ghost Button**
```css
.btn-ghost {
  background: transparent;
  color: #A1A1AA;
}

.btn-ghost:hover {
  background: #1E1E22;
  color: #FAFAFA;
}
```

### Cards
```css
.card {
  background: #111113;
  border: 1px solid #2A2A31;
  border-radius: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.card:hover {
  border-color: rgba(121, 165, 234, 0.3);
  box-shadow: 0 0 20px rgba(121, 165, 234, 0.1);
}
```

### Inputs
```css
.input {
  background: #09090B;
  border: 1px solid #2A2A31;
  border-radius: 0.5rem;
  color: #FAFAFA;
}

.input::placeholder {
  color: #71717A;
}

.input:focus {
  border-color: #79A5EA;
  box-shadow: 0 0 0 3px rgba(121, 165, 234, 0.15);
}
```

### Navigation / Sidebar
```css
.nav-item {
  color: #A1A1AA;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.nav-item:hover {
  background: rgba(121, 165, 234, 0.08);
  color: #FAFAFA;
}

.nav-item.active {
  background: rgba(121, 165, 234, 0.12);
  color: #79A5EA;
}
```

### Chat Bubbles
```css
/* User message */
.chat-bubble-user {
  background: linear-gradient(135deg, #AFC8F0 0%, #79A5EA 100%);
  color: #09090B;
  border-radius: 1rem 1rem 0.25rem 1rem;
}

/* AI/System message */
.chat-bubble-ai {
  background: #18181B;
  color: #FAFAFA;
  border: 1px solid #2A2A31;
  border-radius: 1rem 1rem 1rem 0.25rem;
}
```

---

## Animation Guidelines

### Transitions
```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Keyframe Animations
```css
/* Fade in with slide */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Slide up entrance */
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Floating effect */
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

/* Glow pulse */
@keyframes glow-pulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(121, 165, 234, 0.15);
  }
  50% {
    box-shadow: 0 0 40px rgba(121, 165, 234, 0.3);
  }
}
```

### Hover Effects
```css
/* Scale on hover */
.hover-lift {
  transition: transform 200ms ease, box-shadow 200ms ease;
}
.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* Glow on hover */
.hover-glow:hover {
  box-shadow: 0 0 30px rgba(121, 165, 234, 0.2);
}
```

---

## CSS Variables - Complete Reference

```css
.dark {
  /* Backgrounds */
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  
  /* Surfaces */
  --surface: 240 8% 7%;
  --surface-foreground: 0 0% 98%;
  --surface-muted: 240 6% 10%;
  --surface-border: 240 8% 18%;
  
  /* Cards */
  --card: 240 8% 7%;
  --card-foreground: 0 0% 98%;
  
  /* Popovers */
  --popover: 240 6% 10%;
  --popover-foreground: 0 0% 98%;
  
  /* Primary - Blue Lavender */
  --primary: 217 71% 70%;
  --primary-foreground: 240 10% 4%;
  --primary-light: 216 65% 82%;
  --primary-glow: 217 71% 70%;
  
  /* Secondary */
  --secondary: 240 6% 10%;
  --secondary-foreground: 0 0% 98%;
  
  /* Muted */
  --muted: 240 7% 13%;
  --muted-foreground: 240 5% 65%;
  
  /* Accent */
  --accent: 216 65% 82%;
  --accent-foreground: 240 10% 4%;
  
  /* Status */
  --success: 142 69% 58%;
  --success-foreground: 240 10% 4%;
  --warning: 48 96% 53%;
  --warning-foreground: 240 10% 4%;
  --destructive: 0 91% 71%;
  --destructive-foreground: 0 0% 98%;
  
  /* Structure */
  --border: 240 8% 18%;
  --input: 240 7% 13%;
  --ring: 217 71% 70%;
  
  /* Sidebar */
  --sidebar-background: 240 10% 4%;
  --sidebar-foreground: 240 5% 65%;
  --sidebar-primary: 217 71% 70%;
  --sidebar-primary-foreground: 240 10% 4%;
  --sidebar-accent: 240 6% 10%;
  --sidebar-accent-foreground: 0 0% 98%;
  --sidebar-border: 240 9% 13%;
  --sidebar-ring: 217 71% 70%;
}
```

---

## Quick Reference

| Token | Light Value | Dark Value |
|-------|-------------|------------|
| Background | `#FAFAFA` | `#09090B` |
| Surface | `#FFFFFF` | `#111113` |
| Primary | `#79A5EA` | `#79A5EA` |
| Text | `#09090B` | `#FAFAFA` |
| Muted Text | `#71717A` | `#A1A1AA` |
| Border | `#E4E4E7` | `#2A2A31` |

---

## Usage Notes

1. **Always use the gradient** for primary CTAs - it's the signature Kourti look
2. **Glow effects** should be subtle - they add depth without overwhelming
3. **Maintain contrast** - WCAG AA minimum (4.5:1 for text)
4. **Consistency** - Use CSS variables, never hardcode colors
5. **Animations** - Keep them smooth and purposeful, avoid jarring transitions
