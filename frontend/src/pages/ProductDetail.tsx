import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fmtMXN } from "../lib/api";
import { Card } from "../components/Card";

function fmtDayWithName(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short" }).format(d);
}

function fieldKind(name: string): { label: string; color: string; clean: string } {
  if (name.startsWith("attributes.")) return { label: "Atributo", color: "bg-violet-100 text-violet-700", clean: name.slice("attributes.".length) };
  if (name.startsWith("tags.")) return { label: "Tag", color: "bg-amber-100 text-amber-700", clean: name.slice("tags.".length) };
  if (name.startsWith("sub_status.")) return { label: "Sub-estado", color: "bg-rose-100 text-rose-700", clean: name.slice("sub_status.".length) };
  if (name.startsWith("variations[")) return { label: "Variante", color: "bg-blue-100 text-blue-700", clean: name };
  if (["price", "original_price"].includes(name)) return { label: "Precio", color: "bg-emerald-100 text-emerald-700", clean: name };
  if (["available_quantity", "sold_quantity"].includes(name)) return { label: "Stock/Vtas", color: "bg-sky-100 text-sky-700", clean: name };
  if (["pictures_count", "thumbnail"].includes(name)) return { label: "Imágenes", color: "bg-pink-100 text-pink-700", clean: name === "pictures_count" ? "cantidad de imágenes" : "imagen principal" };
  if (["visits_1d", "visits_7d", "visits_30d"].includes(name)) return { label: "Visitas", color: "bg-teal-100 text-teal-700", clean: name };
  if (["status", "free_shipping", "listing_type_id"].includes(name)) return { label: "Estado", color: "bg-orange-100 text-orange-700", clean: name };
  if (["title", "permalink", "warranty"].includes(name)) return { label: "Contenido", color: "bg-indigo-100 text-indigo-700", clean: name };
  return { label: "Campo", color: "bg-slate-100 text-slate-700", clean: name };
}

function isoMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}
function isoDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weeksOfMonth(monthDate: Date): { start: Date; end: Date }[] {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const out: { start: Date; end: Date }[] = [];
  let cursor = isoMonday(firstOfMonth);
  while (cursor <= lastOfMonth) {
    out.push({ start: new Date(cursor), end: addDays(cursor, 6) });
    cursor = addDays(cursor, 7);
  }
  return out;
}

function fmtShortMD(d: Date) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(d);
}

export default function ProductDetail() {
  const { id } = useParams();
  const [range, setRange] = useState<"week" | "month">("week");
  const [weekIndex, setWeekIndex] = useState<number>(0);

  const product = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id!) });
  const changes = useQuery({ queryKey: ["product-changes", id, range], queryFn: () => api.productChanges(id!, range) });
  const sales = useQuery({ queryKey: ["product-sales", id], queryFn: () => api.productSales(id!, 30) });

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
    const days: { iso: string; date: Date; changes: any[] }[] = [];
    if (!currentWeek) return days;
    for (let i = 0; i < 7; i++) {
      const d = addDays(currentWeek.start, i);
      const iso = isoDate(d);
      const items = all.filter((c: any) => c.snapshot_date === iso);
      days.push({ iso, date: d, changes: items });
    }
    return days;
  }, [changes.data, currentWeek]);

  if (product.isLoading) return <div className="text-slate-500">Cargando…</div>;
  if (product.error) return <div className="text-red-600">{(product.error as Error).message}</div>;
  const p = product.data!;

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <Link to="/productos" className="text-indigo-600 hover:underline">← Volver a productos</Link>
      </div>

      <Card>
        <div className="flex gap-4">
          {p.thumbnail && <img src={p.thumbnail} alt="" className="w-24 h-24 rounded object-cover" />}
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900">{p.title}</h1>
            <div className="text-sm text-slate-500 mt-1">
              {p.ml_item_id} · {p.status}
              {p.seller_sku ? <span className="font-mono"> · SKU {p.seller_sku}</span> : null}
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-slate-500 text-xs">Precio</div><div className="font-medium">{fmtMXN(Number(p.price))}</div></div>
              <div><div className="text-slate-500 text-xs">Stock</div><div className="font-medium">{p.available_quantity}</div></div>
              <div><div className="text-slate-500 text-xs">Vendidos (total)</div><div className="font-medium">{p.sold_quantity}</div></div>
              <div><div className="text-slate-500 text-xs">Listing</div><div className="font-medium">{p.listing_type_id}</div></div>
            </div>
            {p.permalink && (
              <a href={p.permalink} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-indigo-600 hover:underline">
                Ver en MercadoLibre ↗
              </a>
            )}
          </div>
        </div>
      </Card>

      <Card
        title={range === "week" ? "Cambios — esta semana (lun-dom)" : "Cambios — mes en curso (por semana lun-dom)"}
        action={
          <div className="flex gap-1">
            <button onClick={() => { setRange("week"); }} className={`px-2 py-1 text-xs rounded ${range === "week" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>Semana</button>
            <button onClick={() => { setRange("month"); setWeekIndex(0); }} className={`px-2 py-1 text-xs rounded ${range === "month" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>Mes</button>
          </div>
        }
      >
        {changes.isLoading ? (
          <div className="text-slate-500 text-sm">Cargando…</div>
        ) : (
          <div className="space-y-4">
            {changesByDay.map((d) => (
              <div key={d.iso} className="border border-slate-200 rounded-md">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800 capitalize">{fmtDayWithName(d.iso)}</div>
                  <div className="text-xs text-slate-500">
                    {d.changes.length === 0 ? "Sin cambios este día" : `${d.changes.length} cambio${d.changes.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                {d.changes.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-400 italic">No se realizó ningún cambio en este día.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr><th className="py-2 px-3">Tipo</th><th>Campo</th><th>Antes</th><th>Después</th></tr>
                      </thead>
                      <tbody>
                        {d.changes.map((c: any) => {
                          const k = fieldKind(c.field_name);
                          return (
                            <tr key={c.id} className="border-t border-slate-100">
                              <td className="py-2 px-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${k.color}`}>{k.label}</span>
                              </td>
                              <td className="font-mono text-xs">{k.clean}</td>
                              <td className="text-slate-500 line-through max-w-md truncate" title={c.old_value ?? ""}>{c.old_value ?? "—"}</td>
                              <td className="font-medium max-w-md truncate" title={c.new_value ?? ""}>{c.new_value ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {range === "month" && (
          <div className="mt-4 flex flex-wrap gap-2 items-center justify-center border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500 mr-2">Semana:</span>
            {monthWeeks.map((w, i) => (
              <button
                key={i}
                onClick={() => setWeekIndex(i)}
                className={`px-3 py-1 text-xs rounded-md border ${
                  i === weekIndex ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Sem {i + 1} ({fmtShortMD(w.start)}–{fmtShortMD(w.end)})
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Ventas (últimos 30 días) · ${sales.data?.units ?? 0} unidades · ${fmtMXN(Number(sales.data?.total ?? 0))}`}>
        {(sales.data?.items ?? []).length === 0 ? (
          <div className="text-slate-400 text-sm">Sin ventas registradas.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Fecha</th><th>Orden</th><th>Cant.</th><th className="text-right">Monto</th></tr>
            </thead>
            <tbody>
              {sales.data!.items.map((o: any) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="py-2">{new Date(o.sold_at).toLocaleString("es-MX")}</td>
                  <td className="font-mono text-xs">{o.ml_order_id}</td>
                  <td>{o.quantity}</td>
                  <td className="text-right font-medium">{fmtMXN(Number(o.total_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
