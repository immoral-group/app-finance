import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, AccountProfitability, ProfitabilityMember } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import { Settings, ChevronLeft, ChevronRight, AlertTriangle, Users, X, RefreshCw, HelpCircle, Info, Plus, Trash2, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ProfitabilitySetup } from './ProfitabilitySetup';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function semaphoreColor(pct: number | null) {
    if (pct === null) return { cell: 'text-muted-foreground', badge: '' };
    if (pct >= 60) return { cell: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
    if (pct >= 40) return { cell: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
    return { cell: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' };
}

function eur(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function eurDec(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const HINT_KEY = 'fi_profitability_hint_v1';

// ── First-visit hint card ─────────────────────────────────────────────────────
function ProfitabilityHint({ isSuperAdmin }: { isSuperAdmin: boolean }) {
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        if (localStorage.getItem(HINT_KEY)) return;
        const t = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(t);
    }, []);

    const dismiss = () => {
        setLeaving(true);
        setTimeout(() => {
            localStorage.setItem(HINT_KEY, '1');
            setVisible(false);
        }, 300);
    };

    if (!visible) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn('fixed inset-0 z-[200] transition-opacity duration-300', leaving ? 'opacity-0' : 'opacity-100')}
                style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
                onClick={dismiss}
            />

            {/* Glow */}
            <div
                className={cn('fixed z-[201] pointer-events-none transition-opacity duration-300', leaving ? 'opacity-0' : 'opacity-100')}
                style={{
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 480, height: 480,
                    background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)',
                    filter: 'blur(20px)',
                }}
            />

            {/* Card */}
            <div
                className={cn(
                    'fixed z-[202] left-1/2 top-1/2 w-full max-w-sm px-4 transition-all duration-300',
                    leaving ? 'opacity-0 -translate-x-1/2 -translate-y-[46%]' : 'opacity-100 -translate-x-1/2 -translate-y-1/2'
                )}
                onClick={e => e.stopPropagation()}
            >
                <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">

                    {/* Gradient header */}
                    <div
                        className="relative px-6 pt-8 pb-8 flex flex-col items-center text-center"
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #0ea5e9 100%)' }}
                    >
                        <button
                            onClick={dismiss}
                            className="absolute top-4 right-4 h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        >
                            <X size={14} className="text-white" />
                        </button>

                        <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-4">Rentabilidad por cuenta</span>

                        <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-4xl mb-4 shadow-lg ring-1 ring-white/20">
                            📊
                        </div>

                        <p className="text-base font-bold text-white leading-snug">¿Todo listo para empezar?</p>
                        <p className="text-xs text-white/70 mt-1.5 leading-relaxed">Aquí tienes tres cosas que debes saber antes de leer los datos</p>
                    </div>

                    {/* Body */}
                    <div className="bg-card px-6 py-5 space-y-3.5">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 text-sm">⏳</span>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                <span className="font-semibold text-foreground">La primera carga puede tardar unos segundos</span> — los datos se obtienen en tiempo real desde la API de ClickUp y se cruzan con la facturación de la plataforma.
                            </p>
                        </div>

                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                                <HelpCircle size={13} className="text-indigo-600 dark:text-indigo-400" />
                            </span>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Pulsa <span className="font-semibold text-foreground">Cómo leer esto</span> (arriba a la derecha) para entender qué significa cada columna y cómo se calcula cada cifra.
                            </p>
                        </div>

                        {isSuperAdmin && (
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                                    <Settings size={13} className="text-indigo-600 dark:text-indigo-400" />
                                </span>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    En <span className="font-semibold text-foreground">Configurar</span> puedes asignar qué carpeta de ClickUp corresponde a cada cliente y revisar el coste/hora de cada miembro del equipo.
                                </p>
                            </div>
                        )}

                        <button
                            onClick={dismiss}
                            className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Team detail modal ─────────────────────────────────────────────────────────
function TeamModal({ account, monthIdx, year, onClose }: {
    account: AccountProfitability; monthIdx: number | null; year: number; onClose: () => void;
}) {
    const qc = useQueryClient();
    const m = monthIdx !== null ? account.monthly[monthIdx] : null;

    const { data: personsData } = useQuery({
        queryKey: ['manual-persons'],
        queryFn: () => adminApi.getManualPersons(),
        enabled: m !== null,
    });
    const persons = personsData?.persons || [];

    const [editingHoursId, setEditingHoursId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [addingPersonId, setAddingPersonId] = useState<string>('');
    const [addingHours, setAddingHours] = useState('');

    const refetchProfitability = () => {
        qc.invalidateQueries({ queryKey: ['profitability-accounts'] });
    };

    const upsert = useMutation({
        mutationFn: (params: { manual_person_id: string; hours: number }) =>
            adminApi.upsertManualHours({
                client_id: account.client_id,
                manual_person_id: params.manual_person_id,
                year,
                month: (monthIdx ?? 0) + 1,
                hours: params.hours,
            }),
        onSuccess: () => {
            toast.success('Horas guardadas');
            refetchProfitability();
            setEditingHoursId(null);
            setEditingValue('');
            setAddingPersonId('');
            setAddingHours('');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const remove = useMutation({
        mutationFn: (id: string) => adminApi.deleteManualHours(id),
        onSuccess: () => { toast.success('Horas borradas'); refetchProfitability(); },
        onError: (e: Error) => toast.error(e.message),
    });

    if (!m) return null;

    const manualMembers = m.members.filter(mb => mb.source === 'manual');
    const clickupMembers = m.members.filter(mb => mb.source !== 'manual');
    const manualPersonIdsUsed = new Set(manualMembers.map(mb => mb.manual_person_id).filter(Boolean));
    const availablePersons = persons.filter(p => !manualPersonIdsUsed.has(p.id));

    const renderMemberRow = (mb: ProfitabilityMember) => {
        const isManual = mb.source === 'manual';
        const isEditing = isManual && editingHoursId === mb.manual_hours_id;
        return (
            <div key={mb.manual_hours_id || mb.name} className="flex items-center justify-between py-1.5 text-xs gap-2">
                <span className="text-foreground font-medium flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{mb.name}</span>
                    {isManual && <span className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">Manual</span>}
                </span>
                <span className="text-muted-foreground tabular-nums text-right flex items-center gap-1.5 shrink-0">
                    {isEditing ? (
                        <>
                            <input
                                type="number" step="0.01" min="0" autoFocus
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') upsert.mutate({ manual_person_id: mb.manual_person_id!, hours: Number(editingValue || 0) });
                                    if (e.key === 'Escape') { setEditingHoursId(null); setEditingValue(''); }
                                }}
                                className="w-20 h-7 px-1.5 rounded border border-indigo-400 bg-background text-xs font-mono text-right"
                            />
                            <button onClick={() => upsert.mutate({ manual_person_id: mb.manual_person_id!, hours: Number(editingValue || 0) })} disabled={upsert.isPending} className="h-6 w-6 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 flex items-center justify-center"><Check size={12} /></button>
                            <button onClick={() => { setEditingHoursId(null); setEditingValue(''); }} className="h-6 w-6 rounded hover:bg-muted text-muted-foreground flex items-center justify-center"><X size={12} /></button>
                        </>
                    ) : (
                        <>
                            <span>
                                {mb.hours.toFixed(2)}h · {eurDec(mb.labor_cost)}
                                {mb.cost_per_hour > 0 && <span className="ml-1 opacity-50 text-[10px]">@{mb.cost_per_hour.toFixed(2)}€/h</span>}
                            </span>
                            {isManual && (
                                <span className="flex items-center gap-0.5">
                                    <button
                                        onClick={() => { setEditingHoursId(mb.manual_hours_id!); setEditingValue(String(mb.hours)); }}
                                        className="h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
                                        title="Editar horas"
                                    ><Pencil size={11} /></button>
                                    <button
                                        onClick={() => { if (confirm(`¿Borrar las horas manuales de ${mb.name} en ${MONTH_NAMES_FULL[monthIdx!]}?`)) remove.mutate(mb.manual_hours_id!); }}
                                        className="h-6 w-6 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 flex items-center justify-center"
                                        title="Borrar"
                                    ><Trash2 size={11} /></button>
                                </span>
                            )}
                        </>
                    )}
                </span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-xs text-muted-foreground">{account.client_name}</p>
                        <p className="text-base font-bold text-foreground">{MONTH_NAMES_FULL[monthIdx!]}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground"><X size={14} /></button>
                </div>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Users size={11} /> Equipo · {m.hours.toFixed(1)}h</p>

                {m.members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin horas registradas</p>
                ) : (
                    <div className="divide-y divide-border/30">
                        {clickupMembers.map(renderMemberRow)}
                        {manualMembers.map(renderMemberRow)}
                    </div>
                )}

                {/* Añadir persona manual */}
                <div className="pt-2 border-t border-border/40">
                    {addingPersonId ? (
                        <div className="flex items-center gap-2">
                            <select
                                value={addingPersonId}
                                onChange={e => setAddingPersonId(e.target.value)}
                                className="flex-1 h-8 px-2 rounded-md border border-border/60 bg-background text-xs"
                            >
                                {availablePersons.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} · {Number(p.cost_per_hour).toFixed(2)}€/h</option>
                                ))}
                            </select>
                            <input
                                type="number" step="0.01" min="0" autoFocus
                                placeholder="horas"
                                value={addingHours}
                                onChange={e => setAddingHours(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && addingPersonId && addingHours) {
                                        upsert.mutate({ manual_person_id: addingPersonId, hours: Number(addingHours) });
                                    }
                                    if (e.key === 'Escape') { setAddingPersonId(''); setAddingHours(''); }
                                }}
                                className="w-20 h-8 px-2 rounded-md border border-border/60 bg-background text-xs font-mono text-right"
                            />
                            <button
                                onClick={() => upsert.mutate({ manual_person_id: addingPersonId, hours: Number(addingHours || 0) })}
                                disabled={!addingPersonId || !addingHours || upsert.isPending}
                                className="h-8 px-3 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            >Añadir</button>
                            <button onClick={() => { setAddingPersonId(''); setAddingHours(''); }} className="h-8 w-8 rounded-md hover:bg-muted text-muted-foreground flex items-center justify-center"><X size={13} /></button>
                        </div>
                    ) : (
                        availablePersons.length > 0 ? (
                            <button
                                onClick={() => { setAddingPersonId(availablePersons[0].id); setAddingHours(''); }}
                                className="w-full h-8 rounded-md text-xs font-medium border border-dashed border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex items-center justify-center gap-1.5"
                            ><Plus size={12} />Añadir horas manuales</button>
                        ) : (
                            persons.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground text-center">
                                    Crea personas manuales en <span className="font-medium">Configurar</span> para poder añadirles horas.
                                </p>
                            ) : null
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Column guide modal ────────────────────────────────────────────────────────
const COLUMN_GUIDE = [
    {
        emoji: '🏢',
        name: 'Cliente',
        calc: 'Nombre del cliente',
        source: 'Base de datos interna (tabla de clientes)',
        detail: 'Cada fila representa un cliente activo con algún dato configurado en el módulo de Rentabilidad. Solo aparecen clientes con facturación u horas registradas en el período seleccionado.',
    },
    {
        emoji: '💶',
        name: 'Fee mensual',
        calc: 'Importe registrado en la Billing Matrix de la app para ese cliente y mes',
        source: 'Tabla monthly_billing — introducido manualmente en el módulo de Facturación de Immoral Finance',
        detail: 'Es el fee mensual acordado con el cliente, tal como está registrado en la Billing Matrix de la plataforma. Si aparece ⚠ sin importe significa que hay horas registradas en ClickUp para ese cliente pero no hay fee registrado en la Billing Matrix ese mes.',
    },
    {
        emoji: '📐',
        name: 'Fee/hora',
        calc: 'Fee mensual ÷ Horas totales del equipo',
        source: 'Calculado en tiempo real a partir de Billing Matrix + ClickUp',
        detail: 'Indica cuánto ingresa la agencia por cada hora trabajada para ese cliente. Un valor alto significa que cada hora del equipo genera más ingresos. Si no hay horas, se muestra —.',
    },
    {
        emoji: '💸',
        name: 'Coste/hora',
        calc: 'Coste del equipo ÷ Horas totales del equipo',
        source: 'Calculado desde los salarios de empleados configurados en Setup',
        detail: 'Cuánto le cuesta a Immoral cada hora trabajada para ese cliente. Se deriva del salario bruto de cada empleado dividido entre 160 horas/mes. Si Fee/hora > Coste/hora, cada hora es rentable.',
    },
    {
        emoji: '⏱️',
        name: 'Horas',
        calc: 'Suma de horas registradas por el equipo en ClickUp',
        source: 'ClickUp — Time Tracking API, filtrado por listas configuradas en Setup',
        detail: 'Horas reales trabajadas para ese cliente en el período. Puedes hacer clic para ver el desglose por persona. Si aparece ⚠ sin horas significa que hay facturación pero nadie registró tiempo en ClickUp ese mes.',
    },
    {
        emoji: '👥',
        name: 'Coste Immoral',
        calc: 'Σ (horas_persona × coste_hora_persona) para cada miembro del equipo',
        source: 'ClickUp (horas) × Salarios configurados en Setup (coste/hora)',
        detail: 'El coste real del equipo asignado a ese cliente. Cada persona tiene un coste/hora calculado como (salario_bruto / 160). Este número refleja el coste de nómina proporcional a las horas dedicadas.',
    },
    {
        emoji: '📈',
        name: 'Beneficio',
        calc: 'Fee mensual − Coste Immoral',
        source: 'Calculado en tiempo real',
        detail: 'La ganancia bruta real de ese cliente: lo que facturamos menos lo que nos cuesta el equipo. No incluye otros costes indirectos (herramientas, oficina, etc.). Un número negativo indica que estamos perdiendo dinero en ese cliente.',
    },
    {
        emoji: '🚦',
        name: 'Rentabilidad',
        calc: '(Beneficio ÷ Fee mensual) × 100',
        source: 'Calculado en tiempo real',
        detail: 'El margen de beneficio en porcentaje. El semáforo de colores interpreta la salud financiera: 🟢 Verde ≥ 60% (rentable), 🟡 Ámbar 40–59% (atención), 🔴 Rojo < 40% (problema). Solo se calcula si hay tanto facturación como horas registradas.',
    },
];

// ── Inline column header tooltip ──────────────────────────────────────────────
function ColTip({ name }: { name: string }) {
    const [open, setOpen] = useState(false);
    const col = COLUMN_GUIDE.find(c => c.name === name);
    if (!col) return null;
    return (
        <span className="relative inline-flex items-center align-middle ml-1">
            <button
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                className="text-muted-foreground/35 hover:text-indigo-500 transition-colors focus:outline-none"
                tabIndex={-1}
            >
                <Info size={10} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
                    <div
                        className="absolute top-full right-0 mt-2 z-[61] w-64 bg-popover border border-border/60 rounded-xl shadow-2xl p-3 text-left normal-case tracking-normal space-y-2"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="text-xs font-semibold text-foreground">{col.emoji} {col.name}</p>
                        <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-md px-2 py-1 leading-relaxed">{col.calc}</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-indigo-400/40 pl-2">{col.detail}</p>
                        <p className="text-[9px] text-muted-foreground/50 leading-relaxed">Fuente: {col.source}</p>
                    </div>
                </>
            )}
        </span>
    );
}

function ColumnGuide({ onClose }: { onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border/60 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[85dvh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 flex-shrink-0">
                    <div>
                        <h2 className="text-sm font-bold text-foreground">Cómo leer esta tabla</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Qué significa cada columna y cómo se calcula</p>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors">
                        <X size={15} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
                    {COLUMN_GUIDE.map(col => (
                        <div key={col.name} className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-muted/40 border-b border-border/30">
                                <span className="text-base">{col.emoji}</span>
                                <span className="text-sm font-semibold text-foreground">{col.name}</span>
                            </div>
                            <div className="px-4 py-3 space-y-2.5">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-0.5">Cálculo</p>
                                    <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-md px-2.5 py-1.5 leading-relaxed">{col.calc}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-0.5">Fuente de datos</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{col.source}</p>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-indigo-400/50 pl-2.5">{col.detail}</p>
                            </div>
                        </div>
                    ))}

                    {/* Warnings legend */}
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Indicadores de alerta ⚠</p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                            <strong>⚠ en Fee mensual:</strong> el cliente tiene horas en ClickUp pero no hay facturación en Holded ese mes. Puede indicar que falta emitir factura.
                        </p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                            <strong>⚠ en Horas:</strong> hay facturación pero nadie registró tiempo en ClickUp. No es posible calcular rentabilidad.
                        </p>
                    </div>

                    {/* Semaphore legend */}
                    <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Semáforo de rentabilidad</p>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                <span className="text-xs text-foreground/80"><strong className="text-emerald-600 dark:text-emerald-400">≥ 60%</strong> — Cuenta rentable. El fee cubre costes con margen amplio.</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                                <span className="text-xs text-foreground/80"><strong className="text-amber-600 dark:text-amber-400">40–59%</strong> — Atención. El margen es ajustado, revisar dedicación.</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                                <span className="text-xs text-foreground/80"><strong className="text-red-600 dark:text-red-400">&lt; 40%</strong> — Problema. El coste del equipo consume la mayor parte del fee.</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-2" />
                </div>
            </div>
        </div>
    );
}

// ── Main table row ────────────────────────────────────────────────────────────
function Row({ account, monthIdx, annual, onTeam }: {
    account: AccountProfitability;
    monthIdx: number;
    annual: boolean;
    onTeam: (a: AccountProfitability, m: number) => void;
}) {
    const m = account.monthly[monthIdx];
    const revenue = annual ? account.total_revenue : m.revenue;
    const hours = annual ? account.total_hours : m.hours;
    const laborCost = annual ? account.total_labor_cost : m.labor_cost;
    const profit = revenue - laborCost;
    const margin = revenue > 0 && hours > 0 ? (profit / revenue) * 100 : null;
    const feePerHour = hours > 0 ? revenue / hours : null;
    const costPerHour = hours > 0 ? laborCost / hours : null;

    const s = semaphoreColor(margin);

    if (!annual && revenue === 0 && hours === 0) return null; // no data this month

    return (
        <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
            <td className="px-4 py-2.5 text-sm font-medium text-foreground whitespace-nowrap">
                {account.client_name}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                {revenue > 0
                    ? eur(revenue)
                    : hours > 0
                        ? <span className="inline-flex items-center gap-1 text-amber-500" title="Sin facturación registrada este mes"><AlertTriangle size={11} /><span className="text-muted-foreground/40">—</span></span>
                        : <span className="text-muted-foreground/40">—</span>
                }
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {feePerHour !== null ? eurDec(feePerHour) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {costPerHour !== null ? eurDec(costPerHour) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {hours > 0 ? (
                    <button
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-primary/10 hover:text-primary text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/50 transition-colors tabular-nums"
                        onClick={() => onTeam(account, monthIdx)}
                        title="Ver detalle del equipo"
                    >
                        {hours.toFixed(1)}h
                        <Users size={11} className="opacity-60" />
                    </button>
                ) : revenue > 0
                    ? <span className="inline-flex items-center gap-1 text-amber-500" title="Sin horas registradas en ClickUp este mes"><AlertTriangle size={11} /><span className="text-muted-foreground/40">—</span></span>
                    : <span className="text-muted-foreground/40">—</span>
                }
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {laborCost > 0 ? eur(laborCost) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className={cn('px-3 py-2.5 text-right text-sm tabular-nums font-semibold', profit >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400')}>
                {revenue > 0 || laborCost > 0 ? eur(profit) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right">
                {margin !== null ? (
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums', s.badge)}>
                        {margin.toFixed(1)}%
                    </span>
                ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                )}
            </td>
        </tr>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Profitability() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth()); // 0-based, -1 = annual
    const [showSetup, setShowSetup] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [team, setTeam] = useState<{ account: AccountProfitability; month: number } | null>(null);
    const { isSuperAdmin } = useAuth();
    const qc = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ['profitability-accounts', year],
        queryFn: () => adminApi.getProfitabilityAccounts(year),
        staleTime: 7 * 60_000,
    });

    const refreshCache = useMutation({
        mutationFn: () => adminApi.refreshClickUpCache(year),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['profitability-accounts', year] }),
    });

    const accounts = data?.accounts ?? [];
    const annual = month === -1;

    // Totals for the selected period
    const totRevenue = accounts.reduce((s, a) => s + (annual ? a.total_revenue : a.monthly[month].revenue), 0);
    const totCost = accounts.reduce((s, a) => s + (annual ? a.total_labor_cost : a.monthly[month].labor_cost), 0);
    const totHours = accounts.reduce((s, a) => s + (annual ? a.total_hours : a.monthly[month].hours), 0);
    const totProfit = totRevenue - totCost;
    const totMargin = totRevenue > 0 && totHours > 0 ? (totProfit / totRevenue) * 100 : null;

    // Filter out empty rows for the selected month
    const visibleAccounts = annual
        ? accounts.filter(a => a.total_revenue > 0 || a.total_hours > 0)
        : accounts.filter(a => a.monthly[month].revenue > 0 || a.monthly[month].hours > 0);

    if (showSetup) return <ProfitabilitySetup onBack={() => setShowSetup(false)} year={year} />;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Rentabilidad por Cuenta</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Fee − coste de horas internas = beneficio real por cliente</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Year selector */}
                    <div className="flex items-center gap-1 border border-border/60 rounded-lg bg-card px-1">
                        <button onClick={() => setYear(y => y - 1)} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronLeft size={13} className="text-muted-foreground" />
                        </button>
                        <span className="text-sm font-semibold text-foreground px-1 tabular-nums">{year}</span>
                        <button onClick={() => setYear(y => y + 1)} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronRight size={13} className="text-muted-foreground" />
                        </button>
                    </div>
                    {/* Month selector */}
                    <div className="flex items-center gap-1 border border-border/60 rounded-lg bg-card px-1.5 py-1">
                        <button
                            onClick={() => setMonth(-1)}
                            className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', month === -1 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
                        >
                            Anual
                        </button>
                        {MONTH_NAMES.map((mn, i) => (
                            <button
                                key={i}
                                onClick={() => setMonth(i)}
                                className={cn('px-2 py-1 rounded-md text-xs font-medium transition-colors tabular-nums', month === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
                            >
                                {mn}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => refreshCache.mutate()}
                        disabled={refreshCache.isPending || isLoading}
                        title="Actualizar datos de ClickUp (limpia cache)"
                        className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/60 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={refreshCache.isPending ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setShowGuide(true)}
                        title="Cómo leer esta tabla"
                        className="h-9 px-3 rounded-lg border border-border/60 bg-card hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                    >
                        <HelpCircle size={13} />
                        <span className="hidden sm:inline">Cómo leer esto</span>
                    </button>
                    {isSuperAdmin() && (
                        <button
                            onClick={() => setShowSetup(true)}
                            className="h-9 px-3 rounded-lg border border-border/60 bg-card hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                        >
                            <Settings size={13} />
                            <span className="hidden sm:inline">Configurar</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ClickUp debug — visible when no hours loaded */}
            {data && totHours === 0 && data.debug && (
                <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-xs font-mono space-y-1">
                    <p className="font-semibold text-blue-700 dark:text-blue-300 font-sans">Debug ClickUp</p>
                    <p className="text-blue-600 dark:text-blue-400">Entradas recibidas: <strong>{data.debug.total_entries_fetched}</strong></p>
                    <p className="text-blue-600 dark:text-blue-400">Listas configuradas: <strong>{data.debug.configured_lists}</strong></p>
                    {data.debug.sample_entry && (
                        <p className="text-blue-600 dark:text-blue-400">
                            Muestra: user=<strong>{data.debug.sample_entry.user}</strong> list_id=<strong>{data.debug.sample_entry.list_id}</strong> list=<strong>{data.debug.sample_entry.list_name}</strong> ({data.debug.sample_entry.duration_h}h)
                        </p>
                    )}
                    {!data.debug.sample_entry && data.debug.total_entries_fetched === 0 && (
                        <p className="text-blue-600 dark:text-blue-400 font-sans">ClickUp devolvió 0 entradas de tiempo. El token puede no tener acceso al Time Tracking API, o no hay horas registradas en {year}.</p>
                    )}
                    {Object.keys(data.debug.entries_per_list).length > 0 && (
                        <p className="text-blue-600 dark:text-blue-400">Entradas por lista: {JSON.stringify(data.debug.entries_per_list)}</p>
                    )}
                </div>
            )}

            {/* ClickUp error banner */}
            {data?.clickup_error && (
                <div className="flex items-start gap-2.5 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3.5 text-xs">
                    <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-amber-700 dark:text-amber-300">ClickUp: no se han podido cargar las horas</p>
                        <p className="text-amber-600/80 dark:text-amber-400/70 mt-0.5">{data.clickup_error}</p>
                    </div>
                </div>
            )}

            {/* No config */}
            {!isLoading && accounts.length === 0 && !error && (
                <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 text-center">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Sin datos configurados</p>
                    <p className="text-xs text-amber-600/80 mt-1">Configura el mapeo listas ClickUp → clientes en Configurar.</p>
                    {isSuperAdmin() && (
                        <button onClick={() => setShowSetup(true)} className="mt-3 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors">
                            Ir a Configuración
                        </button>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400">{error instanceof Error ? error.message : 'Error cargando datos'}</p>
                </div>
            )}

            {/* Table */}
            {(isLoading || accounts.length > 0) && (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                    <div className="overflow-auto max-h-[calc(100vh-220px)]">
                        <table className="w-full min-w-[780px]">
                            <thead className="sticky top-0 z-10 border-b border-border/50 bg-muted/80 backdrop-blur">
                                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                                    <th className="px-3 py-3 text-right font-semibold">Fee mensual<ColTip name="Fee mensual" /></th>
                                    <th className="px-3 py-3 text-right font-semibold">Fee/hora<ColTip name="Fee/hora" /></th>
                                    <th className="px-3 py-3 text-right font-semibold">Coste/hora<ColTip name="Coste/hora" /></th>
                                    <th className="px-3 py-3 text-right font-semibold">Horas<ColTip name="Horas" /></th>
                                    <th className="px-3 py-3 text-right font-semibold">Coste Immoral<ColTip name="Coste Immoral" /></th>
                                    <th className="px-3 py-3 text-right font-semibold">Beneficio<ColTip name="Beneficio" /></th>
                                    <th className="px-3 py-3 text-right font-semibold">Rentabilidad<ColTip name="Rentabilidad" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading
                                    ? Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={i} className="border-b border-border/30">
                                            {Array.from({ length: 8 }).map((_, j) => (
                                                <td key={j} className="px-3 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                                            ))}
                                        </tr>
                                    ))
                                    : visibleAccounts.length === 0
                                        ? (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                                    Sin datos para {annual ? year : `${MONTH_NAMES_FULL[month]} ${year}`}
                                                </td>
                                            </tr>
                                        )
                                        : visibleAccounts.map(a => (
                                            <Row
                                                key={a.client_id}
                                                account={a}
                                                monthIdx={annual ? 0 : month}
                                                annual={annual}
                                                onTeam={(acc, m) => setTeam({ account: acc, month: m })}
                                            />
                                        ))
                                }
                            </tbody>
                            {!isLoading && visibleAccounts.length > 1 && (
                                <tfoot className="border-t border-border/50 bg-muted/30">
                                    <tr className="text-sm font-semibold">
                                        <td className="px-4 py-3 text-foreground">Total</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-foreground">{eur(totRevenue)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                                            {totHours > 0 ? eurDec(totRevenue / totHours) : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                                            {totHours > 0 ? eurDec(totCost / totHours) : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{totHours.toFixed(1)}h</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{eur(totCost)}</td>
                                        <td className={cn('px-3 py-3 text-right tabular-nums', totProfit >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400')}>{eur(totProfit)}</td>
                                        <td className="px-3 py-3 text-right">
                                            {totMargin !== null && (
                                                <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-bold', semaphoreColor(totMargin).badge)}>
                                                    {totMargin.toFixed(1)}%
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* Legend */}
            {visibleAccounts.length > 0 && (
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> ≥ 60%</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" /> 40–59%</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> &lt; 40%</span>
                    <span className="text-muted-foreground/60">· Click en horas para ver equipo</span>
                </div>
            )}

            {team && (
                <TeamModal account={team.account} monthIdx={team.month} year={year} onClose={() => setTeam(null)} />
            )}
            {showGuide && <ColumnGuide onClose={() => setShowGuide(false)} />}
            <ProfitabilityHint isSuperAdmin={isSuperAdmin()} />
        </div>
    );
}
