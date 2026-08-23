import React, { useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, LogIn, UserPlus } from 'lucide-react';
import { db, Personnel } from '../db/db';
import { authenticate, createPrincipal, getSessionId, hasLicence, hasPrincipal } from '../services/localAuth';
import { Button } from '../components/ui/Button';

interface AuthGateProps {
  children: (personnel: Personnel) => React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [personnel, setPersonnel] = useState<Personnel | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [licenseOnly, setLicenseOnly] = useState(false);
  const [error, setError] = useState('');
  const [nom, setNom] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cle, setCle] = useState('');

  useEffect(() => {
    const load = async () => {
      const principalExists = await hasPrincipal();
      const licenceExists = await hasLicence();
      setSetupRequired(!principalExists || !licenceExists);
      setLicenseOnly(principalExists && !licenceExists);
      const sessionId = getSessionId();
      if (sessionId) {
        const activePersonnel = await db.personnel.get(sessionId);
        if (activePersonnel?.actif) setPersonnel(activePersonnel);
      }
      setLoading(false);
    };
    load();
  }, []);

  const submitSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6 || cle.trim().length < 8) {
      setError('Le mot de passe doit contenir 6 caractères et la clé de licence au moins 8 caractères.');
      return;
    }
    try {
      if (licenseOnly) {
        await db.licence.put({ id: 'principale', cle: cle.trim(), activee_le: new Date().toISOString() });
        const sessionId = getSessionId();
        const restored = sessionId ? await db.personnel.get(sessionId) : null;
        if (restored) setPersonnel(restored);
        else setSetupRequired(false);
        return;
      }
      const created = await createPrincipal(nom, username, password, cle);
      if (!created) throw new Error('Création impossible');
      setPersonnel(created);
    } catch {
      setError('Impossible de créer le compte principal. Vérifiez les informations saisies.');
    }
  };

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const loggedIn = await authenticate(username, password);
    if (!loggedIn) {
      setError('Nom d’utilisateur ou mot de passe incorrect.');
      return;
    }
    setPersonnel(loggedIn);
  };

  if (loading) return <div className="min-h-screen bg-slate-950" />;
  if (personnel) return <>{children(personnel)}</>;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-card p-8 rounded-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white"><LockKeyhole className="w-6 h-6" /></div>
          <div><h1 className="text-2xl font-black text-slate-900 dark:text-white">iVente Pro</h1><p className="text-sm text-slate-500">Accès sécurisé à votre caisse</p></div>
        </div>
        <div className="flex items-center gap-2 mb-6 text-sm font-bold text-slate-900 dark:text-white">
          {setupRequired ? <UserPlus className="w-4 h-4 text-blue-500" /> : <LogIn className="w-4 h-4 text-blue-500" />}
          {licenseOnly ? 'Activer la licence' : setupRequired ? 'Créer le compte principal' : 'Se connecter'}
        </div>
        <form onSubmit={setupRequired ? submitSetup : submitLogin} className="space-y-4">
          {setupRequired && !licenseOnly && <input required value={nom} onChange={(event) => setNom(event.target.value)} placeholder="Nom complet" className="w-full glass-input px-4 py-3 rounded-xl" />}
          {!licenseOnly && <input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nom d’utilisateur" className="w-full glass-input px-4 py-3 rounded-xl" />}
          {!licenseOnly && <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mot de passe" className="w-full glass-input px-4 py-3 rounded-xl" />}
          {setupRequired && <div className="relative"><KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input required value={cle} onChange={(event) => setCle(event.target.value)} placeholder="Clé de licence" className="w-full glass-input pl-10 pr-4 py-3 rounded-xl" /></div>}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <Button type="submit" size="lg" className="w-full" icon={setupRequired ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}>
            {licenseOnly ? 'Activer la licence' : setupRequired ? 'Activer et créer mon compte' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  );
};