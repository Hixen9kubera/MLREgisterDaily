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

  const [target, setTarget] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (goal.data?.target_amount != null) setTarget(String(goal.data.target_amount));
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

  if (!accountId) return <div className="text-slate-500">Cargando cuentas…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">Cuenta</div>
          <div className="text-lg font-semibold text-slate-900">{current?.label || current?.nickname}</div>
        </div>
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
      </div>

      <Card title="Objetivo de ventas — semana actual">
        {goal.isLoading ? (
          <div className="text-slate-500 text-sm">Cargando…</div>
        ) : (
          <>
            <div className="text-sm text-slate-500 mb-3">Semana del {goal.data?.week_start}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-slate-600">Monto objetivo (MXN)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                />
                <div className="text-xs text-slate-500 mt-1">{fmtMXN(Number(target || 0))}</div>
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Nota (opcional)</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                  placeholder="Ej. Buen Fin / temporada alta"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2 items-center">
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending || !Number(target)}
                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {save.isPending ? "Guardando…" : "Guardar objetivo"}
              </button>
              {save.isSuccess && <span className="text-emerald-600 text-sm">Guardado ✔</span>}
              {save.error && <span className="text-red-600 text-sm">{(save.error as Error).message}</span>}
            </div>
          </>
        )}
      </Card>

      <Card title="Histórico de objetivos">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Semana</th><th>Objetivo</th><th>Moneda</th><th>Nota</th></tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((g: any) => (
              <tr key={g.id} className="border-t border-slate-100">
                <td className="py-2">{g.week_start}</td>
                <td className="font-medium">{fmtMXN(Number(g.target_amount))}</td>
                <td>{g.currency}</td>
                <td className="text-slate-500">{g.note}</td>
              </tr>
            ))}
            {(list.data ?? []).length === 0 && (
              <tr><td colSpan={4} className="py-4 text-slate-400">Sin objetivos previos para esta cuenta.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
