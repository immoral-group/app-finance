import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { commissionsApi, Partner, PaymentRequest } from '@/lib/api/commissions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, Trash2, Edit2, Send, FileUp, Loader2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface PartnerDetailProps {
    partner: Partner;
    onBack: () => void;
}

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthNamesFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

import { fetchApi } from '@/lib/api/client';
import { Input } from '@/components/ui/Input';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

export function PartnerDetail({ partner, onBack }: PartnerDetailProps) {
    const { isPartner, user } = useAuth();
    const queryClient = useQueryClient();
    const [year, setYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [newCommission, setNewCommission] = useState({
        client_id: '',
        fiscal_month: new Date().getMonth() + 1,
        client_billing_amount: 0,
        commission_rate: partner.default_commission_rate,
        is_paid: false,
        notes: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);

    // Payment request state
    const [paymentForm, setPaymentForm] = useState({
        partner_email: partner.email || '',
        notes: '',
        requestMonth: 0 as number // 0 = all pending
    });
    const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

    // Fetch clients
    const { data: clientsData } = useQuery({
        queryKey: ['clients'],
        queryFn: () => fetchApi<{ clients: { id: string, name: string }[] }>('/clients', { service: 'ADMIN' }).catch(() => ({ clients: [] }))
    });
    const clients = clientsData?.clients || [];

    const { data, isLoading } = useQuery({
        queryKey: ['annual-commissions', year, partner.id],
        queryFn: () => commissionsApi.getAnnualCommissions(year, partner.id),
    });

    // Fetch payment requests for this partner
    const { data: paymentRequestsData } = useQuery({
        queryKey: ['payment-requests', partner.id, year],
        queryFn: () => commissionsApi.getPaymentRequests({ partner_id: partner.id, year }),
    });

    const paymentRequests = paymentRequestsData?.requests || [];
    const allCommissions = data?.commissions || [];

    // Filter by month if selected
    const partnerCommissions = useMemo(() => {
        if (selectedMonth === null) return allCommissions;
        return allCommissions.filter(c => c.fiscal_month === selectedMonth);
    }, [allCommissions, selectedMonth]);

    const totalFacturado = partnerCommissions.reduce((sum, c) => sum + Number(c.client_billing_amount), 0);
    const totalGenerado = partnerCommissions.reduce((sum, c) => sum + Number(c.commission_amount), 0);
    const totalPagado = partnerCommissions.filter(c => c.is_paid || c.payment_status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount), 0);
    const pendingAmount = totalGenerado - totalPagado;

    // Calculate pending amount for the payment modal based on selected scope
    const paymentModalAmount = useMemo(() => {
        if (paymentForm.requestMonth === 0) {
            // All pending for the year
            const yearPending = allCommissions
                .filter(c => !c.is_paid && c.payment_status !== 'paid')
                .reduce((sum, c) => sum + Number(c.commission_amount), 0);
            return yearPending;
        }
        // Specific month
        const monthComms = allCommissions.filter(c => c.fiscal_month === paymentForm.requestMonth);
        const monthPending = monthComms
            .filter(c => !c.is_paid && c.payment_status !== 'paid')
            .reduce((sum, c) => sum + Number(c.commission_amount), 0);
        return monthPending;
    }, [allCommissions, paymentForm.requestMonth]);

    const createMutation = useMutation({
        mutationFn: () => commissionsApi.createCommission({
            partner_id: partner.id,
            client_id: newCommission.client_id,
            fiscal_year: year,
            fiscal_month: newCommission.fiscal_month,
            client_billing_amount: newCommission.client_billing_amount,
            commission_rate: newCommission.commission_rate,
            commission_amount: newCommission.client_billing_amount * (newCommission.commission_rate / 100),
            is_paid: newCommission.is_paid,
            notes: newCommission.notes
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['annual-commissions', year, partner.id] });
            toast.success('Comisión añadida exitosamente');
            setIsAdding(false);
            setEditingId(null);
            setNewCommission(prev => ({ ...prev, client_billing_amount: 0, notes: '', is_paid: false }));
        },
        onError: (_error: any) => { }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string, data: any }) => commissionsApi.updateCommission(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['annual-commissions', year, partner.id] });
            toast.success('Estado actualizado');
        },
        onError: () => toast.error('Error al actualizar estado')
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => commissionsApi.deleteCommission(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['annual-commissions', year, partner.id] });
            toast.success('Comisión eliminada');
        },
        onError: () => toast.error('Error al eliminar comisión')
    });

    const paymentRequestMutation = useMutation({
        mutationFn: async () => {
            if (!invoiceFile) throw new Error('Adjunte la factura');
            if (!paymentForm.partner_email) throw new Error('Ingrese su correo electrónico');

            const formData = new FormData();
            formData.append('partner_id', partner.id);
            formData.append('partner_email', paymentForm.partner_email);
            formData.append('fiscal_year', String(year));
            formData.append('fiscal_month', String(paymentForm.requestMonth || 0));
            formData.append('total_amount', String(paymentModalAmount));
            formData.append('notes', paymentForm.notes);
            formData.append('invoice', invoiceFile);

            return commissionsApi.requestPayment(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment-requests', partner.id, year] });
            toast.success('Solicitud de pago enviada exitosamente. Recibirás un email de confirmación.');
            setShowPaymentModal(false);
            setInvoiceFile(null);
            setPaymentForm(prev => ({ ...prev, notes: '', requestMonth: 0 }));
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al enviar solicitud');
        }
    });

    const deleteRequestMutation = useMutation({
        mutationFn: (id: string) => commissionsApi.deletePaymentRequest(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment-requests', partner.id, year] });
            toast.success('Solicitud eliminada');
        },
        onError: () => toast.error('Error al eliminar solicitud')
    });

    const updateRequestMutation = useMutation({
        mutationFn: ({ id, data }: { id: string, data: { status: string; admin_notes?: string; reviewed_by?: string } }) =>
            commissionsApi.updatePaymentRequest(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment-requests', partner.id, year] });
            toast.success('Estado de solicitud actualizado');
        },
        onError: () => toast.error('Error al actualizar solicitud')
    });

    const handleSave = () => {
        if (!newCommission.client_id) return toast.error('Debe seleccionar un cliente');
        if (newCommission.client_billing_amount <= 0) return toast.error('El importe debe ser mayor a 0');

        if (editingId) {
            updateMutation.mutate({
                id: editingId,
                data: {
                    fiscal_month: newCommission.fiscal_month,
                    client_id: newCommission.client_id,
                    client_billing_amount: newCommission.client_billing_amount,
                    commission_rate: newCommission.commission_rate,
                    commission_amount: newCommission.client_billing_amount * (newCommission.commission_rate / 100),
                    is_paid: newCommission.is_paid,
                    notes: newCommission.notes
                }
            });
            setIsAdding(false);
            setEditingId(null);
        } else {
            createMutation.mutate();
        }
    };

    const handleEdit = (c: any) => {
        setEditingId(c.id);
        setNewCommission({
            client_id: c.client_id,
            fiscal_month: c.fiscal_month,
            client_billing_amount: c.client_billing_amount,
            commission_rate: c.commission_rate,
            is_paid: c.is_paid,
            notes: c.notes || ''
        });
        setIsAdding(true);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingId(null);
        setNewCommission({
            client_id: '',
            fiscal_month: new Date().getMonth() + 1,
            client_billing_amount: 0,
            commission_rate: partner.default_commission_rate,
            is_paid: false,
            notes: ''
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return { className: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" />, label: 'En revisión' };
            case 'approved': return { className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Aprobada' };
            case 'rejected': return { className: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" />, label: 'Rechazada' };
            default: return { className: 'bg-gray-100 text-gray-800', icon: null, label: status };
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                {!isPartner() && (
                    <Button variant="ghost" onClick={onBack} size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                    </Button>
                )}
                <h2 className="text-xl sm:text-2xl font-bold">Detalle: {partner.name}</h2>
            </div>

            {/* Year selector + Month filter */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex flex-wrap gap-1">
                    <button
                        onClick={() => setSelectedMonth(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedMonth === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                        Todos
                    </button>
                    {monthNames.map((m, i) => (
                        <button
                            key={i}
                            onClick={() => setSelectedMonth(i + 1)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedMonth === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-bold text-lg w-16 text-center">{year}</span>
                    <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Total Facturado</p>
                    <p className="text-xl font-bold">{formatCurrency(totalFacturado)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Comisiones Generadas</p>
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(totalGenerado)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Pagado</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(totalPagado)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Pendiente</p>
                    <p className="text-xl font-bold text-orange-600">{formatCurrency(pendingAmount)}</p>
                </Card>
            </div>

            {/* General payment request button for partners */}
            {isPartner() && (
                <Card className="p-4 border-dashed border-2 border-primary/30 bg-primary/5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                            <h3 className="font-medium">Solicitar Pago de Comisiones</h3>
                            <p className="text-sm text-muted-foreground">
                                Adjunta tu factura y solicita el pago de tus comisiones pendientes.
                            </p>
                        </div>
                        <Button onClick={() => {
                            setPaymentForm(prev => ({ ...prev, requestMonth: selectedMonth || 0 }));
                            setShowPaymentModal(true);
                        }} className="gap-2">
                            <Send className="h-4 w-4" /> Solicitar Pago
                        </Button>
                    </div>
                </Card>
            )}

            {/* Existing payment requests list */}
            {paymentRequests.length > 0 && (
                <Card className="p-4">
                    <h3 className="text-lg font-medium mb-3">Solicitudes de Pago</h3>
                    <div className="space-y-2">
                        {paymentRequests.map((req: PaymentRequest) => {
                            const badge = getStatusBadge(req.status);
                            return (
                                <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-lg border bg-muted/10 hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                                            {badge.icon} {badge.label}
                                        </span>
                                        <div className="min-w-0">
                                            <span className="text-sm font-medium">
                                                {req.fiscal_month === 0 ? `Año completo ${req.fiscal_year}` : `${monthNamesFull[req.fiscal_month - 1]} ${req.fiscal_year}`}
                                            </span>
                                            <span className="text-sm text-muted-foreground ml-2">
                                                — {formatCurrency(req.total_amount)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {req.invoice_filename && (
                                            <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={req.invoice_filename}>
                                                📎 {req.invoice_filename}
                                            </span>
                                        )}
                                        {/* Admin: change status */}
                                        {!isPartner() && (
                                            <select
                                                className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer outline-none appearance-none ${badge.className}`}
                                                value={req.status}
                                                onChange={(e) => updateRequestMutation.mutate({
                                                    id: req.id,
                                                    data: { status: e.target.value, reviewed_by: user?.id }
                                                })}
                                            >
                                                <option value="pending">En revisión</option>
                                                <option value="approved">Aprobada</option>
                                                <option value="rejected">Rechazada</option>
                                            </select>
                                        )}
                                        {/* Delete button for both partner (cancel) and admin */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                                            onClick={() => {
                                                const msg = isPartner() ? '¿Cancelar esta solicitud?' : '¿Eliminar esta solicitud?';
                                                if (confirm(msg)) deleteRequestMutation.mutate(req.id);
                                            }}
                                            disabled={deleteRequestMutation.isPending}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            <Card className="p-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                    <h3 className="text-lg font-medium">
                        Operaciones Registradas
                        {selectedMonth !== null && (
                            <span className="text-sm font-normal text-muted-foreground ml-2">— {monthNamesFull[selectedMonth - 1]} {year}</span>
                        )}
                    </h3>
                    {!isPartner() && (
                        <Button onClick={() => { setIsAdding(true); setEditingId(null); }} size="sm">
                            <Plus className="mr-2 h-4 w-4" /> Registrar Comisión
                        </Button>
                    )}
                </div>

                {isAdding && (
                    <div className="mb-6 p-4 border rounded-md bg-muted/20">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-medium">{editingId ? 'Editar Comisión' : `Nueva Comisión - ${year}`}</h4>
                            <Button variant="ghost" size="sm" onClick={handleCancel}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Mes</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={newCommission.fiscal_month}
                                    onChange={(e) => setNewCommission({ ...newCommission, fiscal_month: Number(e.target.value) })}
                                >
                                    {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={newCommission.client_id}
                                    onChange={(e) => setNewCommission({ ...newCommission, client_id: e.target.value })}
                                >
                                    <option value="">Seleccione...</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Descripción (Opcional)</label>
                                <Input
                                    value={newCommission.notes}
                                    onChange={e => setNewCommission({ ...newCommission, notes: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Facturado (€)</label>
                                <Input
                                    type="number"
                                    value={newCommission.client_billing_amount}
                                    onChange={e => setNewCommission({ ...newCommission, client_billing_amount: Number(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Comisión (%)</label>
                                <Input
                                    type="number"
                                    value={newCommission.commission_rate}
                                    onChange={e => setNewCommission({ ...newCommission, commission_rate: Number(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={newCommission.is_paid ? 'paid' : 'pending'}
                                    onChange={(e) => setNewCommission({ ...newCommission, is_paid: e.target.value === 'paid' })}
                                >
                                    <option value="pending">Pendiente</option>
                                    <option value="paid">Pagado</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <span className="mr-auto text-sm my-auto text-muted-foreground">
                                Importe Comisión: <strong className="text-foreground">{formatCurrency(newCommission.client_billing_amount * (newCommission.commission_rate / 100))}</strong>
                            </span>
                            <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                                {editingId ? 'Actualizar' : 'Guardar'}
                            </Button>
                        </div>
                    </div>
                )}

                <div className="rounded-md border overflow-x-auto mt-2">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Mes</th>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cliente</th>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Descripción</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Facturado</th>
                                <th className="h-10 px-4 text-center font-medium text-muted-foreground" title="Estado de pago del cliente">Cobrado</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Comisión %</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Comisión (€)</th>
                                <th className="h-10 px-4 text-center font-medium text-muted-foreground" title="Estado de pago al partner">Pagado</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                            ) : partnerCommissions.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                                    {selectedMonth !== null
                                        ? `No hay operaciones registradas para ${monthNamesFull[selectedMonth - 1]} ${year}.`
                                        : 'No hay operaciones registradas para este año.'
                                    }
                                </td></tr>
                            ) : (
                                partnerCommissions.map((c) => (
                                    <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                                        <td className="p-4 font-medium">{monthNames[c.fiscal_month - 1]}</td>
                                        <td className="p-4">{c.client?.name || c.client_name || '-'}</td>
                                        <td className="p-4 text-muted-foreground text-xs">{c.notes || '-'}</td>
                                        <td className="p-4 text-right">{formatCurrency(c.client_billing_amount)}</td>
                                        <td className="p-4 text-center">
                                            {isPartner() ? (
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold text-center inline-block ${c.client_is_paid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {c.client_is_paid ? 'COBRADO' : 'PENDIENTE'}
                                                </span>
                                            ) : (
                                                <select
                                                    className={`px-2 py-1 rounded-full text-[10px] font-bold cursor-pointer outline-none text-center appearance-none ${c.client_is_paid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}
                                                    value={c.client_is_paid ? 'paid' : 'pending'}
                                                    onChange={(e) => updateMutation.mutate({ id: c.id, data: { client_is_paid: e.target.value === 'paid' } })}
                                                >
                                                    <option value="pending" className="text-black bg-white">PENDIENTE</option>
                                                    <option value="paid" className="text-black bg-white">COBRADO</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">{c.commission_rate}%</td>
                                        <td className="p-4 text-right font-bold text-orange-600">{formatCurrency(c.commission_amount)}</td>
                                        <td className="p-4 text-center">
                                            {isPartner() ? (
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold text-center inline-block ${c.is_paid ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {c.is_paid ? 'PAGADO' : 'PENDIENTE'}
                                                </span>
                                            ) : (
                                                <select
                                                    className={`px-2 py-1 rounded-full text-[10px] font-bold cursor-pointer outline-none text-center appearance-none ${c.is_paid ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}
                                                    value={c.is_paid ? 'paid' : 'pending'}
                                                    onChange={(e) => updateMutation.mutate({ id: c.id, data: { is_paid: e.target.value === 'paid' } })}
                                                >
                                                    <option value="pending" className="text-black bg-white">PENDIENTE</option>
                                                    <option value="paid" className="text-black bg-white">PAGADO</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="p-4 text-right flex justify-end gap-1">
                                            {!isPartner() && (
                                                <>
                                                    <Button variant="ghost" size="sm" className="hover:bg-muted" onClick={() => handleEdit(c)}>
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { if (confirm('¿Eliminar esta comisión?')) deleteMutation.mutate(c.id); }} disabled={deleteMutation.isPending}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-muted/30 font-bold border-t">
                            <tr>
                                <td colSpan={3} className="p-4">Totales</td>
                                <td className="p-4 text-right">{formatCurrency(totalFacturado)}</td>
                                <td></td>
                                <td></td>
                                <td className="p-4 text-right text-orange-600">{formatCurrency(totalGenerado)}</td>
                                <td className="p-4 text-center">
                                    <div className="text-xs font-normal text-muted-foreground">Pagado: <span className="text-blue-600 font-bold">{formatCurrency(totalPagado)}</span></div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>

            {/* Payment Request Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-background rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5 border">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold">Solicitar Pago de Comisiones</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowPaymentModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground block mb-1">¿Qué comisiones solicitar?</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={paymentForm.requestMonth}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, requestMonth: Number(e.target.value) })}
                                >
                                    <option value={0}>📋 Todas las pendientes del año {year}</option>
                                    {monthNamesFull.map((m, i) => (
                                        <option key={i} value={i + 1}>📅 Solo {m} {year}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="bg-muted/30 rounded-lg p-3">
                                <p className="text-sm text-muted-foreground">Monto pendiente a solicitar</p>
                                <p className="text-2xl font-bold text-orange-600">{formatCurrency(paymentModalAmount)}</p>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-muted-foreground block mb-1">Tu correo electrónico *</label>
                                <Input
                                    type="email"
                                    placeholder="tu@correo.com"
                                    value={paymentForm.partner_email}
                                    onChange={e => setPaymentForm({ ...paymentForm, partner_email: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Recibirás confirmación de tu solicitud aquí.</p>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-muted-foreground block mb-1">Adjuntar factura *</label>
                                <label className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${invoiceFile ? 'border-green-400 bg-green-50/50' : 'border-muted-foreground/30'}`}>
                                    <FileUp className={`h-5 w-5 ${invoiceFile ? 'text-green-600' : 'text-muted-foreground'}`} />
                                    <div className="flex-1 min-w-0">
                                        {invoiceFile ? (
                                            <p className="text-sm font-medium truncate text-green-700">{invoiceFile.name}</p>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Haz clic para seleccionar (PDF, JPG, PNG)</p>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                                    />
                                </label>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-muted-foreground block mb-1">Notas (Opcional)</label>
                                <textarea
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                                    placeholder="Información adicional..."
                                    value={paymentForm.notes}
                                    onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>Cancelar</Button>
                            <Button
                                onClick={() => paymentRequestMutation.mutate()}
                                disabled={paymentRequestMutation.isPending || !invoiceFile || !paymentForm.partner_email || paymentModalAmount <= 0}
                                className="gap-2"
                            >
                                {paymentRequestMutation.isPending ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                                ) : (
                                    <><Send className="h-4 w-4" /> Enviar Solicitud</>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
