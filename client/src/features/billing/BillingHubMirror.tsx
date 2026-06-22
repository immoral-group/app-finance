import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { PeriodSelector } from '@/components/shared/PeriodSelector';
import { Download, Layers, Users, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface BillingHubMirrorProps {
    deptCode: string;
    deptLabel: string;
}

const fmt = (n: number) =>
    Math.round(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function BillingHubMirror({ deptCode, deptLabel }: BillingHubMirrorProps) {
    const [date, setDate] = useState(new Date());
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const { data, isLoading, isError } = useQuery({
        queryKey: ['billing-matrix', year, month],
        queryFn: () => adminApi.getMatrix(year, month),
        staleTime: 30_000,
    });

    const view = useMemo(() => {
        if (!data) return null;
        const cols: any[] = data.columns || [];
        const rows: any[] = data.rows || [];

        const target = deptLabel.toLowerCase();
        const deptCols = cols.filter(c => {
            const dn = (c.department?.name || '').toLowerCase();
            const dc = (c.department?.code || '').toLowerCase();
            return dn === target || dc === deptCode.toLowerCase();
        });

        if (deptCols.length === 0) return { cols: [], rows: [], totals: [], grand: 0 };

        const filteredRows = rows
            .map(r => {
                const services = deptCols.map(c => ({
                    col: c,
                    value: Number(r.services?.[c.id] || 0),
                }));
                const total = services.reduce((s, x) => s + x.value, 0);
                return { client_id: r.client_id, client_name: r.client_name, vertical: r.vertical, services, total };
            })
            .filter(r => r.total > 0)
            .sort((a, b) => b.total - a.total);

        const totals = deptCols.map((c, idx) =>
            filteredRows.reduce((s, r) => s + r.services[idx].value, 0)
        );
        const grand = totals.reduce((a, b) => a + b, 0);

        return { cols: deptCols, rows: filteredRows, totals, grand };
    }, [data, deptLabel, deptCode]);

    const handleExportCSV = () => {
        if (!view || view.rows.length === 0) return;
        const headers = ['#', 'Cliente', 'Vertical', ...view.cols.map(c => c.name), 'TOTAL'];
        const body = view.rows.map((r, i) => [
            i + 1, r.client_name, r.vertical || '',
            ...r.services.map(s => s.value),
            r.total
        ]);
        const totals = ['', 'TOTALES', '', ...view.totals, view.grand];
        const BOM = '﻿';
        const csv = BOM + [headers, ...body, totals]
            .map(row => row.map(c => {
                const s = String(c);
                return (s.includes(';') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(';'))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facturacion_${deptLabel}_${MONTH_NAMES[month - 1]}_${year}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exportado');
    };

    return (
        <div className="space-y-5 px-6 pb-8 pt-2">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                        <Receipt className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">
                            Detalle Facturación — <span className="text-indigo-600">{deptLabel}</span>
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Clientes y servicios facturados a este hub en {MONTH_NAMES[month - 1]} {year} · Solo lectura
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <PeriodSelector value={date} onChange={setDate} />
                    <Button
                        variant="outline"
                        className="gap-2 h-9 text-xs font-semibold"
                        onClick={handleExportCSV}
                        disabled={!view || view.rows.length === 0}
                    >
                        <Download size={14} />
                        Exportar CSV
                    </Button>
                </div>
            </div>

            {/* KPI cards */}
            {view && view.rows.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <KPI icon={<Users className="h-4 w-4" />} label="Clientes facturados" value={String(view.rows.length)} tone="indigo" />
                    <KPI icon={<Layers className="h-4 w-4" />} label="Servicios activos" value={String(view.cols.length)} tone="violet" />
                    <KPI icon={<Receipt className="h-4 w-4" />} label="Total facturación" value={`${fmt(view.grand)} €`} tone="emerald" />
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-border overflow-hidden shadow-sm bg-card">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="h-7 w-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin mx-auto mb-3" />
                        <p className="text-xs text-muted-foreground font-medium">Cargando facturación...</p>
                    </div>
                ) : isError ? (
                    <div className="p-10 text-center">
                        <p className="text-sm font-semibold text-red-600">Error al cargar los datos</p>
                    </div>
                ) : !view || view.cols.length === 0 ? (
                    <div className="p-12 text-center">
                        <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-foreground">No hay servicios definidos para {deptLabel}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Asigna servicios de este hub en el módulo de configuración para verlos aquí.
                        </p>
                    </div>
                ) : view.rows.length === 0 ? (
                    <div className="p-12 text-center">
                        <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-foreground">Sin facturación en este período</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ningún cliente tiene montos facturados a {deptLabel} en {MONTH_NAMES[month - 1]} {year}.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
                                    <th className="px-3 py-2.5 text-left font-bold text-indigo-900 tracking-wide w-10">#</th>
                                    <th className="px-3 py-2.5 text-left font-bold text-indigo-900 tracking-wide">Cliente</th>
                                    <th className="px-3 py-2.5 text-left font-bold text-indigo-900 tracking-wide hidden md:table-cell">Vertical</th>
                                    {view.cols.map(c => (
                                        <th key={c.id} className="px-3 py-2.5 text-right font-bold text-indigo-900 tracking-wide whitespace-nowrap">
                                            {c.name}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2.5 text-right font-bold text-indigo-900 tracking-wide bg-indigo-100">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.rows.map((r, idx) => (
                                    <tr key={r.client_id} className="border-b border-border/40 hover:bg-indigo-50/40 transition-colors">
                                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                                        <td className="px-3 py-2 font-semibold text-foreground">{r.client_name}</td>
                                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                                            {r.vertical && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                                                    {r.vertical}
                                                </span>
                                            )}
                                        </td>
                                        {r.services.map((s, i) => (
                                            <td key={i} className="px-3 py-2 text-right tabular-nums">
                                                {s.value > 0
                                                    ? <span className="font-medium text-foreground">{fmt(s.value)}</span>
                                                    : <span className="text-muted-foreground/40">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700 bg-indigo-50/60">
                                            {fmt(r.total)}
                                        </td>
                                    </tr>
                                ))}
                                {/* Totals row */}
                                <tr className="bg-gradient-to-r from-indigo-100 to-purple-100 border-t-2 border-indigo-300">
                                    <td className="px-3 py-2.5"></td>
                                    <td className="px-3 py-2.5 font-bold text-indigo-900 uppercase tracking-wider text-[11px]" colSpan={2}>
                                        Totales
                                    </td>
                                    {view.totals.map((t, i) => (
                                        <td key={i} className="px-3 py-2.5 text-right tabular-nums font-bold text-indigo-900">
                                            {fmt(t)}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-indigo-900 bg-indigo-200">
                                        {fmt(view.grand)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="text-[11px] text-muted-foreground italic px-1">
                💡 Vista espejo de Billing Matrix filtrada por hub. Para editar montos ve al módulo Billing Matrix.
            </p>
        </div>
    );
}

function KPI({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'indigo' | 'violet' | 'emerald' }) {
    const palette = {
        indigo: 'from-indigo-500 to-indigo-600 text-indigo-50',
        violet: 'from-violet-500 to-purple-600 text-violet-50',
        emerald: 'from-emerald-500 to-teal-600 text-emerald-50',
    }[tone];
    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${palette} flex items-center justify-center shadow-sm`}>
                {icon}
            </div>
            <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
                <div className="text-lg font-bold text-foreground tabular-nums">{value}</div>
            </div>
        </div>
    );
}
