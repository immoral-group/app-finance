import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { commissionsApi, Partner } from '@/lib/api/commissions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, Trash2, Edit2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface PartnerDetailProps {
    partner: Partner;
    onBack: () => void;
}

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Mock fetch for clients if not available in commissionsApi yet. 
// We should really fetch clients from the API. Let me add a basic fetch for clients.
import { fetchApi } from '@/lib/api/client';
import { Input } from '@/components/ui/Input';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

export function PartnerDetail({ partner, onBack }: PartnerDetailProps) {
    const { isPartner } = useAuth();
    const queryClient = useQueryClient();
    const [year, setYear] = useState(new Date().getFullYear());
    const [isAdding, setIsAdding] = useState(false);
    const [newCommission, setNewCommission] = useState({
        client_id: '',
        fiscal_month: new Date().getMonth() + 1,
        client_billing_amount: 0,
        commission_rate: partner.default_commission_rate,
        is_paid: false,
        notes: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);

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

    const partnerCommissions = data?.commissions || [];
    const totalFacturado = partnerCommissions.reduce((sum, c) => sum + Number(c.client_billing_amount), 0);
    const totalGenerado = partnerCommissions.reduce((sum, c) => sum + Number(c.commission_amount), 0);
    const totalPagado = partnerCommissions.filter(c => c.is_paid || c.payment_status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount), 0);

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
        onError: (_error: any) => {
        }
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

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={onBack} size="sm">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                </Button>
                <h2 className="text-2xl font-bold">Detalle Partner: {partner.name}</h2>
            </div>

            <div className="flex justify-end items-center gap-2 mb-4">
                <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-bold text-lg w-16 text-center">{year}</span>
                <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <p className="text-xl font-bold text-orange-600">{formatCurrency(totalGenerado - totalPagado)}</p>
                </Card>
            </div>

            <Card className="p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">Operaciones Registradas</h3>
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
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
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

                <div className="rounded-md border mt-2">
                    <table className="w-full text-sm">
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
                                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                            ) : partnerCommissions.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No hay operaciones registradas para este año.</td></tr>
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
        </div>
    );
}
