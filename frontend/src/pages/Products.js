import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmtMXN } from "../lib/api";
import { Card } from "../components/Card";
import { AccountPicker } from "../components/AccountPicker";
import { useAccount } from "../lib/useAccount";
export default function Products() {
    const { accountId, setAccountId, accounts } = useAccount();
    const [q, setQ] = useState("");
    const [page, setPage] = useState(0);
    const [filterByAccount, setFilterByAccount] = useState(true);
    const limit = 50;
    const effectiveAccountId = filterByAccount ? accountId : "";
    const products = useQuery({
        queryKey: ["products", effectiveAccountId, q, page],
        queryFn: () => api.products({
            account_id: effectiveAccountId || undefined,
            q: q || undefined,
            limit,
            offset: page * limit,
        }),
        enabled: !filterByAccount || !!accountId,
    });
    const changesToday = useQuery({
        queryKey: ["with-changes", "today", effectiveAccountId],
        queryFn: () => api.productsWithChanges("today", effectiveAccountId || undefined, 10),
        enabled: !filterByAccount || !!accountId,
    });
    const changesWeek = useQuery({
        queryKey: ["with-changes", "week", effectiveAccountId],
        queryFn: () => api.productsWithChanges("week", effectiveAccountId || undefined, 10),
        enabled: !filterByAccount || !!accountId,
    });
    return (_jsxs("div", { className: "space-y-4", children: [_jsx(Card, { children: _jsxs("div", { className: "flex flex-wrap gap-3 items-center", children: [_jsx("input", { value: q, onChange: (e) => { setQ(e.target.value); setPage(0); }, placeholder: "Buscar por t\u00EDtulo, SKU o ID\u2026", className: "px-3 py-2 border border-slate-200 rounded-md text-sm w-72" }), _jsx(AccountPicker, { accounts: accounts, value: filterByAccount ? accountId : "", onChange: (id) => {
                                if (id === "") {
                                    setFilterByAccount(false);
                                }
                                else {
                                    setFilterByAccount(true);
                                    setAccountId(id);
                                }
                                setPage(0);
                            }, includeAll: true }), _jsxs("div", { className: "ml-auto text-sm text-slate-500", children: [products.data?.count ?? 0, " productos"] })] }) }), _jsx(ChangesSection, { title: "Productos con cambios hoy", data: changesToday.data?.items ?? [], loading: changesToday.isLoading }), _jsx(ChangesSection, { title: "Productos con cambios esta semana", data: changesWeek.data?.items ?? [], loading: changesWeek.isLoading }), _jsxs(Card, { title: "Listado", children: [_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Producto" }), _jsx("th", { children: "SKU" }), _jsx("th", { children: "Stock" }), _jsx("th", { children: "Vendidos" }), _jsx("th", { children: "Estado" }), _jsx("th", { className: "text-right", children: "Precio" })] }) }), _jsxs("tbody", { children: [(products.data?.items ?? []).map((p) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: _jsxs(Link, { to: `/productos/${p.ml_item_id}`, className: "text-indigo-600 hover:underline flex items-center gap-2", children: [p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-8 h-8 rounded object-cover" }), _jsx("span", { className: "truncate max-w-md", children: p.title })] }) }), _jsx("td", { className: "text-slate-600 text-xs font-mono", children: p.seller_sku || "—" }), _jsx("td", { children: p.available_quantity ?? 0 }), _jsx("td", { children: p.sold_quantity ?? 0 }), _jsx("td", { children: _jsx("span", { className: `px-2 py-0.5 rounded text-xs ${p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`, children: p.status }) }), _jsx("td", { className: "text-right font-medium", children: fmtMXN(Number(p.price)) })] }, `${p.account_id}-${p.ml_item_id}`))), !products.isLoading && products.data?.items.length === 0 && (_jsx("tr", { children: _jsx("td", { className: "py-6 text-center text-slate-400", colSpan: 6, children: "Sin productos para hoy. \u00BFYa corri\u00F3 el snapshot?" }) }))] })] }), _jsxs("div", { className: "flex justify-end gap-2 mt-3", children: [_jsx("button", { disabled: page === 0, onClick: () => setPage(p => Math.max(0, p - 1)), className: "px-3 py-1 text-sm border rounded disabled:opacity-40", children: "Anterior" }), _jsx("button", { onClick: () => setPage(p => p + 1), className: "px-3 py-1 text-sm border rounded", children: "Siguiente" })] })] })] }));
}
function ChangesSection({ title, data, loading }) {
    return (_jsx(Card, { title: title, children: loading ? (_jsx("div", { className: "text-slate-500 text-sm", children: "Cargando\u2026" })) : data.length === 0 ? (_jsx("div", { className: "text-slate-400 text-sm", children: "Sin cambios detectados en el periodo." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Producto" }), _jsx("th", { children: "SKU" }), _jsx("th", { children: "Cambios" }), _jsx("th", { children: "Campos" }), _jsx("th", { children: "\u00DAltimo" }), _jsx("th", { className: "text-right", children: "Precio" })] }) }), _jsx("tbody", { children: data.map((p) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: _jsxs(Link, { to: `/productos/${p.ml_item_id}`, className: "text-indigo-600 hover:underline flex items-center gap-2", children: [p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-8 h-8 rounded object-cover" }), _jsx("span", { className: "truncate max-w-xs", children: p.title })] }) }), _jsx("td", { className: "text-xs font-mono text-slate-600", children: p.seller_sku || "—" }), _jsx("td", { children: _jsx("span", { className: "px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs", children: p.changes_count }) }), _jsx("td", { className: "text-xs text-slate-600 truncate max-w-xs", children: (p.fields_changed ?? []).join(", ") }), _jsx("td", { className: "text-xs text-slate-500", children: p.last_change_date }), _jsx("td", { className: "text-right font-medium", children: fmtMXN(Number(p.price ?? 0)) })] }, p.ml_item_id))) })] }) })) }));
}
