import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { MatrixGrid } from './MatrixGrid';
import { PeriodSelector } from '@/components/shared/PeriodSelector';
import { Button } from '@/components/ui/Button';
import { Download, UserPlus, EyeOff, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { ClientModal } from '@/features/clients/components/ClientModal';
import { clientsApi } from '@/lib/api/clients';
import { CreateClientDTO } from '@/types/client';
import { toast } from 'sonner';
import { ChangeLogPanel } from '@/components/ui/ChangeLogPanel';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function BillingMatrix() {
    const [date, setDate] = useState(new Date());
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const queryClient = useQueryClient();

    const { data: hiddenData } = useQuery({
        queryKey: ['billing-hidden-clients', year, month],
        queryFn: () => adminApi.getHiddenClients(year, month),
        staleTime: 30_000,
    });
    const hiddenClients = hiddenData?.hidden ?? [];

    const unhideClientMutation = useMutation({
        mutationFn: (client_id: string) => adminApi.unhideClient({ client_id, fiscal_year: year, fiscal_month: month }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['billing-matrix', year, month] });
            queryClient.invalidateQueries({ queryKey: ['billing-hidden-clients', year, month] });
            toast.success('Cliente reactivado y visible nuevamente');
        },
        onError: () => toast.error('Error al reactivar el cliente'),
    });

    const { data: matrixData, isLoading, isError } = useQuery({
        queryKey: ['billing-matrix', year, month],
        queryFn: () => adminApi.getMatrix(year, month),
    });

    const handleCreateClient = async (data: CreateClientDTO) => {
        try {
            await clientsApi.create(data);
            queryClient.invalidateQueries({ queryKey: ['billing-matrix'] });
            setIsClientModalOpen(false);
            toast.success('Cliente creado exitosamente');
        } catch (error) {
            console.error(error);
            toast.error('Error al crear cliente');
        }
    };

    const handleExportCSV = useCallback(() => {
        if (!matrixData) return;
        const { rows, columns } = matrixData;
        const headers = ['#', 'Vertical', 'Cliente', 'Inversión', '% Fee', 'Nº Plat', 'Fee Mínimo',
            ...columns.map((col: any) => col.name || col.code), 'TOTAL'];
        const csvRows = rows.map((row: any, idx: number) => {
            let rowTotal = 0;
            columns.forEach((col: any) => { rowTotal += Number(row.services?.[col.id] || 0); });
            return [idx + 1, row.vertical || '', row.client_name || '',
                row.metadata?.investment || 0, row.metadata?.fee_pct || 0,
                row.metadata?.platform_count || 1, row.metadata?.fee_min || '',
                ...columns.map((col: any) => row.services?.[col.id] || 0), rowTotal];
        });
        const totalsRow = ['', '', 'TOTALES',
            String(rows.reduce((sum: number, r: any) => sum + Number(r.metadata?.investment || 0), 0)),
            '', '', ''];
        columns.forEach((col: any) => {
            totalsRow.push(String(rows.reduce((sum: number, r: any) => sum + Number(r.services?.[col.id] || 0), 0)));
        });
        const grandTotal = rows.reduce((sum: number, r: any) => {
            let rt = 0; columns.forEach((col: any) => { rt += Number(r.services?.[col.id] || 0); }); return sum + rt;
        }, 0);
        totalsRow.push(String(grandTotal));
        const BOM = '﻿';
        const csvContent = BOM + [headers.join(';'),
            ...csvRows.map((row: any[]) => row.map(cell => {
                const str = String(cell);
                return (str.includes(';') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(';')),
            totalsRow.join(';')
        ].join('\n');
        const filename = `BillingMatrix_${MONTH_NAMES[month - 1]}_${year}.csv`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename; link.style.display = 'none';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(`Exportado: ${filename}`);
    }, [matrixData, month, year]);

    return (
        <div className="space-y-6 pb-8">

            {/* ── Header ─────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing Matrix</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {MONTH_NAMES[month - 1]} {year} · Gestión mensual de facturación
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="gap-2 h-9 text-xs font-semibold"
                        onClick={handleExportCSV}
                        disabled={!matrixData}
                    >
                        <Download size={14} />
                        Exportar CSV
                    </Button>
                    <Button
                        className="gap-2 h-9 text-xs font-semibold"
                        onClick={() => setIsClientModalOpen(true)}
                    >
                        <UserPlus size={14} />
                        Nuevo Cliente
                    </Button>
                </div>
            </div>

            {/* ── Toolbar ─────────────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap">
                <PeriodSelector value={date} onChange={setDate} />
                <div className="h-5 w-px bg-border hidden md:block" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-700">Período abierto</span>
                </div>
            </div>

            {/* ── Clientes ocultos ────────────────────────── */}
            {hiddenClients.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                    <button
                        onClick={() => setHiddenPanelOpen(o => !o)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors"
                    >
                        <div className="flex items-center gap-2.5">
                            <EyeOff size={14} className="text-amber-600" />
                            <span className="text-sm font-semibold text-amber-700">
                                {hiddenClients.length} cliente{hiddenClients.length > 1 ? 's' : ''} oculto{hiddenClients.length > 1 ? 's' : ''} este período
                            </span>
                        </div>
                        {hiddenPanelOpen
                            ? <ChevronUp size={14} className="text-amber-500" />
                            : <ChevronDown size={14} className="text-amber-500" />}
                    </button>
                    {hiddenPanelOpen && (
                        <div className="border-t border-amber-200 divide-y divide-amber-100">
                            {hiddenClients.map(client => {
                                const hiddenYear = Math.floor(client.hidden_from_yyyymm / 100);
                                const hiddenMonthIdx = client.hidden_from_yyyymm % 100;
                                return (
                                    <div key={client.id} className="flex items-center justify-between px-4 py-3 bg-white/70">
                                        <div>
                                            <span className="text-sm font-semibold text-foreground">{client.name}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                oculto desde {MONTH_NAMES[hiddenMonthIdx - 1]} {hiddenYear}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => unhideClientMutation.mutate(client.id)}
                                            disabled={unhideClientMutation.isPending}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-border hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-all disabled:opacity-50"
                                        >
                                            <Eye size={12} />
                                            Mostrar
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Matrix Grid ─────────────────────────────── */}
            <div className="rounded-2xl border border-border overflow-hidden shadow-sm bg-card">
                {isLoading ? (
                    <div className="p-16 text-center">
                        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground font-medium">Cargando datos de facturación...</p>
                    </div>
                ) : isError ? (
                    <div className="p-12 text-center">
                        <p className="text-sm font-semibold text-red-600">Error al cargar los datos</p>
                        <p className="text-xs text-muted-foreground mt-1">Comprueba la conexión e inténtalo de nuevo</p>
                    </div>
                ) : matrixData ? (
                    <MatrixGrid data={matrixData} year={year} month={month} />
                ) : null}
            </div>

            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSave={handleCreateClient}
            />

            <ChangeLogPanel module="billing" />
        </div>
    );
}
