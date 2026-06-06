import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, IcexRow } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import { Plus, Trash2, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Construction, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_KEYS: (keyof IcexRow)[] = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function fmt(v: number) {
    return Math.round(v).toLocaleString('es-ES');
}

interface EditingCell { rowId: string; monthIdx: number; value: string }

export default function IcexBudget({ year }: { year: number }) {
    const { isSuperAdmin } = useAuth();
    const canEdit = isSuperAdmin();
    const queryClient = useQueryClient();

    const [open, setOpen] = useState(false);
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [newRowName, setNewRowName] = useState('');
    const [addingRow, setAddingRow] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['icex-budget', year],
        queryFn: () => adminApi.getIcexBudget(year),
        enabled: open,
        staleTime: 30_000,
    });

    const rows = data?.rows ?? [];
    const revenueRows = rows.filter(r => r.row_type === 'revenue');
    const expenseRows = rows.filter(r => r.row_type === 'expense');

    const saveMutation = useMutation({
        mutationFn: adminApi.saveIcexCell,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['icex-budget', year] }),
        onError: () => toast.error('Error al guardar'),
    });

    const addRowMutation = useMutation({
        mutationFn: adminApi.addIcexRow,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['icex-budget', year] });
            setNewRowName('');
            setAddingRow(false);
            toast.success('Fila añadida');
        },
        onError: (e: any) => toast.error(e?.message || 'Error al añadir fila'),
    });

    const deleteRowMutation = useMutation({
        mutationFn: adminApi.deleteIcexRow,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['icex-budget', year] });
            toast.success('Fila eliminada');
        },
        onError: () => toast.error('Error al eliminar fila'),
    });

    const startEdit = (row: IcexRow, monthIdx: number) => {
        if (!canEdit) return;
        const val = row[MONTH_KEYS[monthIdx]] as number;
        setEditingCell({ rowId: row.id, monthIdx, value: String(val || '') });
        setTimeout(() => inputRef.current?.select(), 30);
    };

    const commitEdit = () => {
        if (!editingCell) return;
        const numVal = parseFloat(editingCell.value.replace(',', '.')) || 0;
        saveMutation.mutate({ year, row_id: editingCell.rowId, month_idx: editingCell.monthIdx, value: numVal });
        setEditingCell(null);
    };

    const rowTotal = (row: IcexRow) =>
        MONTH_KEYS.reduce((s, k) => s + (Number(row[k]) || 0), 0);

    const sectionTotal = (section: IcexRow[]) =>
        MONTH_KEYS.map((_, i) =>
            section.reduce((s, r) => s + (Number(r[MONTH_KEYS[i]]) || 0), 0)
        );

    const revTotals = sectionTotal(revenueRows);
    const expTotals = sectionTotal(expenseRows);
    const resultados = revTotals.map((v, i) => v - expTotals[i]);
    const totalRev = revTotals.reduce((a, b) => a + b, 0);
    const totalExp = expTotals.reduce((a, b) => a + b, 0);
    const totalRes = totalRev - totalExp;

    const renderCell = (row: IcexRow, mIdx: number) => {
        const val = Number(row[MONTH_KEYS[mIdx]]) || 0;
        const isEditing = editingCell?.rowId === row.id && editingCell.monthIdx === mIdx;

        if (isEditing) {
            return (
                <td key={mIdx} className="border-r border-border/50 p-0">
                    <input
                        ref={inputRef}
                        type="text"
                        value={editingCell.value}
                        onChange={e => setEditingCell(c => c ? { ...c, value: e.target.value } : null)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') setEditingCell(null);
                        }}
                        className="w-full h-full px-1.5 py-2 text-xs text-right tabular bg-primary/5 outline-none focus:bg-primary/10"
                        autoFocus
                    />
                </td>
            );
        }

        return (
            <td
                key={mIdx}
                onClick={() => startEdit(row, mIdx)}
                className={`border-r border-border/50 px-1.5 py-2 text-right text-xs tabular ${canEdit ? 'cursor-pointer hover:bg-muted/60' : ''} ${val === 0 ? 'text-muted-foreground/30' : 'text-foreground'}`}
            >
                {val ? fmt(val) : '—'}
            </td>
        );
    };

    return (
        <div className="rounded-2xl border border-sky-200 overflow-hidden">
            {/* Header / toggle */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-sky-50 hover:bg-sky-100/60 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-sky-100 flex items-center justify-center">
                        <span className="text-base">🏛️</span>
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-sky-900">ICEX</p>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                                <Construction size={9} />
                                En construcción
                            </span>
                        </div>
                        <p className="text-[11px] text-sky-600 mt-0.5">Seguimiento de campañas ICEX · {year}</p>
                    </div>
                    {!open && totalRev > 0 && (
                        <div className="ml-4 flex items-center gap-2">
                            <span className="text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                                Ingresos: {fmt(totalRev)} €
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${totalRes >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                Resultado: {totalRes >= 0 ? '+' : ''}{fmt(totalRes)} €
                            </span>
                        </div>
                    )}
                </div>
                {open ? <ChevronUp size={15} className="text-sky-500" /> : <ChevronDown size={15} className="text-sky-500" />}
            </button>

            {/* Body */}
            {open && (
                <div className="bg-card">
                    {/* Banner de aviso */}
                    <div className="flex items-start gap-3 px-5 py-3.5 bg-orange-50/80 border-b border-orange-100">
                        <AlertTriangle size={15} className="text-orange-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-orange-800 leading-relaxed">
                            <span className="font-bold">Módulo en construcción.</span>{' '}
                            Los datos mostrados pueden estar incompletos o pendientes de validación.
                            Antes de tomar decisiones basadas en esta información, por favor
                            <span className="font-semibold"> espera que finanzas e Immedia verifiquen y actualicen los datos</span>.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="p-10 text-center">
                            <div className="h-6 w-6 rounded-full border-2 border-sky-300 border-t-sky-600 animate-spin mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">Cargando...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs" style={{ minWidth: 1100 }}>
                                <thead>
                                    <tr className="bg-muted/40 border-b border-border">
                                        <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-48 sticky left-0 bg-muted/40">
                                            Concepto
                                        </th>
                                        {MONTHS.map(m => (
                                            <th key={m} className="text-right px-1.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-l border-border/50 min-w-[72px]">
                                                {m}
                                            </th>
                                        ))}
                                        <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-l border-border bg-muted/60 min-w-[88px]">
                                            Anual
                                        </th>
                                        {canEdit && <th className="w-8 border-l border-border/50" />}
                                    </tr>
                                </thead>

                                <tbody>
                                    {/* ── INGRESOS ── */}
                                    <tr className="bg-violet-50/60 border-b border-violet-100">
                                        <td colSpan={15} className="px-4 py-1.5">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp size={12} className="text-violet-500" />
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Ingresos</span>
                                            </div>
                                        </td>
                                    </tr>

                                    {revenueRows.map(row => (
                                        <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20 group">
                                            <td className="px-4 py-2 font-medium text-foreground sticky left-0 bg-card group-hover:bg-muted/20 border-r border-border/50">
                                                {row.item_name}
                                            </td>
                                            {MONTHS.map((_, mIdx) => renderCell(row, mIdx))}
                                            <td className="px-3 py-2 text-right font-semibold text-violet-700 tabular border-l border-border bg-violet-50/40">
                                                {fmt(rowTotal(row))}
                                            </td>
                                            {canEdit && (
                                                <td className="border-l border-border/50 text-center">
                                                    {!row.is_fixed && (
                                                        <button
                                                            onClick={() => deleteRowMutation.mutate(row.id)}
                                                            className="p-1 text-muted-foreground/30 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}

                                    {/* Totales ingresos */}
                                    <tr className="border-b border-violet-200 bg-violet-50">
                                        <td className="px-4 py-2 font-bold text-violet-800 sticky left-0 bg-violet-50 border-r border-violet-200 text-[11px] uppercase tracking-wide">
                                            Total Ingresos
                                        </td>
                                        {revTotals.map((v, i) => (
                                            <td key={i} className="px-1.5 py-2 text-right font-bold text-violet-800 tabular border-l border-violet-100">
                                                {v ? fmt(v) : <span className="text-violet-300">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-bold text-violet-900 tabular border-l border-violet-200 bg-violet-100">
                                            {fmt(totalRev)}
                                        </td>
                                        {canEdit && <td className="border-l border-violet-200" />}
                                    </tr>

                                    {/* Añadir fila ingresos */}
                                    {canEdit && (
                                        <tr className="border-b border-dashed border-violet-100 bg-white">
                                            <td colSpan={15} className="px-4 py-2">
                                                {addingRow ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            placeholder="Nombre de la fila..."
                                                            value={newRowName}
                                                            onChange={e => setNewRowName(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter' && newRowName.trim()) addRowMutation.mutate({ year, item_name: newRowName });
                                                                if (e.key === 'Escape') { setAddingRow(false); setNewRowName(''); }
                                                            }}
                                                            className="text-xs border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
                                                        />
                                                        <button
                                                            onClick={() => newRowName.trim() && addRowMutation.mutate({ year, item_name: newRowName })}
                                                            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg font-semibold"
                                                            disabled={addRowMutation.isPending}
                                                        >
                                                            Añadir
                                                        </button>
                                                        <button onClick={() => { setAddingRow(false); setNewRowName(''); }} className="text-xs text-muted-foreground hover:text-foreground">
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setAddingRow(true)}
                                                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
                                                    >
                                                        <Plus size={12} />
                                                        Añadir fila de ingreso
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )}

                                    <tr><td colSpan={15} className="py-2 bg-white border-b border-border/30" /></tr>

                                    {/* ── GASTOS ── */}
                                    <tr className="bg-orange-50/60 border-b border-orange-100">
                                        <td colSpan={15} className="px-4 py-1.5">
                                            <div className="flex items-center gap-2">
                                                <TrendingDown size={12} className="text-orange-500" />
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Gastos</span>
                                            </div>
                                        </td>
                                    </tr>

                                    {expenseRows.map(row => (
                                        <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20 group">
                                            <td className="px-4 py-2 font-medium text-foreground sticky left-0 bg-card group-hover:bg-muted/20 border-r border-border/50">
                                                {row.item_name}
                                            </td>
                                            {MONTHS.map((_, mIdx) => renderCell(row, mIdx))}
                                            <td className="px-3 py-2 text-right font-semibold text-orange-700 tabular border-l border-border bg-orange-50/40">
                                                {fmt(rowTotal(row))}
                                            </td>
                                            {canEdit && <td className="border-l border-border/50" />}
                                        </tr>
                                    ))}

                                    {/* Totales gastos */}
                                    <tr className="border-b border-orange-200 bg-orange-50">
                                        <td className="px-4 py-2 font-bold text-orange-800 sticky left-0 bg-orange-50 border-r border-orange-200 text-[11px] uppercase tracking-wide">
                                            Total Gastos
                                        </td>
                                        {expTotals.map((v, i) => (
                                            <td key={i} className="px-1.5 py-2 text-right font-bold text-orange-800 tabular border-l border-orange-100">
                                                {v ? fmt(v) : <span className="text-orange-300">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-bold text-orange-900 tabular border-l border-orange-200 bg-orange-100">
                                            {fmt(totalExp)}
                                        </td>
                                        {canEdit && <td className="border-l border-orange-200" />}
                                    </tr>

                                    <tr><td colSpan={15} className="py-2 bg-white border-b border-border/30" /></tr>

                                    {/* ── RESULTADO ── */}
                                    <tr className="border-b border-border">
                                        <td className={`px-4 py-3 font-bold text-sm sticky left-0 border-r border-border ${totalRes >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                                            Resultado Neto
                                        </td>
                                        {resultados.map((v, i) => (
                                            <td key={i} className={`px-1.5 py-3 text-right font-bold tabular text-sm border-l border-border/50 ${v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-600' : 'text-muted-foreground/40'}`}>
                                                {v !== 0 ? (v > 0 ? '+' : '') + fmt(v) : '—'}
                                            </td>
                                        ))}
                                        <td className={`px-3 py-3 text-right font-bold text-sm tabular border-l border-border ${totalRes >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                                            {totalRes > 0 ? '+' : ''}{fmt(totalRes)}
                                        </td>
                                        {canEdit && <td className={`border-l border-border ${totalRes >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`} />}
                                    </tr>

                                    {totalRev > 0 && (
                                        <tr className="border-b border-border/40 bg-muted/20">
                                            <td className="px-4 py-2 text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/20 border-r border-border/50">
                                                Margen %
                                            </td>
                                            {resultados.map((v, i) => {
                                                const pct = revTotals[i] > 0 ? (v / revTotals[i]) * 100 : 0;
                                                return (
                                                    <td key={i} className={`px-1.5 py-2 text-right text-xs font-medium tabular border-l border-border/30 ${pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-muted-foreground/30'}`}>
                                                        {revTotals[i] > 0 ? `${pct.toFixed(1)}%` : '—'}
                                                    </td>
                                                );
                                            })}
                                            <td className={`px-3 py-2 text-right text-xs font-bold tabular border-l border-border bg-muted/30 ${totalRev > 0 && totalRes >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {totalRev > 0 ? `${((totalRes / totalRev) * 100).toFixed(1)}%` : '—'}
                                            </td>
                                            {canEdit && <td className="border-l border-border/30 bg-muted/20" />}
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!canEdit && (
                        <p className="text-[11px] text-muted-foreground/60 px-4 py-2 border-t border-border/30">
                            Solo los superadmin pueden editar estos datos.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
