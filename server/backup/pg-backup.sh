#!/bin/sh
# Sauvegarde de TOUTES les bases Postgres d'iVente : control_plane + chaque base boutique
# (tenant_<slug>, listées depuis control_plane.boutiques.db_name). Un passage = un dossier
# horodaté dans $BACKUP_DIR, un fichier pg_dump au format custom compressé (-Fc) par base.
#
# Lancé une fois par jour par scheduler.sh (service `backup` de deploy/docker-compose.yml),
# ou à la main :  docker compose exec backup sh /app/backup/pg-backup.sh
# Restauration : voir server/deploy/README-backups.md.
#
# Connexion : variables libpq standard (PGHOST, PGPORT, PGUSER, PGPASSWORD) — aucun secret ici.
#
# Variables :
#   BACKUP_DIR                    dossier des sauvegardes (défaut /backups)
#   BACKUP_RETENTION_DAYS         nombre de jours de sauvegardes locales gardés (défaut 14)
#   BACKUP_REMOTE                 optionnel — destination rclone (ex. "offsite:mon-bucket/ivente").
#                                 Vide = copie locale uniquement.
#   BACKUP_REMOTE_RETENTION_DAYS  optionnel — si défini, supprime côté distant les fichiers plus
#                                 vieux que N jours. Vide = rien n'est jamais supprimé à distance.
#
# Code de sortie : 0 si toutes les bases ont été sauvegardées (et copiées à distance si
# BACKUP_REMOTE est défini), 1 sinon. Une base en échec n'empêche pas les autres d'être
# sauvegardées : le dossier est alors suffixé .ECHEC et la rotation n'est pas faite.

set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_REMOTE_RETENTION_DAYS="${BACKUP_REMOTE_RETENTION_DAYS:-}"
CONTROL_DB="control_plane"

log() { echo "[backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
err() { echo "[backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] ERREUR: $*" >&2; }

is_uint() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

if ! is_uint "$BACKUP_RETENTION_DAYS" || [ "$BACKUP_RETENTION_DAYS" -lt 1 ]; then
  err "BACKUP_RETENTION_DAYS doit être un entier >= 1 (reçu: '$BACKUP_RETENTION_DAYS')."
  exit 1
fi
if [ -n "$BACKUP_REMOTE_RETENTION_DAYS" ] && { ! is_uint "$BACKUP_REMOTE_RETENTION_DAYS" || [ "$BACKUP_REMOTE_RETENTION_DAYS" -lt 1 ]; }; then
  err "BACKUP_REMOTE_RETENTION_DAYS doit être vide ou un entier >= 1 (reçu: '$BACKUP_REMOTE_RETENTION_DAYS')."
  exit 1
fi

mkdir -p "$BACKUP_DIR" || { err "impossible de créer $BACKUP_DIR"; exit 1; }

# --- Verrou : jamais deux sauvegardes en même temps (planifiée + manuelle) ---------------
LOCK="$BACKUP_DIR/.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  other="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
    err "une sauvegarde est déjà en cours (pid $other) — abandon."
    exit 1
  fi
  log "verrou orphelin (pid '${other:-?}' absent) — repris."
  rm -rf "$LOCK"
  mkdir "$LOCK" || { err "impossible de prendre le verrou $LOCK"; exit 1; }
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
trap 'exit 1' INT TERM

# Un passage interrompu (conteneur arrêté en plein dump) laisse un dossier .en-cours :
# il est incomplet, on le marque comme tel plutôt que de le laisser passer pour bon.
for stale in "$BACKUP_DIR"/*.en-cours; do
  [ -d "$stale" ] || continue
  log "passage interrompu détecté : $(basename "$stale") -> .ECHEC"
  mv "$stale" "${stale%.en-cours}.ECHEC"
done

STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
WORK="$BACKUP_DIR/$STAMP.en-cours"
mkdir "$WORK" || { err "impossible de créer $WORK"; exit 1; }
log "début — dossier $STAMP"

failures=0

# dump_db <base> : pg_dump -Fc vers un fichier temporaire, vérifié par pg_restore --list
# (relit tout le sommaire de l'archive) avant d'être renommé en <base>.dump.
dump_db() {
  db="$1"
  out="$WORK/$db.dump"
  if pg_dump -Fc --dbname="$db" --file="$out.part" 2>"$out.err" \
     && pg_restore --list "$out.part" >/dev/null 2>>"$out.err"; then
    mv "$out.part" "$out"
    rm -f "$out.err"
    log "  ok  $db ($(wc -c < "$out" | tr -d ' ') octets)"
  else
    rm -f "$out.part"
    err "  pg_dump a échoué pour $db : $(tr '\n' ' ' < "$out.err")"
    failures=$((failures + 1))
  fi
}

# --- Liste des bases ---------------------------------------------------------------------
# Les boutiques en 'failed'/'provisioning' peuvent ne pas avoir de base : ignorées si absentes.
# Une boutique 'active'/'suspended' sans base est une anomalie : comptée comme un échec.
LIST="$WORK/.bases"
if ! psql --dbname="$CONTROL_DB" -X -A -t -F '|' -v ON_ERROR_STOP=1 -c "
    select b.db_name, b.status, (d.datname is not null)
      from boutiques b
      left join pg_database d on d.datname = b.db_name
     order by b.db_name" > "$LIST" 2>"$LIST.err"; then
  err "impossible de lister les boutiques depuis $CONTROL_DB : $(tr '\n' ' ' < "$LIST.err")"
  failures=$((failures + 1))
  : > "$LIST"
fi
rm -f "$LIST.err"
# psql sous Windows (tests locaux) écrit des fins de ligne CRLF : on retire les retours chariot.
tr -d '\r' < "$LIST" > "$LIST.lf" && mv "$LIST.lf" "$LIST"

dump_db "$CONTROL_DB"

# Rôles (sans les mots de passe : le rôle `vente` est recréé par l'image postgres à partir
# de POSTGRES_PASSWORD). Utile seulement pour une reconstruction complète du serveur.
if pg_dumpall --globals-only --no-role-passwords --file="$WORK/globals.sql" 2>"$WORK/globals.err"; then
  rm -f "$WORK/globals.err"
  log "  ok  rôles (globals.sql)"
else
  err "  pg_dumpall --globals-only a échoué : $(tr '\n' ' ' < "$WORK/globals.err")"
  failures=$((failures + 1))
fi

tenants=0
while IFS='|' read -r db status exists; do
  [ -n "$db" ] || continue
  case "$db" in
    *[!a-z0-9_-]*) err "  nom de base inattendu ignoré : '$db'"; failures=$((failures + 1)); continue ;;
  esac
  if [ "$exists" != "t" ]; then
    case "$status" in
      active|suspended) err "  la boutique $db ($status) n'a pas de base Postgres"; failures=$((failures + 1)) ;;
      *) log "  --  $db ($status) : pas de base, ignorée" ;;
    esac
    continue
  fi
  dump_db "$db"
  tenants=$((tenants + 1))
done < "$LIST"
rm -f "$LIST"

# Sommes de contrôle, pour vérifier une copie (distante ou rapatriée) avant restauration.
( cd "$WORK" && sha256sum ./*.dump ./*.sql > SHA256SUMS 2>/dev/null ) || true

if [ "$failures" -eq 0 ]; then
  FINAL="$BACKUP_DIR/$STAMP"
else
  FINAL="$BACKUP_DIR/$STAMP.ECHEC"
fi
mv "$WORK" "$FINAL"
log "fin — $tenants boutique(s) + $CONTROL_DB, $failures échec(s) -> $(basename "$FINAL")"

# --- Rotation locale ---------------------------------------------------------------------
# Uniquement après un passage entièrement réussi : si les sauvegardes échouent pendant des
# jours, on ne supprime surtout pas les dernières bonnes. Garde les dossiers des
# BACKUP_RETENTION_DAYS derniers jours (aujourd'hui compris), d'après la date du nom.
if [ "$failures" -eq 0 ]; then
  date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUP_DIR/last_success"
  now_s="$(date -u +%s)"
  cutoff="$(date -u -d "@$((now_s - (BACKUP_RETENTION_DAYS - 1) * 86400))" +%Y%m%d)"
  for d in "$BACKUP_DIR"/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]_*; do
    [ -d "$d" ] || continue
    [ "$d" = "$FINAL" ] && continue
    day="$(basename "$d" | cut -c1-10 | tr -d '-')"
    is_uint "$day" || continue
    if [ "$day" -lt "$cutoff" ]; then
      log "rotation : suppression de $(basename "$d")"
      rm -rf "$d"
    fi
  done
fi

# --- Copie hors du VPS (optionnelle) ------------------------------------------------------
if [ -n "$BACKUP_REMOTE" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    err "BACKUP_REMOTE est défini mais rclone est introuvable."
    failures=$((failures + 1))
  else
    log "copie vers $BACKUP_REMOTE"
    # copy (pas sync) : n'efface jamais rien à distance ; rattrape aussi les jours où la
    # copie aurait échoué, puisque les fichiers déjà présents sont ignorés.
    if rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" \
         --exclude "/.lock/**" --exclude "/*.en-cours/**" --exclude "/last_success" \
         --stats-one-line --stats 0 2>&1; then
      log "copie distante ok"
      if [ -n "$BACKUP_REMOTE_RETENTION_DAYS" ]; then
        log "rotation distante : fichiers de plus de ${BACKUP_REMOTE_RETENTION_DAYS} jours"
        rclone delete "$BACKUP_REMOTE" --min-age "${BACKUP_REMOTE_RETENTION_DAYS}d" 2>&1 \
          && rclone rmdirs "$BACKUP_REMOTE" --leave-root 2>&1 \
          || err "rotation distante en échec (les copies restent en place)"
      fi
    else
      err "copie distante en échec — la sauvegarde locale reste disponible."
      failures=$((failures + 1))
    fi
  fi
fi

[ "$failures" -eq 0 ]
