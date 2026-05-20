import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Download, FileText, Search, X, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const fmt = (val: number) =>
    val ? Math.round(val).toLocaleString('de-DE') : '—';
const fmtNum = (val: number) => Math.round(val).toString();

// ─── Colores por departamento ────────────────────────────────────────────────
const DEPT_COLORS: Record<string, string> = {
    Immedia:   'bg-blue-500',
    Imcontent: 'bg-purple-500',
    Immoralia: 'bg-emerald-500',
    Imloyal:   'bg-orange-500',
    Imseo:     'bg-yellow-500',
    Immoral:   'bg-slate-500',
    Imsales:   'bg-pink-500',
};
const deptColor = (dept: string) => DEPT_COLORS[dept] || 'bg-gray-400';

// ─── Modal de desglose ────────────────────────────────────────────────────────
interface DetailModalProps {
    clientId: string;
    clientName: string;
    year: number;
    month: number;
    onClose: () => void;
}

function DetailModal({ clientId, clientName, year, month, onClose }: DetailModalProps) {
    const { data, isLoading } = useQuery({
        queryKey: ['client-month-detail', clientId, year, month],
        queryFn: () => adminApi.getClientMonthDetail(year, month, clientId),
        staleTime: 0,
    });

    const total = data?.total ?? 0;
    const feePaid = data?.fee_paid ?? 0;
    const services = data?.services ?? [];

    const allLines = useMemo(() => {
        const lines = [...services];
        if (feePaid > 0) {
            lines.push({ service_name: 'Fee / Paid Media Strategy', department: 'Immedia', department_code: 'IMMED', amount: feePaid });
        }
        return lines.sort((a, b) => b.amount - a.amount);
    }, [services, feePaid]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-card border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                            Desglose de facturación
                        </p>
                        <h2 className="text-base font-bold text-foreground truncate">{clientName}</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {MONTHS_FULL[month - 1]} {year}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Total destacado */}
                <div className="px-5 py-4 bg-primary/5 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <TrendingUp size={15} />
                            Total facturado
                        </div>
                        <span className="text-2xl font-bold text-foreground tabular-nums">
                            {fmt(total)} €
                        </span>
                    </div>
                    {data?.investment && data.investment > 0 ? (
                        <p className="text-xs text-muted-foreground mt-1.5">
                            Inversión publicitaria: <span className="font-medium text-foreground">{fmt(data.investment)} €</span>
                            {data.fee_pct > 0 && <span className="ml-1">· Fee {data.fee_pct}%</span>}
                        </p>
                    ) : null}
                </div>

                {/* Servicios */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                    ) : allLines.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No hay servicios registrados para este mes.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {allLines.map((svc, i) => {
                                const pct = total > 0 ? (svc.amount / total) * 100 : 0;
                                return (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${deptColor(svc.department)}`} />
                                                <div className="min-w-0">
                                                    <span className="text-xs font-bold text-foreground truncate block">
                                                        {svc.department || 'General'}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground truncate block">
                                                        {svc.service_name}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex-shrink-0 text-right ml-3">
                                                <span className="text-xs font-semibold tabular-nums">{fmt(svc.amount)} €</span>
                                                <span className="text-[10px] text-muted-foreground ml-1.5">{Math.round(pct)}%</span>
                                            </div>
                                        </div>
                                        {/* Barra de progreso */}
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${deptColor(svc.department)}`}
                                                style={{ width: `${Math.max(pct, 1)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t flex justify-end">
                    <Button size="sm" variant="outline" onClick={onClose}>Cerrar</Button>
                </div>
            </div>
        </div>
    );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ClientBillingReport() {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [search, setSearch] = useState('');
    const [activeVerticals, setActiveVerticals] = useState<string[]>([]);
    const [modal, setModal] = useState<{ clientId: string; clientName: string; month: number } | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['annual-client-summary', year],
        queryFn: () => adminApi.getAnnualClientSummary(year),
        staleTime: 0,
    });

    const allClients = data?.clients ?? [];

    const verticals = useMemo(() =>
        [...new Set(allClients.map(c => c.vertical || 'Sin vertical'))].sort(),
        [allClients]
    );

    const toggleVertical = (v: string) => {
        setActiveVerticals(prev =>
            prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
        );
    };

    const filtered = useMemo(() => {
        let list = allClients;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(c => c.client_name.toLowerCase().includes(q));
        }
        if (activeVerticals.length > 0) {
            list = list.filter(c => activeVerticals.includes(c.vertical || 'Sin vertical'));
        }
        return list;
    }, [allClients, search, activeVerticals]);

    const columnTotals = useMemo(() =>
        Array.from({ length: 12 }, (_, i) =>
            filtered.reduce((sum, c) => sum + c.months[i], 0)
        ), [filtered]
    );

    const grandTotal = columnTotals.reduce((s, v) => s + v, 0);

    // ── CSV Export ────────────────────────────────────────────────────────────
    const handleExportCSV = useCallback(() => {
        if (!filtered.length) return;
        const BOM = '﻿';
        const headers = ['Vertical', 'Cliente', ...MONTHS_FULL, 'Total Anual'];
        const rows = filtered.map(c => [
            c.vertical || '',
            c.client_name,
            ...c.months.map(fmtNum),
            fmtNum(c.annual),
        ]);
        const totalsRow = ['', 'TOTALES', ...columnTotals.map(fmtNum), fmtNum(grandTotal)];
        const csv = BOM + [
            headers.join(';'),
            ...rows.map(r => r.map(cell => {
                const s = String(cell);
                return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(';')),
            totalsRow.join(';'),
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facturacion_Clientes_${year}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exportado: Facturacion_Clientes_${year}.csv`);
    }, [filtered, columnTotals, grandTotal, year]);

    // ── PDF Export (descarga directa) ─────────────────────────────────────────
    const handleExportPDF = useCallback(() => {
        if (!filtered.length) return;

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

        // Título
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Facturación por Cliente — ${year}`, 14, 16);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(
            `Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} · ${filtered.length} clientes`,
            14, 22
        );
        doc.setTextColor(0);

        const head = [['Vertical', 'Cliente', ...MONTHS_SHORT, 'Total']];
        const body = filtered.map(c => [
            c.vertical || '—',
            c.client_name,
            ...c.months.map(v => v ? Math.round(v).toLocaleString('de-DE') : '—'),
            Math.round(c.annual).toLocaleString('de-DE'),
        ]);
        const foot = [['', 'TOTALES', ...columnTotals.map(v => Math.round(v).toLocaleString('de-DE')), Math.round(grandTotal).toLocaleString('de-DE')]];

        autoTable(doc, {
            startY: 26,
            head,
            body,
            foot,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 2, halign: 'right' },
            headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'right' },
            footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'right' },
            columnStyles: {
                0: { halign: 'left', cellWidth: 20 },
                1: { halign: 'left', cellWidth: 35 },
                14: { fillColor: [239, 246, 255], fontStyle: 'bold' }, // Total col
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didParseCell: (data) => {
                // Cabecera Vertical y Cliente alineados a izquierda
                if (data.section === 'head' && (data.column.index === 0 || data.column.index === 1)) {
                    data.cell.styles.halign = 'left';
                }
                if (data.section === 'foot' && (data.column.index === 0 || data.column.index === 1)) {
                    data.cell.styles.halign = 'left';
                }
                // Columna Total en azul
                if (data.column.index === 14 && data.section === 'head') {
                    data.cell.styles.fillColor = [37, 99, 235];
                }
            },
        });

        doc.save(`Facturacion_Clientes_${year}.pdf`);
        toast.success(`Descargado: Facturacion_Clientes_${year}.pdf`);
    }, [filtered, columnTotals, grandTotal, year]);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                        Facturación por Cliente {year}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Total facturado mensual y anual. Incluye todos los clientes del año.
                        <span className="ml-1 text-primary/70">Haz clic en una celda para ver el desglose de servicios.</span>
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>← {year - 1}</Button>
                    <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV} disabled={!filtered.length}>
                        <Download size={14} /> CSV
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPDF} disabled={!filtered.length}>
                        <FileText size={14} /> PDF
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            {!isLoading && !isError && allClients.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Clientes', value: String(filtered.length) + (filtered.length !== allClients.length ? ` / ${allClients.length}` : '') },
                        { label: 'Total anual', value: Math.round(grandTotal).toLocaleString('de-DE') + ' €' },
                        { label: 'Media mensual', value: Math.round(grandTotal / 12).toLocaleString('de-DE') + ' €' },
                        { label: 'Verticales', value: String(verticals.length) },
                    ].map(k => (
                        <div key={k.label} className="bg-card border rounded-lg px-4 py-3">
                            <p className="text-xs text-muted-foreground">{k.label}</p>
                            <p className="text-xl font-bold mt-0.5">{k.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filtros */}
            {!isLoading && !isError && allClients.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-7 pr-7 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 w-48"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {verticals.map(v => (
                            <button
                                key={v}
                                onClick={() => toggleVertical(v)}
                                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                    activeVerticals.includes(v)
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                        {activeVerticals.length > 0 && (
                            <button
                                onClick={() => setActiveVerticals([])}
                                className="px-2.5 py-1 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                                <X size={10} /> Limpiar
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Tabla */}
            <div className="rounded-lg border overflow-hidden bg-card">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                        <p className="text-muted-foreground text-sm">Cargando datos...</p>
                    </div>
                ) : isError ? (
                    <div className="p-8 text-center text-red-500 bg-red-50 text-sm">
                        Error al cargar los datos. Comprueba la conexión.
                    </div>
                ) : allClients.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground text-sm">
                        No hay clientes asignados para {year}.
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        Ningún cliente coincide con el filtro.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-muted/70">
                                    <th className="border border-border px-2 py-2 text-left font-semibold sticky left-0 bg-muted/70 z-10 w-[72px] max-w-[72px]">
                                        Vertical
                                    </th>
                                    <th className="border border-border px-2 py-2 text-left font-semibold sticky left-[72px] bg-muted/70 z-10 min-w-[150px] max-w-[200px]">
                                        Cliente
                                    </th>
                                    {MONTHS_SHORT.map(m => (
                                        <th key={m} className="border border-border px-1.5 py-2 text-right font-semibold w-[68px]">
                                            {m}
                                        </th>
                                    ))}
                                    <th className="border border-border px-2 py-2 text-right font-bold bg-blue-50 dark:bg-blue-950/30 w-[85px]">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((client, idx) => {
                                    const isEven = idx % 2 === 0;
                                    const bg = isEven ? 'bg-background' : 'bg-muted/20';
                                    return (
                                        <tr key={client.client_id} className={`${bg}`}>
                                            <td
                                                className={`border border-border px-2 py-1.5 text-muted-foreground truncate sticky left-0 z-10 w-[72px] max-w-[72px] ${bg}`}
                                                title={client.vertical || undefined}
                                            >
                                                {client.vertical || '—'}
                                            </td>
                                            <td
                                                className={`border border-border px-2 py-1.5 font-medium sticky left-[72px] z-10 min-w-[150px] max-w-[200px] truncate ${bg}`}
                                                title={client.client_name}
                                            >
                                                {client.client_name}
                                            </td>
                                            {client.months.map((val, mi) => (
                                                <td
                                                    key={mi}
                                                    onClick={() => val > 0 && setModal({ clientId: client.client_id, clientName: client.client_name, month: mi + 1 })}
                                                    className={`border border-border px-1.5 py-1.5 text-right tabular-nums w-[68px] transition-colors
                                                        ${val === 0
                                                            ? 'text-muted-foreground/35'
                                                            : 'cursor-pointer hover:bg-primary/10 hover:text-primary font-medium'
                                                        }`}
                                                >
                                                    {fmt(val)}
                                                </td>
                                            ))}
                                            <td className="border border-border px-2 py-1.5 text-right font-semibold tabular-nums bg-blue-50/60 dark:bg-blue-950/20 w-[85px]">
                                                {fmt(client.annual)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-800 text-white text-xs font-bold">
                                    <td className="border border-slate-600 px-2 py-2 sticky left-0 bg-slate-800 z-10 w-[72px]" />
                                    <td className="border border-slate-600 px-2 py-2 sticky left-[72px] bg-slate-800 z-10">TOTALES</td>
                                    {columnTotals.map((val, mi) => (
                                        <td key={mi} className="border border-slate-600 px-1.5 py-2 text-right tabular-nums w-[68px]">
                                            {fmt(val)}
                                        </td>
                                    ))}
                                    <td className="border border-blue-400 px-2 py-2 text-right tabular-nums bg-blue-700 w-[85px]">
                                        {fmt(grandTotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de desglose */}
            {modal && (
                <DetailModal
                    clientId={modal.clientId}
                    clientName={modal.clientName}
                    year={year}
                    month={modal.month}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}
