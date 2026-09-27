// Police des factures PDF : Arial, comme le site. Arial n'est pas redistribuable, donc aucun
// fichier n'est embarqué : l'image Docker installe Liberation Sans (paquet Alpine
// `font-liberation`, licence OFL), aux dimensions exactes d'Arial, que fontconfig substitue
// automatiquement à « Arial » lors du rendu Puppeteer/Chromium. Aucun appel réseau pendant le
// rendu (un chargement depuis Google Fonts produisait des PDF corrompus/gonflés sur le VPS).
//
// Ce module ne contient AUCUN modèle de facture : depuis que tous les templates sont ajoutés par
// le propriétaire (control_plane.receipt_templates, voir routes/plateforme.js), le serveur n'en
// embarque plus aucun. Il fournit seulement la pile de polices imposée à tout modèle uploadé
// (voir receiptTemplate.js, sanitizeTemplateHtml).

// Noms sans guillemets (identifiants CSS valides) : la pile peut être insérée aussi bien dans une
// feuille de style que dans un attribut style="..." ou style='...' sans le casser.
export const RECEIPT_FONT_STACK = 'Arial, Liberation Sans, Helvetica, sans-serif';
