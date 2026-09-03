import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// Client Supabase avec la clé service_role — pouvoirs d'administration complets sur les
// comptes (créer un utilisateur avec mot de passe, changer le mot de passe de n'importe qui,
// sans passer par le propriétaire du compte). NE DOIT JAMAIS être exposé au navigateur : ce
// module n'est importé que par du code serveur, et la clé n'est lue que depuis une variable
// d'environnement du VPS.
let client = null;

export function getSupabaseAdmin() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY manquant côté serveur — nécessaire pour créer/modifier les comptes du personnel.'
      );
    }
    client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      // Node 20 n'a pas de WebSocket natif (arrivé en Node 22) — le SDK Supabase instancie
      // toujours un client Realtime en interne même si on ne l'utilise jamais ici, et se
      // plaint sans ce polyfill.
      realtime: { transport: ws },
    });
  }
  return client;
}
