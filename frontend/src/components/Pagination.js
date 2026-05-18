import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
export function Pagination({ page, pageSize, total, onChange }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1)
        return null;
    const window = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++)
        window.push(i);
    return (_jsxs("div", { className: "mt-3 flex flex-wrap items-center justify-center gap-1 text-sm", children: [_jsx("button", { onClick: () => onChange(Math.max(1, page - 1)), disabled: page === 1, className: "px-3 py-1 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50", children: "\u2039" }), start > 1 && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => onChange(1), className: "px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50", children: "1" }), start > 2 && _jsx("span", { className: "px-2 text-slate-400", children: "\u2026" })] })), window.map((p) => (_jsx("button", { onClick: () => onChange(p), className: `px-3 py-1 rounded-md border ${p === page ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 hover:bg-slate-50"}`, children: p }, p))), end < totalPages && (_jsxs(_Fragment, { children: [end < totalPages - 1 && _jsx("span", { className: "px-2 text-slate-400", children: "\u2026" }), _jsx("button", { onClick: () => onChange(totalPages), className: "px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50", children: totalPages })] })), _jsx("button", { onClick: () => onChange(Math.min(totalPages, page + 1)), disabled: page === totalPages, className: "px-3 py-1 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50", children: "\u203A" }), _jsxs("span", { className: "ml-3 text-xs text-slate-500", children: ["P\u00E1gina ", page, " de ", totalPages, " \u00B7 ", total, " productos"] })] }));
}
