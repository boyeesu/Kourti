/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Kourti backend service (e.g. https://api.kourti.com). */
  readonly VITE_BACKEND_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
