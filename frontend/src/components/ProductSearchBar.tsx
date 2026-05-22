import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fmtMXN } from "../lib/api";

export function ProductSearchBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const search = useQuery({
    queryKey: ["product-search-dashboard", debounced],
    queryFn: () => api.products({ q: debounced, limit: 8, offset: 0 }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const items = (search.data?.items ?? []) as any[];

  function go(item: any) {
    setOpen(false);
    setQ("");
    setDebounced("");
    navigate(`/productos/${encodeURIComponent(item.ml_item_id)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocused((f) => Math.min(items.length - 1, f + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocused((f) => Math.max(0, f - 1));
    } else if (e.key === "Enter") {
      const idx = focused >= 0 ? focused : 0;
      if (items[idx]) {
        e.preventDefault();
        go(items[idx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setFocused(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar producto por título, SKU o ID…"
        className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {search.isLoading ? (
            <div className="p-3 text-sm text-slate-400">Buscando…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-slate-400">Sin resultados para "{debounced}".</div>
          ) : (
            <ul>
              {items.map((p, i) => (
                <li
                  key={`${p.account_id}-${p.ml_item_id}`}
                  onMouseEnter={() => setFocused(i)}
                  onClick={() => go(p)}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-slate-100 last:border-0 ${
                    i === focused ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  {p.thumbnail && (
                    <img src={p.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-900 truncate">{p.title}</div>
                    <div className="text-xs text-slate-500 flex gap-2">
                      <span className="font-mono">{p.ml_item_id}</span>
                      {p.seller_sku && <span className="font-mono">· {p.seller_sku}</span>}
                      {p.status && (
                        <span className={`px-1.5 rounded ${
                          p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}>{p.status}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">{fmtMXN(Number(p.price || 0))}</div>
                </li>
              ))}
            </ul>
          )}
          {items.length >= 8 && (
            <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">
              Mostrando primeros 8. Refina la búsqueda para más precisión.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
