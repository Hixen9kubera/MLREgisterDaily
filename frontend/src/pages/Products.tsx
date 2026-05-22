import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmtMXN } from "../lib/api";
import { Card } from "../components/Card";
import { AccountPicker } from "../components/AccountPicker";
import { Pagination } from "../components/Pagination";
import { useAccount } from "../lib/useAccount";

const PAGE_SIZE = 10;

export default function Products() {
  const { accountId, setAccountId, accounts } = useAccount();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filterByAccount, setFilterByAccount] = useState(true);

  const effectiveAccountId = filterByAccount ? accountId : "";

  const products = useQuery({
    queryKey: ["products", effectiveAccountId, q, page],
    queryFn: () =>
      api.products({
        account_id: effectiveAccountId || undefined,
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
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

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar por título, SKU o ID…"
            className="px-3 py-2 border border-slate-200 rounded-md text-sm w-72"
          />
          <AccountPicker
            accounts={accounts}
            value={filterByAccount ? accountId : ""}
            onChange={(id) => {
              if (id === "") {
                setFilterByAccount(false);
              } else {
                setFilterByAccount(true);
                setAccountId(id);
              }
              setPage(1);
            }}
            includeAll
          />
          <div className="ml-auto text-sm text-slate-500">
            {products.data?.count ?? 0} productos
          </div>
        </div>
      </Card>

      <Card title="Listado">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Producto</th>
              <th>SKU</th>
              <th>Stock</th>
              <th>Vendidos</th>
              <th>Estado</th>
              <th className="text-right">Precio</th>
            </tr>
          </thead>
          <tbody>
            {(products.data?.items ?? []).map((p: any) => (
              <tr key={`${p.account_id}-${p.ml_item_id}`} className="border-t border-slate-100">
                <td className="py-2">
                  <Link to={`/productos/${p.ml_item_id}`} className="text-indigo-600 hover:underline flex items-center gap-2">
                    {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
                    <span className="truncate max-w-md">{p.title}</span>
                  </Link>
                </td>
                <td className="text-slate-600 text-xs font-mono">{p.seller_sku || "—"}</td>
                <td>{p.available_quantity ?? 0}</td>
                <td>{p.sold_quantity ?? 0}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="text-right font-medium">{fmtMXN(Number(p.price))}</td>
              </tr>
            ))}
            {!products.isLoading && products.data?.items.length === 0 && (
              <tr><td className="py-6 text-center text-slate-400" colSpan={6}>Sin productos para hoy. ¿Ya corrió el snapshot?</td></tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={products.data?.count ?? 0}
          onChange={setPage}
        />
      </Card>

      <ChangesSection title="Productos con cambios hoy" data={changesToday.data?.items ?? []} loading={changesToday.isLoading} />
      <ChangesSection title="Productos con cambios esta semana" data={changesWeek.data?.items ?? []} loading={changesWeek.isLoading} />
    </div>
  );
}

function ChangesSection({ title, data, loading }: { title: string; data: any[]; loading: boolean }) {
  return (
    <Card title={title}>
      {loading ? (
        <div className="text-slate-500 text-sm">Cargando…</div>
      ) : data.length === 0 ? (
        <div className="text-slate-400 text-sm">Sin cambios detectados en el periodo.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Producto</th>
                <th>SKU</th>
                <th>Cambios</th>
                <th>Campos</th>
                <th>Último</th>
                <th className="text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.ml_item_id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link to={`/productos/${p.ml_item_id}`} className="text-indigo-600 hover:underline flex items-center gap-2">
                      {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="truncate max-w-xs">{p.title}</span>
                    </Link>
                  </td>
                  <td className="text-xs font-mono text-slate-600">{p.seller_sku || "—"}</td>
                  <td><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs">{p.changes_count}</span></td>
                  <td className="text-xs text-slate-600 truncate max-w-xs">{(p.fields_changed ?? []).join(", ")}</td>
                  <td className="text-xs text-slate-500">{p.last_change_date}</td>
                  <td className="text-right font-medium">{fmtMXN(Number(p.price ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
