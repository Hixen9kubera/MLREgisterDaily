import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

const STORAGE_KEY = "kubera.account_id";

export function useAccount() {
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const [accountId, setAccountIdState] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || "");

  useEffect(() => {
    const list = accounts.data ?? [];
    if (list.length === 0) return;
    const exists = list.some((a: any) => a.id === accountId);
    if (!accountId || !exists) {
      const first = list[0].id;
      setAccountIdState(first);
      localStorage.setItem(STORAGE_KEY, first);
    }
  }, [accounts.data, accountId]);

  const setAccountId = (id: string) => {
    setAccountIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const current = (accounts.data ?? []).find((a: any) => a.id === accountId);
  return { accountId, setAccountId, accounts: accounts.data ?? [], current, loading: accounts.isLoading };
}
