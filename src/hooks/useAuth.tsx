import React, { createContext, useContext, useState, useEffect } from 'react';
import { Personnel } from '../db/db';
import { getSessionId } from '../services/localAuth';
import { db } from '../db/db';

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
      const sessionId = getSessionId();
      if (sessionId) {
        const activePersonnel = await db.personnel.get(sessionId);
        if (activePersonnel?.actif) {
          setPersonnel(activePersonnel);
        }
      }
      setLoading(false);
    };
    loadSession();
  }, []);

  const logout = () => {
    sessionStorage.removeItem('vente_personnel_session');
    setPersonnel(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">Chargement...</div>;
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
