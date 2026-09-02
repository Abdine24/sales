import { db } from '../db/db';

// Version du format de sauvegarde — à incrémenter si la structure du JSON exporté change.
const BACKUP_FORMAT_VERSION = 1;

// Tables incluses dans la sauvegarde. `file_attente_sync` est volontairement exclue :
// c'est une file d'attente transitoire, pas une donnée métier à restaurer.
const BACKUP_TABLES = [
  'produits',
  'categories',
  'personnel',
  'licence',
  'zones',
  'settings',
  'clients',
  'fournisseurs',
  'ventes',
  'lignes_vente',
  'achats_stock',
  'ajustements_stock',
  'paniers_en_attente',
  'retours',
  'reglements',
] as const;

type BackupTableName = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: 'ivente-backup';
  version: number;
  exported_at: string;
  data: Partial<Record<BackupTableName, unknown[]>>;
}

// Construit la sauvegarde complète en mémoire (utilisé par l'export ET par les tests).
export const buildBackup = async (): Promise<BackupFile> => {
  const data: Partial<Record<BackupTableName, unknown[]>> = {};
  for (const table of BACKUP_TABLES) {
    data[table] = await db.table(table).toArray();
  }
  return {
    format: 'ivente-backup',
    version: BACKUP_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    data,
  };
};

// Déclenche le téléchargement d'un fichier .json contenant toute la base locale.
export const downloadBackup = async (): Promise<string> => {
  const backup = await buildBackup();
  const filename = `sauvegarde_ivente_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
};

export const parseBackupFile = async (file: File): Promise<BackupFile> => {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Le fichier sélectionné n'est pas un JSON valide.");
  }
  const backup = parsed as Partial<BackupFile>;
  if (!backup || backup.format !== 'ivente-backup' || typeof backup.data !== 'object' || !backup.data) {
    throw new Error("Ce fichier ne semble pas être une sauvegarde iVente Pro valide.");
  }
  return backup as BackupFile;
};

// Remplace intégralement le contenu des tables présentes dans la sauvegarde.
// Destructif : à n'appeler qu'après confirmation explicite de l'utilisateur.
export const restoreBackup = async (backup: BackupFile): Promise<void> => {
  const tablesToRestore = BACKUP_TABLES.filter((table) => Array.isArray(backup.data[table]));
  await db.transaction('rw', tablesToRestore.map((table) => db.table(table)), async () => {
    for (const table of tablesToRestore) {
      const rows = backup.data[table] as unknown[];
      await db.table(table).clear();
      if (rows.length > 0) {
        await db.table(table).bulkPut(rows);
      }
    }
  });
};
