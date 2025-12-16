# Dark Mode Feature Documentation

## Overview

The Kourti Legal Hub application now includes a comprehensive dark mode feature that allows users to switch between light mode, dark mode, and system preference-based theming. This feature is implemented across all modules and provides a consistent, professional appearance in both themes.

## Features

### Theme Options

1. **Light Mode** - A professional light theme with blue accents
2. **Dark Mode** - A sophisticated dark theme optimized for low-light environments
3. **System Mode** - Automatically follows the user's operating system theme preference

### User Interface

The theme toggle is accessible from two locations:

1. **Desktop Header** - Located in the top-right toolbar between the Help Center button and user profile dropdown
2. **Mobile Navigation** - Located in the mobile sidebar footer with a dedicated "Theme" section

### Theme Persistence

User theme preferences are automatically saved to `localStorage` and persist across sessions. The storage key is `kourti-legal-hub-theme`.

## Technical Implementation

### Architecture

The dark mode implementation uses:

1. **Tailwind CSS Dark Mode** - Configured with `class` strategy in `tailwind.config.ts`
2. **CSS Custom Properties** - HSL-based color tokens for both light and dark themes
3. **React Context** - Theme state management via `ThemeProvider` and `useTheme` hook

### File Structure

```
src/
├── hooks/
│   └── useTheme.tsx              # Theme context and hook
├── components/
│   ├── ui/
│   │   └── theme-toggle.tsx      # Theme toggle component
│   └── layout/
│       └── AppLayout.tsx         # Integration in header and mobile nav
├── index.css                     # CSS variables for both themes
└── main.tsx                      # ThemeProvider wrapper
```

### Color System

#### Light Mode Colors
- **Primary**: Professional blue (`hsl(211 74% 31%)`)
- **Background**: Light gray-blue (`hsl(214 29% 95%)`)
- **Surface**: Pure white with subtle borders
- **Text**: Dark blue-gray for readability

#### Dark Mode Colors
- **Primary**: Bright blue (`hsl(217.2 91.2% 59.8%)`)
- **Background**: Deep dark blue (`hsl(222.2 84% 4.9%)`)
- **Surface**: Elevated dark panels (`hsl(222.2 47.4% 11.2%)`)
- **Text**: Light gray-blue for contrast

### CSS Variables

All colors are defined using HSL values in CSS custom properties:

```css
/* Light mode */
:root {
  --background: 214 29% 95%;
  --foreground: 211 40% 20%;
  --primary: 211 74% 31%;
  /* ... more variables */
}

/* Dark mode */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  /* ... more variables */
}
```

## Usage

### For Users

1. **Desktop**: Click the sun/moon icon in the top-right header
2. **Mobile**: Open the sidebar menu and use the theme toggle in the footer
3. **Options**: Select Light, Dark, or System from the dropdown menu

### For Developers

#### Using the Theme Hook

```tsx
import { useTheme } from '@/hooks/useTheme';

function MyComponent() {
  const { theme, setTheme } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={() => setTheme('dark')}>Dark Mode</button>
    </div>
  );
}
```

#### Creating Theme-Aware Components

Use Tailwind's `dark:` variant for theme-specific styles:

```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  Content adapts to theme
</div>
```

Or use CSS custom properties:

```tsx
<div className="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
  Uses theme variables
</div>
```

## Component Reference

### ThemeToggle Component

Located at `src/components/ui/theme-toggle.tsx`

**Props**: None (uses context internally)

**Features**:
- Dropdown menu with three theme options
- Visual indicators (sun/moon icons)
- Current theme checkmark
- Tooltip showing current theme
- Accessible keyboard navigation

### ThemeProvider

Located at `src/hooks/useTheme.tsx`

**Props**:
- `defaultTheme?: "light" | "dark" | "system"` - Default theme (default: "system")
- `storageKey?: string` - localStorage key (default: "kourti-legal-theme")

**Context Value**:
- `theme: "light" | "dark" | "system"` - Current theme
- `setTheme: (theme) => void` - Function to change theme

## Browser Support

The dark mode feature is supported in all modern browsers:
- Chrome/Edge 76+
- Firefox 67+
- Safari 12.1+
- Opera 63+

For older browsers, the feature gracefully falls back to light mode.

## Accessibility

The dark mode implementation follows accessibility best practices:

1. **Sufficient Contrast** - All color combinations meet WCAG AA standards
2. **Keyboard Navigation** - Theme toggle is fully keyboard accessible
3. **Screen Readers** - Proper ARIA labels and semantic HTML
4. **Reduced Motion** - Respects `prefers-reduced-motion` for transitions

## Performance

- **Zero Runtime Cost** - Theme switching uses CSS classes, no JavaScript re-renders
- **Instant Switching** - Theme changes apply immediately without page reload
- **Optimized Storage** - Only stores user preference, not entire theme data

## Future Enhancements

Potential improvements for future releases:

1. **Custom Themes** - Allow users to create custom color schemes
2. **Scheduled Themes** - Auto-switch based on time of day
3. **Per-Module Themes** - Different themes for different sections
4. **High Contrast Mode** - Enhanced accessibility option
5. **Theme Preview** - Live preview before applying

## Troubleshooting

### Theme Not Persisting

If theme preference doesn't persist across sessions:
1. Check browser localStorage is enabled
2. Verify no browser extensions are blocking storage
3. Clear site data and try again

### Colors Not Changing

If some elements don't change with theme:
1. Ensure components use CSS custom properties
2. Check for hardcoded color values
3. Verify Tailwind dark mode is configured correctly

### System Theme Not Detected

If system preference isn't detected:
1. Verify browser supports `prefers-color-scheme`
2. Check OS theme settings are configured
3. Try selecting theme manually

## Related Documentation

- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)

## Changelog

### Version 1.0.0 (2025-12-16)
- ✨ Initial dark mode implementation
- 🎨 Complete color system for light and dark themes
- 🔧 Theme toggle component in header and mobile nav
- 💾 Theme persistence via localStorage
- 📱 Responsive design for all screen sizes
- ♿ Full accessibility support
