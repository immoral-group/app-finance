import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const fmt = (val: number) =>
    val ? Math.round(val).toLocaleString('de-DE') : '—';

const fmtCsv = (val: number) => Math.round(val).toString();

export default function ClientBillingReport() {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['annual-client-summary', year],
        queryFn: () => adminApi.getAnnualClientSummary(year),
        staleTime: 2 * 60_000,
    });

    const clients = data?.clients ?? [];

    // Column totals (sum per month across all clients)
    const columnTotals = Array.from({ length: 12 }, (_, i) =>
        clients.reduce((sum, c) => sum + c.months[i], 0)
    );
    const grandTotal = columnTotals.reduce((s, v) => s + v, 0);

    // Group clients by vertical for optional visual grouping
    const verticals = [...new Set(clients.map(c => c.vertical || 'Sin vertical'))];

    const handleExportCSV = useCallback(() => {
        if (!clients.length) return;

        const BOM = '﻿';
        const headers = ['Vertical', 'Cliente', ...MONTHS_FULL, 'Total Anual'];
        const rows = clients.map(c => [
            c.vertical || '',
            c.client_name,
            ...c.months.map(fmtCsv),
            fmtCsv(c.annual),
        ]);
        const totalsRow = ['', 'TOTALES', ...columnTotals.map(fmtCsv), fmtCsv(grandTotal)];

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
    }, [clients, columnTotals, grandTotal, year]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                        Facturación por Cliente {year}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Total facturado mensual y anual por cliente. Incluye todos los clientes del año.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>
                        ← {year - 1}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)}>
                        {year + 1} →
                    </Button>
                    <Button
                        variant="outline"
                        className="gap-2 text-xs md:text-sm"
                        onClick={handleExportCSV}
                        disabled={!clients.length}
                    >
                        <Download size={16} />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* KPIs rápidos */}
            {!isLoading && !isError && clients.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-card border rounded-lg px-4 py-3">
                        <p className="text-xs text-muted-foreground">Clientes activos</p>
                        <p className="text-2xl font-bold">{clients.length}</p>
                    </div>
                    <div className="bg-card border rounded-lg px-4 py-3">
                        <p className="text-xs text-muted-foreground">Total anual</p>
                        <p className="text-2xl font-bold">{Math.round(grandTotal).toLocaleString('de-DE')} €</p>
                    </div>
                    <div className="bg-card border rounded-lg px-4 py-3">
                        <p className="text-xs text-muted-foreground">Media mensual</p>
                        <p className="text-2xl font-bold">
                            {Math.round(grandTotal / 12).toLocaleString('de-DE')} €
                        </p>
                    </div>
                    <div className="bg-card border rounded-lg px-4 py-3">
                        <p className="text-xs text-muted-foreground">Verticales</p>
                        <p className="text-2xl font-bold">{verticals.length}</p>
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
                    <div className="p-8 text-center text-red-500 bg-red-50">
                        Error al cargar los datos. Comprueba la conexión.
                    </div>
                ) : clients.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        No hay clientes asignados para {year}.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-muted/60">
                                    <th className="border border-border px-3 py-2 text-left font-semibold text-foreground sticky left-0 bg-muted/60 z-10 min-w-[120px]">
                                        Vertical
                                    </th>
                                    <th className="border border-border px-3 py-2 text-left font-semibold text-foreground sticky left-[120px] bg-muted/60 z-10 min-w-[160px]">
                                        Cliente
                                    </th>
                                    {MONTHS_SHORT.map(m => (
                                        <th key={m} className="border border-border px-2 py-2 text-right font-semibold text-foreground min-w-[72px]">
                                            {m}
                                        </th>
                                    ))}
                                    <th className="border border-border px-3 py-2 text-right font-bold text-foreground bg-primary/5 min-w-[90px]">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {clients.map((client, idx) => {
                                    const isEven = idx % 2 === 0;
                                    return (
                                        <tr
                                            key={client.client_id}
                                            className={`hover:bg-primary/5 transition-colors ${isEven ? 'bg-background' : 'bg-muted/20'}`}
                                        >
                                            <td className={`border border-border px-3 py-1.5 text-muted-foreground sticky left-0 z-10 ${isEven ? 'bg-background' : 'bg-muted/20'}`}>
                                                {client.vertical || '—'}
                                            </td>
                                            <td className={`border border-border px-3 py-1.5 font-medium text-foreground sticky left-[120px] z-10 ${isEven ? 'bg-background' : 'bg-muted/20'}`}>
                                                {client.client_name}
                                            </td>
                                            {client.months.map((val, mi) => (
                                                <td
                                                    key={mi}
                                                    className={`border border-border px-2 py-1.5 text-right tabular-nums ${val === 0 ? 'text-muted-foreground/40' : 'text-foreground'}`}
                                                >
                                                    {fmt(val)}
                                                </td>
                                            ))}
                                            <td className="border border-border px-3 py-1.5 text-right font-semibold tabular-nums bg-primary/5 text-foreground">
                                                {fmt(client.annual)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-muted font-bold">
                                    <td className="border border-border px-3 py-2 sticky left-0 bg-muted z-10" />
                                    <td className="border border-border px-3 py-2 text-sm sticky left-[120px] bg-muted z-10">
                                        TOTALES
                                    </td>
                                    {columnTotals.map((val, mi) => (
                                        <td key={mi} className="border border-border px-2 py-2 text-right tabular-nums text-foreground">
                                            {fmt(val)}
                                        </td>
                                    ))}
                                    <td className="border border-border px-3 py-2 text-right tabular-nums font-bold bg-primary/10 text-foreground">
                                        {fmt(grandTotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
