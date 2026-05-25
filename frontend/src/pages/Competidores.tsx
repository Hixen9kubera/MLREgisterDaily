import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmtMXN } from "../lib/api";
import { Card } from "../components/Card";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 10;

export default function Competidores() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [onlyActive, setOnlyActive] = useState(true);
  const watched = useQuery({
    queryKey: ["watched-global", onlyActive],
    queryFn: () => api.listWatched(undefined, onlyActive),
  });
  const unwatch = useMutation({
    mutationFn: (args: { our: string; comp: string }) => api.unwatchCompetitor(args.our, args.comp, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watched-global"] }),
  });

  const data = watched.data ?? [];
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = data.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card title={`Competidores monitoreados · ${data.length}`}>
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            Solo activos
          </label>
        </div>
        {watched.isLoading ? (
          <div className="text-slate-400 text-sm">Cargando…</div>
        ) : data.length === 0 ? (
          <div className="text-slate-400 text-sm">
            No tienes competidores monitoreados. Ve al detalle de un producto y agrega competidores desde "Comparar con otros".
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Competidor</th>
                    <th>Vendedor</th>
                    <th>Tu producto</th>
                    <th>Precio inicial</th>
                    <th>Precio actual</th>
                    <th>Δ %</th>
                    <th>Último check</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((w: any) => {
                    const init = Number(w.initial_price || 0);
                    const cur = Number(w.current_price || 0);
                    const delta = init ? ((cur - init) / init) * 100 : 0;
                    return (
                      <tr key={w.id} className="border-t border-slate-100">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            {w.thumbnail && <img src={w.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                            <div className="min-w-0">
                              <a href={w.competitor_url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline line-clamp-1">{w.title}</a>
                              <div className="text-xs font-mono text-slate-500">{w.competitor_ml_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-xs">{w.seller || "—"}</td>
                        <td>
                          <Link to={`/productos/${w.our_ml_item_id}`} className="text-xs text-indigo-600 hover:underline font-mono">
                            {w.our_ml_item_id}
                          </Link>
                        </td>
                        <td className="text-xs">{fmtMXN(init)}</td>
                        <td className="font-semibold">{fmtMXN(cur)}</td>
                        <td className={`text-xs font-semibold ${delta < 0 ? "text-emerald-600" : delta > 0 ? "text-rose-600" : "text-slate-500"}`}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                        </td>
                        <td className="text-xs text-slate-500">
                          {w.last_checked_at ? new Date(w.last_checked_at).toLocaleString("es-MX") : "—"}
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            !w.is_active ? "bg-slate-100 text-slate-500" :
                            w.current_status === "active" ? "bg-emerald-100 text-emerald-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {!w.is_active ? "inactivo" : (w.current_status || "—")}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => unwatch.mutate({ our: w.our_ml_item_id, comp: w.competitor_ml_id })}
                            disabled={unwatch.isPending}
                            className="text-xs text-rose-600 hover:underline"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={safePage} pageSize={PAGE_SIZE} total={data.length} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
