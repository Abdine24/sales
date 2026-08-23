import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KeyRound, ShieldCheck, UserPlus, Users, Edit2, Copy } from 'lucide-react';
import { db, Personnel as PersonnelRecord, PersonnelRole } from '../db/db';
import { generateUniquePersonnelIdentifier, makePasswordHash, roleLabel } from '../services/localAuth';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface PersonnelProps {
  currentUser: PersonnelRecord;
}

export const Personnel: React.FC<PersonnelProps> = ({ currentUser }) => {
  const personnel = useLiveQuery(
    async () => (await db.personnel.toArray()).sort((first, second) => first.nom.localeCompare(second.nom)),
    []
  ) || [];
  const zones = useLiveQuery(() => db.zones.toArray(), []) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonnelRecord | null>(null);
  const [nom, setNom] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PersonnelRole>('gerant');
  const [zoneId, setZoneId] = useState<number | ''>('');
  const [error, setError] = useState('');

  const openCreate = () => {
    setEditingPerson(null);
    setNom('');
    setUsername('');
    setPassword('');
    setRole('gerant');
    setZoneId(zones.length === 1 ? zones[0].id || '' : '');
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (person: PersonnelRecord) => {
    setEditingPerson(person);
    setNom(person.nom);
    setUsername(person.username);
    setPassword('');
    setRole(person.role);
    setZoneId(person.zone_id || '');
    setError('');
    setIsModalOpen(true);
  };

  const savePerson = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedUsername = username.trim().toLowerCase();
    const duplicate = personnel.find((person) => person.username === normalizedUsername && person.id !== editingPerson?.id);
    if (duplicate) {
      setError('Ce nom d’utilisateur existe déjà.');
      return;
    }
    if (!editingPerson && password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
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
    if (editingPerson && password && !currentUser.principal && editingPerson.id !== currentUser.id) {
      setError('Seul l’administrateur principal peut changer le mot de passe d’un autre membre.');
      return;
    }

    const updated: PersonnelRecord = {
      ...(editingPerson || {}),
      identifiant: editingPerson?.identifiant || await generateUniquePersonnelIdentifier(),
      nom: nom.trim(),
      username: normalizedUsername,
      role: editingPerson?.principal ? 'admin' : role,
      actif: editingPerson?.actif ?? true,
      principal: editingPerson?.principal ?? false,
      zone_id: editingPerson?.principal ? null : (zoneId ? Number(zoneId) : null),
      created_at: editingPerson?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      password_hash: editingPerson?.password_hash || await makePasswordHash(password),
    };
    if (password) updated.password_hash = await makePasswordHash(password);
    if (updated.id) await db.personnel.put(updated);
    else await db.personnel.add(updated);
    setIsModalOpen(false);
  };

  const toggleActive = async (person: PersonnelRecord) => {
    if (person.principal) return;
    await db.personnel.update(person.id!, { actif: !person.actif, updated_at: new Date().toISOString() });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Gestion du personnel</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Ajoutez des comptes et limitez leurs actions selon leur rôle.</p>
        </div>
        <Button variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={openCreate}>Ajouter une personne</Button>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <div className="divide-y divide-slate-200/40 dark:divide-white/5">
          {personnel.map((person) => (
            <div key={person.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center"><Users className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{person.nom}</div>
                  <div className="text-xs text-slate-500">@{person.username}</div>
                  <div className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1"><Copy className="w-3 h-3" /> ID: {person.identifiant}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={person.role === 'admin' ? 'blue' : 'gray'}><ShieldCheck className="w-3 h-3" />{person.principal ? 'Admin principal' : roleLabel(person.role)}</Badge>
                <Badge variant={person.actif ? 'green' : 'red'}>{person.actif ? 'Actif' : 'Désactivé'}</Badge>
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
          <select value={role} disabled={editingPerson?.principal} onChange={(event) => setRole(event.target.value as PersonnelRole)} className="w-full glass-input px-4 py-3 rounded-xl text-slate-900 dark:text-white">
            <option value="gerant">Gérant - vue et actions limitées</option>
            <option value="admin">Administrateur - accès complet</option>
          </select>
          <select required={role === 'gerant'} value={zoneId} disabled={editingPerson?.principal} onChange={(event) => setZoneId(event.target.value ? Number(event.target.value) : '')} className="w-full glass-input px-4 py-3 rounded-xl text-slate-900 dark:text-white">
            <option value="">-- Zone affectée au gérant --</option>
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom} ({zone.code})</option>)}
          </select>
          <div className="relative"><KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input type="password" required={!editingPerson} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={editingPerson ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'} className="w-full glass-input pl-10 pr-4 py-3 rounded-xl" /></div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button><Button type="submit" variant="primary">Enregistrer</Button></div>
        </form>
      </Modal>
    </div>
  );
};