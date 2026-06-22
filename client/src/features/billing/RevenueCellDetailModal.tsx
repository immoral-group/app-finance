import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { X, Receipt, TrendingUp, Users, Search } from 'lucide-react';
import { findHubService, buildColumnsByCode } from './hubBillingMap';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    year: number;
    monthIdx: number; // 0-11
    dept: string; // e.g. "Immedia"
    serviceName: string; // e.g. "Paid General"
    expectedTotal: number; // monto mostrado en la celda P&L Real
}

const fmt = (n: number) =>
    Math.round(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function RevenueCellDetailModal({
    isOpen, onClose, year, monthIdx, dept, serviceName, expectedTotal,
}: Props) {
    const month = monthIdx + 1;
    const enabled = isOpen;

    const mapping = useMemo(() => findHubService(dept, serviceName), [dept, serviceName]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['billing-matrix', year, month],
        queryFn: () => adminApi.getMatrix(year, month),
        enabled,
        staleTime: 30_000,
    });

    const view = useMemo(() => {
        if (!data || !mapping) return null;
        const cols: any[] = data.columns || [];
        const rows: any[] = data.rows || [];
        const colsByCode = buildColumnsByCode(cols);

        const items = rows
            .map(r => ({
                client_id: r.client_id,
                client_name: r.client_name,
                vertical: r.vertical,
                value: mapping.def.valueFor(r, colsByCode),
            }))
            .filter(i => i.value > 0)
            .sort((a, b) => b.value - a.value);

        const total = items.reduce((s, i) => s + i.value, 0);
        return { items, total };
    }, [data, mapping]);

    if (!isOpen) return null;

    const delta = view ? view.total - expectedTotal : 0;
    const deltaAbs = Math.abs(delta);
    const showDelta = view && Math.round(deltaAbs) >= 1;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-5 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                    >
                        <X size={16} />
                    </button>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-11 w-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                            <Receipt className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-white/70">
                                Detalle de facturación
                            </div>
                            <div className="text-lg font-bold leading-tight">{serviceName}</div>
                            <div className="text-xs text-white/80">
                                {dept} · {MONTH_NAMES[monthIdx]} {year}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        <MiniStat icon={<TrendingUp className="h-3.5 w-3.5" />} label="P&L Real" value={`${fmt(expectedTotal)} €`} />
                        <MiniStat icon={<Receipt className="h-3.5 w-3.5" />} label="Billing" value={view ? `${fmt(view.total)} €` : '—'} />
                        <MiniStat icon={<Users className="h-3.5 w-3.5" />} label="Clientes" value={view ? String(view.items.length) : '—'} />
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {!mapping ? (
                        <div className="py-10 text-center">
                            <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-foreground">Servicio no mapeado</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Solo hay detalle de clientes para servicios de Immedia, Imcontent, Immoralia e Imsales.
                            </p>
                        </div>
                    ) : isLoading ? (
                        <div className="py-10 text-center">
                            <div className="h-7 w-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin mx-auto mb-3" />
                            <p className="text-xs text-muted-foreground">Cargando facturación...</p>
                        </div>
                    ) : isError ? (
                        <div className="py-10 text-center">
                            <p className="text-sm font-semibold text-red-600">No se pudo cargar el detalle</p>
                        </div>
                    ) : !view || view.items.length === 0 ? (
                        <div className="py-10 text-center">
                            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-foreground">Sin clientes facturados</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Ningún cliente tiene este servicio en Billing Matrix para {MONTH_NAMES[monthIdx]} {year}.
                            </p>
                        </div>
                    ) : (
                        <>
                            {showDelta && (
                                <div className="mb-4 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                                    <span className="font-bold">⚠ Diferencia:</span>
                                    <span>
                                        Billing Matrix {delta > 0 ? 'supera' : 'queda por debajo de'} el P&L Real en{' '}
                                        <span className="font-bold">{fmt(deltaAbs)} €</span>.
                                    </span>
                                </div>
                            )}
                            <div className="rounded-xl border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-bold text-muted-foreground tracking-wide w-8">#</th>
                                            <th className="px-3 py-2 text-left font-bold text-muted-foreground tracking-wide">Cliente</th>
                                            <th className="px-3 py-2 text-right font-bold text-muted-foreground tracking-wide">Importe</th>
                                            <th className="px-3 py-2 text-right font-bold text-muted-foreground tracking-wide w-14">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {view.items.map((it, i) => {
                                            const pct = view.total > 0 ? (it.value / view.total) * 100 : 0;
                                            return (
                                                <tr key={it.client_id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                                                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                                                    <td className="px-3 py-2 font-semibold text-foreground">{it.client_name}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700">
                                                        {fmt(it.value)} €
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-[10px] text-muted-foreground">
                                                        {pct.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-gradient-to-r from-indigo-50 to-purple-50 border-t-2 border-indigo-200">
                                            <td colSpan={2} className="px-3 py-2.5 font-bold text-indigo-900 uppercase tracking-wider text-[11px]">
                                                Total
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-indigo-900">
                                                {fmt(view.total)} €
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-indigo-900">
                                                100%
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground italic">
                        💡 Datos espejo de Billing Matrix · solo lectura
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 border border-white/10">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-white/70">
                {icon}
                {label}
            </div>
            <div className="text-sm font-bold mt-0.5 tabular-nums">{value}</div>
        </div>
    );
}
