import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Copy, Filter } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ClientModal } from './components/ClientModal';
import { clientsApi } from '../../lib/api/clients';
import { Client, CreateClientDTO } from '../../types/client';

export const ClientsPage: React.FC = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [verticals, setVerticals] = useState<{ id: string, name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVertical, setSelectedVertical] = useState<string>('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
    const [isViewMode, setIsViewMode] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [clientsData, verticalsData] = await Promise.all([
                clientsApi.getAll(),
                clientsApi.getVerticals()
            ]);
            setClients(clientsData);
            setVerticals(verticalsData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreate = async (data: CreateClientDTO) => {
        if (isViewMode) return;
        try {
            if (editingClient) {
                await clientsApi.update(editingClient.id, data);
            } else {
                await clientsApi.create(data);
            }
            await fetchData();
            setIsModalOpen(false);
            setEditingClient(undefined);
        } catch (error) {
            console.error(error);
            alert('Error al guardar cliente');
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
            try {
                await clientsApi.delete(id);
                await fetchData();
            } catch (error) {
                console.error(error);
                alert('Error al eliminar cliente');
            }
        }
    };

    const handleDuplicate = async (e: React.MouseEvent, client: Client) => {
        e.stopPropagation();
        const newName = prompt(`Duplicar cliente "${client.name}". Nuevo nombre:`, `${client.name} (Copia)`);
        if (newName) {
            try {
                await clientsApi.duplicate(client.id, newName);
                await fetchData();
            } catch (error) {
                console.error(error);
                alert('Error al duplicar cliente');
            }
        }
    };

    const openCreateModal = () => {
        setEditingClient(undefined);
        setIsViewMode(false);
        setIsModalOpen(true);
    };

    const openEditModal = (e: React.MouseEvent, client: Client) => {
        e.stopPropagation();
        setEditingClient(client);
        setIsViewMode(false);
        setIsModalOpen(true);
    };

    const openViewModal = (client: Client) => {
        setEditingClient(client);
        setIsViewMode(true);
        setIsModalOpen(true);
    };

    const filteredClients = clients.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesVertical = selectedVertical ? c.vertical_id === selectedVertical : true;
        return matchesSearch && matchesVertical;
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gestión de Clientes</h1>
                    <p className="text-muted-foreground text-sm">Configura los fees, costos de plataforma y datos de facturación.</p>
                </div>
                <Button onClick={openCreateModal} className="text-xs sm:text-sm">
                    <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
                </Button>
            </div>

            <Card className="p-4">
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nombre o email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-md px-3 bg-white">
                            <Filter className="h-4 w-4 text-muted-foreground mr-2" />
                            <select
                                className="h-9 text-sm bg-transparent outline-none border-none cursor-pointer min-w-0 sm:min-w-[150px] w-full sm:w-auto"
                                value={selectedVertical}
                                onChange={e => setSelectedVertical(e.target.value)}
                            >
                                <option value="">Todas las Verticales</option>
                                {verticals.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="h-12 px-4 text-left font-medium text-muted-foreground">Cliente</th>
                                <th className="h-12 px-4 text-left font-medium text-muted-foreground">Email</th>
                                <th className="h-12 px-4 text-left font-medium text-muted-foreground">Vertical</th>
                                <th className="h-12 px-4 text-left font-medium text-muted-foreground">Fee Config</th>
                                <th className="h-12 px-4 text-right font-medium text-muted-foreground">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="h-24 text-center">Cargando...</td>
                                </tr>
                            ) : filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="h-24 text-center text-muted-foreground">No se encontraron clientes</td>
                                </tr>
                            ) : (
                                filteredClients.map((client) => (
                                    <tr
                                        key={client.id}
                                        className="border-b hover:bg-gray-50/50 transition-colors group"
                                    >
                                        <td
                                            className="p-4 font-medium cursor-pointer text-blue-900 group-hover:text-blue-600 group-hover:underline"
                                            onClick={() => openViewModal(client)}
                                            title="Ver detalles"
                                        >
                                            {client.name}
                                        </td>
                                        <td className="p-4 text-muted-foreground">{client.email || '-'}</td>
                                        <td className="p-4">
                                            {client.vertical ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                                    {client.vertical.name}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col text-xs">
                                                <span className="font-medium">
                                                    {client.fee_config?.fee_type === 'fixed'
                                                        ? `Fijo: ${client.fee_config.fixed_pct}%`
                                                        : `Variable (${client.fee_config?.variable_ranges?.length || 0} rangos)`}
                                                </span>
                                                <span className="text-gray-400 text-[10px] mt-0.5">
                                                    Plat Base: €{client.fee_config?.platform_cost_first || 700}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" onClick={(e) => handleDuplicate(e, client)} title="Duplicar">
                                                    <Copy className="h-4 w-4 text-blue-600" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={(e) => openEditModal(e, client)} title="Editar">
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, client.id)} title="Eliminar">
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleCreate}
                initialData={editingClient}
                readOnly={isViewMode}
            />
        </div>
    );
};
