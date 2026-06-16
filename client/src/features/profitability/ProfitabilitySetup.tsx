import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type ManualPerson } from '@/lib/api/admin';
import { ArrowLeft, CheckCircle2, AlertCircle, Info, RefreshCw, ChevronDown, Sparkles, Save, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Formula tooltip (replaces browser title= which doesn't show on macOS) ────
function FormulaTip({ formula }: { formula: string }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    return (
        <span className="relative inline-flex items-center align-middle ml-0.5">
            <button
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                className="text-muted-foreground/40 hover:text-indigo-500 transition-colors focus:outline-none"
                tabIndex={-1}
            >
                <Info size={10} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={close} />
                    <div
                        className="absolute top-full right-0 mt-2 z-[61] w-72 bg-popover border border-border/60 rounded-xl shadow-2xl p-3 text-left space-y-1"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">Fórmula</p>
                        <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-md px-2.5 py-2 leading-relaxed break-all">{formula}</p>
                    </div>
                </>
            )}
        </span>
    );
}

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

// ── Auto-Mapping (solo lectura) ───────────────────────────────────────────────
function AutoMappingSection({ year }: { year: number }) {
    const { data, isLoading } = useQuery({
        queryKey: ['profitability-auto-mapping', year],
        queryFn: () => adminApi.getProfitabilityAutoMapping(year),
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
                <p>El coste/hora se calcula desde los salarios reales registrados en <strong>Gastos Reales (actual_expenses)</strong> del año <strong>{year}</strong>, dividido entre (160h × meses con salario registrado). Los usuarios ClickUp se cruzan con los empleados de Finance por nombre (acentos ignorados). Pulsa el icono <Info size={10} className="inline mx-0.5" /> en la columna €/hora para ver la fórmula exacta de cada empleado.</p>
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
                        {mappings.map(m => (
                            <tr key={m.clickup_user_id} className="border-b border-border/30">
                                    <td className="py-2 pr-3 font-medium text-foreground text-xs">{m.clickup_username}</td>
                                    <td className="py-2 pr-3 text-muted-foreground text-xs">{m.matched_employee || '—'}</td>
                                    <td className="py-2 pr-3 text-muted-foreground text-xs">{m.department || '—'}</td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                        <span className="inline-flex items-center gap-1 text-foreground font-medium text-xs">
                                            {m.cost_per_hour > 0 ? `${m.cost_per_hour.toFixed(2)} €` : '—'}
                                            {m.formula && <FormulaTip formula={m.formula} />}
                                        </span>
                                    </td>
                                    <td className="py-2 text-center">
                                        {m.source === 'matched' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[9px] font-medium">
                                                <CheckCircle2 size={9} /> auto
                                            </span>
                                        )}
                                        {m.source === 'override' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[9px] font-medium">
                                                <Sparkles size={9} /> auto
                                            </span>
                                        )}
                                        {m.source === 'unmatched' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-medium">
                                                <AlertCircle size={9} /> sin match
                                            </span>
                                        )}
                                    </td>
                                </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}

// ── Client Match Section ──────────────────────────────────────────────────────
// Muestra todos los clientes Finance con su carpeta ClickUp sugerida.
// El usuario solo corrige los que el sistema no acertó.
function ClientListsSection({ year }: { year: number }) {
    const qc = useQueryClient();
    // clientId → folderId (prefixed "folder:xxx" or list id)
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    const [initialized, setInitialized] = useState(false);

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['profitability-auto-match', year],
        queryFn: () => adminApi.getProfitabilityAutoMatchClients(year),
        staleTime: 2 * 60_000,
    });

    // Inicializar: si ya hay config guardada, úsala; si no, aplica sugerencia
    useEffect(() => {
        if (!data || initialized) return;
        const init: Record<string, string> = {};
        for (const cm of data.client_matches) {
            if (cm.configured.length > 0) {
                init[cm.client_id] = cm.configured[0].id;
            } else if (cm.suggested) {
                init[cm.client_id] = cm.suggested.id;
            }
        }
        setAssignments(init);
        setInitialized(true);
    }, [data, initialized]);

    const saveMutation = useMutation({
        mutationFn: () => {
            const rows = Object.entries(assignments)
                .filter(([, tid]) => !!tid)
                .map(([clientId, tid]) => {
                    const t = targets.find(tg => tg.id === tid);
                    return { client_id: clientId, clickup_list_id: tid, clickup_list_name: t?.name || tid };
                });
            return adminApi.saveProfitabilityClientLists(rows);
        },
        onSuccess: () => {
            setInitialized(false);
            qc.invalidateQueries({ queryKey: ['profitability-auto-match', year] });
            qc.invalidateQueries({ queryKey: ['profitability-accounts'] });
            toast.success('Configuración guardada');
        },
        onError: () => toast.error('Error al guardar'),
    });

    const targets = data?.targets ?? [];
    const matches = data?.client_matches ?? [];
    const configured = matches.filter(cm => assignments[cm.client_id]);
    const missing = matches.filter(cm => !assignments[cm.client_id]);

    if (isLoading) return (
        <Section title="Clientes → Carpetas ClickUp">
            <p className="text-xs text-muted-foreground py-4 text-center">Analizando ClickUp… puede tardar unos segundos.</p>
        </Section>
    );

    return (
        <Section title="Clientes → Carpetas ClickUp">
            <div className="space-y-4">
                <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-xs text-muted-foreground flex items-start gap-2">
                    <Sparkles size={12} className="text-primary mt-0.5 flex-shrink-0" />
                    <div>
                        El sistema compara los nombres de carpetas de ClickUp con los clientes de Finance y sugiere el match automáticamente. Corrige los que no coincidan y guarda.
                        <button onClick={() => { setInitialized(false); refetch(); }} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                            <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} /> Recargar
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                                <th className="pb-2 text-left font-medium">Cliente Finance</th>
                                <th className="pb-2 text-left font-medium">Carpeta ClickUp</th>
                                <th className="pb-2 text-right font-medium">Horas {year}</th>
                                <th className="pb-2 text-center font-medium w-8">Match</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matches.map(cm => {
                                const selected = assignments[cm.client_id] || '';
                                const target = targets.find(t => t.id === selected);
                                const isAuto = cm.suggested?.id === selected && cm.configured.length === 0;
                                const isSaved = cm.configured.some(c => c.id === selected);
                                return (
                                    <tr key={cm.client_id} className="border-b border-border/30 hover:bg-muted/10">
                                        <td className="py-2 pr-4 text-foreground font-medium text-xs">{cm.client_name}</td>
                                        <td className="py-2 pr-4">
                                            <div className="relative">
                                                <select
                                                    value={selected}
                                                    onChange={e => setAssignments(prev => ({ ...prev, [cm.client_id]: e.target.value }))}
                                                    className={cn(
                                                        'appearance-none w-64 px-2 pr-6 py-1 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary',
                                                        !selected ? 'border-amber-400/60 text-muted-foreground' : 'border-border/60 text-foreground'
                                                    )}
                                                >
                                                    <option value="">— sin asignar —</option>
                                                    {targets.map(t => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.type === 'folder' ? '📁 ' : '📋 '}{t.name} · {t.total_hours.toFixed(1)}h ({t.sub})
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                            </div>
                                        </td>
                                        <td className="py-2 pr-4 text-right text-xs tabular-nums text-muted-foreground">
                                            {target ? `${target.total_hours.toFixed(1)}h` : '—'}
                                        </td>
                                        <td className="py-2 text-center">
                                            {isSaved && <CheckCircle2 size={13} className="text-emerald-500 mx-auto" />}
                                            {!isSaved && isAuto && <Sparkles size={13} className="text-primary/70 mx-auto" />}
                                            {!isSaved && !isAuto && selected && <AlertCircle size={13} className="text-amber-500 mx-auto" />}
                                            {!selected && <span className="text-muted-foreground/30 text-[10px]">—</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {missing.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{missing.length} cliente(s) sin carpeta asignada — no aparecerán en el dashboard.</p>
                )}

                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{configured.length} de {matches.length} clientes configurados</p>
                    <button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <Save size={12} />
                        {saveMutation.isPending ? 'Guardando…' : 'Guardar todo'}
                    </button>
                </div>
            </div>
        </Section>
    );
}

// ── Manual Persons ────────────────────────────────────────────────────────────
// Personas cuyas horas se cargan manualmente (usuarios desactivados de ClickUp,
// freelancers no enlazados, etc). Las horas por cliente/mes se cargan en el
// modal mensual de cada cuenta.
function ManualPersonsSection() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['manual-persons'],
        queryFn: () => adminApi.getManualPersons(),
    });

    const [editing, setEditing] = useState<ManualPerson | null>(null);
    const [draft, setDraft] = useState<{ name: string; cost_per_hour: string; department: string; notes: string }>({ name: '', cost_per_hour: '', department: '', notes: '' });
    const [showForm, setShowForm] = useState(false);

    const resetForm = () => {
        setDraft({ name: '', cost_per_hour: '', department: '', notes: '' });
        setEditing(null);
        setShowForm(false);
    };

    const startEdit = (p: ManualPerson) => {
        setEditing(p);
        setDraft({
            name: p.name,
            cost_per_hour: String(p.cost_per_hour ?? 0),
            department: p.department || '',
            notes: p.notes || '',
        });
        setShowForm(true);
    };

    const create = useMutation({
        mutationFn: () => adminApi.createManualPerson({
            name: draft.name.trim(),
            cost_per_hour: Number(draft.cost_per_hour || 0),
            department: draft.department.trim() || null,
            notes: draft.notes.trim() || null,
        }),
        onSuccess: () => { toast.success('Persona manual creada'); qc.invalidateQueries({ queryKey: ['manual-persons'] }); resetForm(); },
        onError: (e: Error) => toast.error(e.message),
    });

    const update = useMutation({
        mutationFn: () => adminApi.updateManualPerson(editing!.id, {
            name: draft.name.trim(),
            cost_per_hour: Number(draft.cost_per_hour || 0),
            department: draft.department.trim() || null,
            notes: draft.notes.trim() || null,
        }),
        onSuccess: () => { toast.success('Persona actualizada'); qc.invalidateQueries({ queryKey: ['manual-persons'] }); qc.invalidateQueries({ queryKey: ['profitability-accounts'] }); resetForm(); },
        onError: (e: Error) => toast.error(e.message),
    });

    const remove = useMutation({
        mutationFn: (id: string) => adminApi.deleteManualPerson(id),
        onSuccess: () => { toast.success('Persona borrada'); qc.invalidateQueries({ queryKey: ['manual-persons'] }); qc.invalidateQueries({ queryKey: ['profitability-accounts'] }); },
        onError: (e: Error) => toast.error(e.message),
    });

    const persons = data?.persons || [];

    return (
        <Section title="Personas manuales">
            <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                    Personas cuyas horas no llegan desde ClickUp (usuarios desactivados, freelancers no enlazados, etc.).
                    El coste/hora se calcula automáticamente desde el P&amp;L si su nombre coincide con una categoría de gasto.
                    Sólo introduce un coste/hora aquí si la persona no tiene sueldo registrado en P&amp;L (p.ej. freelancers externos).
                    Las horas por cliente/mes se cargan desde el modal mensual de cada cuenta.
                </p>

                {isLoading ? (
                    <div className="text-xs text-muted-foreground">Cargando…</div>
                ) : (
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th className="text-left px-3 py-2 font-medium">Nombre</th>
                                    <th className="text-right px-3 py-2 font-medium">Coste/hora</th>
                                    <th className="text-left px-3 py-2 font-medium">Departamento</th>
                                    <th className="text-left px-3 py-2 font-medium">Notas</th>
                                    <th className="px-3 py-2 w-20"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {persons.length === 0 && (
                                    <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">Sin personas manuales</td></tr>
                                )}
                                {persons.map(p => (
                                    <tr key={p.id} className="hover:bg-muted/30">
                                        <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            {Number(p.cost_per_hour) > 0
                                                ? <>{Number(p.cost_per_hour).toFixed(2)} €/h <span className="text-[10px] text-muted-foreground/60 ml-0.5">override</span></>
                                                : <span className="text-[10px] text-muted-foreground/70 italic">auto · P&L</span>}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">{p.department || '—'}</td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{p.notes || '—'}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button onClick={() => startEdit(p)} className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center" title="Editar"><Pencil size={13} /></button>
                                                <button onClick={() => { if (confirm(`¿Borrar a ${p.name}? Se borran también sus horas manuales en todas las cuentas.`)) remove.mutate(p.id); }} className="h-7 w-7 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 flex items-center justify-center" title="Borrar"><Trash2 size={13} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {showForm ? (
                    <div className="bg-muted/30 border border-border/60 rounded-lg p-4 space-y-3">
                        <div className="text-xs font-semibold text-foreground">{editing ? 'Editar persona' : 'Nueva persona manual'}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Nombre</span>
                                <input className="w-full h-9 px-2.5 rounded-md border border-border/60 bg-background text-sm" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="p.ej. Alba Ortega" />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Coste/hora override (€) <span className="normal-case opacity-60">— opcional</span></span>
                                <input type="number" step="0.01" min="0" className="w-full h-9 px-2.5 rounded-md border border-border/60 bg-background text-sm font-mono" value={draft.cost_per_hour} onChange={e => setDraft(d => ({ ...d, cost_per_hour: e.target.value }))} placeholder="0.00 — si vacío usa el sueldo de P&L" />
                                <span className="text-[10px] text-muted-foreground/70 block">Déjalo en 0 si la persona tiene sueldo en P&amp;L (se usa el cálculo automático).</span>
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Departamento (opcional)</span>
                                <input className="w-full h-9 px-2.5 rounded-md border border-border/60 bg-background text-sm" value={draft.department} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Notas (opcional)</span>
                                <input className="w-full h-9 px-2.5 rounded-md border border-border/60 bg-background text-sm" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
                            </label>
                        </div>
                        <div className="flex items-center gap-2 justify-end pt-1">
                            <button onClick={resetForm} className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted">Cancelar</button>
                            <button
                                onClick={() => editing ? update.mutate() : create.mutate()}
                                disabled={!draft.name.trim() || create.isPending || update.isPending}
                                className="h-8 px-3 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                <Save size={12} />{editing ? 'Guardar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowForm(true)} className="h-8 px-3 rounded-md text-xs font-medium border border-dashed border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex items-center gap-1.5">
                        <Plus size={13} />Añadir persona manual
                    </button>
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
                    <p className="text-xs text-muted-foreground mt-0.5">Coste/hora calculado automáticamente · mapeo cliente→lista ClickUp · personas manuales</p>
                </div>
            </div>

            <AutoMappingSection year={year} />
            <ClientListsSection year={year} />
            <ManualPersonsSection />
        </div>
    );
}
