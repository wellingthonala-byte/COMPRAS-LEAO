import { createClient, SupabaseClient } from '@supabase/supabase-js';

/* Conexão com o projeto Supabase do Compras Leão (projeto NOVO).
   A chave publishable é pública por design — a segurança fica nas
   políticas RLS do banco. */
export const SUPABASE_URL = 'https://rmxtxhdgvsoomzilsttp.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3WW6RSsPF_SWvV5MtCW2MQ_Wvi6HvkM';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, storageKey: 'compras-leao-auth' },
    });
  }
  return client;
}
