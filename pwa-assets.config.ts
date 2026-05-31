import { defineConfig } from '@vite-pwa/assets-generator/config';

/**
 * Generates the full PWA icon set from a single source image.
 * Run with: npm run generate:pwa-assets
 *
 * The source logo has transparency, so the maskable + Apple touch icons are
 * flattened onto a white background — otherwise the transparent areas render
 * black on iOS/Android home screens.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
    },
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: '#ffffff' },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: { background: '#ffffff' },
    },
  },
  images: ['public/kourti-mascot.png'],
});
