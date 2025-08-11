/// <reference types="vite/client" />

// Documenso environment variables
interface ImportMetaEnv {
  readonly VITE_DOCUMENSO_URL: string;
  readonly VITE_DOCUMENSO_API_KEY: string;
  // Add other VITE_* env vars here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}