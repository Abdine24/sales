import Layer from 'express/lib/router/layer.js';

// Express 4 ne rattrape que les erreurs SYNCHRONES d'un handler. Une route `async` qui lève
// (erreur Postgres, `throw err` après un catch partiel...) produit une promesse rejetée que
// personne n'écoute — et Node 20 arrête alors tout le process : une seule requête mal formée
// (ex: prix: "abc" sur POST /produits) coupait l'API pour TOUTES les boutiques.
//
// On enrichit donc le point d'entrée unique de chaque handler (Layer.prototype.handle_request,
// le même que celui patché par le paquet express-async-errors) : si le handler renvoie une
// promesse, son rejet est transmis à next(err), comme une erreur synchrone. Doit être importé
// avant la création des routeurs — voir le tout premier import de index.js.
Layer.prototype.handle_request = function handleRequest(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return next(); // middleware d'erreur : jamais appelé ici (comme l'original)
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
  } catch (err) {
    next(err);
  }
};

// Codes d'erreur Postgres causés par des données envoyées par le client (et non par un bug
// serveur) : renvoyés en 400/409 avec un message lisible plutôt qu'un 500 générique.
const PG_CLIENT_ERRORS = {
  '22P02': [400, 'Valeur invalide dans la requête.'], // invalid_text_representation (ex: "abc" pour un nombre)
  '22003': [400, 'Valeur numérique hors limites.'], // numeric_value_out_of_range
  '22007': [400, 'Date invalide.'], // invalid_datetime_format
  '22008': [400, 'Date invalide.'], // datetime_field_overflow
  '23502': [400, 'Un champ obligatoire est manquant.'], // not_null_violation
  '23514': [400, 'Valeur refusée par les règles de la boutique.'], // check_violation
  '23503': [409, 'Cet élément est encore utilisé ailleurs, ou fait référence à un élément introuvable.'], // foreign_key_violation
  '23505': [409, 'Cet élément existe déjà.'], // unique_violation
};

// Middleware d'erreur final (4 paramètres) — monté en DERNIER dans index.js.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    // Réponse déjà partiellement envoyée : on ne peut plus que couper la connexion.
    console.error(`Erreur après envoi de la réponse (${req.method} ${req.originalUrl}) :`, err);
    return res.end();
  }
  // Corps JSON illisible (express.json) ou trop gros.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Requête invalide (JSON mal formé).' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requête trop volumineuse.' });
  }
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  const pgError = err.code && PG_CLIENT_ERRORS[err.code];
  if (pgError) {
    return res.status(pgError[0]).json({ error: pgError[1] });
  }
  console.error(`Erreur serveur (${req.method} ${req.originalUrl}) :`, err);
  res.status(500).json({ error: 'Erreur interne du serveur — réessaie dans un instant.' });
}

// Filet de sécurité pour les promesses rejetées HORS d'une requête (minuteries, tâches de
// démarrage...) : on journalise au lieu de laisser Node arrêter le process.
process.on('unhandledRejection', (reason) => {
  console.error('Promesse rejetée non gérée :', reason);
});
