#!/bin/sh
# Point d'entrée du service `backup` (deploy/docker-compose.yml) : lance pg-backup.sh une fois
# par jour à BACKUP_TIME (HH:MM, heure UTC — l'image n'embarque pas de fuseaux horaires).
#
# Une simple boucle plutôt que crond : crond ne transmet pas les variables d'environnement du
# conteneur (PGPASSWORD, BACKUP_REMOTE, RCLONE_CONFIG_*...) aux tâches qu'il lance.

set -u

BACKUP_TIME="${BACKUP_TIME:-02:30}"
SCRIPT="$(dirname "$0")/pg-backup.sh"

case "$BACKUP_TIME" in
  [01][0-9]:[0-5][0-9]|2[0-3]:[0-5][0-9]) ;;
  *) echo "[backup] ERREUR: BACKUP_TIME doit être au format HH:MM (reçu: '$BACKUP_TIME')." >&2; exit 1 ;;
esac

# PID 1 d'un conteneur : sans trap, SIGTERM serait ignoré et `docker compose stop` attendrait
# 10 s avant de tuer le conteneur. `sleep & wait` permet au trap de s'exécuter tout de suite.
trap 'echo "[backup] arrêt demandé."; exit 0' INT TERM

echo "[backup] planificateur démarré — sauvegarde quotidienne à $BACKUP_TIME UTC" \
     "(rétention locale ${BACKUP_RETENTION_DAYS:-14} j, copie distante: ${BACKUP_REMOTE:-désactivée})."

last_run=""
while :; do
  if [ "$(date -u +%H:%M)" = "$BACKUP_TIME" ] && [ "$last_run" != "$(date -u +%Y-%m-%d)" ]; then
    last_run="$(date -u +%Y-%m-%d)"
    sh "$SCRIPT" || echo "[backup] ERREUR: la sauvegarde du $last_run a échoué (voir ci-dessus)." >&2
  fi
  sleep 20 &
  wait $!
done
