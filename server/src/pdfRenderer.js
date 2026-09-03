import puppeteer from 'puppeteer';

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
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      // Le contenu réel de la page ne va jamais dans ces templates — seulement la pagination,
      // dans une marge dédiée en bas de chaque page.
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:9px;text-align:center;color:#86868b;font-family:Inter,-apple-system,sans-serif;">' +
        'Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '0mm', right: '0mm', bottom: '12mm', left: '0mm' },
    });
  } finally {
    await page.close();
  }
}
