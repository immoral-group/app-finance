import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commissionsApi, Partner } from '@/lib/api/commissions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Plus, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '@/lib/api/client';

interface PartnersListProps {
    onSelectPartner: (partner: Partner) => void;
}

export function PartnersList({ onSelectPartner }: PartnersListProps) {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [newPartner, setNewPartner] = useState({ name: '', default_commission_rate: 10, department_id: '' });

    // Fetch Departments
    const { data: departmentsData } = useQuery({
        queryKey: ['departments'],
        queryFn: () => fetchApi<{ departments: { id: string, name: string }[] }>('/settings/departments', { service: 'ADMIN' }).catch(() => ({ departments: [] }))
    });
    const departments = departmentsData?.departments || [];

    const { data, isLoading } = useQuery({
        queryKey: ['partners'],
        queryFn: commissionsApi.getPartners
    });

    const createMutation = useMutation({
        mutationFn: () => commissionsApi.createPartner({
            name: newPartner.name,
            department_id: newPartner.department_id,
            default_commission_rate: newPartner.default_commission_rate
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partners'] });
            toast.success('Partner añadido exitosamente');
            setIsAdding(false);
            setNewPartner({ name: '', default_commission_rate: 10, department_id: '' });
        },
        onError: () => toast.error('Error al añadir el partner')
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => commissionsApi.deletePartner(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partners'] });
            toast.success('Partner eliminado');
        },
        onError: () => toast.error('Error al eliminar partner')
    });

    const partners = data?.partners || [];

    const handleSave = () => {
        if (!newPartner.name) return toast.error('El nombre es obligatorio');
        if (!newPartner.department_id) return toast.error('El departamento o vertical es obligatorio');
        createMutation.mutate();
    };

    return (
        <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Listado de Partners</h3>
                <Button onClick={() => setIsAdding(true)} size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Agregar Partner
                </Button>
            </div>

            {isAdding && (
                <div className="mb-6 p-4 border rounded-md bg-muted/20">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium">Nuevo Partner</h4>
                        <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                            <Input
                                value={newPartner.name}
                                onChange={e => setNewPartner({ ...newPartner, name: e.target.value })}
                                placeholder="Nombre comercial"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Columna/Vertical</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={newPartner.department_id}
                                onChange={(e) => setNewPartner({ ...newPartner, department_id: e.target.value })}
                            >
                                <option value="">Seleccione...</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Comisión Defecto (%)</label>
                            <Input
                                type="number"
                                value={newPartner.default_commission_rate}
                                onChange={e => setNewPartner({ ...newPartner, default_commission_rate: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsAdding(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={createMutation.isPending}>Guardar</Button>
                    </div>
                </div>
            )}

            <div className="rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Nombre del Partner</th>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Columna/Vertical</th>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Comisión por defecto</th>
                            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Estado</th>
                            <th className="h-10 px-4 text-right font-medium text-muted-foreground">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Cargando partners...</td></tr>
                        ) : partners.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No hay partners registrados.</td></tr>
                        ) : (
                            partners.map((partner) => (
                                <tr key={partner.id} className="border-b hover:bg-muted/50 transition-colors">
                                    <td className="p-4 font-medium">{partner.name}</td>
                                    <td className="p-4">{partner.department?.name || 'N/A'}</td>
                                    <td className="p-4">{partner.default_commission_rate}%</td>
                                    <td className="p-4 text-center">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                            Activo
                                        </span>
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2 items-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onSelectPartner(partner)}
                                        >
                                            Ver detalle <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => { if (confirm('¿Seguro que deseas eliminar a este partner y todas sus comisiones?')) deleteMutation.mutate(partner.id); }}
                                            disabled={deleteMutation.isPending}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
