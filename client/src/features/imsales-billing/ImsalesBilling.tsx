import { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { imsalesApi, ImsalesClientBilling, ImsalesService } from '@/lib/api/imsales';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeriodSelector } from '@/components/shared/PeriodSelector';
import { formatCurrency } from '@/lib/utils';
import { AlertCircle, UserPlus, EyeOff, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ClientModal } from '@/features/clients/components/ClientModal';
import { clientsApi } from '@/lib/api/clients';
import { CreateClientDTO } from '@/types/client';
import { toast } from 'sonner';
import { ChangeLogPanel } from '@/components/ui/ChangeLogPanel';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Format a number with dot thousands separator (es-ES style: 1.000, 50.000) */
const fmtDisplay = (val: number | string): string => {
    const n = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(n) || n === 0) return '';
    return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
};

/** Parse a user-typed value accepting comma or dot as decimal */
const parseInput = (raw: string): number => {
    let s = raw.trim();
    if (!s) return 0;
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
        s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
};

/** Editable numeric cell */
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

function ImsalesBillingContent({ embedded = false }: { embedded?: boolean }) {
    const [date, setDate] = useState(new Date());
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [hideConfirm, setHideConfirm] = useState<{ client_id: string; client_name: string } | null>(null);
    const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
    const [showWarning, setShowWarning] = useState(true);
    const [countdown, setCountdown] = useState(5);
    const { profile } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!showWarning || countdown <= 0) return;
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [showWarning, countdown]);

    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Fetch billing data
    const { data, isLoading, error } = useQuery({
        queryKey: ['imsales-billing', year, month],
        queryFn: () => imsalesApi.getBilling(year, month),
    });

    const investments = data?.investments || [];
    const services: ImsalesService[] = data?.services || [];

    // Fetch Imsales vertical ID (for pre-selecting in client modal)
    const { data: verticalsData } = useQuery({
        queryKey: ['verticals'],
        queryFn: () => clientsApi.getVerticals(),
        staleTime: 60_000 * 10,
    });
    const imsalesVerticalId = (verticalsData || []).find(
        (v: { id: string; name: string }) => v.name.toLowerCase() === 'imsales'
    )?.id || '';

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: imsalesApi.saveBilling,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['imsales-billing', year, month] });
        }
    });

    // Hide/unhide mutations
    const hideClientMutation = useMutation({
        mutationFn: (client_id: string) =>
            imsalesApi.hideClient({ client_id, fiscal_year: year, fiscal_month: month }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['imsales-billing', year, month] });
            queryClient.invalidateQueries({ queryKey: ['imsales-hidden-clients', year, month] });
            toast.success(`Cliente ocultado a partir de ${MONTH_NAMES[month - 1]} ${year}`);
            setHideConfirm(null);
        },
        onError: () => toast.error('Error al ocultar el cliente')
    });

    const { data: hiddenData } = useQuery({
        queryKey: ['imsales-hidden-clients', year, month],
        queryFn: () => imsalesApi.getHiddenClients(year, month),
        staleTime: 30_000,
    });
    const hiddenClients = hiddenData?.hidden ?? [];

    const unhideClientMutation = useMutation({
        mutationFn: (client_id: string) => imsalesApi.unhideClient({ client_id, fiscal_year: year, fiscal_month: month }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['imsales-billing', year, month] });
            queryClient.invalidateQueries({ queryKey: ['imsales-hidden-clients', year, month] });
            toast.success('Cliente reactivado y visible nuevamente');
        },
        onError: () => toast.error('Error al reactivar el cliente')
    });

    // Error state
    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                <h3 className="text-lg font-bold">Error al cargar datos</h3>
                <p>{(error as Error).message}</p>
                <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['imsales-billing'] })} className="mt-4">
                    Reintentar
                </Button>
            </div>
        );
    }

    // Handlers
    const handleServiceChange = (clientId: string, serviceId: string, val: number) => {
        saveMutation.mutate({
            client_id: clientId,
            fiscal_year: year,
            fiscal_month: month,
            service_id: serviceId,
            amount: val
        });
    };

    const handleCreateClient = async (clientData: CreateClientDTO) => {
        try {
            await clientsApi.create(clientData);
            queryClient.invalidateQueries({ queryKey: ['imsales-billing'] });
            setIsClientModalOpen(false);
            toast.success('Cliente creado exitosamente');
        } catch (err) {
            console.error(err);
            toast.error('Error al crear cliente');
        }
    };



    // KPI totals
    const totals = useMemo(() => {
        const result: Record<string, number> = { grand: 0 };
        services.forEach(svc => { result[svc.id] = 0; });
        investments.forEach(inv => {
            services.forEach(svc => {
                const amount = inv.services[svc.id] || 0;
                result[svc.id] += amount;
                result.grand += amount;
            });
        });
        return result;
    }, [investments, services]);

    return (
        <div className="space-y-6">
            {!embedded && (
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Billing Imsales</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Gestión de facturación del departamento Imsales por servicio.</p>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {services.map(svc => (
                    <Card key={svc.id} className="p-4 sm:p-6">
                        <p className="text-sm font-medium text-muted-foreground">Total {svc.name}</p>
                        <h3 className="text-xl sm:text-2xl font-bold mt-2 text-emerald-600 break-all">{formatCurrency(totals[svc.id] || 0)}</h3>
                    </Card>
                ))}
                <Card className="p-4 sm:p-6">
                    <p className="text-sm font-medium text-muted-foreground">Total General</p>
                    <h3 className="text-xl sm:text-2xl font-bold mt-2 break-all">{formatCurrency(totals.grand)}</h3>
                </Card>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-card border rounded-lg">
                <div className="flex items-center gap-4 flex-1">
                    <PeriodSelector value={date} onChange={setDate} />
                </div>
                <div className="flex gap-2">

                    <Button size="sm" className="gap-2" onClick={() => setIsClientModalOpen(true)}>
                        <UserPlus size={16} />
                        Nuevo Cliente
                    </Button>
                </div>
            </div>

            {/* Hidden clients banner */}
            {hiddenClients.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                    <button
                        onClick={() => setHiddenPanelOpen(o => !o)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-100/60 transition-colors"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                            <EyeOff size={14} />
                            <span>
                                {hiddenClients.length} cliente{hiddenClients.length > 1 ? 's' : ''} oculto{hiddenClients.length > 1 ? 's' : ''} en este período
                            </span>
                            <span className="text-amber-500 font-normal text-xs">— haz clic para ver cuáles</span>
                        </div>
                        {hiddenPanelOpen
                            ? <ChevronUp size={14} className="text-amber-500" />
                            : <ChevronDown size={14} className="text-amber-500" />}
                    </button>

                    {hiddenPanelOpen && (
                        <div className="border-t border-amber-200 divide-y divide-amber-100">
                            {hiddenClients.map(client => {
                                const hiddenYear = Math.floor(client.hidden_from_yyyymm / 100);
                                const hiddenMonth = client.hidden_from_yyyymm % 100;
                                return (
                                    <div key={client.id} className="flex items-center justify-between px-4 py-2.5 bg-white/60">
                                        <div>
                                            <span className="text-sm font-medium text-gray-800">{client.name}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                Oculto desde {MONTH_NAMES[hiddenMonth - 1]} {hiddenYear}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => unhideClientMutation.mutate(client.id)}
                                            disabled={unhideClientMutation.isPending}
                                            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-white border border-gray-200 hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
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

            {/* Main Table */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="h-12 px-4 text-left font-medium text-gray-600 min-w-[200px] sticky left-0 bg-gray-50 z-10 border-r">Cliente</th>
                                {services.map(svc => (
                                    <th key={svc.id} className="h-12 px-2 text-center font-medium text-emerald-700 w-40 bg-emerald-50/50 border-r border-emerald-100">
                                        {svc.name}
                                    </th>
                                ))}
                                <th className="h-12 px-2 text-center font-bold text-emerald-800 w-32 bg-emerald-100 border-l border-emerald-200">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={services.length + 2} className="p-8 text-center text-muted-foreground">Cargando datos...</td></tr>
                            ) : investments.length === 0 ? (
                                <tr><td colSpan={services.length + 2} className="p-8 text-center text-muted-foreground">No hay clientes Imsales registrados para este periodo.</td></tr>
                            ) : (
                                investments.map((inv: ImsalesClientBilling) => (
                                    <tr key={inv.client_id} className="border-b hover:bg-gray-50/50 group">
                                        <td className="p-3 font-medium sticky left-0 bg-white z-10 border-r">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>{inv.client_name}</span>
                                                <button
                                                    onClick={() => setHideConfirm({ client_id: inv.client_id, client_name: inv.client_name })}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-amber-100 text-gray-300 hover:text-amber-600 shrink-0"
                                                    title="Ocultar cliente en meses posteriores"
                                                >
                                                    <EyeOff size={14} />
                                                </button>
                                            </div>
                                        </td>
                                        {services.map(svc => (
                                            <td key={svc.id} className="p-1 border-r border-emerald-100">
                                                <NumericCell
                                                    value={inv.services[svc.id] || 0}
                                                    onSave={(val) => handleServiceChange(inv.client_id, svc.id, val)}
                                                    className="text-gray-600 border border-transparent hover:border-emerald-300 focus:border-emerald-500 bg-transparent focus:bg-white rounded"
                                                />
                                            </td>
                                        ))}
                                        <td className="p-2 text-right font-bold text-emerald-700 bg-emerald-50 border-l border-emerald-200">
                                            {formatCurrency(inv.total || 0)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-200">
                            <tr>
                                <td className="p-3 sticky left-0 bg-gray-100 z-10 border-r">TOTALES</td>
                                {services.map(svc => (
                                    <td key={svc.id} className="p-3 text-right border-r border-emerald-100 text-emerald-700">
                                        {formatCurrency(totals[svc.id] || 0)}
                                    </td>
                                ))}
                                <td className="p-3 text-right text-emerald-800 bg-emerald-100 border-l border-emerald-200">
                                    {formatCurrency(totals.grand)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>

            {/* Warning Modal */}
            {showWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-emerald-100 shrink-0">
                                <AlertCircle size={20} className="text-emerald-600" />
                            </div>
                            <h3 className="font-semibold text-gray-900 text-lg leading-snug pt-1">
                                Antes de seguir, revisa el mes
                            </h3>
                        </div>
                        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                            <p>
                                Hola <span className="font-semibold">{profile?.display_name ?? 'usuario'}</span>,
                            </p>
                            <p>
                                <span className="font-medium text-emerald-700">Importante:</span> la facturación se hace a mes vencido.
                                Eso significa que, aunque estés en el mes actual, puede que tengas que cargar la inversión del mes anterior.
                            </p>
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-emerald-800">
                                <p>Ejemplo: si estás en abril, seguramente te toque completar marzo.</p>
                                <p className="mt-1 font-medium">Revísalo siempre antes de guardar.</p>
                            </div>
                        </div>
                        <div className="flex justify-end pt-1">
                            <Button
                                onClick={() => setShowWarning(false)}
                                disabled={countdown > 0}
                                className="min-w-[140px]"
                            >
                                {countdown > 0 ? `Entendido (${countdown}s)` : 'Entendido'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hide confirmation modal */}
            {hideConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-amber-100 shrink-0">
                                <EyeOff size={18} className="text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">¿Ocultar este cliente?</h3>
                                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                                    <span className="font-medium text-gray-800">{hideConfirm.client_name}</span> dejará de
                                    aparecer a partir de{' '}
                                    <span className="font-medium text-gray-800">{MONTH_NAMES[month - 1]} {year}</span>.
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Los meses anteriores con datos registrados no se ven afectados.
                                    Los datos del cliente se conservan intactos.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end pt-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHideConfirm(null)}
                                disabled={hideClientMutation.isPending}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
                                onClick={() => hideClientMutation.mutate(hideConfirm.client_id)}
                                disabled={hideClientMutation.isPending}
                            >
                                <EyeOff size={14} />
                                {hideClientMutation.isPending ? 'Ocultando...' : 'Ocultar en meses posteriores'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Client Modal — pre-selects Imsales vertical */}
            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSave={handleCreateClient}
                defaultVerticalId={imsalesVerticalId}
            />

            {/* Change log */}
            <ChangeLogPanel module="imsales" />
        </div>
    );
}

export default function ImsalesBilling({ embedded = false }: { embedded?: boolean }) {
    return (
        <ErrorBoundary>
            <ImsalesBillingContent embedded={embedded} />
        </ErrorBoundary>
    );
}
