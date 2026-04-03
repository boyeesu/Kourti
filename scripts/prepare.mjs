const isCi = process.env.CI === 'true';
const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';

if (isCi || isVercel || isProduction) {
  process.exit(0);
}

try {
  const { default: husky } = await import('husky');
  husky();
} catch {
  process.exit(0);
}
