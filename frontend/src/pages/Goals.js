import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMXN } from "../lib/api";
import { Card } from "../components/Card";
import { AccountPicker } from "../components/AccountPicker";
import { useAccount } from "../lib/useAccount";
export default function Goals() {
    const qc = useQueryClient();
    const { accountId, setAccountId, accounts, current } = useAccount();
    const goal = useQuery({
        queryKey: ["goal-current", accountId],
        queryFn: () => api.goalCurrent(accountId),
        enabled: !!accountId,
    });
    const list = useQuery({
        queryKey: ["goals-list", accountId],
        queryFn: () => api.goalsList(accountId),
        enabled: !!accountId,
    });
    const [target, setTarget] = useState("");
    const [note, setNote] = useState("");
    useEffect(() => {
        if (goal.data?.target_amount != null)
            setTarget(String(goal.data.target_amount));
        setNote(goal.data?.note ?? "");
    }, [goal.data]);
    const save = useMutation({
        mutationFn: () => api.saveGoal(accountId, Number(target), note || undefined),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["goal-current", accountId] });
            qc.invalidateQueries({ queryKey: ["goals-list", accountId] });
            qc.invalidateQueries({ queryKey: ["summary", accountId] });
        },
    });
    if (!accountId)
        return _jsx("div", { className: "text-slate-500", children: "Cargando cuentas\u2026" });
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Cuenta" }), _jsx("div", { className: "text-lg font-semibold text-slate-900", children: current?.label || current?.nickname })] }), _jsx(AccountPicker, { accounts: accounts, value: accountId, onChange: setAccountId })] }), _jsx(Card, { title: "Objetivo de ventas \u2014 semana actual", children: goal.isLoading ? (_jsx("div", { className: "text-slate-500 text-sm", children: "Cargando\u2026" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-sm text-slate-500 mb-3", children: ["Semana del ", goal.data?.week_start] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "text-xs text-slate-600", children: "Monto objetivo (MXN)" }), _jsx("input", { type: "number", inputMode: "numeric", value: target, onChange: (e) => setTarget(e.target.value), className: "mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm" }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: fmtMXN(Number(target || 0)) })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "text-xs text-slate-600", children: "Nota (opcional)" }), _jsx("input", { value: note, onChange: (e) => setNote(e.target.value), className: "mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm", placeholder: "Ej. Buen Fin / temporada alta" })] })] }), _jsxs("div", { className: "mt-4 flex gap-2 items-center", children: [_jsx("button", { onClick: () => save.mutate(), disabled: save.isPending || !Number(target), className: "px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50", children: save.isPending ? "Guardando…" : "Guardar objetivo" }), save.isSuccess && _jsx("span", { className: "text-emerald-600 text-sm", children: "Guardado \u2714" }), save.error && _jsx("span", { className: "text-red-600 text-sm", children: save.error.message })] })] })) }), _jsx(Card, { title: "Hist\u00F3rico de objetivos", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "Semana" }), _jsx("th", { children: "Objetivo" }), _jsx("th", { children: "Moneda" }), _jsx("th", { children: "Nota" })] }) }), _jsxs("tbody", { children: [(list.data ?? []).map((g) => (_jsxs("tr", { className: "border-t border-slate-100", children: [_jsx("td", { className: "py-2", children: g.week_start }), _jsx("td", { className: "font-medium", children: fmtMXN(Number(g.target_amount)) }), _jsx("td", { children: g.currency }), _jsx("td", { className: "text-slate-500", children: g.note })] }, g.id))), (list.data ?? []).length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "py-4 text-slate-400", children: "Sin objetivos previos para esta cuenta." }) }))] })] }) })] }));
}
