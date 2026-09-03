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

-- Lot 2 : reste du schéma métier (une seule boutique par déploiement pour l'instant — pas
-- encore multi-tenant ; le sous-domaine par boutique évoqué plus tard nécessitera d'ajouter
-- une colonne shop_id partout, décision à prendre quand une 2e boutique sera réellement à onboarder).

create table if not exists personnel (
  id serial primary key,
  identifiant text not null unique,
  nom text not null,
  username text not null unique,
  email text,
  supabase_user_id text unique,
  role text not null check (role in ('admin', 'gerant', 'caissier')),
  actif boolean not null default true,
  principal boolean not null default false,
  zone_id integer references zones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_personnel_supabase_user on personnel(supabase_user_id);

create table if not exists clients (
  id serial primary key,
  nom text not null,
  telephone text,
  total_dette numeric(12,2) not null default 0,
  email text,
  adresse text,
  vendeur_id integer references personnel(id) on delete set null
);

create table if not exists fournisseurs (
  id serial primary key,
  nom text not null,
  contact text,
  email text
);

create table if not exists ventes (
  id uuid primary key,
  date timestamptz not null default now(),
  client_id integer references clients(id) on delete set null,
  client_nom text,
  total numeric(12,2) not null default 0,
  remise numeric(12,2),
  montant_paye numeric(12,2) not null default 0,
  reste_a_payer numeric(12,2) not null default 0,
  statut text not null check (statut in ('paye', 'partiel', 'credit')),
  methode_paiement text not null check (methode_paiement in ('especes', 'mobile_money', 'virement')),
  zone_id integer references zones(id) on delete set null,
  vendeur_id integer references personnel(id) on delete set null,
  vendeur_nom text,
  vendeur_identifiant text
);
create index if not exists idx_ventes_date on ventes(date);
create index if not exists idx_ventes_client on ventes(client_id);
create index if not exists idx_ventes_zone on ventes(zone_id);

create table if not exists lignes_vente (
  id serial primary key,
  vente_id uuid not null references ventes(id) on delete cascade,
  produit_id integer references produits(id) on delete set null,
  variant_id text,
  produit_nom text not null,
  variante text,
  quantite integer not null,
  prix_unitaire numeric(12,2) not null,
  cout_unitaire numeric(12,2)
);
create index if not exists idx_lignes_vente_vente on lignes_vente(vente_id);
create index if not exists idx_lignes_vente_produit on lignes_vente(produit_id);

create table if not exists achats_stock (
  id serial primary key,
  date timestamptz not null default now(),
  fournisseur_id integer references fournisseurs(id) on delete set null,
  fournisseur_nom text,
  produit_id integer references produits(id) on delete set null,
  produit_nom text,
  variant_id text,
  variante text,
  quantite integer not null,
  cout_total numeric(12,2) not null default 0,
  cout_unitaire numeric(12,2),
  zone_id integer references zones(id) on delete set null
);
create index if not exists idx_achats_stock_produit on achats_stock(produit_id);

create table if not exists ajustements_stock (
  id serial primary key,
  date timestamptz not null default now(),
  produit_id integer references produits(id) on delete set null,
  produit_nom text not null,
  variant_id text,
  variante text,
  ancien_stock integer not null,
  nouveau_stock integer not null,
  delta integer not null,
  motif text not null check (motif in ('inventaire', 'casse', 'perte_vol', 'don_promo', 'autre')),
  commentaire text,
  zone_id integer references zones(id) on delete set null,
  auteur text
);

create table if not exists paniers_en_attente (
  id serial primary key,
  date timestamptz not null default now(),
  nom_reference text not null,
  lignes jsonb not null,
  total numeric(12,2) not null default 0,
  vendeur_id integer references personnel(id) on delete set null
);

create table if not exists retours (
  id serial primary key,
  date timestamptz not null default now(),
  vente_id uuid references ventes(id) on delete set null,
  client_id integer references clients(id) on delete set null,
  client_nom text,
  lignes jsonb not null,
  montant_total numeric(12,2) not null default 0,
  mode_remboursement text not null check (mode_remboursement in ('especes', 'mobile_money', 'virement')),
  motif text not null check (motif in ('client_insatisfait', 'defectueux', 'erreur_caisse', 'autre')),
  commentaire text,
  zone_id integer references zones(id) on delete set null,
  vendeur_id integer references personnel(id) on delete set null,
  vendeur_nom text
);
create index if not exists idx_retours_vente on retours(vente_id);

create table if not exists reglements (
  id serial primary key,
  date timestamptz not null default now(),
  client_id integer not null references clients(id) on delete cascade,
  client_nom text not null,
  montant numeric(12,2) not null,
  mode_paiement text not null check (mode_paiement in ('especes', 'mobile_money', 'virement')),
  vendeur_id integer references personnel(id) on delete set null,
  vendeur_nom text,
  vendeur_identifiant text,
  zone_id integer references zones(id) on delete set null,
  vente_id uuid references ventes(id) on delete set null,
  dette_avant numeric(12,2),
  dette_apres numeric(12,2),
  type text not null check (type in ('paiement_dette', 'acompte', 'remboursement_retour')),
  note text
);
create index if not exists idx_reglements_client on reglements(client_id);

create table if not exists settings (
  id text primary key default 'principale',
  nom_site text not null default 'iVente Pro',
  slogan text,
  logo_url text,
  email text,
  telephone text,
  ifu text,
  rrcm text,
  localite text,
  print_format_default text,
  ticket_show_logo boolean default true,
  ticket_show_vendeur boolean default true,
  ticket_show_adresse boolean default true,
  ticket_show_ifu boolean default true,
  ticket_show_qrcode boolean default true,
  ticket_footer_message text,
  sound_enabled boolean default true,
  whatsapp_enabled boolean default false,
  whatsapp_custom_message text,
  whatsapp_auto_open boolean default false
);

create table if not exists licence (
  id text primary key default 'principale',
  cle text not null,
  activee_le timestamptz not null default now(),
  duree_jours integer,
  expire_le timestamptz,
  -- Une fois passé à true, ne redescend jamais à false (voir licenceStatus.js) : l'essai
  -- gratuit de 7 jours ne doit pouvoir être utilisé qu'une seule fois par boutique, même après
  -- l'avoir remplacé par une clé payante.
  trial_used boolean not null default false
);
-- Migration pour les installations existantes (CREATE TABLE IF NOT EXISTS ne touche pas aux
-- tables déjà créées) : rejoué à chaque démarrage, sans effet une fois la colonne en place.
alter table licence add column if not exists trial_used boolean not null default false;

-- Notifications in-app (cloche dans la navbar). target_role='admin' = diffusée à tous les
-- admins ; lue par n'importe lequel d'entre eux la marque lue pour tous (équipes admin
-- généralement réduites — pas besoin d'un état de lecture par personne pour l'instant).
create table if not exists notifications (
  id serial primary key,
  type text not null,
  message text not null,
  target_role text,
  target_personnel_id integer references personnel(id) on delete cascade,
  related_personnel_id integer references personnel(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_target_role on notifications(target_role, read);
create index if not exists idx_notifications_target_personnel on notifications(target_personnel_id, read);
