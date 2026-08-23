import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Image, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { db, AppSettings, Zone } from '../db/db';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

export const Settings: React.FC = () => {
  const settings = useLiveQuery(() => db.settings.get('principale'), []) || { id: 'principale', nom_site: 'iVente Pro' };
  const zones = useLiveQuery(() => db.zones.toArray(), []) || [];
  const produits = useLiveQuery(() => db.produits.toArray(), []) || [];
  const personnel = useLiveQuery(() => db.personnel.toArray(), []) || [];
  const [nomSite, setNomSite] = useState('');
  const [slogan, setSlogan] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneNom, setZoneNom] = useState('');
  const [zoneCode, setZoneCode] = useState('');

  React.useEffect(() => {
    setNomSite(settings.nom_site);
    setSlogan(settings.slogan || '');
    setLogoUrl(settings.logo_url || '');
  }, [settings.nom_site, settings.slogan, settings.logo_url]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const updated: AppSettings = {
      id: 'principale',
      nom_site: nomSite.trim() || 'iVente Pro',
      slogan: slogan.trim(),
      logo_url: logoUrl.trim(),
    };
    await db.settings.put(updated);
    window.dispatchEvent(new Event('app-settings-updated'));
  };

  const openZone = (zone?: Zone) => {
    setEditingZone(zone || null);
    setZoneNom(zone?.nom || '');
    setZoneCode(zone?.code || '');
    setZoneModalOpen(true);
  };

  const saveZone = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = zoneCode.trim().toUpperCase();
    if (!zoneNom.trim() || !code) return;
    const duplicate = zones.some((zone) => zone.code === code && zone.id !== editingZone?.id);
    if (duplicate) return;
    if (editingZone?.id) await db.zones.put({ ...editingZone, nom: zoneNom.trim(), code });
    else await db.zones.add({ nom: zoneNom.trim(), code, actif: true });
    setZoneModalOpen(false);
  };

  const deleteZone = async (zone: Zone) => {
    const used = produits.some((produit) => produit.zone_id === zone.id) || personnel.some((person) => person.zone_id === zone.id);
    if (used) {
      alert('Cette zone est utilisée par des produits ou des membres du personnel.');
      return;
    }
    if (zone.id && confirm(`Supprimer ${zone.nom} ?`)) await db.zones.delete(zone.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Paramètres</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Identité de votre entreprise et organisation de vos magasins.</p>
      </div>

      <GlassCard>
        <div className="flex items-center gap-2 mb-5"><Building2 className="w-5 h-5 text-blue-500" /><h3 className="font-bold text-slate-900 dark:text-white">Identité du site</h3></div>
        <form onSubmit={saveSettings} className="grid md:grid-cols-2 gap-4">
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Nom du site</label><input value={nomSite} onChange={(event) => setNomSite(event.target.value)} className="w-full glass-input px-4 py-3 rounded-xl" placeholder="Nom de votre entreprise" /></div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Slogan de la boutique</label><input value={slogan} onChange={(event) => setSlogan(event.target.value)} className="w-full glass-input px-4 py-3 rounded-xl" placeholder="Votre slogan" /></div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">URL du logo</label><div className="relative"><Image className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} className="w-full glass-input pl-10 pr-4 py-3 rounded-xl" placeholder="https://.../logo.png" /></div></div>
          <div className="md:col-span-2 flex items-center gap-3"><Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />}>Enregistrer les paramètres</Button>{logoUrl && <img src={logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded-lg border border-slate-200" />}</div>
        </form>
      </GlassCard>

      <GlassCard className="p-0 overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10"><div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-500" /><div><h3 className="font-bold text-slate-900 dark:text-white">Magasins / Zones</h3><p className="text-xs text-slate-400">Chaque produit et chaque gérant peut être affecté à une zone.</p></div></div><Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => openZone()}>Ajouter une zone</Button></div>
        <div className="divide-y divide-slate-200/40 dark:divide-white/5">{zones.map((zone) => <div key={zone.id} className="p-4 flex items-center justify-between"><div><div className="font-bold text-slate-900 dark:text-white">{zone.nom}</div><div className="text-xs text-slate-400">{zone.code} · {produits.filter((produit) => produit.zone_id === zone.id).length} produit(s) · {personnel.filter((person) => person.zone_id === zone.id).length} personnel</div></div><div className="flex gap-2"><Button variant="glass" size="sm" onClick={() => openZone(zone)}>Modifier</Button><button onClick={() => deleteZone(zone)} className="p-2 rounded-xl glass-card text-rose-500" title="Supprimer"><Trash2 className="w-4 h-4" /></button></div></div>)}</div>
      </GlassCard>

      <Modal isOpen={zoneModalOpen} onClose={() => setZoneModalOpen(false)} title={editingZone ? 'Modifier la zone' : 'Ajouter une zone'}>
        <form onSubmit={saveZone} className="space-y-4"><input required value={zoneNom} onChange={(event) => setZoneNom(event.target.value)} placeholder="Nom du magasin" className="w-full glass-input px-4 py-3 rounded-xl" /><input required value={zoneCode} onChange={(event) => setZoneCode(event.target.value)} placeholder="Code : MAG-02" className="w-full glass-input px-4 py-3 rounded-xl" /><div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setZoneModalOpen(false)}>Annuler</Button><Button variant="primary" type="submit">Enregistrer</Button></div></form>
      </Modal>
    </div>
  );
};
