import { useMemo, useState } from 'react';
import { X, Sparkles, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ============================================================
// Tipos y constantes
// ============================================================

export const SCENARIO_STEPS = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30] as const;
export type ScenarioStep = typeof SCENARIO_STEPS[number];

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const EXPENSE_SECTION_LABELS: Record<string, string> = {
    personal: 'Personal',
    comisiones: 'Comisiones',
    marketing: 'Marketing',
    formacion: 'Formación',
    software: 'Software',
    adspent: 'Adspent',
    gastosOp: 'Gastos Operativos',
};

export const EXPENSE_SECTION_KEYS = ['personal', 'comisiones', 'marketing', 'formacion', 'software', 'adspent', 'gastosOp'] as const;

export interface ForecastScenario {
    name: string;
    // Rango temporal (meses 1-12, inclusivo) donde aplica el escenario.
    // Por defecto: desde el mes siguiente al actual hasta diciembre.
    range: { from: number; to: number };
    revenue: {
        globalPct: number;
        byDept: Record<string, number>;
    };
    expenses: {
        globalPct: number;
        bySection: Record<string, number>;
        byDept: Record<string, number>;
    };
}

// Devuelve el rango por defecto: desde el mes siguiente al actual hasta diciembre.
// Si ya estamos en diciembre, devuelve diciembre solo (escenario hipotético del último mes).
export function defaultRange(): { from: number; to: number } {
    const m = new Date().getMonth() + 1; // 1-12
    return { from: Math.min(m + 1, 12), to: 12 };
}

export const EMPTY_SCENARIO: ForecastScenario = {
    name: '',
    range: defaultRange(),
    revenue: { globalPct: 0, byDept: {} },
    expenses: { globalPct: 0, bySection: {}, byDept: {} },
};

// Pretty string del rango (e.g. "Jul–Dic", "Octubre", "Año completo")
export function rangeLabel(range: { from: number; to: number }): string {
    if (range.from === 1 && range.to === 12) return 'Año completo';
    if (range.from === range.to) return MONTHS_SHORT[range.from - 1];
    return `${MONTHS_SHORT[range.from - 1]}–${MONTHS_SHORT[range.to - 1]}`;
}

// ============================================================
// Resolución de multiplicador por celda
// Prioridad: byDept (más específico) > bySection > global
// Si el mes está fuera del rango del escenario → 1 (sin cambio)
// ============================================================
export function resolveMultiplier(
    scenario: ForecastScenario | null,
    section: string,
    dept: string,
    monthIdx: number,
): number {
    if (!scenario) return 1;
    const month = monthIdx + 1; // monthIdx 0-11 → 1-12
    if (month < scenario.range.from || month > scenario.range.to) return 1;
    if (section === 'revenue') {
        const pct = scenario.revenue.byDept[dept];
        if (pct !== undefined && pct !== 0) return 1 + pct / 100;
        return 1 + (scenario.revenue.globalPct || 0) / 100;
    }
    const deptPct = scenario.expenses.byDept[dept];
    if (deptPct !== undefined && deptPct !== 0) return 1 + deptPct / 100;
    const sectionPct = scenario.expenses.bySection[section];
    if (sectionPct !== undefined && sectionPct !== 0) return 1 + sectionPct / 100;
    return 1 + (scenario.expenses.globalPct || 0) / 100;
}

// Detecta si el escenario tiene algun cambio aplicado
export function isScenarioEmpty(s: ForecastScenario | null): boolean {
    if (!s) return true;
    const allPcts = [
        s.revenue.globalPct,
        ...Object.values(s.revenue.byDept),
        s.expenses.globalPct,
        ...Object.values(s.expenses.bySection),
        ...Object.values(s.expenses.byDept),
    ];
    return allPcts.every(v => !v);
}

// Resumen corto del escenario para mostrar en el chip
export function scenarioSummary(s: ForecastScenario): string {
    const parts: string[] = [];
    if (s.revenue.globalPct) parts.push(`${s.revenue.globalPct > 0 ? '+' : ''}${s.revenue.globalPct}% ingresos`);
    Object.entries(s.revenue.byDept).forEach(([d, p]) => {
        if (p) parts.push(`${p > 0 ? '+' : ''}${p}% ${d}`);
    });
    if (s.expenses.globalPct) parts.push(`${s.expenses.globalPct > 0 ? '+' : ''}${s.expenses.globalPct}% gastos`);
    Object.entries(s.expenses.bySection).forEach(([k, p]) => {
        if (p) parts.push(`${p > 0 ? '+' : ''}${p}% ${EXPENSE_SECTION_LABELS[k] || k}`);
    });
    Object.entries(s.expenses.byDept).forEach(([d, p]) => {
        if (p) parts.push(`${p > 0 ? '+' : ''}${p}% gastos ${d}`);
    });
    const head = parts.slice(0, 2).join(' · ') + (parts.length > 2 ? ` · +${parts.length - 2}` : '');
    return `${head} · ${rangeLabel(s.range)}`;
}

// ============================================================
// Presets
// ============================================================

export const PRESETS: { id: string; emoji: string; label: string; description: string; build: () => ForecastScenario }[] = [
    {
        id: 'growth-10',
        emoji: '📈',
        label: 'Crecimiento moderado',
        description: 'Facturación +10%',
        build: () => ({ ...EMPTY_SCENARIO, range: defaultRange(), name: 'Crecimiento moderado', revenue: { globalPct: 10, byDept: {} } }),
    },
    {
        id: 'growth-25',
        emoji: '🚀',
        label: 'Crecimiento agresivo',
        description: 'Facturación +25%',
        build: () => ({ ...EMPTY_SCENARIO, name: 'Crecimiento agresivo', revenue: { globalPct: 25, byDept: {} } }),
    },
    {
        id: 'recession',
        emoji: '📉',
        label: 'Recesión',
        description: 'Facturación −15%',
        build: () => ({ ...EMPTY_SCENARIO, name: 'Recesión', revenue: { globalPct: -15, byDept: {} } }),
    },
    {
        id: 'cost-up-15',
        emoji: '⚠️',
        label: 'Gastos al alza',
        description: 'Gastos +15%',
        build: () => ({ ...EMPTY_SCENARIO, name: 'Gastos al alza', expenses: { globalPct: 15, bySection: {}, byDept: {} } }),
    },
    {
        id: 'crisis',
        emoji: '🔥',
        label: 'Crisis',
        description: 'Facturación −20%, Gastos +10%',
        build: () => ({
            ...EMPTY_SCENARIO,
            name: 'Crisis',
            revenue: { globalPct: -20, byDept: {} },
            expenses: { globalPct: 10, bySection: {}, byDept: {} },
        }),
    },
    {
        id: 'optimize',
        emoji: '💪',
        label: 'Optimización',
        description: 'Gastos −10%',
        build: () => ({ ...EMPTY_SCENARIO, name: 'Optimización', expenses: { globalPct: -10, bySection: {}, byDept: {} } }),
    },
    {
        id: 'best-case',
        emoji: '✨',
        label: 'Mejor caso',
        description: 'Facturación +20%, Gastos −5%',
        build: () => ({
            ...EMPTY_SCENARIO,
            name: 'Mejor caso',
            revenue: { globalPct: 20, byDept: {} },
            expenses: { globalPct: -5, bySection: {}, byDept: {} },
        }),
    },
    {
        id: 'worst-case',
        emoji: '🌧️',
        label: 'Peor caso',
        description: 'Facturación −30%, Gastos +20%',
        build: () => ({
            ...EMPTY_SCENARIO,
            name: 'Peor caso',
            revenue: { globalPct: -30, byDept: {} },
            expenses: { globalPct: 20, bySection: {}, byDept: {} },
        }),
    },
];

// ============================================================
// PctSelector — dropdown con saltos de 5% de −30 a +30
// ============================================================

const PctSelector = ({ value, onChange, accent = 'indigo' }: { value: number; onChange: (v: number) => void; accent?: 'indigo' | 'rose' }) => {
    const accentColor = accent === 'rose' ? 'border-rose-300 text-rose-700' : 'border-indigo-300 text-indigo-700';
    return (
        <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className={`text-xs h-7 px-2 rounded-md border bg-white font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-300 ${value !== 0 ? accentColor : 'border-gray-200 text-gray-500'}`}
        >
            {SCENARIO_STEPS.map(s => (
                <option key={s} value={s}>{s === 0 ? 'Sin cambio' : `${s > 0 ? '+' : ''}${s}%`}</option>
            ))}
        </select>
    );
};

// ============================================================
// Modal de Escenarios — slide desde la derecha
// ============================================================

interface ModalProps {
    initial: ForecastScenario | null;
    revenueDepts: string[];
    expenseDepts: string[];
    onApply: (s: ForecastScenario) => void;
    onClose: () => void;
}

export const ForecastScenariosModal = ({ initial, revenueDepts, expenseDepts, onApply, onClose }: ModalProps) => {
    const [draft, setDraft] = useState<ForecastScenario>(() => initial ? structuredClone(initial) : structuredClone(EMPTY_SCENARIO));
    const [leaving, setLeaving] = useState(false);

    const dismiss = () => {
        setLeaving(true);
        setTimeout(onClose, 200);
    };

    const updateRevenueGlobal = (v: number) => setDraft(d => ({ ...d, revenue: { ...d.revenue, globalPct: v } }));
    const updateRevenueDept = (dept: string, v: number) => setDraft(d => ({ ...d, revenue: { ...d.revenue, byDept: { ...d.revenue.byDept, [dept]: v } } }));
    const updateExpenseGlobal = (v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, globalPct: v } }));
    const updateExpenseSection = (s: string, v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, bySection: { ...d.expenses.bySection, [s]: v } } }));
    const updateExpenseDept = (dept: string, v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, byDept: { ...d.expenses.byDept, [dept]: v } } }));

    const reset = () => setDraft(structuredClone(EMPTY_SCENARIO));

    const handleApply = () => {
        const hasChanges = !isScenarioEmpty(draft);
        const finalScenario = {
            ...draft,
            name: draft.name || (hasChanges ? 'Escenario personalizado' : ''),
        };
        onApply(finalScenario);
        dismiss();
    };

    const applyPreset = (preset: typeof PRESETS[number]) => {
        setDraft(preset.build());
    };

    const isDirty = useMemo(() => !isScenarioEmpty(draft), [draft]);

    return (
        <>
            <div
                className={`fixed inset-0 z-[190] bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
                onClick={dismiss}
            />
            <aside
                className={`fixed top-0 right-0 z-[191] h-screen w-full max-w-md bg-white shadow-2xl transition-transform duration-300 flex flex-col ${leaving ? 'translate-x-full' : 'translate-x-0'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header gradiente */}
                <div
                    className="relative px-5 py-5 text-white"
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)' }}
                >
                    <button onClick={dismiss} className="absolute top-3 right-3 h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                        <X size={14} />
                    </button>
                    <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-white/70 mb-1">
                        <Sparkles size={12} /> Escenarios Forecast
                    </div>
                    <h2 className="text-lg font-bold">¿Qué pasaría si...?</h2>
                    <p className="text-xs text-white/80 mt-1 leading-relaxed">
                        Simula variaciones de facturación y gastos sobre el Forecast actual. Los cambios son solo visuales, no afectan los datos.
                    </p>
                </div>

                {/* Cuerpo scrolleable */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                    {/* RANGO TEMPORAL */}
                    <section>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">¿En qué meses aplica?</h3>
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {(() => {
                                    const today = new Date();
                                    const nextMonth = Math.min(today.getMonth() + 2, 12);
                                    const currentQuarter = Math.floor(today.getMonth() / 3) + 1; // 1-4
                                    const rangeChips = [
                                        { label: 'Lo que queda', from: nextMonth, to: 12 },
                                        { label: 'Solo Q3', from: 7, to: 9 },
                                        { label: 'Solo Q4', from: 10, to: 12 },
                                        { label: 'H2 (Jul-Dic)', from: 7, to: 12 },
                                        { label: 'Año completo', from: 1, to: 12 },
                                    ];
                                    if (currentQuarter < 4) {
                                        const qStart = currentQuarter * 3 + 1;
                                        rangeChips.splice(1, 0, { label: `Próximo trimestre`, from: qStart, to: Math.min(qStart + 2, 12) });
                                    }
                                    return rangeChips.map(chip => {
                                        const active = draft.range.from === chip.from && draft.range.to === chip.to;
                                        return (
                                            <button
                                                key={chip.label}
                                                onClick={() => setDraft(d => ({ ...d, range: { from: chip.from, to: chip.to } }))}
                                                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'}`}
                                            >
                                                {chip.label}
                                            </button>
                                        );
                                    });
                                })()}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-xs text-gray-600">Desde</span>
                                <select
                                    value={draft.range.from}
                                    onChange={e => {
                                        const from = Number(e.target.value);
                                        setDraft(d => ({ ...d, range: { from, to: Math.max(d.range.to, from) } }));
                                    }}
                                    className="text-xs h-7 px-2 rounded-md border border-gray-200 bg-white font-medium"
                                >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                        <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                    ))}
                                </select>
                                <span className="text-xs text-gray-600">hasta</span>
                                <select
                                    value={draft.range.to}
                                    onChange={e => {
                                        const to = Number(e.target.value);
                                        setDraft(d => ({ ...d, range: { from: Math.min(d.range.from, to), to } }));
                                    }}
                                    className="text-xs h-7 px-2 rounded-md border border-gray-200 bg-white font-medium"
                                >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                        <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                    ))}
                                </select>
                            </div>
                            <p className="text-[10px] text-gray-500 italic">
                                Los meses fuera de este rango se quedan con su valor base (no se ven afectados por el escenario).
                            </p>
                        </div>
                    </section>

                    {/* PRESETS */}
                    <section>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Plantillas rápidas</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => applyPreset(p)}
                                    className="text-left rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 px-3 py-2 transition-colors"
                                >
                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                                        <span>{p.emoji}</span> {p.label}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5">{p.description}</div>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* INGRESOS */}
                    <section>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">Ingresos</h3>
                        <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-gray-800">Global (toda la facturación)</label>
                                <PctSelector value={draft.revenue.globalPct} onChange={updateRevenueGlobal} />
                            </div>
                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-600 hover:text-gray-900 select-none">Ajustar por departamento</summary>
                                <div className="mt-2 space-y-1.5 pl-2">
                                    {revenueDepts.map(d => (
                                        <div key={d} className="flex items-center justify-between">
                                            <span className="text-gray-700">{d}</span>
                                            <PctSelector value={draft.revenue.byDept[d] || 0} onChange={(v) => updateRevenueDept(d, v)} />
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-2 text-[10px] text-gray-500 italic">El % por departamento sustituye al global para ese dept.</p>
                            </details>
                        </div>
                    </section>

                    {/* GASTOS */}
                    <section>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-2">Gastos</h3>
                        <div className="space-y-2 rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-gray-800">Global (todos los gastos)</label>
                                <PctSelector value={draft.expenses.globalPct} onChange={updateExpenseGlobal} accent="rose" />
                            </div>

                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-600 hover:text-gray-900 select-none">Ajustar por categoría</summary>
                                <div className="mt-2 space-y-1.5 pl-2">
                                    {EXPENSE_SECTION_KEYS.map(k => (
                                        <div key={k} className="flex items-center justify-between">
                                            <span className="text-gray-700">{EXPENSE_SECTION_LABELS[k]}</span>
                                            <PctSelector value={draft.expenses.bySection[k] || 0} onChange={(v) => updateExpenseSection(k, v)} accent="rose" />
                                        </div>
                                    ))}
                                </div>
                            </details>

                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-600 hover:text-gray-900 select-none">Ajustar por departamento</summary>
                                <div className="mt-2 space-y-1.5 pl-2">
                                    {expenseDepts.map(d => (
                                        <div key={d} className="flex items-center justify-between">
                                            <span className="text-gray-700">{d}</span>
                                            <PctSelector value={draft.expenses.byDept[d] || 0} onChange={(v) => updateExpenseDept(d, v)} accent="rose" />
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-2 text-[10px] text-gray-500 italic">El % por dept sustituye al de categoría y al global.</p>
                            </details>
                        </div>
                    </section>

                    {/* Nombre */}
                    <section>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Nombre del escenario (opcional)</label>
                        <input
                            value={draft.name}
                            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                            placeholder="Ej. Q4 conservador"
                            className="w-full h-8 px-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </section>
                </div>

                {/* Footer */}
                <div className="border-t px-5 py-3 flex items-center gap-2 bg-gray-50">
                    <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs">
                        <RotateCcw size={12} /> Limpiar
                    </Button>
                    <div className="flex-1" />
                    <Button variant="outline" size="sm" onClick={dismiss} className="text-xs">Cancelar</Button>
                    <Button size="sm" onClick={handleApply} disabled={!isDirty} className="gap-1.5 text-xs">
                        <Check size={12} /> Aplicar
                    </Button>
                </div>
            </aside>
        </>
    );
};
