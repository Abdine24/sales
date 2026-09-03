FROM node:20-alpine
WORKDIR /app

# node:20-alpine n'a pas Chromium, et le Chromium que Puppeteer télécharge par défaut n'est pas
# compatible musl (la libc d'Alpine) — d'où l'installation du paquet système `chromium` +
# dépendances de rendu, et PUPPETEER_SKIP_DOWNLOAD pour empêcher `npm install` d'essayer de
# télécharger son propre binaire incompatible. `font-noto` est nécessaire pour que les accents
# français (é, è, à...) s'affichent correctement dans les PDF générés — sans lui, Chromium les
# rend en tofu (rectangles vides) faute de police couvrant ces caractères.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont font-noto
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Le nom du binaire Chromium fourni par Alpine a changé selon les versions (chromium-browser
# puis chromium, selon les releases) — résolu une fois ici via un lien symbolique plutôt que
# figé en dur, pour ne pas dépendre de la version exacte d'Alpine embarquée dans l'image
# node:20-alpine au moment du build.
RUN CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser)" \
    && ln -sf "$CHROMIUM_BIN" /usr/local/bin/chromium-for-puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium-for-puppeteer

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
