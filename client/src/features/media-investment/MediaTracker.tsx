import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mediaApi } from '@/lib/api/media';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeriodSelector } from '@/components/shared/PeriodSelector';
import { formatCurrency } from '@/lib/utils';
import { Download, AlertCircle, UserPlus } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ClientModal } from '@/features/clients/components/ClientModal';
import { clientsApi } from '@/lib/api/clients';
import { CreateClientDTO } from '@/types/client';
import { toast } from 'sonner';

const REQUIRED_COLUMNS = [
    { code: 'BRAND', label: 'Branding' },
    { code: 'META', label: 'Facebook Ads' },
    { code: 'GOOGLE', label: 'Google Ads' },
    { code: 'TIKTOK', label: 'TikTok Ads' },
    { code: 'LINKEDIN', label: 'LinkedIn' },
    { code: 'PINTEREST', label: 'Pinterest' },
    { code: 'SPOTIFY', label: 'Spotify' },
    { code: 'APPLE', label: 'Apple Ads' },
    { code: 'MICROSOFT', label: 'Microsoft Ads' },
];

/** Format a number with dot thousands separator (es-ES style: 1.000, 50.000) */
const fmtDisplay = (val: number | string): string => {
    const n = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(n) || n === 0) return '';
    return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
};

/** Parse a user-typed value accepting comma or dot as decimal. Dots used as thousands are stripped. */
const parseInput = (raw: string): number => {
    let s = raw.trim();
    if (!s) return 0;
    // If has both dot and comma → dot is thousands, comma is decimal  (1.234,56)
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        // Only comma → treat as decimal  (1234,56)
        s = s.replace(',', '.');
    }
    // else only dots → could be thousands (1.000) or decimal (1.5)
    // Heuristic: if there are multiple dots, they're thousands separators
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
        s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
};

/** Editable numeric cell — no spinners, dot thousands display, comma-friendly input */
function NumericCell({ value, onSave, className }: { value: number | string; onSave: (val: number) => void; className?: string }) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFocus = () => {
        const n = typeof value === 'string' ? parseFloat(String(value)) : value;
        setText(n && n !== 0 ? String(n) : '');
        setEditing(true);
    };

    const handleBlur = () => {
        setEditing(false);
        const parsed = parseInput(text);
        onSave(parsed);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={editing ? text : fmtDisplay(value)}
            onChange={(e) => setText(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="-"
            className={`h-8 w-full text-right outline-none px-2 text-sm ${className || ''}`}
        />
    );
}

function MediaTrackerContent() {
    const [date, setDate] = useState(new Date());
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const queryClient = useQueryClient();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // 1. All Hooks First (Rules of Hooks)

    // Fetch Platforms
    const { data: platforms = [] } = useQuery({
        queryKey: ['platforms'],
        queryFn: mediaApi.getPlatforms
    });

    // Fetch Investments
    const { data, isLoading, error } = useQuery({
        queryKey: ['media-investment', year, month],
        queryFn: () => mediaApi.getMonthlyInvestment(year, month),
    });

    const investments = data?.investments || [];

    // Map platforms to columns
    const platformColumns = useMemo(() => {
        return REQUIRED_COLUMNS.map(col => {
            const platform = platforms.find((p: any) => p.code === col.code);
            return {
                ...col,
                id: platform?.id
            };
        });
    }, [platforms]);

    // Mutations
    const savePlannedMutation = useMutation({
        mutationFn: mediaApi.updatePlannedInvestment,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['media-investment', year, month] });
        }
    });

    const savePlatformMutation = useMutation({
        mutationFn: mediaApi.updatePlatformInvestment,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['media-investment', year, month] });
        }
    });

    // 2. Conditional Returns (After all hooks)

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                <h3 className="text-lg font-bold">Error al cargar datos</h3>
                <p>{(error as Error).message}</p>
                <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['media-investment'] })} className="mt-4">
                    Reintentar
                </Button>
            </div>
        );
    }

    // 3. Handlers and Render Logic

    const handlePlannedChange = (clientId: string, value: string) => {
        // Handle empty string as 0 to allow clearing inputs
        const finalValue = value.trim() === '' ? '0' : value;
        const amount = parseFloat(finalValue);

        if (isNaN(amount)) return;

        savePlannedMutation.mutate({
            client_id: clientId,
            fiscal_year: year,
            fiscal_month: month,
            amount
        });
    };

    const handlePlatformChange = (clientId: string, platformId: string, value: string) => {
        const finalValue = value.trim() === '' ? '0' : value;
        const amount = parseFloat(finalValue);

        if (isNaN(amount)) return;

        savePlatformMutation.mutate({
            client_id: clientId,
            fiscal_year: year,
            fiscal_month: month,
            platform_id: platformId,
            amount
        });
    };

    // Handle new client
    const handleCreateClient = async (clientData: CreateClientDTO) => {
        try {
            await clientsApi.create(clientData);
            queryClient.invalidateQueries({ queryKey: ['media-investment'] });
            setIsClientModalOpen(false);
            toast.success('Cliente creado exitosamente');
        } catch (err) {
            console.error(err);
            toast.error('Error al crear cliente');
        }
    };

    // Export CSV
    const handleExportCSV = () => {
        if (!investments.length) return;

        const headers = [
            'Cliente',
            'Inv. Planificada',
            ...platformColumns.map(col => col.label),
            'Total Real',
            'Remanente/Exceso'
        ];

        const csvRows = investments.map((inv: any) => {
            if (!inv) return [];
            const diff = (inv.planned_investment || 0) - (inv.total_actual || 0);
            return [
                inv.client_name || '',
                inv.planned_investment || 0,
                ...platformColumns.map(col => {
                    const platformData = inv.platforms?.find((p: any) => p.platform_code === col.code);
                    return platformData?.actual_amount || 0;
                }),
                inv.total_actual || 0,
                diff
            ];
        });

        // Totals row
        const totalPlannedCSV = investments.reduce((sum: number, i: any) => sum + (i?.planned_investment || 0), 0);
        const totalActualCSV = investments.reduce((sum: number, i: any) => sum + (i?.total_actual || 0), 0);
        const totalsRow = [
            'TOTALES',
            totalPlannedCSV,
            ...platformColumns.map(col => {
                return investments.reduce((sum: number, inv: any) => {
                    const p = inv?.platforms?.find((pl: any) => pl.platform_code === col.code);
                    return sum + (p?.actual_amount || 0);
                }, 0);
            }),
            totalActualCSV,
            totalPlannedCSV - totalActualCSV
        ];

        const BOM = '\uFEFF';
        const csvContent = BOM + [
            headers.join(';'),
            ...csvRows.map((row: any[]) => row.map(cell => {
                const str = String(cell);
                if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(';')),
            totalsRow.join(';')
        ].join('\n');

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const filename = `MediaInvestment_${monthNames[month - 1]}_${year}.csv`;

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
    };

    const totalPlanned = investments.reduce((sum: number, i: any) => sum + (i?.planned_investment || 0), 0);
    const totalActual = investments.reduce((sum: number, i: any) => sum + (i?.total_actual || 0), 0);
    // Logic: Planned - Actual = Remaining (Positive), Excess (Negative)
    const totalDiff = totalPlanned - totalActual;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Control de Inversión de Medios</h1>
                <p className="text-muted-foreground mt-1 text-sm">Gestión de presupuestos y gasto real por plataforma.</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="p-6">
                    <p className="text-sm font-medium text-muted-foreground">Inversión Planificada (Total)</p>
                    <h3 className="text-2xl font-bold mt-2">{formatCurrency(totalPlanned)}</h3>
                </Card>
                <Card className="p-6">
                    <p className="text-sm font-medium text-muted-foreground">Total Real Ejecutado</p>
                    <h3 className="text-2xl font-bold mt-2 text-blue-600">{formatCurrency(totalActual)}</h3>
                </Card>
                <Card className="p-6">
                    <p className="text-sm font-medium text-muted-foreground">Remanente / Exceso Global</p>
                    <h3 className={`text-2xl font-bold mt-2 ${totalDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalDiff)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {totalDiff >= 0 ? 'Disponible (Remanente)' : 'Exceso sobre presupuesto'}
                    </p>
                </Card>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-card border rounded-lg">
                <div className="flex items-center gap-4 flex-1">
                    <PeriodSelector value={date} onChange={setDate} />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV} disabled={investments.length === 0}>
                        <Download size={16} />
                        Export CSV
                    </Button>
                    <Button size="sm" className="gap-2" onClick={() => setIsClientModalOpen(true)}>
                        <UserPlus size={16} />
                        Add New Client
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="h-12 px-4 text-left font-medium text-gray-600 min-w-[200px] sticky left-0 bg-gray-50 z-10 border-r">Cliente</th>
                                <th className="h-12 px-2 text-center font-medium text-gray-800 w-32 bg-blue-50/50 border-r border-blue-100">
                                    Inv. Planificada
                                </th>
                                {platformColumns.map(col => (
                                    <th key={col.code} className="h-12 px-2 text-center font-medium text-gray-600 w-32 border-r last:border-0 hover:bg-gray-100 transition-colors">
                                        {col.label}
                                    </th>
                                ))}
                                <th className="h-12 px-2 text-center font-bold text-blue-700 w-32 bg-blue-50 border-l border-blue-200">Total Real</th>
                                <th className="h-12 px-2 text-center font-bold text-gray-700 w-32 bg-gray-100 border-l border-gray-200">Remanente/Exceso</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">Cargando datos...</td></tr>
                            ) : investments.length === 0 ? (
                                <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">No hay inversiones registradas para este periodo.</td></tr>
                            ) : (
                                investments.map((inv: any) => {
                                    if (!inv) return null;
                                    // Row logic: Planned - Actual = Remaining/Excess
                                    const diff = (inv.planned_investment || 0) - (inv.total_actual || 0);

                                    return (
                                        <tr key={inv.client_id} className="border-b hover:bg-gray-50/50">
                                            <td className="p-3 font-medium sticky left-0 bg-white z-10 border-r flex items-center h-full">
                                                {inv.client_name}
                                            </td>

                                            {/* Planned Investment (Editable) */}
                                            <td className="p-1 border-r border-blue-100 bg-blue-50/10">
                                                <NumericCell
                                                    value={inv.planned_investment || 0}
                                                    onSave={(val) => handlePlannedChange(inv.client_id, String(val))}
                                                    className="font-medium border border-transparent hover:border-blue-200 focus:border-blue-500 bg-transparent text-gray-800 rounded"
                                                />
                                            </td>

                                            {/* Platform Columns (Editable) */}
                                            {platformColumns.map(col => {
                                                const platformData = inv.platforms?.find((p: any) => p.platform_code === col.code);
                                                const amount = platformData?.actual_amount || 0;

                                                return (
                                                    <td key={col.code} className="p-1 border-r last:border-0 border-gray-100">
                                                        {col.id ? (
                                                            <NumericCell
                                                                value={amount}
                                                                onSave={(val) => handlePlatformChange(inv.client_id, col.id!, String(val))}
                                                                className="text-gray-600 border border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent focus:bg-white rounded"
                                                            />
                                                        ) : (
                                                            <div className="h-8 flex items-center justify-center text-gray-300 text-xs bg-gray-50/50 cursor-not-allowed" title="Plataforma no configurada">
                                                                N/A
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}

                                            {/* Total Real (Calculated) */}
                                            <td className="p-2 text-right font-bold text-blue-700 bg-blue-50 border-l border-blue-200">
                                                {formatCurrency(inv.total_actual || 0)}
                                            </td>

                                            {/* Remanente/Exceso */}
                                            {/* Logic: if diff >= 0 (Remaining), Green. If diff < 0 (Excess), Red. */}
                                            <td className={`p-2 text-right font-bold bg-gray-100 border-l border-gray-200 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(diff)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-200">
                            <tr>
                                <td className="p-3 sticky left-0 bg-gray-100 z-10 border-r">TOTALES</td>
                                <td className="p-3 text-right border-r border-blue-100 bg-blue-50/30">{formatCurrency(totalPlanned)}</td>
                                {platformColumns.map(col => {
                                    // Sum per column
                                    const colTotal = investments.reduce((sum: number, inv: any) => {
                                        const p = inv?.platforms?.find((pl: any) => pl.platform_code === col.code);
                                        return sum + (p?.actual_amount || 0);
                                    }, 0);
                                    return (
                                        <td key={col.code} className="p-3 text-right border-r border-gray-200 text-gray-700">
                                            {formatCurrency(colTotal)}
                                        </td>
                                    );
                                })}
                                <td className="p-3 text-right text-blue-700 bg-blue-100 border-l border-blue-200">{formatCurrency(totalActual)}</td>
                                {/* Global Total Logic */}
                                <td className={`p-3 text-right bg-gray-200 border-l border-gray-300 ${totalDiff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {formatCurrency(totalDiff)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>

            {/* Client Modal — same as Clients & Fees */}
            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSave={handleCreateClient}
            />
        </div>
    );
}

export default function MediaTracker() {
    return (
        <ErrorBoundary>
            <MediaTrackerContent />
        </ErrorBoundary>
    );
}
