import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmtMXN, fmtDayShort } from "../lib/api";
import { Card, Stat } from "../components/Card";
import { AccountPicker } from "../components/AccountPicker";
import { Pagination } from "../components/Pagination";
import { useAccount } from "../lib/useAccount";

const PAGE_SIZE = 10;
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

function isoMonday(d: Date) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const todayIso = () => new Date().toISOString().slice(0, 10);

type Preset = "this-week" | "last-week" | "last-14" | "last-30" | "this-month" | "custom";

function presetRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
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
  if (preset === "last-14") return { from: addDays(today, -13), to: today };
  if (preset === "last-30") return { from: addDays(today, -29), to: today };
  if (preset === "this-month") {
    const first = new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10);
    return { from: first, to: today };
  }
  return { from: customFrom || today, to: customTo || today };
}

export default function Dashboard() {
  const { accountId, setAccountId, accounts, current } = useAccount();
  const enabled = !!accountId;

  const [preset, setPreset] = useState<Preset>("this-week");
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

  if (!enabled) return <div className="text-slate-500">Cargando cuentas…</div>;
  if (summary.isLoading) return <div className="text-slate-500">Cargando…</div>;
  if (summary.error) return <div className="text-red-600">{(summary.error as Error).message}</div>;

  const s = summary.data!;
  const target = Number(s.goal?.target_amount ?? 0);
  const total = Number(s.total ?? 0);
  const pct = Math.min(100, Math.round((s.progress ?? 0) * 100));
  const delta = s.delta_pct;

  const activeRow = inventorySum.data?.by_status?.find((b: any) => b.status === "active");
  const pausedRow = inventorySum.data?.by_status?.find((b: any) => b.status === "paused");
  const closedRow = inventorySum.data?.by_status?.find((b: any) => b.status === "closed");
  const inactiveValue = (pausedRow?.value ?? 0) + (closedRow?.value ?? 0);
  const inactiveCount = (pausedRow?.products ?? 0) + (closedRow?.products ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">Cuenta</div>
          <div className="text-lg font-semibold text-slate-900">{current?.label || current?.nickname}</div>
        </div>
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
      </div>

      <Card title="Periodo">
        <div className="flex flex-wrap gap-2 items-center">
          {([
            ["this-week", "Esta semana (lun-dom)"],
            ["last-week", "Semana pasada"],
            ["last-14", "Últimos 14 días"],
            ["last-30", "Últimos 30 días"],
            ["this-month", "Este mes"],
            ["custom", "Personalizado"],
          ] as [Preset, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPreset(k)}
              className={`px-3 py-1.5 rounded-md text-sm border ${
                preset === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-md text-sm" />
              <span className="text-slate-500 text-sm">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-md text-sm" />
            </div>
          )}
          <div className="ml-auto text-xs text-slate-500">Del {range.from} al {range.to}</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat
          label={isCurrentWeek ? "Vendido esta semana" : "Vendido en período"}
          value={fmtMXN(total)}
          sub={`${s.units ?? 0} unidades`}
        />
        <Stat
          label="Vs período anterior"
          value={delta == null ? "—" : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`}
          sub={`${fmtMXN(s.prev_total ?? 0)} en ${s.prev_range_start} → ${s.prev_range_end}`}
        />
        <Stat
          label="Objetivo semanal"
          value={isCurrentWeek ? fmtMXN(target) : "—"}
          sub={isCurrentWeek ? (target ? `Faltan ${fmtMXN(Math.max(0, target - total))}` : "Sin objetivo · ve a Objetivo") : "Solo para semana actual"}
        />
        <Stat
          label="Progreso del objetivo"
          value={isCurrentWeek ? `${pct}%` : "—"}
          sub={s.last_run ? `Último snapshot: ${new Date(s.last_run.started_at).toLocaleString("es-MX")}` : undefined}
        />
      </div>

      {isCurrentWeek && (
        <Card title="Progreso del objetivo semanal (lun-dom)">
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full ${pct >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-500">{fmtMXN(total)} de {fmtMXN(target)}</div>
        </Card>
      )}

      <Card title="Inventario (snapshot de hoy)">
        {inventorySum.isLoading ? <div className="text-slate-400 text-sm">Cargando…</div> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Activos" value={`${activeRow?.products ?? 0}`} sub={`${(activeRow?.units ?? 0).toLocaleString()} u. · ${fmtMXN(activeRow?.value ?? 0)}`} accent="emerald" />
            <MiniStat label="Pausados" value={`${pausedRow?.products ?? 0}`} sub={`${(pausedRow?.units ?? 0).toLocaleString()} u. · ${fmtMXN(pausedRow?.value ?? 0)}`} accent="amber" />
            <MiniStat label="Cerrados / otros" value={`${(closedRow?.products ?? 0) + (inventorySum.data?.by_status?.filter((b:any)=>!['active','paused','closed'].includes(b.status)).reduce((a:number,b:any)=>a+b.products,0) ?? 0)}`} sub={`${fmtMXN(closedRow?.value ?? 0)} cerrados`} accent="slate" />
            <MiniStat label="Inactivos (pausados+cerrados)" value={`${inactiveCount}`} sub={`Valor inmovilizado: ${fmtMXN(inactiveValue)}`} accent="rose" />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card title="Ventas por día">
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={series.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={fmtDayShort} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip labelFormatter={(label) => fmtDayShort(String(label))} formatter={(v: any) => fmtMXN(Number(v))} />
                  <Bar dataKey="total" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card title="Mejores días del período">
          {topDays.length === 0 ? <div className="text-slate-400 text-sm">Sin ventas en el período.</div> : (
            <ol className="space-y-2">
              {topDays.map((d, i) => (
                <li key={d.date} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <Rank n={i + 1} />
                    <div>
                      <div className="text-sm font-medium text-slate-900 capitalize">{fmtDayShort(d.date)}</div>
                      <div className="text-xs text-slate-500">{d.units} unidades</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{fmtMXN(d.total)}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopProductsCard
          title="Top 10 productos con más ventas"
          subtitle="Ingresos en el período"
          data={topRevenue.data ?? []}
          loading={topRevenue.isLoading}
          metric={(p) => fmtMXN(Number(p.revenue || 0))}
          secondary={(p) => `${p.units} u. vendidas · stock: ${p.current_stock ?? "—"}`}
        />
        <TopProductsCard
          title="Top 10 productos con mayor ticket"
          subtitle="Ticket promedio = ingresos / unidades"
          data={topTicket.data ?? []}
          loading={topTicket.isLoading}
          metric={(p) => fmtMXN(Number(p.ticket || 0))}
          secondary={(p) => `${p.units} u. · stock: ${p.current_stock ?? "—"} · total ${fmtMXN(Number(p.revenue || 0))}`}
        />
        <TopProductsCard
          title="Top 10 por valor de stock"
          subtitle="Si se vende todo el stock actual"
          data={topStock.data ?? []}
          loading={topStock.isLoading}
          metric={(p) => fmtMXN(Number(p.potential_revenue || 0))}
          secondary={(p) => `${p.current_stock} u. × ${fmtMXN(Number(p.current_price || 0))}`}
        />
      </div>

      <TopViewsSection accountId={accountId} />

      <LowStockSection accountId={accountId} />

      <InactiveProductsSection accountId={accountId} />

      <AgedProductsSection accountId={accountId} />
    </div>
  );
}

function Rank({ n }: { n: number }) {
  return (
    <span className={`text-xs w-6 h-6 rounded-full flex items-center justify-center font-semibold ${
      n === 1 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
    }`}>{n}</span>
  );
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: "emerald" | "amber" | "slate" | "rose" }) {
  const colors = {
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    slate: "border-slate-200 bg-slate-50",
    rose: "border-rose-200 bg-rose-50",
  }[accent];
  return (
    <div className={`rounded-md border ${colors} p-3`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function TopProductsCard({
  title, subtitle, data, loading, metric, secondary,
}: {
  title: string;
  subtitle: string;
  data: any[];
  loading: boolean;
  metric: (p: any) => string;
  secondary: (p: any) => string;
}) {
  return (
    <Card title={title}>
      <div className="text-xs text-slate-500 -mt-2 mb-3">{subtitle}</div>
      {loading ? <div className="text-slate-400 text-sm">Cargando…</div> :
       data.length === 0 ? <div className="text-slate-400 text-sm">Sin datos.</div> : (
        <ol className="space-y-2">
          {data.map((p: any, i: number) => (
            <li key={p.ml_item_id} className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0">
              <Rank n={i + 1} />
              {p.thumbnail && <img src={p.thumbnail} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <Link to={`/productos/${p.ml_item_id}`} className="block text-sm text-indigo-600 hover:underline truncate">{p.title || p.ml_item_id}</Link>
                <div className="text-xs text-slate-500 truncate">
                  {p.seller_sku ? <span className="font-mono">{p.seller_sku}</span> : null}
                  {p.seller_sku ? " · " : null}
                  {secondary(p)}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">{metric(p)}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function TopViewsSection({ accountId }: { accountId: string }) {
  const [window, setWindow] = useState<"1d" | "7d" | "30d">("30d");
  const q = useQuery({
    queryKey: ["top-views", accountId, window],
    queryFn: () => api.topViews({ account_id: accountId, window, limit: 10 }),
  });
  const data = q.data ?? [];
  const label = window === "1d" ? "hoy" : window === "7d" ? "últimos 7 días" : "últimos 30 días";
  return (
    <Card title={`Top 10 productos con más visitas únicas (${label})`}>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setWindow("1d")} className={`px-3 py-1 text-sm rounded-md border ${window === "1d" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>Hoy</button>
        <button onClick={() => setWindow("7d")} className={`px-3 py-1 text-sm rounded-md border ${window === "7d" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>7 días</button>
        <button onClick={() => setWindow("30d")} className={`px-3 py-1 text-sm rounded-md border ${window === "30d" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>30 días</button>
      </div>
      {q.isLoading ? <div className="text-slate-400 text-sm">Cargando…</div> :
       data.length === 0 ? <div className="text-slate-400 text-sm">Aún no hay datos de visitas. Se llenarán al correr el próximo snapshot.</div> : (
        <ol className="space-y-2">
          {data.map((p: any, i: number) => (
            <li key={p.ml_item_id} className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0">
              <Rank n={i + 1} />
              {p.thumbnail && <img src={p.thumbnail} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <Link to={`/productos/${p.ml_item_id}`} className="block text-sm text-indigo-600 hover:underline truncate">{p.title || p.ml_item_id}</Link>
                <div className="text-xs text-slate-500 truncate">
                  {p.seller_sku ? <span className="font-mono">{p.seller_sku} · </span> : null}
                  Stock: {p.available_quantity ?? "—"} · {fmtMXN(Number(p.price || 0))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">{(p.visits ?? 0).toLocaleString()} únicas</div>
                <div className="text-xs text-slate-500">{p.sold_quantity ?? 0} vendidos hist.</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function LowStockSection({ accountId }: { accountId: string }) {
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

  return (
    <Card title={`Alerta de stock bajo (< ${threshold} unidades, solo activos)`}>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-slate-600">Umbral:</label>
        <input type="number" min={1} max={100} value={threshold} onChange={(e) => { setThreshold(Number(e.target.value) || 10); setPage(1); }} className="w-20 px-2 py-1 border border-slate-200 rounded-md text-sm" />
        <div className="text-xs text-slate-500">{data.length} productos por debajo del umbral</div>
      </div>
      {q.isLoading ? <div className="text-slate-400 text-sm">Cargando…</div> :
       data.length === 0 ? <div className="text-slate-400 text-sm">Ninguno por debajo del umbral.</div> : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Producto</th><th>SKU</th><th>Stock</th><th>Precio</th><th>Vendidos hist.</th></tr>
            </thead>
            <tbody>
              {slice.map((p: any) => (
                <tr key={p.ml_item_id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link to={`/productos/${p.ml_item_id}`} className="text-indigo-600 hover:underline flex items-center gap-2">
                      {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="truncate max-w-md">{p.title}</span>
                    </Link>
                  </td>
                  <td className="text-xs font-mono text-slate-600">{p.seller_sku || "—"}</td>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-semibold ${p.available_quantity === 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{p.available_quantity}</span></td>
                  <td>{fmtMXN(Number(p.price || 0))}</td>
                  <td>{p.sold_quantity ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={safePage} pageSize={PAGE_SIZE} total={data.length} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function InactiveProductsSection({ accountId }: { accountId: string }) {
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

  return (
    <Card title="Productos activos sin ventas">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-xs text-slate-600">Sin ventas en los últimos:</label>
        <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }} className="px-2 py-1 border border-slate-200 rounded-md text-sm">
          <option value={7}>7 días</option>
          <option value={14}>14 días</option>
          <option value={30}>30 días</option>
          <option value={60}>60 días</option>
          <option value={90}>90 días</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => { setOnlyChanged(e.target.checked); setPage(1); }} />
          Solo los que tuvieron cambios recientes (sugerir nuevo cambio)
        </label>
        <div className="ml-auto text-xs text-slate-500">
          {total} productos · valor potencial total: {fmtMXN(q.data?.total_potential_revenue ?? 0)}
        </div>
      </div>
      {q.isLoading ? <div className="text-slate-400 text-sm">Cargando…</div> :
       items.length === 0 ? <div className="text-slate-400 text-sm">No hay productos sin ventas en este período.</div> : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Producto</th><th>SKU</th><th>Stock</th><th>Precio</th>
                <th className="text-right">Genera si se vende</th>
                <th>Cambios 7d</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((p: any) => (
                <tr key={p.ml_item_id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link to={`/productos/${p.ml_item_id}`} className="text-indigo-600 hover:underline flex items-center gap-2">
                      {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="truncate max-w-md">{p.title}</span>
                    </Link>
                  </td>
                  <td className="text-xs font-mono text-slate-600">{p.seller_sku || "—"}</td>
                  <td>{p.available_quantity ?? 0}</td>
                  <td>{fmtMXN(Number(p.price || 0))}</td>
                  <td className="text-right font-semibold">{fmtMXN(Number(p.potential_revenue || 0))}</td>
                  <td>
                    {p.changes_7d > 0 ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">{p.changes_7d}</span>
                    ) : <span className="text-slate-400 text-xs">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={safePage} pageSize={PAGE_SIZE} total={items.length} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function AgedProductsSection({ accountId }: { accountId: string }) {
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

  return (
    <Card title="Productos con antigüedad sin ventas">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-xs text-slate-600">Antigüedad mínima:</label>
        <select value={minAge} onChange={(e) => { setMinAge(Number(e.target.value)); setPage(1); }} className="px-2 py-1 border border-slate-200 rounded-md text-sm">
          <option value={15}>15 días</option>
          <option value={30}>30 días</option>
          <option value={60}>60 días</option>
          <option value={90}>90 días</option>
          <option value={180}>6 meses</option>
          <option value={365}>1 año</option>
          <option value={730}>2 años</option>
        </select>
        <label className="text-xs text-slate-600">Sin ventas en:</label>
        <select value={noSalesDays} onChange={(e) => { setNoSalesDays(Number(e.target.value)); setPage(1); }} className="px-2 py-1 border border-slate-200 rounded-md text-sm">
          <option value={15}>15 días</option>
          <option value={30}>30 días</option>
          <option value={60}>60 días</option>
          <option value={90}>90 días</option>
        </select>
        <div className="ml-auto text-xs text-slate-500">{total} productos</div>
      </div>
      {q.isLoading ? <div className="text-slate-400 text-sm">Cargando…</div> :
       items.length === 0 ? <div className="text-slate-400 text-sm">No hay productos con estos criterios.</div> : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Producto</th><th>SKU</th><th>Antigüedad</th><th>Stock</th><th>Precio</th><th className="text-right">Potencial</th></tr>
            </thead>
            <tbody>
              {slice.map((p: any) => (
                <tr key={p.ml_item_id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link to={`/productos/${p.ml_item_id}`} className="text-indigo-600 hover:underline flex items-center gap-2">
                      {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="truncate max-w-md">{p.title}</span>
                    </Link>
                  </td>
                  <td className="text-xs font-mono text-slate-600">{p.seller_sku || "—"}</td>
                  <td className="text-xs text-slate-500">{p.start_time ? new Date(p.start_time).toLocaleDateString("es-MX") : "—"}</td>
                  <td>{p.available_quantity ?? 0}</td>
                  <td>{fmtMXN(Number(p.price || 0))}</td>
                  <td className="text-right font-semibold">{fmtMXN(Number(p.potential_revenue || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={safePage} pageSize={PAGE_SIZE} total={items.length} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
