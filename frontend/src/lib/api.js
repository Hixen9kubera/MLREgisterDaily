const BASE = import.meta.env.VITE_API_URL ?? "";
async function req(path, init) {
    const r = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
        ...init,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText}: ${text}`);
    }
    return r.json();
}
function qs(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "")
            sp.set(k, String(v));
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
}
export const api = {
    summary: (account_id, date_from, date_to) => req(`/dashboard/summary${qs({ account_id, date_from, date_to })}`),
    salesByDay: (params = {}) => req(`/dashboard/sales-by-day${qs({ days: params.days ?? 14, account_id: params.account_id, date_from: params.date_from, date_to: params.date_to })}`),
    topDays: (params = {}) => req(`/dashboard/top-days${qs({ account_id: params.account_id, date_from: params.date_from, date_to: params.date_to, days: params.days ?? 30, limit: params.limit ?? 7 })}`),
    topProducts: (params) => req(`/dashboard/top-products${qs({ metric: params.metric, account_id: params.account_id, date_from: params.date_from, date_to: params.date_to, limit: params.limit ?? 10 })}`),
    inventorySummary: (account_id) => req(`/dashboard/inventory-summary${qs({ account_id })}`),
    lowStock: (params = {}) => req(`/dashboard/low-stock${qs({ account_id: params.account_id, threshold: params.threshold ?? 10, only_active: params.only_active === false ? "false" : "true", limit: params.limit ?? 100 })}`),
    inactiveProducts: (params = {}) => req(`/dashboard/inactive-products${qs({ account_id: params.account_id, days: params.days ?? 30, only_with_recent_changes: params.only_with_recent_changes ? "true" : "false", limit: params.limit ?? 50 })}`),
    agedProducts: (params = {}) => req(`/dashboard/aged-products${qs({ account_id: params.account_id, min_age_days: params.min_age_days ?? 180, no_sales_days: params.no_sales_days ?? 60, limit: params.limit ?? 50 })}`),
    topViews: (params = {}) => req(`/dashboard/top-views${qs({ account_id: params.account_id, window: params.window ?? "30d", limit: params.limit ?? 10 })}`),
    accounts: () => req("/accounts"),
    products: (params = {}) => req(`/products${qs({ account_id: params.account_id, q: params.q, limit: params.limit ?? 50, offset: params.offset ?? 0 })}`),
    productsWithChanges: (range, account_id, limit = 20) => req(`/products/with-changes${qs({ range, account_id, limit })}`),
    product: (id) => req(`/products/${encodeURIComponent(id)}`),
    productChanges: (id, range = "week") => req(`/products/${encodeURIComponent(id)}/changes${qs({ range })}`),
    productSales: (id, days = 30) => req(`/products/${encodeURIComponent(id)}/sales${qs({ days })}`),
    goalCurrent: (account_id) => req(`/goals/current${qs({ account_id })}`),
    goalsList: (account_id) => req(`/goals${qs({ account_id })}`),
    saveGoal: (account_id, target_amount, note) => req("/goals/current", {
        method: "PUT",
        body: JSON.stringify({ account_id, target_amount, note }),
    }),
};
export const fmtMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
export const fmtDayShort = (iso) => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime()))
        return iso;
    const s = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric" }).format(d);
    return s.replace(".", "");
};
