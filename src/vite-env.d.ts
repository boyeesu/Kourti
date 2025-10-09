/// <reference types="vite/client" />

// Documenso environment variables
interface ImportMetaEnv {
  readonly VITE_DOCUMENSO_URL: string;
  readonly VITE_DOCUMENSO_API_KEY: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}