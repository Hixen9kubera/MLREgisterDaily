import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMXN } from "../lib/api";

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const boxRef = useRef<HTMLDivElement>(null);

  const unread = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: api.unreadCount,
    refetchInterval: 60_000,
  });
  const grouped = useQuery({
    queryKey: ["notifications-grouped"],
    queryFn: api.notificationsGrouped,
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });
  const markAll = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-grouped"] });
    },
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const count = unread.data?.count ?? 0;
  const groups = grouped.data ?? [];

  function toggleDate(d: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  function openNotif(n: any) {
    if (n.kind === "competitor_price_change") {
      const ourId = n.payload?.our_ml_item_id;
      if (ourId) {
        api.markNotificationRead(n.id).then(() => {
          qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
          qc.invalidateQueries({ queryKey: ["notifications-grouped"] });
        });
        setOpen(false);
        navigate(`/productos/${encodeURIComponent(ourId)}`);
      }
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-slate-100"
        aria-label="Notificaciones"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 rounded-lg shadow-xl z-40 max-h-[32rem] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Notificaciones</div>
            {count > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
              >
                Marcar todas leídas
              </button>
            )}
          </div>
          {grouped.isLoading ? (
            <div className="p-4 text-sm text-slate-400">Cargando…</div>
          ) : groups.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">Sin notificaciones.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groups.map((g: any) => {
                const isExpanded = expandedDates.has(g.date) || g.count === 1;
                return (
                  <div key={g.date}>
                    <button
                      onClick={() => toggleDate(g.date)}
                      className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-700">
                        {fmtRelDate(g.date)} · {g.count} cambio{g.count === 1 ? "" : "s"}
                      </span>
                      <span className="flex items-center gap-2">
                        {g.unread > 0 && (
                          <span className="px-1.5 rounded bg-rose-100 text-rose-700 font-semibold">{g.unread} sin leer</span>
                        )}
                        <span className="text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                      </span>
                    </button>
                    {isExpanded && (
                      <ul>
                        {g.items.map((n: any) => (
                          <li
                            key={n.id}
                            onClick={() => openNotif(n)}
                            className={`px-3 py-2 cursor-pointer flex items-start gap-2 ${
                              n.is_read ? "bg-white" : "bg-indigo-50/40"
                            } hover:bg-slate-50`}
                          >
                            {n.payload?.thumbnail && (
                              <img src={n.payload.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-slate-900 line-clamp-2">{n.payload?.title || "Producto"}</div>
                              <div className="text-xs mt-0.5">
                                <span className="line-through text-slate-400">{fmtMXN(Number(n.payload?.old_price || 0))}</span>
                                <span className="mx-1 text-slate-500">→</span>
                                <span className="font-semibold text-slate-900">{fmtMXN(Number(n.payload?.new_price || 0))}</span>
                                <span className={`ml-2 ${n.payload?.direction === "down" ? "text-emerald-600" : n.payload?.direction === "up" ? "text-rose-600" : "text-slate-500"}`}>
                                  {n.payload?.delta_pct != null ? `${n.payload.delta_pct > 0 ? "+" : ""}${n.payload.delta_pct}%` : ""}
                                </span>
                              </div>
                              {n.payload?.seller && (
                                <div className="text-xs text-slate-500 mt-0.5">{n.payload.seller}</div>
                              )}
                            </div>
                            {!n.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtRelDate(d: string): string {
  const today = new Date();
  const target = new Date(d + "T00:00:00");
  const diff = Math.floor((+new Date(today.toISOString().slice(0, 10) + "T00:00:00") - +target) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return `Hace ${diff} días`;
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" }).format(target);
}
