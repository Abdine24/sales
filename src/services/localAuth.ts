import { db, Licence, Personnel, PersonnelRole } from '../db/db';

const SESSION_KEY = 'vente_personnel_session';

// Temporary local mode: keep the auth flow available but do not block app startup.
export const AUTH_REQUIRED = false;

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hashPassword = async (password: string, salt: string) => {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `${salt}:${toHex(new Uint8Array(digest))}`;
};

export const makePasswordHash = (password: string) => hashPassword(password, crypto.randomUUID());

export const generatePersonnelIdentifier = () => Array.from(crypto.getRandomValues(new Uint8Array(10)))
  .map((value) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[value % 32])
  .join('');

export const generateUniquePersonnelIdentifier = async () => {
  let identifiant = generatePersonnelIdentifier();
  while (await db.personnel.where('identifiant').equals(identifiant).count()) {
    identifiant = generatePersonnelIdentifier();
  }
  return identifiant;
};

const verifyPassword = async (password: string, storedHash: string) => {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = (await hashPassword(password, salt)).split(':')[1];
  return actual === expected;
};

export const getSessionId = () => {
  const value = sessionStorage.getItem(SESSION_KEY);
  return value ? Number(value) : null;
};

export const setSession = (id: number) => sessionStorage.setItem(SESSION_KEY, String(id));
export const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

export const authenticate = async (username: string, password: string) => {
  const personnel = await db.personnel.where('username').equals(username.trim().toLowerCase()).first();
  if (!personnel || !personnel.actif || !(await verifyPassword(password, personnel.password_hash))) return null;
  setSession(personnel.id!);
  return personnel;
};

export const createPrincipal = async (nom: string, username: string, password: string, cle: string) => {
  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await makePasswordHash(password);
  const personnel: Personnel = {
    identifiant: await generateUniquePersonnelIdentifier(),
    nom: nom.trim(),
    username: normalizedUsername,
    password_hash: passwordHash,
    role: 'admin',
    actif: true,
    principal: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.transaction('rw', db.personnel, db.licence, async () => {
    await db.personnel.add(personnel);
    const licence: Licence = { id: 'principale', cle: cle.trim(), activee_le: new Date().toISOString() };
    await db.licence.put(licence);
  });
  return authenticate(normalizedUsername, password);
};

export const hasPrincipal = async () => (await db.personnel.toArray()).some((personnel) => personnel.principal);
export const hasLicence = async () => Boolean(await db.licence.get('principale'));

export const canAccess = (personnel: Pick<Personnel, 'role'>, page: string) => {
  if (personnel.role === 'admin') return true;
  return ['dashboard', 'pos', 'clients'].includes(page);
};

export const roleLabel = (role: PersonnelRole) => role === 'admin' ? 'Administrateur' : 'Gérant';