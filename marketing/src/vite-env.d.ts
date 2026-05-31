/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Kourti backend service (e.g. https://api.kourti.com). */
  readonly VITE_BACKEND_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Initialises Clarity + Mixpanel. Only called after cookie consent is accepted.
   *  Defined in index.html; guard with optional chaining before calling. */
  __kourtiInitAnalytics?: () => void;
  /** Mixpanel stub/instance loaded on demand after consent. */
  mixpanel?: {
    opt_out_tracking?: () => void;
    [key: string]: unknown;
  };
}
