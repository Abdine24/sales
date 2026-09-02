// Limiteur de débit minimal en mémoire (une seule instance API pour l'instant — à remplacer
// par une solution partagée type Redis si l'API est un jour répliquée sur plusieurs instances).
export function simpleRateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Trop de tentatives, réessaie plus tard.' });
    }
    next();
  };
}
