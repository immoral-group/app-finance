import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, ClientList, ClickUpSpace, ClickUpList } from '@/lib/api/admin';
import { ArrowLeft, Plus, Trash2, Save, ChevronDown, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
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

// ── Auto-Mapping (read-only + override opcional) ──────────────────────────────
function AutoMappingSection({ year }: { year: number }) {
    const qc = useQueryClient();
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    const [editing, setEditing] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['profitability-auto-mapping', year],
        queryFn: () => adminApi.getProfitabilityAutoMapping(year),
    });

    const saveOverride = useMutation({
        mutationFn: (uid: string) => {
            const entry = data!.mappings.find(m => m.clickup_user_id === uid)!;
            return adminApi.saveProfitabilityUserMappings([{
                clickup_user_id: uid,
                display_name: entry.clickup_username,
                email: entry.email,
                cost_per_hour: overrides[uid],
                department: entry.department || undefined,
            }]);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['profitability-auto-mapping', year] });
            qc.invalidateQueries({ queryKey: ['profitability-accounts', year] });
            toast.success('Override guardado');
            setEditing(null);
        },
        onError: () => toast.error('Error al guardar'),
    });

    if (isLoading) return <Section title="Coste por hora (auto)"><p className="text-xs text-muted-foreground text-center py-4">Calculando…</p></Section>;

    const mappings = data?.mappings ?? [];
    const matched = mappings.filter(m => m.source === 'matched').length;
    const overridden = mappings.filter(m => m.source === 'override').length;
    const unmatched = mappings.filter(m => m.source === 'unmatched').length;

    return (
        <Section title="Coste por hora (calculado automáticamente)">
            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 mb-1.5 text-foreground font-medium">
                    <Sparkles size={12} className="text-primary" />
                    Cálculo automático
                </div>
                <p>El coste/hora se calcula desde los salarios en <strong>actual_expenses</strong> ÷ (160h × meses activos). Los usuarios ClickUp se cruzan con los empleados de Finance por nombre. Puedes anular cualquier valor con un override manual.</p>
                <div className="mt-2 flex gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-500" /> {matched} auto-detectados</span>
                    {overridden > 0 && <span className="flex items-center gap-1"><Sparkles size={10} className="text-blue-500" /> {overridden} override</span>}
                    {unmatched > 0 && <span className="flex items-center gap-1"><AlertCircle size={10} className="text-amber-500" /> {unmatched} sin match</span>}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                            <th className="pb-2 text-left font-medium">Usuario ClickUp</th>
                            <th className="pb-2 text-left font-medium">Empleado Finance</th>
                            <th className="pb-2 text-left font-medium">Depto</th>
                            <th className="pb-2 text-right font-medium">€/hora</th>
                            <th className="pb-2 text-center font-medium">Fuente</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mappings.map(m => {
                            const isEditing = editing === m.clickup_user_id;
                            return (
                                <tr key={m.clickup_user_id} className="border-b border-border/30">
                                    <td className="py-2 pr-3 font-medium text-foreground text-xs">{m.clickup_username}</td>
                                    <td className="py-2 pr-3 text-muted-foreground text-xs">{m.matched_employee || '—'}</td>
                                    <td className="py-2 pr-3 text-muted-foreground text-xs">{m.department || '—'}</td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                        {isEditing ? (
                                            <div className="flex items-center justify-end gap-1">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.5}
                                                    autoFocus
                                                    defaultValue={m.cost_per_hour}
                                                    onChange={e => setOverrides(p => ({ ...p, [m.clickup_user_id]: parseFloat(e.target.value) || 0 }))}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') saveOverride.mutate(m.clickup_user_id);
                                                        if (e.key === 'Escape') setEditing(null);
                                                    }}
                                                    className="w-16 px-1.5 py-0.5 text-xs rounded border border-primary bg-background focus:outline-none text-right"
                                                />
                                                <button
                                                    onClick={() => saveOverride.mutate(m.clickup_user_id)}
                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded"
                                                >
                                                    <Save size={11} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditing(m.clickup_user_id); setOverrides(p => ({ ...p, [m.clickup_user_id]: m.cost_per_hour })); }}
                                                className="hover:text-primary transition-colors text-foreground font-medium"
                                                title="Click para overridear"
                                            >
                                                {m.cost_per_hour > 0 ? `${m.cost_per_hour.toFixed(2)} €` : '—'}
                                            </button>
                                        )}
                                    </td>
                                    <td className="py-2 text-center">
                                        {m.source === 'matched' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[9px] font-medium">
                                                <CheckCircle2 size={9} /> auto
                                            </span>
                                        )}
                                        {m.source === 'override' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[9px] font-medium">
                                                <Sparkles size={9} /> manual
                                            </span>
                                        )}
                                        {m.source === 'unmatched' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-medium">
                                                <AlertCircle size={9} /> sin match
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}

// ── Client Lists ───────────────────────────────────────────────────────────────
function ClientListsSection({ year }: { year: number }) {
    const qc = useQueryClient();
    const [selectedSpace, setSelectedSpace] = useState<string>('');
    const [showAutoDiscover, setShowAutoDiscover] = useState(true);
    const [rows, setRows] = useState<ClientList[]>([]);
    const [initialized, setInitialized] = useState(false);

    const { data: autoListsData, isLoading: loadingAuto } = useQuery({
        queryKey: ['clickup-lists-with-time', year],
        queryFn: () => adminApi.getClickUpListsWithTime(year),
        staleTime: 5 * 60_000,
    });

    const { data: spacesData } = useQuery({
        queryKey: ['clickup-spaces'],
        queryFn: adminApi.getClickUpSpaces,
        enabled: !showAutoDiscover,
        staleTime: 10 * 60_000,
    });

    const { data: listsData } = useQuery({
        queryKey: ['clickup-lists', selectedSpace],
        queryFn: () => adminApi.getClickUpLists(selectedSpace),
        enabled: !!selectedSpace && !showAutoDiscover,
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

    useEffect(() => {
        if (clientListsData && !initialized) {
            setRows(clientListsData.client_lists || []);
            setInitialized(true);
        }
    }, [clientListsData, initialized]);

    const saveMutation = useMutation({
        mutationFn: () => adminApi.saveProfitabilityClientLists(rows.filter(r => !!r.client_id)),
        onSuccess: () => {
            setInitialized(false);
            qc.invalidateQueries({ queryKey: ['profitability-client-lists'] });
            qc.invalidateQueries({ queryKey: ['profitability-accounts'] });
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

    const autoLists = autoListsData?.lists ?? [];

    return (
        <Section title="Listas ClickUp → Cliente Finance">
            <div className="space-y-4">
                {/* Toggle: auto-discover vs manual */}
                <div className="flex items-center gap-2 text-xs">
                    <button
                        onClick={() => setShowAutoDiscover(true)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg font-medium transition-colors',
                            showAutoDiscover ? 'bg-primary text-primary-foreground' : 'border border-border/60 text-muted-foreground hover:bg-muted/60'
                        )}
                    >
                        <Sparkles size={11} className="inline mr-1" /> Auto-descubrir (con horas {year})
                    </button>
                    <button
                        onClick={() => setShowAutoDiscover(false)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg font-medium transition-colors',
                            !showAutoDiscover ? 'bg-primary text-primary-foreground' : 'border border-border/60 text-muted-foreground hover:bg-muted/60'
                        )}
                    >
                        Explorar por Space
                    </button>
                </div>

                {/* Auto-discover: lists with time logged */}
                {showAutoDiscover && (
                    <div>
                        {loadingAuto && <p className="text-xs text-muted-foreground py-2">Buscando listas con horas registradas en {year}…</p>}
                        {!loadingAuto && autoLists.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2">No se han encontrado listas con horas registradas en {year}.</p>
                        )}
                        {autoLists.length > 0 && (
                            <>
                                <p className="text-xs text-muted-foreground mb-2">
                                    {autoLists.length} listas con horas registradas en {year}. Click para añadir:
                                </p>
                                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                                    {autoLists
                                        .filter(l => !rows.find(r => r.clickup_list_id === l.id))
                                        .map(l => (
                                            <button
                                                key={l.id}
                                                onClick={() => addList({ id: l.id, name: l.name, folder: l.folder })}
                                                className="flex items-center gap-1 px-2 py-1 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors"
                                                title={`${l.entry_count} entradas · ${l.space}${l.folder ? ' / ' + l.folder : ''}`}
                                            >
                                                <Plus size={10} />
                                                {l.name}
                                                <span className="text-[9px] text-muted-foreground ml-1">{l.total_hours}h</span>
                                            </button>
                                        ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Manual: space selector */}
                {!showAutoDiscover && (
                    <>
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
                    </>
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
export function ProfitabilitySetup({ onBack, year }: { onBack: () => void; year: number }) {
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
                    <p className="text-xs text-muted-foreground mt-0.5">Coste/hora calculado automáticamente · solo configura el mapeo cliente→lista ClickUp</p>
                </div>
            </div>

            <AutoMappingSection year={year} />
            <ClientListsSection year={year} />
        </div>
    );
}
