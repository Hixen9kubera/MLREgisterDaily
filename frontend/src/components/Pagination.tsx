type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const window: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) window.push(i);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1 text-sm">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 py-1 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50"
      >
        ‹
      </button>
      {start > 1 && (
        <>
          <button onClick={() => onChange(1)} className="px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50">1</button>
          {start > 2 && <span className="px-2 text-slate-400">…</span>}
        </>
      )}
      {window.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-md border ${
            p === page ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 hover:bg-slate-50"
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-2 text-slate-400">…</span>}
          <button onClick={() => onChange(totalPages)} className="px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50">{totalPages}</button>
        </>
      )}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-1 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50"
      >
        ›
      </button>
      <span className="ml-3 text-xs text-slate-500">
        Página {page} de {totalPages} · {total} productos
      </span>
    </div>
  );
}
