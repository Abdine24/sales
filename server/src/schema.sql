-- Schéma initial de l'API — premier lot (zones, catégories, produits) pour valider le
-- pipeline VPS <-> app de bout en bout. Les autres tables (clients, ventes, stock...)
-- suivront au même format une fois cette base validée.
-- Exécuté au démarrage de l'API (idempotent grâce à IF NOT EXISTS).

create table if not exists zones (
  id serial primary key,
  nom text not null,
  code text not null unique,
  actif boolean not null default true
);

create table if not exists categories (
  id serial primary key,
  nom text not null unique,
  description text
);

create table if not exists produits (
  id serial primary key,
  nom text not null,
  prix numeric(12,2) not null default 0,
  cout_achat_unitaire numeric(12,2),
  stock integer not null default 0,
  code_barres text,
  categorie text,
  min_stock integer not null default 0,
  image_url text,
  variantes jsonb,
  is_variable boolean not null default false,
  attributs jsonb,
  variantes_detaillees jsonb,
  zone_id integer references zones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_produits_zone on produits(zone_id);
create index if not exists idx_produits_categorie on produits(categorie);
create index if not exists idx_produits_code_barres on produits(code_barres);
