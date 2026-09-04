import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Users, Edit2, Copy, KeyRound, CheckCircle2 } from 'lucide-react';
import type { Personnel as PersonnelRecord, PersonnelRole, Zone } from '../db/db';
import { apiGet, apiPost, apiPut, ApiError } from '../services/api';
import { roleLabel } from '../services/localAuth';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface PersonnelProps {
  currentUser: PersonnelRecord;
}

// C'est l'admin qui gère les identifiants de son équipe : il fixe le mot de passe à la
// création, et peut le changer à tout moment (ex: employé qui l'a oublié) — voir
// server/src/routes/personnel.js (POST / et PUT /:id/mot-de-passe), qui utilisent la clé
// service_role de Supabase côté serveur pour ça. Rien de tout ça ne transite par le
// navigateur de l'employé.
export const Personnel: React.FC<PersonnelProps> = ({ currentUser }) => {
  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonnelRecord | null>(null);
  const [nom, setNom] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PersonnelRole>('gerant');
  const [zoneId, setZoneId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Modale "changer le mot de passe"
  const [passwordTarget, setPasswordTarget] = useState<PersonnelRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [p, z] = await Promise.all([
        apiGet<PersonnelRecord[]>('/personnel'),
        apiGet<Zone[]>('/zones'),
      ]);
      setPersonnel([...p].sort((a, b) => a.nom.localeCompare(b.nom)));
      setZones(z);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger le personnel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setEditingPerson(null);
    setNom('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('gerant');
    setZoneId(zones.length === 1 ? zones[0].id || '' : '');
    setError('');
    setInfoMessage('');
    setIsModalOpen(true);
  };

  const openEdit = (person: PersonnelRecord) => {
    setEditingPerson(person);
    setNom(person.nom);
    setUsername(person.username);
    setEmail(person.email || '');
    setPassword('');
    setRole(person.role);
    setZoneId(person.zone_id || '');
    setError('');
    setInfoMessage('');
    setIsModalOpen(true);
  };

  const savePerson = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('L’adresse email est obligatoire pour sécuriser le compte.');
      return;
    }
    const duplicateUsername = personnel.find((person) => person.username === normalizedUsername && person.id !== editingPerson?.id);
    if (duplicateUsername) {
      setError('Ce nom d’utilisateur existe déjà.');
      return;
    }
    const duplicateEmail = personnel.find((person) => (person.email || '').trim().toLowerCase() === normalizedEmail && person.id !== editingPerson?.id);
    if (duplicateEmail) {
      setError('Cette adresse email est déjà utilisée par un autre membre.');
      return;
    }
    if (editingPerson?.principal && role !== 'admin') {
      setError('Le compte principal doit rester administrateur.');
      return;
    }
    if (role === 'gerant' && !zoneId) {
      setError('Un gérant doit être affecté à une zone.');
      return;
    }
    if (!editingPerson && (!password || password.length < 6)) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    try {
      if (editingPerson?.id) {
        await apiPut(`/personnel/${editingPerson.id}`, {
          nom: nom.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          role: editingPerson.principal ? 'admin' : role,
          zone_id: editingPerson.principal ? null : (zoneId ? Number(zoneId) : null),
        });
      } else {
        await apiPost('/personnel', {
          nom: nom.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          password,
          role,
          zone_id: zoneId ? Number(zoneId) : null,
        });
        setInfoMessage(`Compte créé pour ${nom.trim()} — transmets-lui son identifiant et son mot de passe.`);
      }
      setIsModalOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'enregistrement.");
    }
  };

  const toggleActive = async (person: PersonnelRecord) => {
    if (person.principal || !person.id) return;
    try {
      await apiPut(`/personnel/${person.id}`, { actif: !person.actif });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la mise à jour.');
    }
  };

  const openPasswordModal = (person: PersonnelRecord) => {
    setPasswordTarget(person);
    setNewPassword('');
    setPasswordError('');
  };

  const submitNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordTarget?.id) return;
    if (newPassword.length < 6) {
      setPasswordError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setPasswordSubmitting(true);
    setPasswordError('');
    try {
      await apiPut(`/personnel/${passwordTarget.id}/mot-de-passe`, { password: newPassword });
      setInfoMessage(`Mot de passe de ${passwordTarget.nom} mis à jour.`);
      setPasswordTarget(null);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Échec de la mise à jour du mot de passe.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (currentUser.role !== 'admin') {
    return (
      <GlassCard className="p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Accès limité</h2>
        <p className="text-sm text-slate-500 mt-2">Seul un administrateur peut gérer le personnel.</p>
      </GlassCard>
    );
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Gestion du personnel</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Ajoutez des comptes et limitez leurs actions selon leur rôle.</p>
        </div>
        <Button variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={openCreate}>Ajouter une personne</Button>
      </div>

      {infoMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{infoMessage}</span>
        </div>
      )}

      <GlassCard className="p-0 overflow-hidden">
        <div className="divide-y divide-slate-200/40 dark:divide-white/5">
          {personnel.map((person) => (
            <div key={person.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center"><Users className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{person.nom}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">@{person.username}</span>
                    <span className="text-slate-400">•</span>
                    <span>{person.email || 'Email non défini'}</span>
                  </div>
                  <div className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5"><Copy className="w-3 h-3" /> ID: {person.identifiant}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={person.role === 'admin' ? 'blue' : 'gray'}><ShieldCheck className="w-3 h-3" />{person.principal ? 'Admin principal' : roleLabel(person.role)}</Badge>
                <Badge variant={person.actif ? 'green' : 'red'}>{person.actif ? 'Actif' : 'Désactivé'}</Badge>
                <Button variant="glass" size="sm" icon={<KeyRound className="w-3.5 h-3.5" />} onClick={() => openPasswordModal(person)}>Mot de passe</Button>
                <Button variant="glass" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => openEdit(person)}>Modifier</Button>
                {!person.principal && <Button variant="ghost" size="sm" onClick={() => toggleActive(person)}>{person.actif ? 'Désactiver' : 'Activer'}</Button>}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPerson ? 'Modifier le personnel' : 'Ajouter une personne'}>
        <form onSubmit={savePerson} className="space-y-4">
          <input required value={nom} onChange={(event) => setNom(event.target.value)} placeholder="Nom complet" className="w-full glass-input px-4 py-3 rounded-xl" />
          <input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nom d’utilisateur" className="w-full glass-input px-4 py-3 rounded-xl" />
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Adresse email" className="w-full glass-input px-4 py-3 rounded-xl" />
          {!editingPerson && (
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                required
                type="text"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mot de passe (au moins 6 caractères)"
                className="w-full glass-input pl-10 pr-4 py-3 rounded-xl"
              />
            </div>
          )}
          <select value={role} disabled={editingPerson?.principal} onChange={(event) => setRole(event.target.value as PersonnelRole)} className="w-full glass-input px-4 py-3 rounded-xl text-slate-900 dark:text-white">
            <option value="caissier">Caissier - caisse et clients uniquement</option>
            <option value="gerant">Gérant - tableau de bord restreint</option>
            <option value="admin">Administrateur - accès complet</option>
          </select>
          <select required={role === 'gerant'} value={zoneId} disabled={editingPerson?.principal} onChange={(event) => setZoneId(event.target.value ? Number(event.target.value) : '')} className="w-full glass-input px-4 py-3 rounded-xl text-slate-900 dark:text-white">
            <option value="">-- Zone affectée au gérant --</option>
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom} ({zone.code})</option>)}
          </select>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button><Button type="submit" variant="primary">Enregistrer</Button></div>
        </form>
      </Modal>

      <Modal isOpen={!!passwordTarget} onClose={() => setPasswordTarget(null)} title={passwordTarget ? `Nouveau mot de passe — ${passwordTarget.nom}` : ''}>
        <form onSubmit={submitNewPassword} className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              required
              autoFocus
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Nouveau mot de passe (au moins 6 caractères)"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl"
            />
          </div>
          {passwordError && <p className="text-sm text-rose-500">{passwordError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setPasswordTarget(null)}>Annuler</Button>
            <Button type="submit" variant="primary" disabled={passwordSubmitting}>
              {passwordSubmitting ? 'Mise à jour...' : 'Mettre à jour'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
