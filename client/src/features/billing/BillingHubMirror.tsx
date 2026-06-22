import { useMemo, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { ChevronLeft, ChevronRight, Download, FileText, Layers, Users, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HUB_SERVICES, HubKey, buildColumnsByCode } from './hubBillingMap';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface BillingHubMirrorProps {
    deptCode: string;
    deptLabel: string;
}

const fmt = (n: number) =>
    Math.round(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Mode = 'month' | 'annual';

export default function BillingHubMirror({ deptCode, deptLabel }: BillingHubMirrorProps) {
    const [mode, setMode] = useState<Mode>('month');
    const [date, setDate] = useState(new Date());
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const hub = (deptCode || '').toLowerCase() as HubKey;
    const services = HUB_SERVICES[hub];

    // Mes individual
    const monthQuery = useQuery({
        queryKey: ['billing-matrix', year, month],
        queryFn: () => adminApi.getMatrix(year, month),
        enabled: mode === 'month',
        staleTime: 30_000,
    });

    // Año completo: 12 fetches paralelos
    const annualQueries = useQueries({
        queries: Array.from({ length: 12 }, (_, i) => ({
            queryKey: ['billing-matrix', year, i + 1],
            queryFn: () => adminApi.getMatrix(year, i + 1),
            enabled: mode === 'annual',
            staleTime: 30_000,
        })),
    });

    const isLoading = mode === 'month'
        ? monthQuery.isLoading
        : annualQueries.some(q => q.isLoading);
    const isError = mode === 'month'
        ? monthQuery.isError
        : annualQueries.some(q => q.isError);

    const view = useMemo(() => {
        if (!services) return null;

        // Acumula cells[serviceIdx] por cliente agregando uno o varios meses
        const datasets = mode === 'month'
            ? (monthQuery.data ? [monthQuery.data] : [])
            : annualQueries.map(q => q.data).filter(Boolean);

        if (datasets.length === 0) return null;

        const clientAgg = new Map<string, { name: string; cells: number[] }>();

        datasets.forEach((d: any) => {
            const cols: any[] = d.columns || [];
            const rows: any[] = d.rows || [];
            const colsByCode = buildColumnsByCode(cols);
            rows.forEach(r => {
                const cells = services.map(svc => svc.valueFor(r, colsByCode));
                const has = cells.some(v => v > 0);
                if (!has) return;
                const cur = clientAgg.get(r.client_id) || {
                    name: r.client_name,
                    cells: services.map(() => 0),
                };
                cells.forEach((v, i) => { cur.cells[i] += v; });
                clientAgg.set(r.client_id, cur);
            });
        });

        const filteredRows = Array.from(clientAgg.entries())
            .map(([client_id, v]) => ({
                client_id,
                client_name: v.name,
                cells: v.cells,
                total: v.cells.reduce((s, x) => s + x, 0),
            }))
            .filter(r => r.total > 0)
            .sort((a, b) => b.total - a.total);

        const totals = services.map((_s, idx) =>
            filteredRows.reduce((s, r) => s + r.cells[idx], 0)
        );
        const grand = totals.reduce((a, b) => a + b, 0);

        return { rows: filteredRows, totals, grand };
    }, [mode, monthQuery.data, annualQueries, services]);

    const periodLabel = mode === 'annual'
        ? `Anual ${year}`
        : `${MONTH_NAMES[month - 1]} ${year}`;
    const fileSuffix = mode === 'annual' ? `Anual_${year}` : `${MONTH_NAMES[month - 1]}_${year}`;

    const handlePrevMonth = () => {
        if (mode === 'annual') return;
        const d = new Date(date); d.setMonth(d.getMonth() - 1); setDate(d);
    };
    const handleNextMonth = () => {
        if (mode === 'annual') return;
        const d = new Date(date); d.setMonth(d.getMonth() + 1); setDate(d);
    };
    const handleToday = () => setDate(new Date());

    const handleExportCSV = () => {
        if (!view || view.rows.length === 0 || !services) return;
        const headers = ['#', 'Cliente', ...services.map(s => s.plName), 'TOTAL'];
        const body = view.rows.map((r, i) => [i + 1, r.client_name, ...r.cells, r.total]);
        const totals = ['', 'TOTALES', ...view.totals, view.grand];
        const BOM = '﻿';
        const csv = BOM + [headers, ...body, totals]
            .map(row => row.map(c => {
                const s = String(c);
                return (s.includes(';') || s.includes('"') || s.includes('\n'))
                    ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(';'))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facturacion_${deptLabel}_${fileSuffix}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exportado: ${a.download}`);
    };

    const handleExportPDF = () => {
        if (!view || view.rows.length === 0 || !services) return;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Facturación — ${deptLabel}`, 14, 16);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(
            `${periodLabel} · ${view.rows.length} cliente${view.rows.length === 1 ? '' : 's'} · Generado ${new Date().toLocaleDateString('es-ES')}`,
            14, 22,
        );
        doc.setTextColor(0);

        const head = [['#', 'Cliente', ...services.map(s => s.plName), 'Total']];
        const body = view.rows.map((r, i) => [
            String(i + 1),
            r.client_name,
            ...r.cells.map(v => v > 0 ? Math.round(v).toLocaleString('de-DE') : '—'),
            Math.round(r.total).toLocaleString('de-DE'),
        ]);
        const foot = [[
            '', 'TOTALES',
            ...view.totals.map(v => Math.round(v).toLocaleString('de-DE')),
            Math.round(view.grand).toLocaleString('de-DE'),
        ]];

        autoTable(doc, {
            startY: 26,
            head, body, foot,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'right' },
            footStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'right' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { halign: 'left', cellWidth: 45 },
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didParseCell: (data) => {
                if (data.column.index === 0 || data.column.index === 1) {
                    if (data.section === 'head' || data.section === 'foot') {
                        data.cell.styles.halign = data.column.index === 0 ? 'center' : 'left';
                    }
                }
            },
        });

        doc.save(`Facturacion_${deptLabel}_${fileSuffix}.pdf`);
        toast.success(`Descargado: Facturacion_${deptLabel}_${fileSuffix}.pdf`);
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
                            Clientes y servicios facturados a este hub en {periodLabel} · Solo lectura
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Period selector con toggle Anual */}
                    <div className="flex items-center rounded-md border bg-card shadow-sm overflow-hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handlePrevMonth}
                            disabled={mode === 'annual'}
                            className="h-9 w-9 rounded-none border-r"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex h-9 min-w-[140px] items-center justify-center px-4 text-sm font-medium">
                            {periodLabel}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleNextMonth}
                            disabled={mode === 'annual'}
                            className="h-9 w-9 rounded-none border-l"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    {/* Toggle Mes / Anual */}
                    <div className="flex items-center rounded-md border bg-card shadow-sm overflow-hidden">
                        <button
                            onClick={() => setMode('month')}
                            className={`h-9 px-3 text-xs font-semibold transition-colors ${mode === 'month' ? 'bg-indigo-600 text-white' : 'hover:bg-muted text-foreground'}`}
                        >
                            Mes
                        </button>
                        <button
                            onClick={() => setMode('annual')}
                            className={`h-9 px-3 text-xs font-semibold transition-colors border-l ${mode === 'annual' ? 'bg-indigo-600 text-white' : 'hover:bg-muted text-foreground'}`}
                        >
                            Anual
                        </button>
                    </div>
                    {mode === 'month' && (
                        <Button variant="outline" size="sm" className="h-9" onClick={handleToday}>
                            Mes Actual
                        </Button>
                    )}
                    {/* Export buttons (estilo primario azul, idem otros módulos) */}
                    <Button
                        size="sm"
                        className="gap-1.5 h-9"
                        onClick={handleExportCSV}
                        disabled={!view || view.rows.length === 0}
                    >
                        <Download size={14} /> CSV
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5 h-9"
                        onClick={handleExportPDF}
                        disabled={!view || view.rows.length === 0}
                    >
                        <FileText size={14} /> PDF
                    </Button>
                </div>
            </div>

            {/* KPI cards */}
            {view && view.rows.length > 0 && services && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <KPI icon={<Users className="h-4 w-4" />} label="Clientes facturados" value={String(view.rows.length)} tone="indigo" />
                    <KPI icon={<Layers className="h-4 w-4" />} label="Servicios del hub" value={String(services.length)} tone="violet" />
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
                ) : !services ? (
                    <div className="p-12 text-center">
                        <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-foreground">Hub no soportado</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Solo Immedia, Imcontent, Immoralia e Imsales tienen detalle de facturación.
                        </p>
                    </div>
                ) : !view || view.rows.length === 0 ? (
                    <div className="p-12 text-center">
                        <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-foreground">Sin facturación en este período</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ningún cliente tiene montos facturados a {deptLabel} en {periodLabel}.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
                                    <th className="px-3 py-2.5 text-left font-bold text-indigo-900 tracking-wide w-10">#</th>
                                    <th className="px-3 py-2.5 text-left font-bold text-indigo-900 tracking-wide">Cliente</th>
                                    {services.map(s => (
                                        <th key={s.plName} className="px-3 py-2.5 text-right font-bold text-indigo-900 tracking-wide whitespace-nowrap">
                                            {s.plName}
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
                                        {r.cells.map((v, i) => (
                                            <td key={i} className="px-3 py-2 text-right tabular-nums">
                                                {v > 0
                                                    ? <span className="font-medium text-foreground">{fmt(v)}</span>
                                                    : <span className="text-muted-foreground/40">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700 bg-indigo-50/60">
                                            {fmt(r.total)}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-gradient-to-r from-indigo-100 to-purple-100 border-t-2 border-indigo-300">
                                    <td className="px-3 py-2.5"></td>
                                    <td className="px-3 py-2.5 font-bold text-indigo-900 uppercase tracking-wider text-[11px]">
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
                💡 Vista espejo de Billing Matrix mapeada a los servicios del P&L. Para editar montos ve a Billing Matrix.
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
