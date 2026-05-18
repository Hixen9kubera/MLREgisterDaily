import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Card({ title, children, action }) {
    return (_jsxs("div", { className: "bg-white border border-slate-200 rounded-xl p-5 shadow-sm", children: [(title || action) && (_jsxs("div", { className: "flex items-center justify-between mb-3", children: [title && _jsx("h2", { className: "text-sm font-semibold text-slate-700", children: title }), action] })), children] }));
}
export function Stat({ label, value, sub }) {
    return (_jsxs(Card, { children: [_jsx("div", { className: "text-xs text-slate-500", children: label }), _jsx("div", { className: "text-2xl font-bold text-slate-900 mt-1", children: value }), sub && _jsx("div", { className: "text-xs text-slate-500 mt-1", children: sub })] }));
}
