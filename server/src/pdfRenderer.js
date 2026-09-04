import puppeteer from 'puppeteer';

// Marge basse réservée à la pagination "Page X / Y" imprimée par Chromium (voir footerTemplate).
export const PDF_BOTTOM_MARGIN_MM = 12;

// Hauteur réellement disponible pour le contenu sur une feuille A4 : 297mm moins la marge basse
// ci-dessus, moins 1mm de sécurité contre les arrondis mm -> px de Chromium.
//
// C'est LA valeur qu'un template doit utiliser pour coller son pied de page en bas de page
// (min-height + flex + margin-top:auto). Un template qui écrit `min-height: 297mm` — le réflexe
// naturel — ne peut par construction JAMAIS tenir sur une page, puisque 297mm dépasse déjà la
// zone imprimable : Chromium bascule alors tout le pied de page sur une 2e page vide.
// receiptTemplate.js réécrit donc 297mm vers cette valeur (voir sanitizeTemplateHtml).
export const PDF_CONTENT_HEIGHT_MM = 297 - PDF_BOTTOM_MARGIN_MM - 1;

// Une seule instance Chromium pour tout le process — un launch() par facture coûterait environ
// 1,5s et finirait par saturer la mémoire du VPS. `browserPromise` (pas juste `browser`) évite
// une course : deux requêtes arrivant avant la fin du tout premier launch() partagent la même
// promesse au lieu de déclencher chacune leur propre navigateur.
let browserPromise = null;

function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
    try {
      const browser = await browserPromise;
      // Si Chromium plante (OOM, crash interne...), le prochain appel doit en relancer un neuf
      // plutôt que de rester bloqué à réutiliser une connexion morte indéfiniment.
      browser.on('disconnected', () => {
        browserPromise = null;
      });
    } catch (err) {
      // Le launch() lui-même a échoué (mauvais executablePath, binaire manquant...) — sans ce
      // reset, browserPromise resterait une promesse rejetée pour toujours : toute génération
      // de facture échouerait jusqu'au prochain redémarrage de l'API, même une fois la cause
      // corrigée. On laisse le prochain appel retenter un launch() propre.
      browserPromise = null;
      throw err;
    }
  }
  return browserPromise;
}

// Convertit un document HTML complet (DOCTYPE/head/body) en PDF A4 — texte vectoriel,
// pagination native, polices réellement chargées (document.fonts.ready), pas de setTimeout
// arbitraire. Un onglet (page) par appel, toujours fermé après usage : jamais le navigateur.
export async function htmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      // Le contenu réel de la page ne va jamais dans ces templates — seulement la pagination,
      // dans une marge dédiée en bas de chaque page. Pas de police externe ici non plus (voir
      // receiptFonts.js) — juste sans-serif générique, résolu par une police du
      // conteneur.
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:9px;text-align:center;color:#86868b;font-family:sans-serif;">' +
        'Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '0mm', right: '0mm', bottom: `${PDF_BOTTOM_MARGIN_MM}mm`, left: '0mm' },
    });
    // page.pdf() renvoie un Uint8Array, pas un vrai Buffer Node — Express (res.send) ne
    // reconnaît QUE Buffer.isBuffer() comme binaire ; un Uint8Array brut tombe dans sa branche
    // "objet" et se retrouve sérialisé en JSON ({"0":37,"1":80,...}) au lieu d'être envoyé tel
    // quel, corrompant le PDF côté client (et le gonflant au passage, un objet JSON étant bien
    // plus verbeux que les octets qu'il décrit). Invisible en local avec fs.writeFileSync, qui
    // accepte un Uint8Array sans broncher — seule la route HTTP réelle est concernée.
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}
