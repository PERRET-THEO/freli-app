/**
 * Ambient shims so the workspace TypeScript server can type-check Deno Edge
 * Functions (https:// imports + Deno global) without Deno-specific resolution.
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void
}

declare module 'https://deno.land/std@0.224.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): import('@supabase/supabase-js').SupabaseClient
}

declare module 'npm:resend' {
  export class Resend {
    constructor(apiKey: string)
    emails: {
      send(payload: Record<string, unknown>): Promise<{ data?: unknown; error?: unknown }>
    }
  }
}
