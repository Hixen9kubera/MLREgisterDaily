const BASE = import.meta.env.VITE_API_URL ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}: ${text}`);
  }
  return r.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  summary: (account_id?: string, date_from?: string, date_to?: string) =>
    req<any>(`/dashboard/summary${qs({ account_id, date_from, date_to })}`),
  salesByDay: (params: { days?: number; account_id?: string; date_from?: string; date_to?: string } = {}) =>
    req<any[]>(`/dashboard/sales-by-day${qs({ days: params.days ?? 14, account_id: params.account_id, date_from: params.date_from, date_to: params.date_to })}`),
  topDays: (params: { account_id?: string; date_from?: string; date_to?: string; days?: number; limit?: number } = {}) =>
    req<any[]>(`/dashboard/top-days${qs({ account_id: params.account_id, date_from: params.date_from, date_to: params.date_to, days: params.days ?? 30, limit: params.limit ?? 7 })}`),
  topProducts: (params: { metric: "revenue" | "units" | "ticket" | "stock_value"; account_id?: string; date_from?: string; date_to?: string; limit?: number }) =>
    req<any[]>(`/dashboard/top-products${qs({ metric: params.metric, account_id: params.account_id, date_from: params.date_from, date_to: params.date_to, limit: params.limit ?? 10 })}`),
  inventorySummary: (account_id?: string) =>
    req<{ total_products: number; by_status: any[] }>(`/dashboard/inventory-summary${qs({ account_id })}`),
  lowStock: (params: { account_id?: string; threshold?: number; only_active?: boolean; limit?: number } = {}) =>
    req<any[]>(`/dashboard/low-stock${qs({ account_id: params.account_id, threshold: params.threshold ?? 10, only_active: params.only_active === false ? "false" : "true", limit: params.limit ?? 100 })}`),
  inactiveProducts: (params: { account_id?: string; days?: number; only_with_recent_changes?: boolean; limit?: number } = {}) =>
    req<{ days: number; total_inactive: number; total_potential_revenue: number; items: any[] }>(`/dashboard/inactive-products${qs({ account_id: params.account_id, days: params.days ?? 30, only_with_recent_changes: params.only_with_recent_changes ? "true" : "false", limit: params.limit ?? 50 })}`),
  agedProducts: (params: { account_id?: string; min_age_days?: number; no_sales_days?: number; limit?: number } = {}) =>
    req<{ min_age_days: number; no_sales_days: number; total: number; items: any[] }>(`/dashboard/aged-products${qs({ account_id: params.account_id, min_age_days: params.min_age_days ?? 180, no_sales_days: params.no_sales_days ?? 60, limit: params.limit ?? 50 })}`),
  topViews: (params: { account_id?: string; window?: "1d" | "7d" | "30d"; limit?: number } = {}) =>
    req<any[]>(`/dashboard/top-views${qs({ account_id: params.account_id, window: params.window ?? "30d", limit: params.limit ?? 10 })}`),
  accounts: () => req<any[]>("/accounts"),
  products: (params: { account_id?: string; q?: string; limit?: number; offset?: number } = {}) =>
    req<{ items: any[]; count: number }>(`/products${qs({ account_id: params.account_id, q: params.q, limit: params.limit ?? 50, offset: params.offset ?? 0 })}`),
  productsWithChanges: (range: "today" | "week", account_id?: string, limit = 20) =>
    req<{ start: string; end: string; items: any[] }>(`/products/with-changes${qs({ range, account_id, limit })}`),
  product: (id: string) => req<any>(`/products/${encodeURIComponent(id)}`),
  productChanges: (id: string, range: "week" | "month" = "week") =>
    req<any>(`/products/${encodeURIComponent(id)}/changes${qs({ range })}`),
  productSales: (id: string, days = 30) =>
    req<any>(`/products/${encodeURIComponent(id)}/sales${qs({ days })}`),
  goalCurrent: (account_id: string) => req<any>(`/goals/current${qs({ account_id })}`),
  goalsList: (account_id?: string) => req<any[]>(`/goals${qs({ account_id })}`),
  saveGoal: (account_id: string, target_amount: number, note?: string) =>
    req<any>("/goals/current", {
      method: "PUT",
      body: JSON.stringify({ account_id, target_amount, note }),
    }),
};

export const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

export const fmtDayShort = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const s = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric" }).format(d);
  return s.replace(".", "");
};
