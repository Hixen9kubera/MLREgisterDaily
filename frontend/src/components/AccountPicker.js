import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function AccountPicker({ accounts, value, onChange, includeAll = false, }) {
    return (_jsxs("select", { value: value, onChange: (e) => onChange(e.target.value), className: "px-3 py-2 border border-slate-200 rounded-md text-sm bg-white", children: [includeAll && _jsx("option", { value: "", children: "Todas las cuentas" }), accounts.map((a) => (_jsx("option", { value: a.id, children: a.label || a.nickname }, a.id)))] }));
}
