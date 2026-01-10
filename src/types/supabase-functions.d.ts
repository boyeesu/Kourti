// Type declarations for Supabase Edge Functions
// This file helps with TypeScript errors in edge functions during development

declare const Deno: { env: { get(key: string): string | undefined } };
declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
declare module "https://esm.sh/@supabase/supabase-js@2.45.0" {
  export function createClient(url: string, key: string): ReturnType<typeof import('@supabase/supabase-js').createClient>;
}
declare module "https://deno.land/x/xhr@0.1.0/mod.ts";