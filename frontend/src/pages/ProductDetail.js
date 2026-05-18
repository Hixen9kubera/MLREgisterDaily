import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fmtMXN } from "../lib/api";
import { Card } from "../components/Card";
function fmtDayWithName(iso) {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime()))
        return iso;
    return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short" }).format(d);
}
function fieldKind(name) {
    if (name.startsWith("attributes."))
        return { label: "Atributo", color: "bg-violet-100 text-violet-700", clean: name.slice("attributes.".length) };
    if (name.startsWith("tags."))
        return { label: "Tag", color: "bg-amber-100 text-amber-700", clean: name.slice("tags.".length) };
    if (name.startsWith("sub_status."))
        return { label: "Sub-estado", color: "bg-rose-100 text-rose-700", clean: name.slice("sub_status.".length) };
    if (name.startsWith("variations["))
        return { label: "Variante", color: "bg-blue-100 text-blue-700", clean: name };
    if (["price", "original_price"].includes(name))
        return { label: "Precio", color: "bg-emerald-100 text-emerald-700", clean: name };
    if (["available_quantity", "sold_quantity"].includes(name))
        return { label: "Stock/Vtas", color: "bg-sky-100 text-sky-700", clean: name };
    if (["status", "free_shipping", "listing_type_id"].includes(name))
        return { label: "Estado", color: "bg-orange-100 text-orange-700", clean: name };
    return { label: "Campo", color: "bg-slate-100 text-slate-700", clean: name };
}
function isoMonday(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x;
}
function isoDate(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function weeksOfMonth(monthDate) {
    const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const out = [];
    let cursor = isoMonday(firstOfMonth);
    while (cursor <= lastOfMonth) {
        out.push({ start: new Date(cursor), end: addDays(cursor, 6) });
        cursor = addDays(cursor, 7);
    }
    return out;
}
function fmtShortMD(d) {
    return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(d);
}
export default function ProductDetail() {
    const { id } = useParams();
    const [range, setRange] = useState("week");
    const [weekIndex, setWeekIndex] = useState(0);
    const product = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
    const changes = useQuery({ queryKey: ["product-changes", id, range], queryFn: () => api.productChanges(id, range) });
    const sales = useQuery({ queryKey: ["product-sales", id], queryFn: () => api.productSales(id, 30) });
    const monthWeeks = useMemo(() => weeksOfMonth(new Date()), []);
    const currentWeek = useMemo(() => {
        if (range === "week") {
            const mon = isoMonday(new Date());
            return { start: mon, end: addDays(mon, 6) };
        }
        return monthWeeks[weekIndex] ?? monthWeeks[0];
    }, [range, weekIndex, monthWeeks]);
    const changesByDay = useMemo(() => {
        const all = changes.data?.changes ?? [];
        const days = [];
        if (!currentWeek)
            return days;
        for (let i = 0; i < 7; i++) {
            const d = addDays(currentWeek.start, i);
            const iso = isoDate(d);
            const items = all.filter((c) => c.snapshot_date === iso);
            days.push({ iso, date: d, changes: items });
        }
        return days;
    }, [changes.data, currentWeek]);
    if (product.isLoading)
        return _jsx("div", { className: "text-slate-500", children: "Cargando\u2026" });
    if (product.error)
        return _jsx("div", { className: "text-red-600", children: product.error.message });
    const p = product.data;
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "text-sm", children: _jsx(Link, { to: "/productos", className: "text-indigo-600 hover:underline", children: "\u2190 Volver a productos" }) }), _jsx(Card, { children: _jsxs("div", { className: "flex gap-4", children: [p.thumbnail && _jsx("img", { src: p.thumbnail, alt: "", className: "w-24 h-24 rounded object-cover" }), _jsxs("div", { className: "flex-1", children: [_jsx("h1", { className: "text-lg font-semibold text-slate-900", children: p.title }), _jsxs("div", { className: "text-sm text-slate-500 mt-1", children: [p.ml_item_id, " \u00B7 ", p.status, p.seller_sku ? _jsxs("span", { className: "font-mono", children: [" \u00B7 SKU ", p.seller_sku] }) : null] }), _jsxs("div", { className: "mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-slate-500 text-xs", children: "Precio" }), _jsx("div", { className: "font-medium", children: fmtMXN(Number(p.price)) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-slate-500 text-xs", children: "Stock" }), _jsx("div", { className: "font-medium", children: p.available_quantity })] }), _jsxs("div", { children: [_jsx("div", { className: "text-slate-500 text-xs", children: "Vendidos (total)" }), _jsx("div", { className: "font-medium", children: p.sold_quantity })] }), _jsxs("div", { children: [_jsx("div", { className: "text-slate-500 text-xs", children: "Listing" }), _jsx("div", { className: "font-medium", children: p.listing_type_id })] })] }), p.permalink && (_jsx("a", { href: p.permalink, target: "_blank", rel: "noreferrer", className: "inline-block mt-3 text-sm text-indigo-600 hover:underline", children: "Ver en MercadoLibre \u2197" }))] })] }) }), _jsxs(Card, { title: range === "week" ? "Cambios — esta semana (lun-dom)" : "Cambios — mes en curso (por semana lun-dom)", action: _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: () => { setRange("week"); }, className: `px-2 py-1 text-xs rounded ${range === "week" ? "bg-slate-900 text-white" : "bg-slate-100"}`, children: "Semana" }), _jsx("button", { onClick: () => { setRange("month"); setWeekIndex(0); }, className: `px-2 py-1 text-xs rounded ${range === "month" ? "bg-slate-900 text-white" : "bg-slate-100"}`, children: "Mes" })] }), children: [changes.isLoading ? (_jsx("div", { className: "text-slate-500 text-sm", children: "Cargando\u2026" })) : (_jsx("div", { className: "space-y-4", children: changesByDay.map((d) => (_jsxs("div", { className: "border border-slate-200 rounded-md", children: [_jsxs("div", { className: "px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between", children: [_jsx("div", { className: "text-sm font-semibold text-slate-800 capitalize", children: fmtDayWithName(d.iso) }), _jsx("div", { className: "text-xs text-slate-500", children: d.changes.length === 0 ? "Sin cambios este día" : `${d.changes.length} cambio${d.changes.length === 1 ? "" : "s"}` })] }), d.changes.length === 0 ? (_jsx("div", { className: "px-3 py-3 text-sm text-slate-400 italic", children: "No se realiz\u00F3 ning\u00FAn cambio en este d\u00EDa." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2 px-3", children: "Tipo" }), _jsx("th", { children: "Campo" }), _jsx("th", { children: "Antes" }), _jsx("th", { children: "Despu\u00E9s" })] }) }), _jsx("tbody", { children: d.changes.map((c) => {
                                                    const k = fieldKind(c.field_name);
                                                    return (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2 px-3", children: _jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${k.color}`, children: k.label }) }), _jsx("td", { className: "font-mono text-xs", children: k.clean }), _jsx("td", { className: "text-slate-500 line-through max-w-md truncate", title: c.old_value ?? "", children: c.old_value ?? "—" }), _jsx("td", { className: "font-medium max-w-md truncate", title: c.new_value ?? "", children: c.new_value ?? "—" })] }, c.id));
                                                }) })] }) }))] }, d.iso))) })), range === "month" && (_jsxs("div", { className: "mt-4 flex flex-wrap gap-2 items-center justify-center border-t border-slate-100 pt-3", children: [_jsx("span", { className: "text-xs text-slate-500 mr-2", children: "Semana:" }), monthWeeks.map((w, i) => (_jsxs("button", { onClick: () => setWeekIndex(i), className: `px-3 py-1 text-xs rounded-md border ${i === weekIndex ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`, children: ["Sem ", i + 1, " (", fmtShortMD(w.start), "\u2013", fmtShortMD(w.end), ")"] }, i)))] }))] }), _jsx(Card, { title: `Ventas (últimos 30 días) · ${sales.data?.units ?? 0} unidades · ${fmtMXN(Number(sales.data?.total ?? 0))}`, children: (sales.data?.items ?? []).length === 0 ? (_jsx("div", { className: "text-slate-400 text-sm", children: "Sin ventas registradas." })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Fecha" }), _jsx("th", { children: "Orden" }), _jsx("th", { children: "Cant." }), _jsx("th", { className: "text-right", children: "Monto" })] }) }), _jsx("tbody", { children: sales.data.items.map((o) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: new Date(o.sold_at).toLocaleString("es-MX") }), _jsx("td", { className: "font-mono text-xs", children: o.ml_order_id }), _jsx("td", { children: o.quantity }), _jsx("td", { className: "text-right font-medium", children: fmtMXN(Number(o.total_amount)) })] }, o.id))) })] })) })] }));
}
