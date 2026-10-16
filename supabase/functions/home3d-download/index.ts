import { createHandler } from './handler.mjs';

Deno.serve(createHandler({
  config: {
    url: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    origin: Deno.env.get('HOME3D_ALLOWED_ORIGIN') || 'https://kostandovmiha.github.io',
  },
}));
