import React, { createContext, useContext, useState, useEffect } from 'react';
import { Personnel } from '../db/db';
import { apiGet } from '../services/api';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
import { signOutSupabase } from '../services/supabaseAuth';

interface AuthContextType {
  personnel: Personnel | null;
  setPersonnel: (personnel: Personnel | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [personnel, setPersonnel] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      // Un lien "réinitialiser mon mot de passe" ouvre lui aussi une session Supabase (de
      // récupération) — on ne doit surtout pas la traiter comme une connexion normale ici,
      // sinon l'utilisateur atterrit directement dans l'app au lieu de choisir un nouveau mot
      // de passe. AuthGate détecte ce cas via l'URL et affiche le bon écran.
      const isPasswordRecoveryLink =
        window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');

      // La session vient désormais de Supabase (persistée par son propre SDK) — plus d'un
      // identifiant local dans sessionStorage. Une session Supabase active ne veut pas
      // forcément dire qu'un profil personnel existe déjà pour ce compte (ex: lien coupé
      // entre-temps par un admin) : /personnel/me tranche.
      if (isSupabaseConfigured() && !isPasswordRecoveryLink) {
        try {
          const supabase = await getSupabase();
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            const activePersonnel = await apiGet<Personnel>('/personnel/me');
            if (activePersonnel?.actif) {
              setPersonnel(activePersonnel);
            }
          }
        } catch {
          // Pas de session valide ou pas de profil pour ce compte -> reste déconnecté.
        }
      }
      setLoading(false);
    };
    loadSession();
  }, []);

  const logout = () => {
    signOutSupabase();
    setPersonnel(null);
  };

  if (loading) {
    return <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">Chargement...</div>;
  }

  return (
    <AuthContext.Provider value={{ personnel, setPersonnel, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider');
  }
  return context;
};
