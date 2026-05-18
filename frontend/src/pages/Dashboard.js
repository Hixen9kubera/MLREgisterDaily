import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmtMXN, fmtDayShort } from "../lib/api";
import { Card, Stat } from "../components/Card";
import { AccountPicker } from "../components/AccountPicker";
import { Pagination } from "../components/Pagination";
import { useAccount } from "../lib/useAccount";
const PAGE_SIZE = 10;
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
function isoMonday(d) {
    const x = new Date(d);
    const dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x.toISOString().slice(0, 10);
}
function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
const todayIso = () => new Date().toISOString().slice(0, 10);
function presetRange(preset, customFrom, customTo) {
    const t = new Date();
    const today = todayIso();
    if (preset === "this-week") {
        const mon = isoMonday(t);
        return { from: mon, to: addDays(mon, 6) };
    }
    if (preset === "last-week") {
        const mon = isoMonday(t);
        return { from: addDays(mon, -7), to: addDays(mon, -1) };
    }
    if (preset === "last-14")
        return { from: addDays(today, -13), to: today };
    if (preset === "last-30")
        return { from: addDays(today, -29), to: today };
    if (preset === "this-month") {
        const first = new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10);
        return { from: first, to: today };
    }
    return { from: customFrom || today, to: customTo || today };
}
export default function Dashboard() {
    const { accountId, setAccountId, accounts, current } = useAccount();
    const enabled = !!accountId;
    const [preset, setPreset] = useState("this-week");
    const [customFrom, setCustomFrom] = useState(todayIso());
    const [customTo, setCustomTo] = useState(todayIso());
    const range = useMemo(() => presetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
    const isCurrentWeek = preset === "this-week";
    const summary = useQuery({
        queryKey: ["summary", accountId, range.from, range.to],
        queryFn: () => api.summary(accountId, range.from, range.to),
        enabled,
    });
    const series = useQuery({
        queryKey: ["sales-by-day", accountId, range.from, range.to],
        queryFn: () => api.salesByDay({ account_id: accountId, date_from: range.from, date_to: range.to }),
        enabled,
    });
    const topRevenue = useQuery({
        queryKey: ["top-products", "revenue", accountId, range.from, range.to],
        queryFn: () => api.topProducts({ metric: "revenue", account_id: accountId, date_from: range.from, date_to: range.to, limit: 10 }),
        enabled,
    });
    const topTicket = useQuery({
        queryKey: ["top-products", "ticket", accountId, range.from, range.to],
        queryFn: () => api.topProducts({ metric: "ticket", account_id: accountId, date_from: range.from, date_to: range.to, limit: 10 }),
        enabled,
    });
    const topStock = useQuery({
        queryKey: ["top-products", "stock_value", accountId],
        queryFn: () => api.topProducts({ metric: "stock_value", account_id: accountId, limit: 10 }),
        enabled,
    });
    const inventorySum = useQuery({
        queryKey: ["inventory-summary", accountId],
        queryFn: () => api.inventorySummary(accountId),
        enabled,
    });
    const topDays = useMemo(() => {
        const data = series.data ?? [];
        return [...data].sort((a, b) => b.total - a.total).slice(0, 7).filter(d => d.total > 0);
    }, [series.data]);
    if (!enabled)
        return _jsx("div", { className: "text-slate-500", children: "Cargando cuentas\u2026" });
    if (summary.isLoading)
        return _jsx("div", { className: "text-slate-500", children: "Cargando\u2026" });
    if (summary.error)
        return _jsx("div", { className: "text-red-600", children: summary.error.message });
    const s = summary.data;
    const target = Number(s.goal?.target_amount ?? 0);
    const total = Number(s.total ?? 0);
    const pct = Math.min(100, Math.round((s.progress ?? 0) * 100));
    const delta = s.delta_pct;
    const activeRow = inventorySum.data?.by_status?.find((b) => b.status === "active");
    const pausedRow = inventorySum.data?.by_status?.find((b) => b.status === "paused");
    const closedRow = inventorySum.data?.by_status?.find((b) => b.status === "closed");
    const inactiveValue = (pausedRow?.value ?? 0) + (closedRow?.value ?? 0);
    const inactiveCount = (pausedRow?.products ?? 0) + (closedRow?.products ?? 0);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Cuenta" }), _jsx("div", { className: "text-lg font-semibold text-slate-900", children: current?.label || current?.nickname })] }), _jsx(AccountPicker, { accounts: accounts, value: accountId, onChange: setAccountId })] }), _jsx(Card, { title: "Periodo", children: _jsxs("div", { className: "flex flex-wrap gap-2 items-center", children: [[
                            ["this-week", "Esta semana (lun-dom)"],
                            ["last-week", "Semana pasada"],
                            ["last-14", "Últimos 14 días"],
                            ["last-30", "Últimos 30 días"],
                            ["this-month", "Este mes"],
                            ["custom", "Personalizado"],
                        ].map(([k, label]) => (_jsx("button", { onClick: () => setPreset(k), className: `px-3 py-1.5 rounded-md text-sm border ${preset === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`, children: label }, k))), preset === "custom" && (_jsxs("div", { className: "flex items-center gap-2 ml-2", children: [_jsx("input", { type: "date", value: customFrom, onChange: (e) => setCustomFrom(e.target.value), className: "px-2 py-1 border border-slate-200 rounded-md text-sm" }), _jsx("span", { className: "text-slate-500 text-sm", children: "\u2192" }), _jsx("input", { type: "date", value: customTo, onChange: (e) => setCustomTo(e.target.value), className: "px-2 py-1 border border-slate-200 rounded-md text-sm" })] })), _jsxs("div", { className: "ml-auto text-xs text-slate-500", children: ["Del ", range.from, " al ", range.to] })] }) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [_jsx(Stat, { label: isCurrentWeek ? "Vendido esta semana" : "Vendido en período", value: fmtMXN(total), sub: `${s.units ?? 0} unidades` }), _jsx(Stat, { label: "Vs per\u00EDodo anterior", value: delta == null ? "—" : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`, sub: `${fmtMXN(s.prev_total ?? 0)} en ${s.prev_range_start} → ${s.prev_range_end}` }), _jsx(Stat, { label: "Objetivo semanal", value: isCurrentWeek ? fmtMXN(target) : "—", sub: isCurrentWeek ? (target ? `Faltan ${fmtMXN(Math.max(0, target - total))}` : "Sin objetivo · ve a Objetivo") : "Solo para semana actual" }), _jsx(Stat, { label: "Progreso del objetivo", value: isCurrentWeek ? `${pct}%` : "—", sub: s.last_run ? `Último snapshot: ${new Date(s.last_run.started_at).toLocaleString("es-MX")}` : undefined })] }), isCurrentWeek && (_jsxs(Card, { title: "Progreso del objetivo semanal (lun-dom)", children: [_jsx("div", { className: "w-full h-3 rounded-full bg-slate-100 overflow-hidden", children: _jsx("div", { className: `h-full ${pct >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`, style: { width: `${pct}%` } }) }), _jsxs("div", { className: "mt-2 text-xs text-slate-500", children: [fmtMXN(total), " de ", fmtMXN(target)] })] })), _jsx(Card, { title: "Inventario (snapshot de hoy)", children: inventorySum.isLoading ? _jsx("div", { className: "text-slate-400 text-sm", children: "Cargando\u2026" }) : (_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(MiniStat, { label: "Activos", value: `${activeRow?.products ?? 0}`, sub: `${(activeRow?.units ?? 0).toLocaleString()} u. · ${fmtMXN(activeRow?.value ?? 0)}`, accent: "emerald" }), _jsx(MiniStat, { label: "Pausados", value: `${pausedRow?.products ?? 0}`, sub: `${(pausedRow?.units ?? 0).toLocaleString()} u. · ${fmtMXN(pausedRow?.value ?? 0)}`, accent: "amber" }), _jsx(MiniStat, { label: "Cerrados / otros", value: `${(closedRow?.products ?? 0) + (inventorySum.data?.by_status?.filter((b) => !['active', 'paused', 'closed'].includes(b.status)).reduce((a, b) => a + b.products, 0) ?? 0)}`, sub: `${fmtMXN(closedRow?.value ?? 0)} cerrados`, accent: "slate" }), _jsx(MiniStat, { label: "Inactivos (pausados+cerrados)", value: `${inactiveCount}`, sub: `Valor inmovilizado: ${fmtMXN(inactiveValue)}`, accent: "rose" })] })) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [_jsx("div", { className: "lg:col-span-2", children: _jsx(Card, { title: "Ventas por d\u00EDa", children: _jsx("div", { style: { width: "100%", height: 280 }, children: _jsx(ResponsiveContainer, { children: _jsxs(BarChart, { data: series.data ?? [], children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "date", tickFormatter: fmtDayShort }), _jsx(YAxis, { tickFormatter: (v) => `$${(v / 1000).toFixed(0)}k` }), _jsx(Tooltip, { labelFormatter: (label) => fmtDayShort(String(label)), formatter: (v) => fmtMXN(Number(v)) }), _jsx(Bar, { dataKey: "total", fill: "#6366f1" })] }) }) }) }) }), _jsx(Card, { title: "Mejores d\u00EDas del per\u00EDodo", children: topDays.length === 0 ? _jsx("div", { className: "text-slate-400 text-sm", children: "Sin ventas en el per\u00EDodo." }) : (_jsx("ol", { className: "space-y-2", children: topDays.map((d, i) => (_jsxs("li", { className: "flex items-center justify-between border-b border-slate-100 pb-2 last:border-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Rank, { n: i + 1 }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium text-slate-900 capitalize", children: fmtDayShort(d.date) }), _jsxs("div", { className: "text-xs text-slate-500", children: [d.units, " unidades"] })] })] }), _jsx("div", { className: "text-sm font-semibold text-slate-900", children: fmtMXN(d.total) })] }, d.date))) })) })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [_jsx(TopProductsCard, { title: "Top 10 productos con m\u00E1s ventas", subtitle: "Ingresos en el per\u00EDodo", data: topRevenue.data ?? [], loading: topRevenue.isLoading, metric: (p) => fmtMXN(Number(p.revenue || 0)), secondary: (p) => `${p.units} u. vendidas · stock: ${p.current_stock ?? "—"}` }), _jsx(TopProductsCard, { title: "Top 10 productos con mayor ticket", subtitle: "Ticket promedio = ingresos / unidades", data: topTicket.data ?? [], loading: topTicket.isLoading, metric: (p) => fmtMXN(Number(p.ticket || 0)), secondary: (p) => `${p.units} u. · stock: ${p.current_stock ?? "—"} · total ${fmtMXN(Number(p.revenue || 0))}` }), _jsx(TopProductsCard, { title: "Top 10 por valor de stock", subtitle: "Si se vende todo el stock actual", data: topStock.data ?? [], loading: topStock.isLoading, metric: (p) => fmtMXN(Number(p.potential_revenue || 0)), secondary: (p) => `${p.current_stock} u. × ${fmtMXN(Number(p.current_price || 0))}` })] }), _jsx(TopViewsSection, { accountId: accountId }), _jsx(LowStockSection, { accountId: accountId }), _jsx(InactiveProductsSection, { accountId: accountId }), _jsx(AgedProductsSection, { accountId: accountId })] }));
}
function Rank({ n }) {
    return (_jsx("span", { className: `text-xs w-6 h-6 rounded-full flex items-center justify-center font-semibold ${n === 1 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`, children: n }));
}
function MiniStat({ label, value, sub, accent }) {
    const colors = {
        emerald: "border-emerald-200 bg-emerald-50",
        amber: "border-amber-200 bg-amber-50",
        slate: "border-slate-200 bg-slate-50",
        rose: "border-rose-200 bg-rose-50",
    }[accent];
    return (_jsxs("div", { className: `rounded-md border ${colors} p-3`, children: [_jsx("div", { className: "text-xs text-slate-600", children: label }), _jsx("div", { className: "text-xl font-semibold text-slate-900", children: value }), sub && _jsx("div", { className: "text-xs text-slate-500 mt-0.5", children: sub })] }));
}
function TopProductsCard({ title, subtitle, data, loading, metric, secondary, }) {
    return (_jsxs(Card, { title: title, children: [_jsx("div", { className: "text-xs text-slate-500 -mt-2 mb-3", children: subtitle }), loading ? _jsx("div", { className: "text-slate-400 text-sm", children: "Cargando\u2026" }) :
                data.length === 0 ? _jsx("div", { className: "text-slate-400 text-sm", children: "Sin datos." }) : (_jsx("ol", { className: "space-y-2", children: data.map((p, i) => (_jsxs("li", { className: "flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0", children: [_jsx(Rank, { n: i + 1 }), p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-9 h-9 rounded object-cover flex-shrink-0" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx(Link, { to: `/productos/${p.ml_item_id}`, className: "block text-sm text-indigo-600 hover:underline truncate", children: p.title || p.ml_item_id }), _jsxs("div", { className: "text-xs text-slate-500 truncate", children: [p.seller_sku ? _jsx("span", { className: "font-mono", children: p.seller_sku }) : null, p.seller_sku ? " · " : null, secondary(p)] })] }), _jsx("div", { className: "text-sm font-semibold text-slate-900 whitespace-nowrap", children: metric(p) })] }, p.ml_item_id))) }))] }));
}
function TopViewsSection({ accountId }) {
    const [window, setWindow] = useState("30d");
    const q = useQuery({
        queryKey: ["top-views", accountId, window],
        queryFn: () => api.topViews({ account_id: accountId, window, limit: 10 }),
    });
    const data = q.data ?? [];
    const label = window === "1d" ? "hoy" : window === "7d" ? "últimos 7 días" : "últimos 30 días";
    return (_jsxs(Card, { title: `Top 10 productos con más visitas únicas (${label})`, children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("button", { onClick: () => setWindow("1d"), className: `px-3 py-1 text-sm rounded-md border ${window === "1d" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`, children: "Hoy" }), _jsx("button", { onClick: () => setWindow("7d"), className: `px-3 py-1 text-sm rounded-md border ${window === "7d" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`, children: "7 d\u00EDas" }), _jsx("button", { onClick: () => setWindow("30d"), className: `px-3 py-1 text-sm rounded-md border ${window === "30d" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`, children: "30 d\u00EDas" })] }), q.isLoading ? _jsx("div", { className: "text-slate-400 text-sm", children: "Cargando\u2026" }) :
                data.length === 0 ? _jsx("div", { className: "text-slate-400 text-sm", children: "A\u00FAn no hay datos de visitas. Se llenar\u00E1n al correr el pr\u00F3ximo snapshot." }) : (_jsx("ol", { className: "space-y-2", children: data.map((p, i) => (_jsxs("li", { className: "flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0", children: [_jsx(Rank, { n: i + 1 }), p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-9 h-9 rounded object-cover flex-shrink-0" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx(Link, { to: `/productos/${p.ml_item_id}`, className: "block text-sm text-indigo-600 hover:underline truncate", children: p.title || p.ml_item_id }), _jsxs("div", { className: "text-xs text-slate-500 truncate", children: [p.seller_sku ? _jsxs("span", { className: "font-mono", children: [p.seller_sku, " \u00B7 "] }) : null, "Stock: ", p.available_quantity ?? "—", " \u00B7 ", fmtMXN(Number(p.price || 0))] })] }), _jsxs("div", { className: "text-right", children: [_jsxs("div", { className: "text-sm font-semibold text-slate-900 whitespace-nowrap", children: [(p.visits ?? 0).toLocaleString(), " \u00FAnicas"] }), _jsxs("div", { className: "text-xs text-slate-500", children: [p.sold_quantity ?? 0, " vendidos hist."] })] })] }, p.ml_item_id))) }))] }));
}
function LowStockSection({ accountId }) {
    const [threshold, setThreshold] = useState(10);
    const [page, setPage] = useState(1);
    const q = useQuery({
        queryKey: ["low-stock", accountId, threshold],
        queryFn: () => api.lowStock({ account_id: accountId, threshold, only_active: true, limit: 1000 }),
    });
    const data = q.data ?? [];
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = data.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return (_jsxs(Card, { title: `Alerta de stock bajo (< ${threshold} unidades, solo activos)`, children: [_jsxs("div", { className: "flex items-center gap-3 mb-3", children: [_jsx("label", { className: "text-xs text-slate-600", children: "Umbral:" }), _jsx("input", { type: "number", min: 1, max: 100, value: threshold, onChange: (e) => { setThreshold(Number(e.target.value) || 10); setPage(1); }, className: "w-20 px-2 py-1 border border-slate-200 rounded-md text-sm" }), _jsxs("div", { className: "text-xs text-slate-500", children: [data.length, " productos por debajo del umbral"] })] }), q.isLoading ? _jsx("div", { className: "text-slate-400 text-sm", children: "Cargando\u2026" }) :
                data.length === 0 ? _jsx("div", { className: "text-slate-400 text-sm", children: "Ninguno por debajo del umbral." }) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Producto" }), _jsx("th", { children: "SKU" }), _jsx("th", { children: "Stock" }), _jsx("th", { children: "Precio" }), _jsx("th", { children: "Vendidos hist." })] }) }), _jsx("tbody", { children: slice.map((p) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: _jsxs(Link, { to: `/productos/${p.ml_item_id}`, className: "text-indigo-600 hover:underline flex items-center gap-2", children: [p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-8 h-8 rounded object-cover" }), _jsx("span", { className: "truncate max-w-md", children: p.title })] }) }), _jsx("td", { className: "text-xs font-mono text-slate-600", children: p.seller_sku || "—" }), _jsx("td", { children: _jsx("span", { className: `px-2 py-0.5 rounded text-xs font-semibold ${p.available_quantity === 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`, children: p.available_quantity }) }), _jsx("td", { children: fmtMXN(Number(p.price || 0)) }), _jsx("td", { children: p.sold_quantity ?? 0 })] }, p.ml_item_id))) })] }) }), _jsx(Pagination, { page: safePage, pageSize: PAGE_SIZE, total: data.length, onChange: setPage })] }))] }));
}
function InactiveProductsSection({ accountId }) {
    const [days, setDays] = useState(30);
    const [onlyChanged, setOnlyChanged] = useState(false);
    const [page, setPage] = useState(1);
    const q = useQuery({
        queryKey: ["inactive-products", accountId, days, onlyChanged],
        queryFn: () => api.inactiveProducts({ account_id: accountId, days, only_with_recent_changes: onlyChanged, limit: 5000 }),
    });
    const items = q.data?.items ?? [];
    const total = q.data?.total_inactive ?? 0;
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return (_jsxs(Card, { title: "Productos activos sin ventas", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 mb-3", children: [_jsx("label", { className: "text-xs text-slate-600", children: "Sin ventas en los \u00FAltimos:" }), _jsxs("select", { value: days, onChange: (e) => { setDays(Number(e.target.value)); setPage(1); }, className: "px-2 py-1 border border-slate-200 rounded-md text-sm", children: [_jsx("option", { value: 7, children: "7 d\u00EDas" }), _jsx("option", { value: 14, children: "14 d\u00EDas" }), _jsx("option", { value: 30, children: "30 d\u00EDas" }), _jsx("option", { value: 60, children: "60 d\u00EDas" }), _jsx("option", { value: 90, children: "90 d\u00EDas" })] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-slate-600", children: [_jsx("input", { type: "checkbox", checked: onlyChanged, onChange: (e) => { setOnlyChanged(e.target.checked); setPage(1); } }), "Solo los que tuvieron cambios recientes (sugerir nuevo cambio)"] }), _jsxs("div", { className: "ml-auto text-xs text-slate-500", children: [total, " productos \u00B7 valor potencial total: ", fmtMXN(q.data?.total_potential_revenue ?? 0)] })] }), q.isLoading ? _jsx("div", { className: "text-slate-400 text-sm", children: "Cargando\u2026" }) :
                items.length === 0 ? _jsx("div", { className: "text-slate-400 text-sm", children: "No hay productos sin ventas en este per\u00EDodo." }) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Producto" }), _jsx("th", { children: "SKU" }), _jsx("th", { children: "Stock" }), _jsx("th", { children: "Precio" }), _jsx("th", { className: "text-right", children: "Genera si se vende" }), _jsx("th", { children: "Cambios 7d" })] }) }), _jsx("tbody", { children: slice.map((p) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: _jsxs(Link, { to: `/productos/${p.ml_item_id}`, className: "text-indigo-600 hover:underline flex items-center gap-2", children: [p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-8 h-8 rounded object-cover" }), _jsx("span", { className: "truncate max-w-md", children: p.title })] }) }), _jsx("td", { className: "text-xs font-mono text-slate-600", children: p.seller_sku || "—" }), _jsx("td", { children: p.available_quantity ?? 0 }), _jsx("td", { children: fmtMXN(Number(p.price || 0)) }), _jsx("td", { className: "text-right font-semibold", children: fmtMXN(Number(p.potential_revenue || 0)) }), _jsx("td", { children: p.changes_7d > 0 ? (_jsx("span", { className: "px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700", children: p.changes_7d })) : _jsx("span", { className: "text-slate-400 text-xs", children: "0" }) })] }, p.ml_item_id))) })] }) }), _jsx(Pagination, { page: safePage, pageSize: PAGE_SIZE, total: items.length, onChange: setPage })] }))] }));
}
function AgedProductsSection({ accountId }) {
    const [minAge, setMinAge] = useState(15);
    const [noSalesDays, setNoSalesDays] = useState(15);
    const [page, setPage] = useState(1);
    const q = useQuery({
        queryKey: ["aged-products", accountId, minAge, noSalesDays],
        queryFn: () => api.agedProducts({ account_id: accountId, min_age_days: minAge, no_sales_days: noSalesDays, limit: 5000 }),
    });
    const items = q.data?.items ?? [];
    const total = q.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return (_jsxs(Card, { title: "Productos con antig\u00FCedad sin ventas", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 mb-3", children: [_jsx("label", { className: "text-xs text-slate-600", children: "Antig\u00FCedad m\u00EDnima:" }), _jsxs("select", { value: minAge, onChange: (e) => { setMinAge(Number(e.target.value)); setPage(1); }, className: "px-2 py-1 border border-slate-200 rounded-md text-sm", children: [_jsx("option", { value: 15, children: "15 d\u00EDas" }), _jsx("option", { value: 30, children: "30 d\u00EDas" }), _jsx("option", { value: 60, children: "60 d\u00EDas" }), _jsx("option", { value: 90, children: "90 d\u00EDas" }), _jsx("option", { value: 180, children: "6 meses" }), _jsx("option", { value: 365, children: "1 a\u00F1o" }), _jsx("option", { value: 730, children: "2 a\u00F1os" })] }), _jsx("label", { className: "text-xs text-slate-600", children: "Sin ventas en:" }), _jsxs("select", { value: noSalesDays, onChange: (e) => { setNoSalesDays(Number(e.target.value)); setPage(1); }, className: "px-2 py-1 border border-slate-200 rounded-md text-sm", children: [_jsx("option", { value: 15, children: "15 d\u00EDas" }), _jsx("option", { value: 30, children: "30 d\u00EDas" }), _jsx("option", { value: 60, children: "60 d\u00EDas" }), _jsx("option", { value: 90, children: "90 d\u00EDas" })] }), _jsxs("div", { className: "ml-auto text-xs text-slate-500", children: [total, " productos"] })] }), q.isLoading ? _jsx("div", { className: "text-slate-400 text-sm", children: "Cargando\u2026" }) :
                items.length === 0 ? _jsx("div", { className: "text-slate-400 text-sm", children: "No hay productos con estos criterios." }) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Producto" }), _jsx("th", { children: "SKU" }), _jsx("th", { children: "Antig\u00FCedad" }), _jsx("th", { children: "Stock" }), _jsx("th", { children: "Precio" }), _jsx("th", { className: "text-right", children: "Potencial" })] }) }), _jsx("tbody", { children: slice.map((p) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: _jsxs(Link, { to: `/productos/${p.ml_item_id}`, className: "text-indigo-600 hover:underline flex items-center gap-2", children: [p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-8 h-8 rounded object-cover" }), _jsx("span", { className: "truncate max-w-md", children: p.title })] }) }), _jsx("td", { className: "text-xs font-mono text-slate-600", children: p.seller_sku || "—" }), _jsx("td", { className: "text-xs text-slate-500", children: p.start_time ? new Date(p.start_time).toLocaleDateString("es-MX") : "—" }), _jsx("td", { children: p.available_quantity ?? 0 }), _jsx("td", { children: fmtMXN(Number(p.price || 0)) }), _jsx("td", { className: "text-right font-semibold", children: fmtMXN(Number(p.potential_revenue || 0)) })] }, p.ml_item_id))) })] }) }), _jsx(Pagination, { page: safePage, pageSize: PAGE_SIZE, total: items.length, onChange: setPage })] }))] }));
}
