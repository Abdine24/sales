import { createRemoteJWKSet, jwtVerify } from 'jose';

// Vérifie les jetons émis par Supabase Auth via son JWKS public — aucun secret partagé à
// stocker sur le VPS, juste l'URL publique du projet Supabase.
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL manquant — nécessaire pour vérifier les jetons des utilisateurs.');
}

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

// Middleware Express : exige un jeton Supabase valide dans "Authorization: Bearer <token>".
// Attache req.user = { id, email } si valide, sinon répond 401.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
    });
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }
}
