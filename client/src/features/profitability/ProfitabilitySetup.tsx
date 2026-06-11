import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { ArrowLeft, CheckCircle2, AlertCircle, Info, RefreshCw, ChevronDown, Sparkles, Save } from 'lucide-react';
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
                        className="absolute bottom-full right-0 mb-2 z-[61] w-72 bg-popover border border-border/60 rounded-xl shadow-2xl p-3 text-left space-y-1"
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
