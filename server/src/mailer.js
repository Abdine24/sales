// Envoi d'emails transactionnels internes (notifications à l'exploitant de la plateforme) via
// l'API Resend — distinct du SMTP Resend déjà configuré côté Supabase Dashboard, qui ne gère
// que les emails d'authentification (OTP, réinitialisation de mot de passe des admins).
//
// Optionnel : si RESEND_API_KEY n'est pas défini, les appels à sendEmail() sont journalisés
// puis ignorés plutôt que de faire échouer l'opération qui les a déclenchés — créer une
// boutique ne doit jamais échouer à cause d'un email de notification qui ne part pas.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'iVente Pro <notifications@azanga.tech>';

export async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn(`RESEND_API_KEY manquant — email non envoyé ("${subject}" à ${to}).`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`Échec envoi email Resend (${res.status}) :`, await res.text());
    }
  } catch (err) {
    console.error('Échec envoi email Resend :', err);
  }
}
