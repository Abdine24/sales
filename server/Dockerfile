# Versions épinglées (pas de tag flottant) : une reconstruction de l'image donne la même base.
# node:20.20.2-alpine3.23 = l'image que désignait `node:20-alpine` au moment de l'épinglage
# (même digest). Pour monter de version : changer ce tag ET la branche Alpine des paquets
# ci-dessous (postgresql16-client, rclone), qui dépendent de alpine3.23.
FROM node:20.20.2-alpine3.23
WORKDIR /app

# node:20-alpine n'a pas Chromium, et le Chromium que Puppeteer télécharge par défaut n'est pas
# compatible musl (la libc d'Alpine) — d'où l'installation du paquet système `chromium` +
# dépendances de rendu, et PUPPETEER_SKIP_DOWNLOAD pour empêcher `npm install` d'essayer de
# télécharger son propre binaire incompatible. `font-noto` est nécessaire pour que les accents
# français (é, è, à...) s'affichent correctement dans les PDF générés — sans lui, Chromium les
# rend en tofu (rectangles vides) faute de police couvrant ces caractères.
# `font-liberation` fournit Liberation Sans (licence OFL), aux dimensions exactes d'Arial :
# fontconfig la substitue automatiquement à « Arial », la police des factures PDF (Arial
# elle-même n'est pas redistribuable).
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont font-noto font-liberation
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Le nom du binaire Chromium fourni par Alpine a changé selon les versions (chromium-browser
# puis chromium, selon les releases) — résolu une fois ici via un lien symbolique plutôt que
# figé en dur, pour ne pas dépendre de la version exacte d'Alpine embarquée dans l'image
# node:20-alpine au moment du build.
RUN CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser)" \
    && ln -sf "$CHROMIUM_BIN" /usr/local/bin/chromium-for-puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium-for-puppeteer

# `npm ci` + package-lock.json : installe exactement les versions du lockfile (express, pg,
# puppeteer...), au lieu de résoudre les plages `^` de package.json au moment du build.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Service `backup` de deploy/docker-compose.yml : il réutilise CETTE image (déjà construite par
# la CI et tirée par le VPS) au lieu d'une image à part — le projet Compose du VPS est créé à
# partir du seul docker-compose.yml, sans les autres fichiers du dépôt, donc le script ne peut
# pas y être monté depuis le disque. Client Postgres 16 = même version majeure que le serveur
# (postgres:16.15-alpine3.23) ; rclone sert uniquement à la copie hors VPS, optionnelle.
# Voir deploy/README-backups.md.
# `~16.15` / `~1.72` : version figée, seule la révision Alpine (-rN, correctifs de
# sécurité) peut bouger. Si Alpine 3.23 publie une nouvelle version mineure, le build CI
# échoue ici : mettre à jour le numéro (et garder le client = la version du serveur
# postgres du compose).
RUN apk add --no-cache postgresql16-client~16.15 rclone~1.72
COPY backup ./backup

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
