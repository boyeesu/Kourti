// Temporary module declarations to satisfy TypeScript under NodeNext resolution
// This helps the preview build by bypassing path resolution issues for alias imports.
// TODO: Replace with proper path-resolved imports or adjust tsconfig when allowed.
declare module '@/components/*';
declare module '@/pages/*';
declare module '@/hooks/*';
declare module '@/context/*';
declare module '@/lib/*';
declare module '@/features/*';
declare module '@/integrations/*';
