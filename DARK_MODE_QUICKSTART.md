# Dark Mode Quick Start Guide

## For Users

### How to Switch Themes

#### On Desktop
1. Look for the **sun/moon icon** in the top-right corner of the header
2. Click the icon to open the theme menu
3. Select your preferred theme:
   - **Light** - Bright, professional theme
   - **Dark** - Easy on the eyes in low-light environments
   - **System** - Automatically matches your computer's theme

#### On Mobile
1. Open the **sidebar menu** (hamburger icon in top-left)
2. Scroll to the bottom of the menu
3. Find the **"Theme"** section
4. Click the sun/moon icon to open the theme menu
5. Select your preferred theme

### Theme Options Explained

**🌞 Light Mode**
- Best for: Bright environments, daytime use
- Features: High contrast, professional appearance
- Colors: Blue accents on light backgrounds

**🌙 Dark Mode**
- Best for: Low-light environments, nighttime use
- Features: Reduced eye strain, modern look
- Colors: Bright blue accents on dark backgrounds

**💻 System Mode**
- Best for: Automatic switching based on time of day
- Features: Follows your computer's theme settings
- Behavior: Changes automatically with your OS

### Your Preference is Saved

Once you select a theme, your choice is automatically saved and will be remembered:
- ✅ Across browser sessions
- ✅ On different pages
- ✅ After logging out and back in

## For Developers

### Quick Implementation

```tsx
import { useTheme } from '@/hooks/useTheme';

function MyComponent() {
  const { theme, setTheme } = useTheme();
  
  return (
    <div>
      <p>Current: {theme}</p>
      <button onClick={() => setTheme('dark')}>Go Dark</button>
    </div>
  );
}
```

### Using Theme Colors

```tsx
// Use CSS variables (recommended)
<div className="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
  Adapts to theme automatically
</div>

// Or use Tailwind dark variant
<div className="bg-white dark:bg-gray-900">
  Light background, dark in dark mode
</div>
```

### Available CSS Variables

```css
/* Backgrounds */
--background
--surface
--card
--popover

/* Text */
--foreground
--muted-foreground

/* Brand */
--primary
--primary-foreground
--primary-glow

/* Status */
--success
--warning
--destructive

/* UI Elements */
--border
--input
--ring
```

## Tips & Tricks

### For Users

1. **Try System Mode First**
   - Let your computer decide based on time of day
   - Automatically switches between light and dark

2. **Dark Mode for Late Night Work**
   - Reduces blue light exposure
   - Easier on the eyes in dark rooms

3. **Light Mode for Presentations**
   - Better visibility on projectors
   - Professional appearance for client meetings

### For Developers

1. **Always Use CSS Variables**
   - Ensures consistency across themes
   - Automatic theme adaptation

2. **Test Both Themes**
   - Check all components in light and dark
   - Verify contrast ratios

3. **Avoid Hardcoded Colors**
   - Use theme variables instead
   - Makes maintenance easier

## Troubleshooting

### Theme Not Changing?
1. Clear browser cache
2. Check if JavaScript is enabled
3. Try a different browser

### Theme Not Saving?
1. Check browser localStorage is enabled
2. Disable browser extensions temporarily
3. Try incognito/private mode

### Colors Look Wrong?
1. Make sure you're using CSS variables
2. Check for hardcoded color values
3. Verify Tailwind classes are correct

## Keyboard Shortcuts

- **Open Theme Menu**: Click theme toggle button
- **Navigate Options**: Arrow keys
- **Select Theme**: Enter key
- **Close Menu**: Escape key

## Accessibility

The dark mode feature is fully accessible:
- ✅ Keyboard navigation supported
- ✅ Screen reader friendly
- ✅ High contrast ratios (WCAG AA)
- ✅ Respects motion preferences

## Need Help?

- 📖 Full documentation: See `DARK_MODE_FEATURE.md`
- 💬 Support: Contact your system administrator
- 🐛 Report issues: Use the Help Center

---

**Enjoy your personalized theme experience!** 🎨
