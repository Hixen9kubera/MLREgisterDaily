type Account = { id: string; nickname: string; label?: string | null };

export function AccountPicker({
  accounts,
  value,
  onChange,
  includeAll = false,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  includeAll?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-slate-200 rounded-md text-sm bg-white"
    >
      {includeAll && <option value="">Todas las cuentas</option>}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label || a.nickname}
        </option>
      ))}
    </select>
  );
}
