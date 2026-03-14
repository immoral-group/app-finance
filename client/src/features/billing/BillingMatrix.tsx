import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { MatrixGrid } from './MatrixGrid';
import { PeriodSelector } from '@/components/shared/PeriodSelector';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, UserPlus } from 'lucide-react';
import { ClientModal } from '@/features/clients/components/ClientModal';
import { clientsApi } from '@/lib/api/clients';
import { CreateClientDTO } from '@/types/client';
import { toast } from 'sonner';


export default function BillingMatrix() {
    const [date, setDate] = useState(new Date());
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const queryClient = useQueryClient();

    // Fetch billing data (MATRIX VIEW)
    const { data: matrixData, isLoading, isError } = useQuery({
        queryKey: ['billing-matrix', year, month],
        queryFn: () => adminApi.getMatrix(year, month),
    });

    // Handle new client creation
    const handleCreateClient = async (data: CreateClientDTO) => {
        try {
            await clientsApi.create(data);
            // Refresh the billing matrix to include the new client
            queryClient.invalidateQueries({ queryKey: ['billing-matrix'] });
            setIsClientModalOpen(false);
            toast.success('Cliente creado exitosamente');
        } catch (error) {
            console.error(error);
            toast.error('Error al crear cliente');
        }
    };

    // Export matrix data as CSV
    const handleExportCSV = useCallback(() => {
        if (!matrixData) return;

        const { rows, columns } = matrixData;

        // Build header row
        const headers = [
            '#',
            'Vertical',
            'Cliente',
            'Inversión',
            '% Fee',
            'Nº Plat',
            'Fee Mínimo',
            ...columns.map((col: any) => col.name || col.code),
            'TOTAL'
        ];

        // Build data rows
        const csvRows = rows.map((row: any, idx: number) => {
            // Calculate row total
            let rowTotal = 0;
            columns.forEach((col: any) => {
                rowTotal += Number(row.services?.[col.id] || 0);
            });

            return [
                idx + 1,
                row.vertical || '',
                row.client_name || '',
                row.metadata?.investment || 0,
                row.metadata?.fee_pct || 0,
                row.metadata?.platform_count || 1,
                row.metadata?.fee_min || '',
                ...columns.map((col: any) => row.services?.[col.id] || 0),
                rowTotal
            ];
        });

        // Build totals row
        const totalsRow = ['', '', 'TOTALES'];
        // Investment total
        totalsRow.push(String(rows.reduce((sum: number, r: any) => sum + Number(r.metadata?.investment || 0), 0)));
        totalsRow.push(''); // fee_pct
        totalsRow.push(''); // platform_count
        totalsRow.push(''); // fee_min
        // Service totals
        columns.forEach((col: any) => {
            const total = rows.reduce((sum: number, r: any) => sum + Number(r.services?.[col.id] || 0), 0);
            totalsRow.push(String(total));
        });
        // Grand total
        const grandTotal = rows.reduce((sum: number, r: any) => {
            let rt = 0;
            columns.forEach((col: any) => { rt += Number(r.services?.[col.id] || 0); });
            return sum + rt;
        }, 0);
        totalsRow.push(String(grandTotal));

        // CSV content with BOM for Excel UTF-8 support
        const BOM = '\uFEFF';
        const csvContent = BOM + [
            headers.join(';'),
            ...csvRows.map((row: any[]) => row.map(cell => {
                const str = String(cell);
                // Escape cells that contain semicolons or quotes
                if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(';')),
            totalsRow.join(';')
        ].join('\n');

        // Create and download file
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const filename = `BillingMatrix_${monthNames[month - 1]}_${year}.csv`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(`Exportado: ${filename}`);
    }, [matrixData, month, year]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Billing Matrix {year}</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Spreadsheet view for monthly billing management.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" className="gap-2 text-xs md:text-sm" onClick={handleExportCSV} disabled={!matrixData}>
                        <Download size={16} />
                        Export CSV
                    </Button>
                    <Button className="gap-2 text-xs md:text-sm" onClick={() => setIsClientModalOpen(true)}>
                        <UserPlus size={16} />
                        Add Client
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <PeriodSelector value={date} onChange={setDate} />
                    <div className="h-8 w-px bg-border hidden md:block" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Status:</span>
                        <span className="flex items-center gap-1 text-sm text-green-600 bg-green-50 px-2 py-1 rounded-full">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            Open
                        </span>
                    </div>
                </div>
            </div>

            <Card className="overflow-hidden border-none shadow-none bg-transparent">
                <div className="p-0">
                    {isLoading ? (
                        <div className="p-12 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                            <p className="text-muted-foreground">Loading matrix data...</p>
                        </div>
                    ) : isError ? (
                        <div className="p-8 text-center text-red-500 bg-red-50 rounded-lg border border-red-100">
                            Error loading billing data. Please check connection.
                        </div>
                    ) : matrixData ? (
                        <MatrixGrid
                            data={matrixData}
                            year={year}
                            month={month}
                        />
                    ) : null}
                </div>
            </Card>

            {/* Client Modal — same component as Clients & Fees */}
            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSave={handleCreateClient}
            />
        </div>
    );
}
