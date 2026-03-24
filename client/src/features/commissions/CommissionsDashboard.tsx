import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commissionsApi, PaymentRequest } from '@/lib/api/commissions';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { Handshake, AlertCircle, CheckCircle2, TrendingUp, Users, Wallet, Clock, XCircle, Trash2, FileDown, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';


type PeriodType = 'year' | 'quarter' | 'month';

export function CommissionsDashboard() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [year, setYear] = useState(new Date().getFullYear());
    const [periodType, setPeriodType] = useState<PeriodType>('month');
    const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Fetch Annual Commissions
    const { data: commData, isLoading } = useQuery({
        queryKey: ['annual-commissions-all', year],
        queryFn: () => commissionsApi.getAnnualCommissions(year),
    });

    // Fetch Payment Requests
    const { data: requestsData } = useQuery({
        queryKey: ['payment-requests-all', year],
        queryFn: () => commissionsApi.getPaymentRequests({ year }),
    });

    const paymentRequests = requestsData?.requests || [];
    const pendingRequests = paymentRequests.filter((r: PaymentRequest) => r.status === 'pending');

    const allCommissions = commData?.commissions || [];

    // Filter based on selected period
    const filteredCommissions = useMemo(() => {
        return allCommissions.filter(c => {
            if (periodType === 'year') return true;
            if (periodType === 'quarter') {
                const quarterMonthStart = (selectedQuarter - 1) * 3 + 1;
                return c.fiscal_month >= quarterMonthStart && c.fiscal_month <= quarterMonthStart + 2;
            }
            if (periodType === 'month') {
                return c.fiscal_month === selectedMonth;
            }
            return true;
        });
    }, [allCommissions, periodType, selectedQuarter, selectedMonth]);

    // Financial Metrics
    const totalFacturado = filteredCommissions.reduce((sum, c) => sum + Number(c.client_billing_amount || 0), 0);
    const totalGenerated = filteredCommissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
    const totalPaid = filteredCommissions.filter(c => c.is_paid).reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
    const totalPending = totalGenerated - totalPaid;

    // Top Partner KPIs
    const partnerStats = useMemo(() => {
        const stats: Record<string, { name: string, commission: number, uniqueClients: Set<string> }> = {};
        filteredCommissions.forEach(c => {
            const pid = c.partner_id;
            if (!stats[pid]) {
                stats[pid] = { name: c.partner_name || 'Desconocido', commission: 0, uniqueClients: new Set() };
            }
            stats[pid].commission += Number(c.commission_amount || 0);
            stats[pid].uniqueClients.add(c.client_id);
        });
        return Object.values(stats);
    }, [filteredCommissions]);

    const topEarner = [...partnerStats].sort((a, b) => b.commission - a.commission)[0];
    const topTraffic = [...partnerStats].sort((a, b) => b.uniqueClients.size - a.uniqueClients.size)[0];

    const renderedPeriodLabel = useMemo(() => {
        if (periodType === 'month') return `${monthNames[selectedMonth - 1]} ${year}`;
        if (periodType === 'quarter') return `Trimestre ${selectedQuarter}, ${year}`;
        return `Año Completo ${year}`;
    }, [periodType, selectedMonth, selectedQuarter, year]);

    // Mutations for payment requests
    const updateRequestMutation = useMutation({
        mutationFn: ({ id, data }: { id: string, data: { status: string; admin_notes?: string; reviewed_by?: string } }) =>
            commissionsApi.updatePaymentRequest(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment-requests-all', year] });
            toast.success('Estado de solicitud actualizado');
        },
        onError: () => toast.error('Error al actualizar solicitud')
    });

    const deleteRequestMutation = useMutation({
        mutationFn: (id: string) => commissionsApi.deletePaymentRequest(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment-requests-all', year] });
            toast.success('Solicitud eliminada');
        },
        onError: () => toast.error('Error al eliminar solicitud')
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return { className: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" />, label: 'En revisión' };
            case 'approved': return { className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Aprobada' };
            case 'rejected': return { className: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" />, label: 'Rechazada' };
            default: return { className: 'bg-gray-100 text-gray-800', icon: null, label: status };
        }
    };

    const handleViewInvoice = async (req: PaymentRequest) => {
        try {
            const result = await commissionsApi.getPaymentRequestDetail(req.id);
            if (result.request?.invoice_url) {
                window.open(result.request.invoice_url, '_blank');
            } else {
                toast.error('No se pudo obtener el enlace de la factura');
            }
        } catch {
            toast.error('Error al descargar factura');
        }
    };

    return (
        <div className="space-y-6">
            {/* Pending Payment Requests Alert */}
            {pendingRequests.length > 0 && (
                <Card className="border-yellow-300 bg-yellow-50/50 shadow-sm">
                    <div className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-yellow-100 rounded-full"><Send className="h-4 w-4 text-yellow-700" /></div>
                            <h3 className="font-semibold text-yellow-800">
                                {pendingRequests.length} solicitud{pendingRequests.length > 1 ? 'es' : ''} de pago pendiente{pendingRequests.length > 1 ? 's' : ''}
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {pendingRequests.map((req: PaymentRequest) => (
                                <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-lg bg-white border border-yellow-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                                        <span className="font-medium text-sm">{req.partner?.name || 'Partner'}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {req.fiscal_month === 0 ? `Año completo ${req.fiscal_year}` : `${monthNames[req.fiscal_month - 1]} ${req.fiscal_year}`}
                                        </span>
                                        <span className="text-sm font-bold text-orange-600">{formatCurrency(req.total_amount)}</span>
                                        {req.partner_email && <span className="text-xs text-muted-foreground">📧 {req.partner_email}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs gap-1"
                                            onClick={() => handleViewInvoice(req)}
                                        >
                                            <FileDown className="h-3 w-3" /> Factura
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="text-xs bg-green-600 hover:bg-green-700 gap-1"
                                            onClick={() => updateRequestMutation.mutate({
                                                id: req.id,
                                                data: { status: 'approved', reviewed_by: user?.id }
                                            })}
                                            disabled={updateRequestMutation.isPending}
                                        >
                                            <CheckCircle2 className="h-3 w-3" /> Aprobar
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                                            onClick={() => updateRequestMutation.mutate({
                                                id: req.id,
                                                data: { status: 'rejected', reviewed_by: user?.id }
                                            })}
                                            disabled={updateRequestMutation.isPending}
                                        >
                                            <XCircle className="h-3 w-3" /> Rechazar
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                                            onClick={() => {
                                                if (confirm('¿Eliminar esta solicitud?')) deleteRequestMutation.mutate(req.id);
                                            }}
                                            disabled={deleteRequestMutation.isPending}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-muted/30 p-4 rounded-xl border border-muted">
                <div>
                    <h2 className="text-xl font-bold">{renderedPeriodLabel}</h2>
                    <p className="text-sm text-muted-foreground">Resumen de comisiones para este periodo</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex rounded-md border text-sm overflow-hidden bg-background">
                        <button onClick={() => setPeriodType('month')} className={`px-3 py-1.5 ${periodType === 'month' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}>Mensual</button>
                        <button onClick={() => setPeriodType('quarter')} className={`px-3 py-1.5 border-l ${periodType === 'quarter' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}>Trimestral</button>
                        <button onClick={() => setPeriodType('year')} className={`px-3 py-1.5 border-l ${periodType === 'year' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}>Anual</button>
                    </div>

                    <div className="flex items-center gap-2">
                        <select className="h-9 rounded-md border bg-background px-3 py-1 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
                            {[...Array(5)].map((_, i) => {
                                const y = new Date().getFullYear() - 2 + i;
                                return <option key={y} value={y}>{y}</option>;
                            })}
                        </select>

                        {periodType === 'month' && (
                            <select className="h-9 rounded-md border bg-background px-3 py-1 text-sm" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
                                {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                        )}

                        {periodType === 'quarter' && (
                            <select className="h-9 rounded-md border bg-background px-3 py-1 text-sm" value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}>
                                <option value={1}>Trimestre 1 (Ene-Mar)</option>
                                <option value={2}>Trimestre 2 (Abr-Jun)</option>
                                <option value={3}>Trimestre 3 (Jul-Sep)</option>
                                <option value={4}>Trimestre 4 (Oct-Dic)</option>
                            </select>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Row KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-muted-foreground">Facturado a Clientes</p>
                            <div className="p-2 bg-indigo-100/50 rounded-full text-indigo-600"><Wallet size={16} /></div>
                        </div>
                        <h3 className="text-2xl font-bold mt-2">{formatCurrency(totalFacturado)}</h3>
                        <p className="text-xs text-muted-foreground mt-1">Importe base para comisiones</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-orange-200/50">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-orange-600/80">Comisiones Generadas</p>
                            <div className="p-2 bg-orange-100 rounded-full text-orange-600"><Handshake size={16} /></div>
                        </div>
                        <h3 className="text-2xl font-bold mt-2 text-orange-600">{formatCurrency(totalGenerated)}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalFacturado > 0 ? ((totalGenerated / totalFacturado) * 100).toFixed(1) : 0}% del Facturado Total
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-blue-200/50">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-blue-600/80">Comisiones Pagadas</p>
                            <div className="p-2 bg-blue-100 rounded-full text-blue-600"><CheckCircle2 size={16} /></div>
                        </div>
                        <h3 className="text-2xl font-bold mt-2 text-blue-600">{formatCurrency(totalPaid)}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalGenerated > 0 ? ((totalPaid / totalGenerated) * 100).toFixed(0) : 0}% procesado
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-red-200/50">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-red-600/80">Comisiones Pendientes</p>
                            <div className="p-2 bg-red-100 rounded-full text-red-600"><AlertCircle size={16} /></div>
                        </div>
                        <h3 className="text-2xl font-bold mt-2 text-red-600">{formatCurrency(totalPending)}</h3>
                        <p className="text-xs text-muted-foreground mt-1 text-red-600/70">Esperando pago a partner</p>
                    </CardContent>
                </Card>
            </div>

            {/* Middle Row: Partner Superstars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-gradient-to-br from-background to-muted/20">
                    <div className="p-6">
                        <div className="flex gap-3 items-center mb-4">
                            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><TrendingUp size={20} /></div>
                            <div>
                                <h3 className="text-base font-semibold">Top Earner</h3>
                                <p className="text-xs text-muted-foreground">Partner con más comisiones generadas</p>
                            </div>
                        </div>
                        {topEarner ? (
                            <div className="flex justify-between items-baseline mt-4 border-t pt-4 border-border/50">
                                <span className="font-bold text-lg">{topEarner.name}</span>
                                <span className="font-bold text-xl text-orange-600">{formatCurrency(topEarner.commission)}</span>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-border/50 text-muted-foreground text-sm">Sin datos suficientes</div>
                        )}
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-background to-muted/20">
                    <div className="p-6">
                        <div className="flex gap-3 items-center mb-4">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Users size={20} /></div>
                            <div>
                                <h3 className="text-base font-semibold">Top Tráfico</h3>
                                <p className="text-xs text-muted-foreground">Partner con más clientes referidos únicos</p>
                            </div>
                        </div>
                        {topTraffic ? (
                            <div className="flex justify-between items-baseline mt-4 border-t pt-4 border-border/50">
                                <span className="font-bold text-lg">{topTraffic.name}</span>
                                <span className="font-bold text-xl text-emerald-600">{topTraffic.uniqueClients.size} Clientes</span>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-border/50 text-muted-foreground text-sm">Sin datos suficientes</div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Payment Requests History */}
            {paymentRequests.length > 0 && (
                <Card>
                    <div className="p-6">
                        <h3 className="text-lg font-medium mb-4">Historial de Solicitudes de Pago</h3>
                        <div className="rounded-md border overflow-x-auto">
                            <table className="w-full text-sm min-w-[700px]">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Partner</th>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Período</th>
                                        <th className="h-9 px-4 text-right font-medium text-muted-foreground">Monto</th>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Email</th>
                                        <th className="h-9 px-4 text-center font-medium text-muted-foreground">Estado</th>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Fecha</th>
                                        <th className="h-9 px-4 text-right font-medium text-muted-foreground">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paymentRequests.map((req: PaymentRequest) => {
                                        const badge = getStatusBadge(req.status);
                                        return (
                                            <tr key={req.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                                <td className="p-3 font-medium">{req.partner?.name || '-'}</td>
                                                <td className="p-3 text-muted-foreground text-xs">
                                                    {req.fiscal_month === 0 ? `Año ${req.fiscal_year}` : `${monthNames[req.fiscal_month - 1]} ${req.fiscal_year}`}
                                                </td>
                                                <td className="p-3 text-right font-bold text-orange-600">{formatCurrency(req.total_amount)}</td>
                                                <td className="p-3 text-xs text-muted-foreground">{req.partner_email}</td>
                                                <td className="p-3 text-center">
                                                    <select
                                                        className={`px-2 py-1 rounded-full text-[10px] font-bold cursor-pointer outline-none text-center appearance-none ${badge.className}`}
                                                        value={req.status}
                                                        onChange={(e) => updateRequestMutation.mutate({
                                                            id: req.id,
                                                            data: { status: e.target.value, reviewed_by: user?.id }
                                                        })}
                                                    >
                                                        <option value="pending">EN REVISIÓN</option>
                                                        <option value="approved">APROBADA</option>
                                                        <option value="rejected">RECHAZADA</option>
                                                    </select>
                                                </td>
                                                <td className="p-3 text-xs text-muted-foreground">
                                                    {new Date(req.requested_at).toLocaleDateString('es-ES')}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0"
                                                            title="Ver factura"
                                                            onClick={() => handleViewInvoice(req)}
                                                        >
                                                            <FileDown className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                                                            onClick={() => {
                                                                if (confirm('¿Eliminar esta solicitud?')) deleteRequestMutation.mutate(req.id);
                                                            }}
                                                            disabled={deleteRequestMutation.isPending}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Card>
            )}

            {/* Bottom Row: Recent Transactions View */}
            <Card>
                <div className="p-6">
                    <h3 className="text-lg font-medium mb-4">Transacciones en este periodo</h3>
                    {isLoading ? (
                        <p className="text-muted-foreground text-sm flex items-center gap-2"><div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" /> Cargando...</p>
                    ) : filteredCommissions.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4">No hay comisiones registradas en {renderedPeriodLabel.toLowerCase()}.</p>
                    ) : (
                        <div className="rounded-md border overflow-x-auto overflow-hidden">
                            <table className="w-full text-sm min-w-[600px]">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Mes/Año</th>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Partner</th>
                                        <th className="h-9 px-4 text-left font-medium text-muted-foreground">Cliente Referido</th>
                                        <th className="h-9 px-4 text-right font-medium text-muted-foreground">Facturado</th>
                                        <th className="h-9 px-4 text-right font-medium text-muted-foreground">Comisión</th>
                                        <th className="h-9 px-4 text-center font-medium text-muted-foreground">Estado Partner</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCommissions.map(c => (
                                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                            <td className="p-3 text-muted-foreground text-xs">{monthNames[c.fiscal_month - 1].substring(0, 3)} {c.fiscal_year}</td>
                                            <td className="p-3 font-medium">{c.partner_name}</td>
                                            <td className="p-3 text-muted-foreground">{c.client_name || '-'}</td>
                                            <td className="p-3 text-right">{formatCurrency(c.client_billing_amount)}</td>
                                            <td className="p-3 text-right font-medium text-orange-600">{formatCurrency(c.commission_amount)}</td>
                                            <td className="p-3 text-center">
                                                <span className={`text-[10px] items-center gap-1 inline-flex px-2 py-0.5 rounded-full font-bold ${c.is_paid ? 'bg-blue-100 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                                                    {c.is_paid ? 'PAGADO' : 'PENDIENTE'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
