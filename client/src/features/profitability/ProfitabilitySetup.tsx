import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, UserMapping, ClientList, ClickUpMember, ClickUpSpace, ClickUpList } from '@/lib/api/admin';
import { ArrowLeft, Plus, Trash2, Save, RefreshCw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/50 bg-muted/40">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

// ── User Mappings ──────────────────────────────────────────────────────────────
function UserMappingsSection() {
    const qc = useQueryClient();
    const { data: mappingsData } = useQuery({
        queryKey: ['profitability-user-mappings'],
        queryFn: adminApi.getProfitabilityUserMappings,
    });
    const { data: membersData, isLoading: loadingMembers } = useQuery({
        queryKey: ['clickup-members'],
        queryFn: adminApi.getClickUpMembers,
        staleTime: 10 * 60_000,
    });

    const [rows, setRows] = useState<UserMapping[]>([]);
    const [initialized, setInitialized] = useState(false);

    if (mappingsData && !initialized) {
        setRows(mappingsData.mappings || []);
        setInitialized(true);
    }

    const saveMutation = useMutation({
        mutationFn: () => adminApi.saveProfitabilityUserMappings(rows),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['profitability-user-mappings'] });
            toast.success('Mappings guardados');
        },
        onError: () => toast.error('Error al guardar'),
    });

    const addFromClickUp = (member: ClickUpMember) => {
        if (rows.find(r => r.clickup_user_id === String(member.id))) return;
        setRows(prev => [...prev, {
            clickup_user_id: String(member.id),
            display_name: member.username,
            email: member.email,
            cost_per_hour: 0,
        }]);
    };

    const removeRow = (uid: string) => setRows(prev => prev.filter(r => r.clickup_user_id !== uid));

    const updateCost = (uid: string, val: string) => {
        setRows(prev => prev.map(r => r.clickup_user_id === uid ? { ...r, cost_per_hour: parseFloat(val) || 0 } : r));
    };
    const updateDept = (uid: string, val: string) => {
        setRows(prev => prev.map(r => r.clickup_user_id === uid ? { ...r, department: val } : r));
    };

    const members = membersData?.members ?? [];
    const unmapped = members.filter(m => !rows.find(r => r.clickup_user_id === String(m.id)));

    return (
        <Section title="Coste por hora — Usuarios ClickUp">
            {loadingMembers && <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5"><RefreshCw size={12} className="animate-spin" /> Cargando miembros de ClickUp…</p>}

            {unmapped.length > 0 && (
                <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Añadir usuario de ClickUp:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {unmapped.map(m => (
                            <button
                                key={m.id}
                                onClick={() => addFromClickUp(m)}
                                className="flex items-center gap-1 px-2 py-1 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors"
                            >
                                <Plus size={10} />
                                {m.username}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {rows.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                                <th className="pb-2 text-left font-medium">Usuario</th>
                                <th className="pb-2 text-left font-medium">Email</th>
                                <th className="pb-2 text-left font-medium">Departamento</th>
                                <th className="pb-2 text-right font-medium">€/hora</th>
                                <th className="pb-2 w-8" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.clickup_user_id} className="border-b border-border/30">
                                    <td className="py-2 pr-3 font-medium text-foreground">{r.display_name}</td>
                                    <td className="py-2 pr-3 text-muted-foreground text-xs">{r.email || '—'}</td>
                                    <td className="py-2 pr-3">
                                        <input
                                            value={r.department || ''}
                                            onChange={e => updateDept(r.clickup_user_id, e.target.value)}
                                            placeholder="ej. Immedia"
                                            className="w-28 px-2 py-1 text-xs rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </td>
                                    <td className="py-2 pr-3 text-right">
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.5}
                                            value={r.cost_per_hour}
                                            onChange={e => updateCost(r.clickup_user_id, e.target.value)}
                                            className="w-20 px-2 py-1 text-xs rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-primary text-right"
                                        />
                                    </td>
                                    <td className="py-2">
                                        <button onClick={() => removeRow(r.clickup_user_id)} className="p-1 hover:text-red-500 text-muted-foreground transition-colors">
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No hay usuarios configurados. Añade usuarios de ClickUp arriba.</p>
            )}

            {rows.length > 0 && (
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <Save size={12} />
                        {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            )}
        </Section>
    );
}

// ── Client Lists ───────────────────────────────────────────────────────────────
function ClientListsSection() {
    const qc = useQueryClient();
    const [selectedSpace, setSelectedSpace] = useState<string>('');
    const [rows, setRows] = useState<ClientList[]>([]);
    const [initialized, setInitialized] = useState(false);

    const { data: spacesData } = useQuery({
        queryKey: ['clickup-spaces'],
        queryFn: adminApi.getClickUpSpaces,
        staleTime: 10 * 60_000,
    });

    const { data: listsData } = useQuery({
        queryKey: ['clickup-lists', selectedSpace],
        queryFn: () => adminApi.getClickUpLists(selectedSpace),
        enabled: !!selectedSpace,
        staleTime: 5 * 60_000,
    });

    const { data: clientListsData } = useQuery({
        queryKey: ['profitability-client-lists'],
        queryFn: adminApi.getProfitabilityClientLists,
    });

    const { data: clientsRaw } = useQuery({
        queryKey: ['clients-simple'],
        queryFn: adminApi.getClients,
        staleTime: 60_000,
    });

    if (clientListsData && !initialized) {
        setRows(clientListsData.client_lists || []);
        setInitialized(true);
    }

    const saveMutation = useMutation({
        mutationFn: () => adminApi.saveProfitabilityClientLists(rows),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['profitability-client-lists'] });
            toast.success('Listas guardadas');
        },
        onError: () => toast.error('Error al guardar'),
    });

    const addList = (list: ClickUpList) => {
        if (rows.find(r => r.clickup_list_id === list.id)) return;
        setRows(prev => [...prev, { client_id: '', clickup_list_id: list.id, clickup_list_name: list.name }]);
    };

    const removeRow = (listId: string) => setRows(prev => prev.filter(r => r.clickup_list_id !== listId));

    const updateClient = (listId: string, clientId: string) => {
        setRows(prev => prev.map(r => r.clickup_list_id === listId ? { ...r, client_id: clientId } : r));
    };

    const spaces = spacesData?.spaces ?? [];
    const lists = listsData?.lists ?? [];
    const clients = clientsRaw?.clients ?? [];

    return (
        <Section title="Listas ClickUp → Cliente Finance">
            <div className="space-y-4">
                {/* Space selector */}
                <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Space ClickUp:</label>
                    <div className="relative">
                        <select
                            value={selectedSpace}
                            onChange={e => setSelectedSpace(e.target.value)}
                            className="appearance-none px-3 pr-7 py-1.5 text-xs rounded-lg border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="">— seleccionar —</option>
                            {spaces.map((s: ClickUpSpace) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                </div>

                {/* Lists to add */}
                {lists.length > 0 && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Añadir lista:</p>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {lists
                                .filter((l: ClickUpList) => !rows.find(r => r.clickup_list_id === l.id))
                                .map((l: ClickUpList) => (
                                    <button
                                        key={l.id}
                                        onClick={() => addList(l)}
                                        className="flex items-center gap-1 px-2 py-1 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors"
                                    >
                                        <Plus size={10} />
                                        {l.folder ? `${l.folder} / ` : ''}{l.name}
                                    </button>
                                ))}
                        </div>
                    </div>
                )}

                {/* Mapping table */}
                {rows.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                                    <th className="pb-2 text-left font-medium">Lista ClickUp</th>
                                    <th className="pb-2 text-left font-medium">Cliente Finance</th>
                                    <th className="pb-2 w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.clickup_list_id} className="border-b border-border/30">
                                        <td className="py-2 pr-4 text-foreground text-xs font-medium">{r.clickup_list_name || r.clickup_list_id}</td>
                                        <td className="py-2 pr-4">
                                            <div className="relative">
                                                <select
                                                    value={r.client_id}
                                                    onChange={e => updateClient(r.clickup_list_id, e.target.value)}
                                                    className={cn(
                                                        'appearance-none w-48 px-2 pr-7 py-1 text-xs rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-primary',
                                                        !r.client_id && 'text-muted-foreground'
                                                    )}
                                                >
                                                    <option value="">— seleccionar cliente —</option>
                                                    {clients.map((c: any) => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                            </div>
                                        </td>
                                        <td className="py-2">
                                            <button onClick={() => removeRow(r.clickup_list_id)} className="p-1 hover:text-red-500 text-muted-foreground transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">No hay listas configuradas. Selecciona un space y añade listas.</p>
                )}

                {rows.length > 0 && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => saveMutation.mutate()}
                            disabled={saveMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <Save size={12} />
                            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                )}
            </div>
        </Section>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function ProfitabilitySetup({ onBack }: { onBack: () => void }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="h-8 w-8 rounded-lg border border-border/60 bg-card hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft size={15} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Configurar Rentabilidad</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Mapea usuarios ClickUp y listas de trabajo a clientes</p>
                </div>
            </div>

            <UserMappingsSection />
            <ClientListsSection />
        </div>
    );
}
