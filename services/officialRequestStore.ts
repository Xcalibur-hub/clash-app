import AsyncStorage from '@react-native-async-storage/async-storage';
import { officialKey } from '../utils/officialRecovery';

// A failed request survives rerenders/restarts, but is never shared by accounts.
// Editing the submitted payload explicitly abandons the previous request key.
const storageKey = (account: string, room: string, operation: string) => `official-request:v1:${account}:${room}:${operation}`;
async function acquire(account: string, room: string, operation: string, payload: unknown): Promise<string> {
  const name = storageKey(account, room, operation), fingerprint = JSON.stringify(payload);
  const raw = await AsyncStorage.getItem(name);
  if (raw) {
    try { const old = JSON.parse(raw); if (old.fingerprint === fingerprint && typeof old.key === 'string') return old.key; } catch { /* invalid cache is replaced */ }
  }
  const key = officialKey();
  await AsyncStorage.setItem(name, JSON.stringify({ key, fingerprint }));
  return key;
}
export async function confirmOfficialRequest(account: string, room: string, operation: string, key: string): Promise<void> {
  const name = storageKey(account, room, operation), raw = await AsyncStorage.getItem(name);
  if (raw && JSON.parse(raw).key === key) await AsyncStorage.removeItem(name);
}

const locks=new Map<string,Promise<unknown>>();
export async function acquireOfficialRequest(account: string, room: string, operation: string, payload: unknown): Promise<string> {
  const name=storageKey(account,room,operation), previous=locks.get(name) ?? Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>acquire(account,room,operation,payload));
  locks.set(name,next);
  try { return await next; } finally { if(locks.get(name)===next) locks.delete(name); }
}
