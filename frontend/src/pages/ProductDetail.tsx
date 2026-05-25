import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fmtMXN, hdImage } from "../lib/api";
import { Card } from "../components/Card";
import { Pagination } from "../components/Pagination";

const SALES_PAGE_SIZE = 10;
const COMP_PAGE_SIZE = 6;

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
  const [salesPage, setSalesPage] = useState(1);
  const [compPage, setCompPage] = useState(1);
  const [forceFetched, setForceFetched] = useState(false);

  const product = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id!) });
  const changes = useQuery({ queryKey: ["product-changes", id, range], queryFn: () => api.productChanges(id!, range) });
  const sales = useQuery({ queryKey: ["product-sales", id], queryFn: () => api.productSales(id!, 30) });

  // Auto-cargar cache si ya existe (sin disparar Apify)
  const cached = useQuery({
    queryKey: ["product-competition-cache", id],
    queryFn: async () => {
      try {
        return await api.competitionCache(id!);
      } catch (e: any) {
        if (String(e?.message || "").startsWith("404")) return null;
        throw e;
      }
    },
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
  });

  // Solo dispara Apify cuando el usuario da clic explícito
  const comparison = useQuery({
    queryKey: ["product-competition", id],
    queryFn: () => api.compareCompetition(id!),
    enabled: forceFetched && !!id,
    staleTime: 60 * 60 * 1000,
  });

  // Lista de competidores monitoreados para este producto
  const watched = useQuery({
    queryKey: ["watched", id],
    queryFn: () => api.listWatched(id!, false),
    enabled: !!id,
  });

  const hasResults = !!cached.data || !!comparison.data;
  const activeData = comparison.data || cached.data || null;
  const isLoading = comparison.isFetching;

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
        <div className="flex flex-col md:flex-row gap-6">
          {p.thumbnail && (
            <img
              src={hdImage(p.thumbnail)}
              alt=""
              loading="lazy"
              className="w-full md:w-48 h-48 md:h-48 rounded-lg object-cover bg-slate-50 flex-shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = p.thumbnail; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">{p.title}</h1>
            <div className="text-sm text-slate-500 mt-1">
              {p.ml_item_id} · {p.status}
              {p.seller_sku ? <span className="font-mono"> · SKU {p.seller_sku}</span> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-slate-500 text-xs">Precio</div><div className="font-medium text-lg">{fmtMXN(Number(p.price))}</div></div>
              <div><div className="text-slate-500 text-xs">Stock</div><div className="font-medium text-lg">{p.available_quantity}</div></div>
              <div><div className="text-slate-500 text-xs">Vendidos (total)</div><div className="font-medium text-lg">{p.sold_quantity}</div></div>
              <div><div className="text-slate-500 text-xs">Listing</div><div className="font-medium">{p.listing_type_id}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline">
                  Ver en MercadoLibre ↗
                </a>
              )}
              {!hasResults && (
                <button
                  onClick={() => setForceFetched(true)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isLoading ? "Buscando competencia…" : "Comparar con otros"}
                </button>
              )}
              {hasResults && !forceFetched && (
                <button
                  onClick={() => setForceFetched(true)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  title="Forzar nueva búsqueda en Apify (~30-60s)"
                >
                  {isLoading ? "Actualizando…" : "Actualizar comparativa"}
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {(hasResults || isLoading) && (
        <CompetitionCard
          ourMlItemId={id!}
          watchedIds={new Set((watched.data ?? []).filter((w: any) => w.is_active).map((w: any) => w.competitor_ml_id))}
          data={activeData}
          loading={isLoading && !activeData}
          error={comparison.error}
          page={compPage}
          setPage={setCompPage}
        />
      )}

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
        {(() => {
          const items = sales.data?.items ?? [];
          if (items.length === 0) return <div className="text-slate-400 text-sm">Sin ventas registradas.</div>;
          const totalPages = Math.max(1, Math.ceil(items.length / SALES_PAGE_SIZE));
          const safePage = Math.min(salesPage, totalPages);
          const slice = items.slice((safePage - 1) * SALES_PAGE_SIZE, safePage * SALES_PAGE_SIZE);
          return (
            <>
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr><th className="py-2">Fecha</th><th>Orden</th><th>Cant.</th><th className="text-right">Monto</th></tr>
                </thead>
                <tbody>
                  {slice.map((o: any) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="py-2">{new Date(o.sold_at).toLocaleString("es-MX")}</td>
                      <td className="font-mono text-xs">{o.ml_order_id}</td>
                      <td>{o.quantity}</td>
                      <td className="text-right font-medium">{fmtMXN(Number(o.total_amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={safePage} pageSize={SALES_PAGE_SIZE} total={items.length} onChange={setSalesPage} />
            </>
          );
        })()}
      </Card>
    </div>
  );
}

function CompetitionCard({ data, loading, error, page, setPage, ourMlItemId, watchedIds }: { data: any; loading: boolean; error: any; page: number; setPage: (n: number) => void; ourMlItemId: string; watchedIds: Set<string> }) {
  if (loading) {
    return (
      <Card title="Comparativa con competencia">
        <div className="text-slate-500 text-sm flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
          Buscando en MercadoLibre vía Apify… (esto toma ~30-60 segundos la primera vez)
        </div>
      </Card>
    );
  }
  if (error && !data) {
    return (
      <Card title="Comparativa con competencia">
        <div className="text-red-600 text-sm">Error: {(error as Error).message}</div>
      </Card>
    );
  }
  if (!data) return null;
  const items: any[] = data.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / COMP_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = items.slice((safePage - 1) * COMP_PAGE_SIZE, safePage * COMP_PAGE_SIZE);

  return (
    <Card title={`Comparativa con competencia · ${items.length} productos`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-slate-500">
        <div>
          Búsqueda: <span className="font-mono">"{data.keyword}"</span>
        </div>
        <div>
          {data.cached ? "Resultados en caché" : "Recién consultado"} · {new Date(data.fetched_at).toLocaleString("es-MX")}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-slate-400 text-sm">No se encontraron productos competidores.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slice.map((it: any, i: number) => (
              <CompetitionItem
                key={`${safePage}-${i}`}
                item={it}
                rank={(safePage - 1) * COMP_PAGE_SIZE + i + 1}
                ourMlItemId={ourMlItemId}
                isWatched={watchedIds.has(it.SKU)}
              />
            ))}
          </div>
          <Pagination page={safePage} pageSize={COMP_PAGE_SIZE} total={items.length} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function CompetitionItem({ item, rank, ourMlItemId, isWatched }: { item: any; rank: number; ourMlItemId: string; isWatched: boolean }) {
  const img = item.imgDireccion || item.thumbnail || item.image;
  const titulo = item.articuloTitulo || item.title || "Sin título";
  const precioActual = item.nuevoPrecio || item.price;
  const precioAntes = item.precioAnterior;
  const descuento = item.precioDiscount;
  const moneda = (item.Moneda || "MXN").replace("$", "").trim() || "MXN";
  const installments = item.installments;
  const vendedor = item.Vendedor;
  const marca = item.productoMarca;
  const url = item.zdireccion;
  const sku = item.SKU;

  const qc = useQueryClient();
  const watch = useMutation({
    mutationFn: () => api.watchCompetitor({
      our_ml_item_id: ourMlItemId,
      competitor_ml_id: sku,
      title: titulo,
      url,
      thumbnail: img,
      seller: vendedor,
      brand: marca,
      price: precioActual ? Number(precioActual) : null,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watched", ourMlItemId] }),
  });
  const unwatch = useMutation({
    mutationFn: () => api.unwatchCompetitor(ourMlItemId, sku, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watched", ourMlItemId] }),
  });
  const toggling = watch.isPending || unwatch.isPending;

  return (
    <div className={`flex flex-col border rounded-md overflow-hidden hover:shadow-md transition-shadow bg-white ${
      isWatched ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"
    }`}>
      <div className="relative bg-slate-50 aspect-square">
        {img ? (
          <img src={img} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">Sin imagen</div>
        )}
        <span className="absolute top-2 left-2 text-xs w-7 h-7 rounded-full flex items-center justify-center font-semibold bg-white/90 text-slate-700 shadow">
          {rank}
        </span>
        {isWatched && (
          <span className="absolute top-2 left-11 px-1.5 py-0.5 rounded bg-amber-400 text-white text-xs font-bold shadow flex items-center gap-0.5">★ Monitoreado</span>
        )}
        {descuento && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-rose-500 text-white text-xs font-semibold shadow">
            {descuento}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-slate-900 hover:text-indigo-600 line-clamp-2 min-h-[2.5rem]"
            title={titulo}
          >
            {titulo}
          </a>
        ) : (
          <div className="text-sm font-medium text-slate-900 line-clamp-2 min-h-[2.5rem]" title={titulo}>
            {titulo}
          </div>
        )}

        <div className="flex flex-col">
          <div className="text-xl font-bold text-emerald-700">
            {moneda} {precioActual ? Number(precioActual).toLocaleString("es-MX") : "—"}
          </div>
          {precioAntes && (
            <div className="text-xs line-through text-slate-400">
              antes: {moneda} {Number(precioAntes).toLocaleString("es-MX")}
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 leading-tight space-y-0.5">
          {vendedor && <div>Vendedor: <span className="font-medium text-slate-700">{vendedor}</span></div>}
          {marca && <div>Marca: {marca}</div>}
          {sku && <div className="font-mono truncate">{sku}</div>}
          {installments && <div className="text-emerald-700">{installments}</div>}
        </div>

        <div className="flex flex-wrap gap-1 text-xs">
          {item.Envio && <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">{item.Envio}</span>}
          {item.envioDesde && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{item.envioDesde}</span>}
          {item.highlight && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{item.highlight}</span>}
          {item.esCompraIternacional && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">Internacional</span>}
          {item.promociones && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{item.promociones}</span>}
        </div>

        <button
          onClick={() => isWatched ? unwatch.mutate() : watch.mutate()}
          disabled={toggling || !sku}
          className={`mt-auto w-full px-3 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 ${
            isWatched
              ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
              : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
          }`}
          title={!sku ? "Sin ID de competidor" : undefined}
        >
          {toggling ? "…" : isWatched ? "★ Dejar de monitorear" : "☆ Monitorear"}
        </button>
      </div>
    </div>
  );
}
