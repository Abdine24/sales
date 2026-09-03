-- Base de contrôle multi-tenant : l'annuaire de toutes les boutiques et de leurs
-- utilisateurs. Ne contient JAMAIS de données métier (ventes, produits, clients...) —
-- celles-ci vivent exclusivement dans la base Postgres dédiée de chaque boutique
-- (voir schema.sql, copié tel quel dans chaque base boutique par le provisioning).
-- Appliqué au démarrage de l'API, comme schema.sql l'est pour chaque base boutique —
-- idempotent (CREATE TABLE IF NOT EXISTS), sans effet une fois en place.

-- gen_random_uuid() est intégré au cœur de Postgres depuis la version 13 (postgres:16-alpine
-- l'a nativement) — pas besoin de l'extension pgcrypto pour l'obtenir.
create table if not exists boutiques (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,           -- étiquette de sous-domaine, ex: 'boutiquea'
  nom text not null,
  db_name text not null unique,        -- ex: 'tenant_boutiquea'
  status text not null default 'provisioning'
    check (status in ('provisioning','active','suspended','failed')),
  created_at timestamptz not null default now(),
  provisioned_at timestamptz
);

-- Table de correspondance utilisateur Supabase -> boutique. Nécessaire car le projet
-- Supabase (auth.users) est partagé par toutes les boutiques (voir décision produit), alors
-- que chaque boutique a sa propre base personnel/ventes/etc. — après vérification d'un jeton
-- JWT, l'API doit savoir dans QUELLE base aller chercher le profil de cet utilisateur.
create table if not exists utilisateurs_boutiques (
  supabase_user_id text primary key,
  boutique_id uuid not null references boutiques(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_utilisateurs_boutiques_boutique on utilisateurs_boutiques(boutique_id);

-- Scaffoldée pour la fonctionnalité "domaine personnalisé" à venir — pas encore branchée
-- dans la résolution de tenant (voir tenantResolver.js). Créer la table maintenant coûte
-- rien et évite une migration plus tard.
create table if not exists domaines_personnalises (
  domaine text primary key,
  boutique_id uuid not null references boutiques(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active')),
  created_at timestamptz not null default now()
);

-- Réglages globaux de la plateforme, éditables dynamiquement depuis la page propriétaire
-- (server/src/routes/plateforme.js) plutôt qu'en dur dans le code du site — ex: le numéro
-- WhatsApp de contact affiché sur toutes les boutiques. Une seule ligne (id='defaut').
create table if not exists platform_config (
  id text primary key default 'defaut',
  whatsapp_number text,
  contact_phone text,
  updated_at timestamptz not null default now()
);
insert into platform_config (id) values ('defaut') on conflict (id) do nothing;
