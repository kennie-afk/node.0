import { useEffect, useState } from 'react';
import { listAccounts, listFunds, type Account, type Fund } from '../../../api/financeApi';
import { listGivingTypes, type GivingType } from '../../../api/givingApi';
import { listBankAccounts, type BankAccount } from '../../../api/bankingApi';
import { http } from '../../../api/http';

/**
 * Small reference lists (funds, chart of accounts, giving types, cash accounts) are needed by
 * almost every form. Each is fetched once per page load and shared; `invalidate` after an edit.
 * These are bounded by design (a church has tens of funds, a few hundred accounts), which is why
 * they are loaded whole while every transactional list is paged on the server.
 */
const cache = new Map<string, Promise<unknown>>();

export function invalidateLookups(...keys: string[]): void {
  if (keys.length === 0) cache.clear();
  for (const key of keys) cache.delete(key);
}

function useLookup<T>(key: string, fetcher: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | undefined; error: boolean }>({ data: undefined, error: false });
  useEffect(() => {
    let live = true;
    let promise = cache.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = fetcher();
      cache.set(key, promise);
      promise.catch(() => cache.delete(key));
    }
    promise.then((data) => live && setState({ data, error: false })).catch(() => live && setState({ data: undefined, error: true }));
    return () => {
      live = false;
    };
    // The fetcher is a stable module-level function per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data: state.data, loading: state.data === undefined && !state.error, error: state.error };
}

export const useFunds = () => useLookup<Fund[]>('funds', () => listFunds());
export const useAccounts = () => useLookup<Account[]>('accounts', () => listAccounts({ postable: true }));
export const useAllAccounts = () => useLookup<Account[]>('accounts-all', () => listAccounts({ includeInactive: true }));
export const useGivingTypes = () => useLookup<GivingType[]>('giving-types', () => listGivingTypes());
export const useBankAccounts = () => useLookup<BankAccount[]>('bank-accounts', () => listBankAccounts());
export interface MinistryRef {
  id: number;
  name: string;
}
export const useMinistries = () =>
  useLookup<MinistryRef[]>('ministries', async () => {
    const page = await http.get<{ data: MinistryRef[] }>('/ministries', { page: 1, pageSize: 100 });
    return page.data;
  });
