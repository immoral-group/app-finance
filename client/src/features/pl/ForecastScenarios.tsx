import { useMemo, useState } from 'react';
import { X, Sparkles, RotateCcw, Check, Trash2, Bookmark, Users, Pencil, Wand2, CalendarRange, SlidersHorizontal, Save as SaveIcon, UserMinus, UserPlus, Plus, Coins } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ============================================================
// Tipos y constantes
// ============================================================

export const SCENARIO_STEPS = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30] as const;
export type ScenarioStep = typeof SCENARIO_STEPS[number];

// Hubs disponibles para compartir escenarios
export const HUBS = ['Immedia', 'Imcontent', 'Immoralia', 'Imsales'] as const;

// ============================================================
// NewFeatureBubble — callout reutilizable para anunciar funciones nuevas
// ============================================================
export const NewFeatureBubble = ({
    title,
    description,
    onDismiss,
    align = 'center',
}: {
    title: string;
    description?: string;
    onDismiss: () => void;
    align?: 'start' | 'center' | 'end';
}) => {
    // Posición de la BURBUJA respecto al elemento padre
    const bubblePos: Record<string, string> = {
        start: 'left-0',
        center: 'left-1/2 -translate-x-1/2',
        end: 'right-0',
    };
    // Posición de la COLA dentro de la burbuja — apunta al centro del padre
    const tailPos: Record<string, string> = {
        start: 'left-3',
        center: 'left-1/2 -translate-x-1/2',
        end: 'right-3',
    };
    return (
        <div
            className={`absolute top-full mt-2.5 z-30 pointer-events-auto ${bubblePos[align]}`}
            style={{ animation: 'pl-bubble-float 2.6s ease-in-out infinite' }}
        >
            <span
                aria-hidden
                className={`absolute w-2.5 h-2.5 rotate-45 -top-1 ${tailPos[align]}`}
                style={{ background: '#6366f1' }}
            />
            <div
                className="relative rounded-xl px-3 py-2.5 shadow-2xl ring-1 ring-white/20 flex items-start gap-2 w-[230px]"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
            >
                <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">
                    <Sparkles size={11} className="text-white" />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-extrabold tracking-widest text-white bg-white/20 px-1.5 py-0.5 rounded">NUEVO</span>
                        <span className="text-[12px] font-bold text-white">{title}</span>
                    </div>
                    {description && (
                        <div className="text-[10.5px] text-white/85 mt-0.5 leading-snug">{description}</div>
                    )}
                </div>
                <button
                    onClick={onDismiss}
                    className="flex-shrink-0 h-5 w-5 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                    title="Cerrar"
                >
                    <X size={10} />
                </button>
            </div>
            <style>{`@keyframes pl-bubble-float { 0%,100% { translate: 0 0; } 50% { translate: 0 -3px; } }`}</style>
        </div>
    );
};

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

// Fila existente que "desaparece" a partir de fromMonth (baja de trabajador, corte de software, etc.)
// section para revenue = 'revenue'; para gastos, el section_key ('personal', 'software', ...).
export interface ScenarioRemovedItem {
    id: string;
    section: string;
    dept: string;
    item: string;
    fromMonth: number; // 1-12, inclusivo — a partir de este mes la fila vale 0
}

// Fila nueva "virtual" que se añade dentro del escenario (trabajador nuevo, software nuevo, etc.)
// No toca la base — solo suma al total mientras el escenario está activo.
export interface ScenarioAddedRow {
    id: string;
    section: string;
    dept: string;
    name: string;
    monthlyAmount: number;
    fromMonth: number; // 1-12
    toMonth: number;   // 1-12
    // Extras por mes (opcional). Clave = mes 1-12, valor = € añadidos a ese mes
    // sobre el monthlyAmount base. Útil para paga doble en diciembre, extra en julio, etc.
    extraByMonth?: Record<number, number>;
}

// Override de monto para una fila existente en un rango de meses.
// Reemplaza el valor base de la fila para esos meses (no suma, no aplica %).
// Ejemplo: "en julio, ingresos por Paid General = 12.000 €".
// Si se activa junto a un ajuste por %, este override gana.
export interface ScenarioAmountOverride {
    id: string;
    section: string;  // 'revenue' o clave de sección de gasto
    dept: string;
    item: string;
    fromMonth: number; // 1-12
    toMonth: number;   // 1-12
    amount: number;    // Valor fijo en €
}

export interface ForecastScenario {
    name: string;
    // Rango temporal (meses 1-12, inclusivo) donde aplica el escenario.
    // Por defecto: desde el mes siguiente al actual hasta diciembre.
    range: { from: number; to: number };
    revenue: {
        globalPct: number;
        byDept: Record<string, number>;
        // Clave: "dept::service" — afecta solo a un servicio concreto del hub
        byItem?: Record<string, number>;
    };
    expenses: {
        globalPct: number;
        bySection: Record<string, number>;
        byDept: Record<string, number>;
        // Clave: "section::dept" — afecta solo a una categoría dentro de un hub
        bySectionDept?: Record<string, number>;
        // Clave: "section::dept::item" — afecta a un item específico
        byItem?: Record<string, number>;
    };
    // Filas eliminadas del escenario (opcional — retrocompatible con escenarios antiguos)
    removedItems?: ScenarioRemovedItem[];
    // Filas nuevas del escenario (opcional — retrocompatible con escenarios antiguos)
    addedRows?: ScenarioAddedRow[];
    // Overrides de monto por fila y rango de meses (opcional — retrocompatible).
    // Cuando existe uno para una celda, reemplaza el valor base ignorando el % del escenario.
    amountOverrides?: ScenarioAmountOverride[];
}

// Secciones disponibles para añadir/eliminar filas en el escenario.
// 'revenue' incluido para poder simular apertura/cierre de servicios de facturación.
export const SCENARIO_ROW_SECTIONS: { key: string; label: string }[] = [
    { key: 'revenue', label: 'Ingresos' },
    { key: 'personal', label: 'Personal' },
    { key: 'comisiones', label: 'Comisiones' },
    { key: 'marketing', label: 'Marketing' },
    { key: 'formacion', label: 'Formación' },
    { key: 'software', label: 'Software' },
    { key: 'adspent', label: 'Adspent' },
    { key: 'gastosOp', label: 'Gastos Operativos' },
];

// Helpers de claves
export const keys = {
    revenueItem: (dept: string, item: string) => `${dept}::${item}`,
    expenseSectionDept: (section: string, dept: string) => `${section}::${dept}`,
    expenseItem: (section: string, dept: string, item: string) => `${section}::${dept}::${item}`,
};

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

// Tipo del item guardado (alineado con la DB)
export interface SavedScenario {
    id: string;
    name: string;
    scenario: ForecastScenario;
    shared_with_depts: string[];
    created_by_email?: string | null;
    created_at: string;
}

// Pretty string del rango (e.g. "Jul–Dic", "Octubre", "Año completo")
export function rangeLabel(range: { from: number; to: number }): string {
    if (range.from === 1 && range.to === 12) return 'Año completo';
    if (range.from === range.to) return MONTHS_SHORT[range.from - 1];
    return `${MONTHS_SHORT[range.from - 1]}–${MONTHS_SHORT[range.to - 1]}`;
}

// ============================================================
// Resolución de multiplicador por celda — prioridad de más específico a más general
// ============================================================
export function resolveMultiplier(
    scenario: ForecastScenario | null,
    section: string,
    dept: string,
    item: string,
    monthIdx: number,
): number {
    if (!scenario) return 1;
    const month = monthIdx + 1;
    if (month < scenario.range.from || month > scenario.range.to) return 1;
    if (section === 'revenue') {
        const itemPct = scenario.revenue.byItem?.[keys.revenueItem(dept, item)];
        if (itemPct !== undefined && itemPct !== 0) return 1 + itemPct / 100;
        const deptPct = scenario.revenue.byDept[dept];
        if (deptPct !== undefined && deptPct !== 0) return 1 + deptPct / 100;
        return 1 + (scenario.revenue.globalPct || 0) / 100;
    }
    const itemPct = scenario.expenses.byItem?.[keys.expenseItem(section, dept, item)];
    if (itemPct !== undefined && itemPct !== 0) return 1 + itemPct / 100;
    const sdPct = scenario.expenses.bySectionDept?.[keys.expenseSectionDept(section, dept)];
    if (sdPct !== undefined && sdPct !== 0) return 1 + sdPct / 100;
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
        ...Object.values(s.revenue.byItem || {}),
        s.expenses.globalPct,
        ...Object.values(s.expenses.bySection),
        ...Object.values(s.expenses.byDept),
        ...Object.values(s.expenses.bySectionDept || {}),
        ...Object.values(s.expenses.byItem || {}),
    ];
    const hasRowChanges = (s.removedItems && s.removedItems.length > 0) || (s.addedRows && s.addedRows.length > 0);
    const hasOverrides = s.amountOverrides && s.amountOverrides.length > 0;
    return allPcts.every(v => !v) && !hasRowChanges && !hasOverrides;
}

// ¿Está la fila eliminada por el escenario para ese mes concreto?
export function isItemRemoved(
    scenario: ForecastScenario | null,
    section: string,
    dept: string,
    item: string,
    monthIdx: number,
): boolean {
    if (!scenario?.removedItems?.length) return false;
    const month = monthIdx + 1;
    return scenario.removedItems.some(
        r => r.section === section && r.dept === dept && r.item === item && month >= r.fromMonth,
    );
}

// Valor de una fila añadida (virtual) para un mes concreto — 0 si está fuera del rango.
// Suma el "extra" configurado para ese mes (paga doble en diciembre, etc.) si aplica.
export function addedRowValue(row: ScenarioAddedRow, monthIdx: number): number {
    const month = monthIdx + 1;
    if (month < row.fromMonth || month > row.toMonth) return 0;
    const extra = row.extraByMonth?.[month] || 0;
    return row.monthlyAmount + extra;
}

// Devuelve las filas añadidas que aplican a una sección (agrupadas por dept)
export function addedRowsBySection(scenario: ForecastScenario | null, section: string): ScenarioAddedRow[] {
    if (!scenario?.addedRows?.length) return [];
    return scenario.addedRows.filter(r => r.section === section);
}

// Busca un override de monto activo para una celda concreta.
// Devuelve el override (que incluye el amount) o undefined si no hay ninguno.
export function getAmountOverride(
    scenario: ForecastScenario | null,
    section: string,
    dept: string,
    item: string,
    monthIdx: number,
): ScenarioAmountOverride | undefined {
    if (!scenario?.amountOverrides?.length) return undefined;
    const month = monthIdx + 1;
    return scenario.amountOverrides.find(o =>
        o.section === section && o.dept === dept && o.item === item &&
        month >= o.fromMonth && month <= o.toMonth,
    );
}

// Resumen corto del escenario para mostrar en el chip
export function scenarioSummary(s: ForecastScenario): string {
    const parts: string[] = [];
    if (s.revenue.globalPct) parts.push(`${s.revenue.globalPct > 0 ? '+' : ''}${s.revenue.globalPct}% ingresos`);
    Object.entries(s.revenue.byDept).forEach(([d, p]) => { if (p) parts.push(`${p > 0 ? '+' : ''}${p}% ${d}`); });
    Object.entries(s.revenue.byItem || {}).forEach(([k, p]) => {
        if (p) { const [, name] = k.split('::'); parts.push(`${p > 0 ? '+' : ''}${p}% ${name}`); }
    });
    if (s.expenses.globalPct) parts.push(`${s.expenses.globalPct > 0 ? '+' : ''}${s.expenses.globalPct}% gastos`);
    Object.entries(s.expenses.bySection).forEach(([k, p]) => { if (p) parts.push(`${p > 0 ? '+' : ''}${p}% ${EXPENSE_SECTION_LABELS[k] || k}`); });
    Object.entries(s.expenses.byDept).forEach(([d, p]) => { if (p) parts.push(`${p > 0 ? '+' : ''}${p}% gastos ${d}`); });
    Object.entries(s.expenses.bySectionDept || {}).forEach(([k, p]) => {
        if (p) { const [sec, d] = k.split('::'); parts.push(`${p > 0 ? '+' : ''}${p}% ${EXPENSE_SECTION_LABELS[sec] || sec} ${d}`); }
    });
    Object.entries(s.expenses.byItem || {}).forEach(([k, p]) => {
        if (p) { const [, , name] = k.split('::'); parts.push(`${p > 0 ? '+' : ''}${p}% ${name}`); }
    });
    (s.removedItems || []).forEach(r => parts.push(`− ${r.item}`));
    (s.addedRows || []).forEach(r => parts.push(`+ ${r.name}`));
    (s.amountOverrides || []).forEach(o => parts.push(`= ${o.item}: ${Math.round(o.amount).toLocaleString('de-DE')} €`));
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

// Estructuras de items para granularidad
export type ExpenseStructItem = { section: string; dept: string; name: string };
export type RevenueStructItem = { dept: string; name: string };

interface ModalProps {
    initial: ForecastScenario | null;
    revenueDepts: string[];
    expenseDepts: string[];
    // Items concretos para drill-down. Si no se pasa, no se muestra el detalle.
    revenueItems?: RevenueStructItem[];
    expenseItems?: ExpenseStructItem[];
    targetLabel: 'Forecast' | 'Presupuesto';
    savedList: SavedScenario[];
    canEdit: boolean;
    shareableDepts: string[];
    onApply: (s: ForecastScenario, fromSavedId?: string) => void;
    onUpdate: (id: string, patch: { name?: string; scenario?: ForecastScenario; shared_with_depts?: string[] }) => void;
    onDelete: (id: string, name: string) => void;
    onClose: () => void;
}

export const ForecastScenariosModal = ({
    initial, revenueDepts, expenseDepts, revenueItems, expenseItems, targetLabel,
    savedList, canEdit, shareableDepts,
    onApply, onUpdate, onDelete, onClose
}: ModalProps) => {
    const [draft, setDraft] = useState<ForecastScenario>(() => initial ? structuredClone(initial) : structuredClone(EMPTY_SCENARIO));
    const [leaving, setLeaving] = useState(false);
    const [loadedFromId, setLoadedFromId] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string; name: string; depts: string[] } | null>(null);
    const [showGuide, setShowGuide] = useState(() => localStorage.getItem('scenarios_guide_seen') !== '1');
    // Buscador para "quitar fila"
    const [removeSearch, setRemoveSearch] = useState('');
    // Controlled open/close de los tres bloques (para poder cerrarlos con la X)
    const [removeOpen, setRemoveOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [overrideOpen, setOverrideOpen] = useState(false);
    // Buscador para el picker de "fijar monto"
    const [overrideSearch, setOverrideSearch] = useState('');
    // Formulario de nuevo override — la fila se selecciona del picker (section+dept+item)
    const [newOverride, setNewOverride] = useState<{
        section: string; dept: string; item: string;
        amount: string; fromMonth: number; toMonth: number;
    }>({
        section: '',
        dept: '',
        item: '',
        amount: '',
        fromMonth: (initial?.range.from) || defaultRange().from,
        toMonth: 12,
    });
    // Qué secciones están expandidas en el árbol de "eliminar fila"
    const [removeExpandedSections, setRemoveExpandedSections] = useState<Record<string, boolean>>({});
    // Formulario de nueva fila (con paga doble/extra opcionales para personal)
    const [newRow, setNewRow] = useState<{
        section: string; dept: string; name: string; monthlyAmount: string;
        fromMonth: number; toMonth: number;
        doublePayDecember: boolean; extraDecember: string;
    }>({
        section: 'personal',
        dept: '',
        name: '',
        monthlyAmount: '',
        fromMonth: (initial?.range.from) || defaultRange().from,
        toMonth: 12,
        doublePayDecember: false,
        extraDecember: '',
    });
    const dismissGuide = () => {
        localStorage.setItem('scenarios_guide_seen', '1');
        setShowGuide(false);
    };

    const handleLoadSaved = (s: SavedScenario) => {
        setDraft(structuredClone(s.scenario));
        setLoadedFromId(s.id);
    };

    const handleDeleteSaved = (id: string, name: string) => {
        onDelete(id, name);
        if (loadedFromId === id) setLoadedFromId(null);
    };

    const startEdit = (s: SavedScenario) => {
        setEditing({ id: s.id, name: s.name, depts: [...s.shared_with_depts] });
    };
    const toggleEditDept = (d: string) => {
        setEditing(e => e ? { ...e, depts: e.depts.includes(d) ? e.depts.filter(x => x !== d) : [...e.depts, d] } : e);
    };
    const saveEdit = () => {
        if (!editing) return;
        onUpdate(editing.id, { name: editing.name.trim() || 'Sin nombre', shared_with_depts: editing.depts });
        setEditing(null);
    };

    const dismiss = () => {
        setLeaving(true);
        setTimeout(onClose, 200);
    };

    const updateRevenueGlobal = (v: number) => setDraft(d => ({ ...d, revenue: { ...d.revenue, globalPct: v } }));
    const updateRevenueDept = (dept: string, v: number) => setDraft(d => ({ ...d, revenue: { ...d.revenue, byDept: { ...d.revenue.byDept, [dept]: v } } }));
    const updateRevenueItem = (dept: string, item: string, v: number) => setDraft(d => ({ ...d, revenue: { ...d.revenue, byItem: { ...(d.revenue.byItem || {}), [keys.revenueItem(dept, item)]: v } } }));
    const updateExpenseGlobal = (v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, globalPct: v } }));
    const updateExpenseSection = (s: string, v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, bySection: { ...d.expenses.bySection, [s]: v } } }));
    const updateExpenseDept = (dept: string, v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, byDept: { ...d.expenses.byDept, [dept]: v } } }));
    const updateExpenseSectionDept = (section: string, dept: string, v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, bySectionDept: { ...(d.expenses.bySectionDept || {}), [keys.expenseSectionDept(section, dept)]: v } } }));
    const updateExpenseItem = (section: string, dept: string, item: string, v: number) => setDraft(d => ({ ...d, expenses: { ...d.expenses, byItem: { ...(d.expenses.byItem || {}), [keys.expenseItem(section, dept, item)]: v } } }));

    // ── Filas eliminadas / añadidas por el escenario ─────────────────────────
    const rid = () => `r_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

    const isRowRemoved = (section: string, dept: string, item: string): ScenarioRemovedItem | undefined =>
        (draft.removedItems || []).find(r => r.section === section && r.dept === dept && r.item === item);

    const toggleRemoveRow = (section: string, dept: string, item: string) => {
        setDraft(d => {
            const list = d.removedItems || [];
            const exists = list.find(r => r.section === section && r.dept === dept && r.item === item);
            if (exists) {
                return { ...d, removedItems: list.filter(r => r !== exists) };
            }
            return {
                ...d,
                removedItems: [...list, { id: rid(), section, dept, item, fromMonth: d.range.from }],
            };
        });
    };

    const updateRemoveFromMonth = (id: string, fromMonth: number) => {
        setDraft(d => ({
            ...d,
            removedItems: (d.removedItems || []).map(r => r.id === id ? { ...r, fromMonth } : r),
        }));
    };

    const addNewRow = (row: Omit<ScenarioAddedRow, 'id'>) => {
        setDraft(d => ({
            ...d,
            addedRows: [...(d.addedRows || []), { ...row, id: rid() }],
        }));
    };

    const updateAddedRow = (id: string, patch: Partial<ScenarioAddedRow>) => {
        setDraft(d => ({
            ...d,
            addedRows: (d.addedRows || []).map(r => r.id === id ? { ...r, ...patch } : r),
        }));
    };

    const removeAddedRow = (id: string) => {
        setDraft(d => ({
            ...d,
            addedRows: (d.addedRows || []).filter(r => r.id !== id),
        }));
    };

    // ── Amount overrides ─────────────────────────────────────────────────────
    const addAmountOverride = (o: Omit<ScenarioAmountOverride, 'id'>) => {
        setDraft(d => ({
            ...d,
            amountOverrides: [...(d.amountOverrides || []), { ...o, id: rid() }],
        }));
    };

    const updateAmountOverride = (id: string, patch: Partial<ScenarioAmountOverride>) => {
        setDraft(d => ({
            ...d,
            amountOverrides: (d.amountOverrides || []).map(o => o.id === id ? { ...o, ...patch } : o),
        }));
    };

    const removeAmountOverride = (id: string) => {
        setDraft(d => ({
            ...d,
            amountOverrides: (d.amountOverrides || []).filter(o => o.id !== id),
        }));
    };

    // Agrupaciones derivadas para drill-down
    const revenueByDeptItems = useMemo(() => {
        const m: Record<string, string[]> = {};
        (revenueItems || []).forEach(it => {
            if (!m[it.dept]) m[it.dept] = [];
            if (!m[it.dept].includes(it.name)) m[it.dept].push(it.name);
        });
        return m;
    }, [revenueItems]);

    const expenseBySectionDeptItems = useMemo(() => {
        // section -> dept -> items[]
        const m: Record<string, Record<string, string[]>> = {};
        (expenseItems || []).forEach(it => {
            if (!m[it.section]) m[it.section] = {};
            if (!m[it.section][it.dept]) m[it.section][it.dept] = [];
            if (!m[it.section][it.dept].includes(it.name)) m[it.section][it.dept].push(it.name);
        });
        return m;
    }, [expenseItems]);

    const expenseByDeptSectionItems = useMemo(() => {
        // dept -> section -> items[]
        const m: Record<string, Record<string, string[]>> = {};
        (expenseItems || []).forEach(it => {
            if (!m[it.dept]) m[it.dept] = {};
            if (!m[it.dept][it.section]) m[it.dept][it.section] = [];
            if (!m[it.dept][it.section].includes(it.name)) m[it.dept][it.section].push(it.name);
        });
        return m;
    }, [expenseItems]);

    // Lista plana de todas las filas del año — se usa en el buscador de "eliminar fila"
    const allRows = useMemo(() => {
        const rows: { section: string; dept: string; item: string; label: string }[] = [];
        (revenueItems || []).forEach(it => rows.push({ section: 'revenue', dept: it.dept, item: it.name, label: 'Ingresos' }));
        (expenseItems || []).forEach(it => rows.push({ section: it.section, dept: it.dept, item: it.name, label: EXPENSE_SECTION_LABELS[it.section] || it.section }));
        return rows;
    }, [revenueItems, expenseItems]);

    const filteredOverrideRows = useMemo(() => {
        const q = overrideSearch.trim().toLowerCase();
        if (!q) return allRows;
        return allRows.filter(r =>
            r.item.toLowerCase().includes(q) ||
            r.dept.toLowerCase().includes(q) ||
            r.label.toLowerCase().includes(q),
        );
    }, [allRows, overrideSearch]);

    const filteredRemoveRows = useMemo(() => {
        const q = removeSearch.trim().toLowerCase();
        if (!q) return allRows;
        return allRows.filter(r =>
            r.item.toLowerCase().includes(q) ||
            r.dept.toLowerCase().includes(q) ||
            r.label.toLowerCase().includes(q),
        );
    }, [allRows, removeSearch]);

    // Agrupamos las filas filtradas por sección para presentarlas en árbol (Facturación · Personal · ...)
    // Mantenemos el orden definido en SCENARIO_ROW_SECTIONS.
    const groupedRemoveRows = useMemo(() => {
        const bySection: Record<string, { section: string; label: string; rows: typeof allRows }> = {};
        filteredRemoveRows.forEach(r => {
            const label = r.section === 'revenue' ? 'Facturación' : (EXPENSE_SECTION_LABELS[r.section] || r.section);
            if (!bySection[r.section]) bySection[r.section] = { section: r.section, label, rows: [] };
            bySection[r.section].rows.push(r);
        });
        // Devolver en el orden canónico
        const order = ['revenue', 'personal', 'comisiones', 'marketing', 'formacion', 'software', 'adspent', 'gastosOp'];
        return order
            .map(s => bySection[s])
            .filter(Boolean);
    }, [filteredRemoveRows]);

    const isSearching = removeSearch.trim().length > 0;

    // Departamentos disponibles para el formulario "añadir fila", según la sección elegida
    const deptsForNewRow = useMemo(() => {
        if (newRow.section === 'revenue') return revenueDepts;
        return expenseDepts;
    }, [newRow.section, revenueDepts, expenseDepts]);

    const reset = () => setDraft(structuredClone(EMPTY_SCENARIO));

    const handleApply = () => {
        const hasChanges = !isScenarioEmpty(draft);
        const finalScenario = {
            ...draft,
            name: draft.name || (hasChanges ? 'Escenario personalizado' : ''),
        };
        onApply(finalScenario, loadedFromId || undefined);
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
                        Simula variaciones de facturación y gastos sobre el {targetLabel} actual. Los cambios son solo visuales, no afectan los datos.
                    </p>
                </div>

                {/* Cuerpo scrolleable */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                    {/* QUICK GUIDE — primera vez */}
                    {canEdit && showGuide && (
                        <section className="relative rounded-xl overflow-hidden ring-1 ring-indigo-100 shadow-sm">
                            <div
                                className="absolute inset-0 opacity-[0.08] pointer-events-none"
                                style={{ background: 'radial-gradient(circle at 20% 20%, #6366f1, transparent 50%), radial-gradient(circle at 80% 80%, #ec4899, transparent 50%)' }}
                            />
                            <div className="relative bg-white/95 backdrop-blur p-3">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-extrabold tracking-widest text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">CÓMO FUNCIONA</span>
                                        <span className="text-xs font-bold text-gray-800">En 5 pasos</span>
                                    </div>
                                    <button
                                        onClick={dismissGuide}
                                        className="h-5 w-5 rounded-full hover:bg-gray-100 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                                        title="Ocultar guía"
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { n: 1, icon: <Wand2 size={12} />, title: 'Elige plantilla o crea', desc: 'Presets rápidos o ajustes a medida.' },
                                        { n: 2, icon: <CalendarRange size={12} />, title: 'Define el rango', desc: 'Solo afecta los meses que elijas.' },
                                        { n: 3, icon: <SlidersHorizontal size={12} />, title: 'Ajusta ingresos / gastos', desc: '±5% a ±30% global o por dept/categoría.' },
                                        { n: 4, icon: <UserPlus size={12} />, title: 'Añade o quita filas ✨', desc: 'Simula bajas, altas nuevas y paga doble en dic.' },
                                        { n: 5, icon: <SaveIcon size={12} />, title: 'Aplica y guarda', desc: 'Mira el resultado y guarda desde el chip.' },
                                    ].map(step => (
                                        <div key={step.n} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-white px-2 py-1.5">
                                            <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-[10px] font-bold inline-flex items-center justify-center shadow-sm">
                                                {step.n}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-800">
                                                    <span className="text-indigo-600">{step.icon}</span>
                                                    {step.title}
                                                </div>
                                                <div className="text-[10px] text-gray-500 leading-tight">{step.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* MIS ESCENARIOS GUARDADOS */}
                    {savedList.length > 0 && (
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                <Bookmark size={12} /> {canEdit ? 'Escenarios guardados' : 'Disponibles para tu departamento'}
                                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                                    {savedList.length}
                                </span>
                            </h3>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                                {savedList.map(s => {
                                    const isEditing = editing?.id === s.id;
                                    if (isEditing && canEdit) {
                                        return (
                                            <div key={s.id} className="rounded-lg border border-indigo-300 bg-indigo-50/40 px-2.5 py-2 space-y-2">
                                                <input
                                                    value={editing!.name}
                                                    onChange={e => setEditing(prev => prev ? { ...prev, name: e.target.value } : prev)}
                                                    className="w-full h-7 px-2 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                    placeholder="Nombre del escenario"
                                                />
                                                {shareableDepts.length > 0 && (
                                                    <div>
                                                        <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 mb-1">
                                                            <Users size={10} /> Compartir con Hubs:
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {shareableDepts.map(d => {
                                                                const active = editing!.depts.includes(d);
                                                                return (
                                                                    <button
                                                                        key={d}
                                                                        onClick={() => toggleEditDept(d)}
                                                                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'}`}
                                                                    >
                                                                        {d}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex justify-end gap-1.5">
                                                    <Button variant="outline" size="sm" onClick={() => setEditing(null)} className="text-[11px] h-6">Cancelar</Button>
                                                    <Button size="sm" onClick={saveEdit} className="text-[11px] h-6 gap-1"><Check size={10} /> Guardar</Button>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div
                                            key={s.id}
                                            className={`group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${loadedFromId === s.id ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40'}`}
                                        >
                                            <button
                                                onClick={() => {
                                                    if (canEdit) {
                                                        handleLoadSaved(s);
                                                    } else {
                                                        onApply(s.scenario, s.id);
                                                        dismiss();
                                                    }
                                                }}
                                                className="flex-1 text-left min-w-0"
                                                title={canEdit ? 'Cargar este escenario' : 'Aplicar este escenario'}
                                            >
                                                <div className="text-xs font-semibold text-gray-800 truncate">{s.name}</div>
                                                <div className="text-[10px] text-gray-500 truncate">{scenarioSummary(s.scenario)}</div>
                                                {canEdit && s.shared_with_depts.length > 0 && (
                                                    <div className="mt-0.5 flex items-center gap-1 text-[9px] text-indigo-700">
                                                        <Users size={9} /> {s.shared_with_depts.join(', ')}
                                                    </div>
                                                )}
                                            </button>
                                            {canEdit && (
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => startEdit(s)}
                                                        className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                        title="Renombrar y compartir"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSaved(s.id, s.name)}
                                                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {!canEdit && savedList.length === 0 && (
                        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">
                            No hay escenarios compartidos con tu departamento todavía.
                        </div>
                    )}

                    {canEdit && (
                    <>
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
                                <summary className="cursor-pointer text-gray-600 hover:text-gray-900 select-none">Ajustar por hubs o vertical</summary>
                                <div className="mt-2 space-y-1.5 pl-2">
                                    {revenueDepts.map(d => {
                                        const items = revenueByDeptItems[d] || [];
                                        return (
                                            <div key={d} className="rounded-md bg-white/60 px-2 py-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-700 font-medium">{d}</span>
                                                    <PctSelector value={draft.revenue.byDept[d] || 0} onChange={(v) => updateRevenueDept(d, v)} />
                                                </div>
                                                {items.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-[11px] text-emerald-700 hover:text-emerald-900 select-none">Por servicio ({items.length})</summary>
                                                        <div className="mt-1.5 space-y-1 pl-3 border-l-2 border-emerald-100">
                                                            {items.map(it => (
                                                                <div key={it} className="flex items-center justify-between">
                                                                    <span className="text-[11px] text-gray-700">{it}</span>
                                                                    <PctSelector value={draft.revenue.byItem?.[keys.revenueItem(d, it)] || 0} onChange={(v) => updateRevenueItem(d, it, v)} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-2 text-[10px] text-gray-500 italic">Lo más específico (servicio &gt; hub &gt; global) tiene prioridad.</p>
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
                                    {EXPENSE_SECTION_KEYS.map(k => {
                                        const depts = Object.keys(expenseBySectionDeptItems[k] || {});
                                        return (
                                            <div key={k} className="rounded-md bg-white/60 px-2 py-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-700 font-medium">{EXPENSE_SECTION_LABELS[k]}</span>
                                                    <PctSelector value={draft.expenses.bySection[k] || 0} onChange={(v) => updateExpenseSection(k, v)} accent="rose" />
                                                </div>
                                                {depts.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-[11px] text-rose-700 hover:text-rose-900 select-none">Por hub o vertical ({depts.length})</summary>
                                                        <div className="mt-1.5 space-y-1.5 pl-3 border-l-2 border-rose-100">
                                                            {depts.map(d => {
                                                                const items = expenseBySectionDeptItems[k][d] || [];
                                                                return (
                                                                    <div key={d} className="rounded bg-white/70 px-1.5 py-1">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[11px] text-gray-700">{d}</span>
                                                                            <PctSelector value={draft.expenses.bySectionDept?.[keys.expenseSectionDept(k, d)] || 0} onChange={(v) => updateExpenseSectionDept(k, d, v)} accent="rose" />
                                                                        </div>
                                                                        {items.length > 0 && (
                                                                            <details className="mt-1">
                                                                                <summary className="cursor-pointer text-[10.5px] text-gray-500 hover:text-gray-800 select-none">Por item ({items.length})</summary>
                                                                                <div className="mt-1 space-y-0.5 pl-2.5 border-l border-gray-200">
                                                                                    {items.map(it => (
                                                                                        <div key={it} className="flex items-center justify-between">
                                                                                            <span className="text-[10.5px] text-gray-700">{it}</span>
                                                                                            <PctSelector value={draft.expenses.byItem?.[keys.expenseItem(k, d, it)] || 0} onChange={(v) => updateExpenseItem(k, d, it, v)} accent="rose" />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </details>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </details>

                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-600 hover:text-gray-900 select-none">Ajustar por hubs o vertical</summary>
                                <div className="mt-2 space-y-1.5 pl-2">
                                    {expenseDepts.map(d => {
                                        const sections = Object.keys(expenseByDeptSectionItems[d] || {});
                                        return (
                                            <div key={d} className="rounded-md bg-white/60 px-2 py-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-700 font-medium">{d}</span>
                                                    <PctSelector value={draft.expenses.byDept[d] || 0} onChange={(v) => updateExpenseDept(d, v)} accent="rose" />
                                                </div>
                                                {sections.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-[11px] text-rose-700 hover:text-rose-900 select-none">Por categoría ({sections.length})</summary>
                                                        <div className="mt-1.5 space-y-1.5 pl-3 border-l-2 border-rose-100">
                                                            {sections.map(sec => {
                                                                const items = expenseByDeptSectionItems[d][sec] || [];
                                                                return (
                                                                    <div key={sec} className="rounded bg-white/70 px-1.5 py-1">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[11px] text-gray-700">{EXPENSE_SECTION_LABELS[sec] || sec}</span>
                                                                            <PctSelector value={draft.expenses.bySectionDept?.[keys.expenseSectionDept(sec, d)] || 0} onChange={(v) => updateExpenseSectionDept(sec, d, v)} accent="rose" />
                                                                        </div>
                                                                        {items.length > 0 && (
                                                                            <details className="mt-1">
                                                                                <summary className="cursor-pointer text-[10.5px] text-gray-500 hover:text-gray-800 select-none">Por item ({items.length})</summary>
                                                                                <div className="mt-1 space-y-0.5 pl-2.5 border-l border-gray-200">
                                                                                    {items.map(it => (
                                                                                        <div key={it} className="flex items-center justify-between">
                                                                                            <span className="text-[10.5px] text-gray-700">{it}</span>
                                                                                            <PctSelector value={draft.expenses.byItem?.[keys.expenseItem(sec, d, it)] || 0} onChange={(v) => updateExpenseItem(sec, d, it, v)} accent="rose" />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </details>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-2 text-[10px] text-gray-500 italic">Prioridad: item &gt; categoría dentro de hub &gt; hub &gt; categoría global &gt; global.</p>
                            </details>
                        </div>
                    </section>

                    {/* FILAS — Añadir / Eliminar */}
                    <section>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-violet-700 mb-2 flex items-center gap-1.5">
                            <UserPlus size={12} /> Filas del escenario
                            <span className="text-[9px] font-extrabold tracking-widest text-white bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-1.5 py-0.5 rounded shadow-sm">NUEVO</span>
                        </h3>
                        <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                            <p className="text-[11px] text-gray-600 leading-snug">
                                Simula altas y bajas: elimina una fila existente a partir de un mes (p. ej. un trabajador que se va) o añade una fila nueva con su coste mensual (nuevo trabajador, nuevo software, etc.). También puedes <span className="font-semibold text-amber-700">fijar un monto</span> para una fila existente en un rango de meses (p. ej. ingresos de un servicio = 12.000 € en julio).
                            </p>

                            {/* Filas eliminadas — chips actuales */}
                            {(draft.removedItems || []).length > 0 && (
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1 flex items-center gap-1">
                                        <UserMinus size={10} /> Eliminadas ({(draft.removedItems || []).length})
                                    </div>
                                    <div className="space-y-1">
                                        {(draft.removedItems || []).map(r => (
                                            <div key={r.id} className="flex items-center gap-2 rounded-md bg-white border border-rose-200 px-2 py-1">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-semibold text-gray-800 truncate">{r.item}</div>
                                                    <div className="text-[10px] text-gray-500 truncate">{r.section === 'revenue' ? 'Facturación' : (EXPENSE_SECTION_LABELS[r.section] || r.section)} · {r.dept}</div>
                                                </div>
                                                <span className="text-[10px] text-gray-600">desde</span>
                                                <select
                                                    value={r.fromMonth}
                                                    onChange={e => updateRemoveFromMonth(r.id, Number(e.target.value))}
                                                    className="text-[11px] h-6 px-1.5 rounded border border-gray-200 bg-white font-medium"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                        <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={() => toggleRemoveRow(r.section, r.dept, r.item)}
                                                    className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                                                    title="Quitar de la lista"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Bloque "Eliminar fila existente" — controlado (X para cerrar) y agrupado por sección */}
                            {allRows.length > 0 && (
                                <div className="rounded-md bg-white/60 border border-rose-100">
                                    <div className="flex items-center justify-between px-2 py-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setRemoveOpen(v => !v)}
                                            className="flex-1 text-left text-[11px] font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-1"
                                        >
                                            <UserMinus size={11} /> Eliminar fila existente
                                            <span className="ml-auto text-[10px] text-gray-400">{removeOpen ? 'Ocultar' : 'Mostrar'}</span>
                                        </button>
                                        {removeOpen && (
                                            <button
                                                type="button"
                                                onClick={() => setRemoveOpen(false)}
                                                className="ml-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                                title="Cerrar"
                                            >
                                                <X size={11} />
                                            </button>
                                        )}
                                    </div>
                                    {removeOpen && (
                                        <div className="border-t border-rose-100 p-2 space-y-1.5">
                                            <input
                                                value={removeSearch}
                                                onChange={e => setRemoveSearch(e.target.value)}
                                                placeholder="Buscar por nombre, hub o categoría..."
                                                className="w-full h-7 px-2 text-[11px] rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-200"
                                            />
                                            <div className="max-h-64 overflow-y-auto rounded-md border border-gray-100 bg-white">
                                                {groupedRemoveRows.length === 0 && (
                                                    <div className="text-[11px] text-gray-400 px-2 py-3 text-center">Sin resultados</div>
                                                )}
                                                {groupedRemoveRows.map(group => {
                                                    const forcedOpen = isSearching;
                                                    const expanded = forcedOpen || !!removeExpandedSections[group.section];
                                                    return (
                                                        <div key={group.section} className="border-b border-gray-50 last:border-b-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => !forcedOpen && setRemoveExpandedSections(s => ({ ...s, [group.section]: !s[group.section] }))}
                                                                className={`w-full flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold ${group.section === 'revenue' ? 'text-emerald-800 bg-emerald-50/60' : 'text-gray-700 bg-gray-50'} hover:bg-gray-100`}
                                                            >
                                                                <span>{group.label} <span className="text-[10px] font-normal text-gray-500">({group.rows.length})</span></span>
                                                                <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                                                            </button>
                                                            {expanded && (
                                                                <div className="divide-y divide-gray-50">
                                                                    {group.rows.map(r => {
                                                                        const removed = isRowRemoved(r.section, r.dept, r.item);
                                                                        return (
                                                                            <button
                                                                                key={`${r.section}-${r.dept}-${r.item}`}
                                                                                onClick={() => toggleRemoveRow(r.section, r.dept, r.item)}
                                                                                className={`w-full flex items-center gap-2 px-2 py-1 text-left transition-colors ${removed ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-gray-50'}`}
                                                                            >
                                                                                <span className={`flex-shrink-0 h-4 w-4 rounded border ${removed ? 'bg-rose-600 border-rose-600 text-white' : 'border-gray-300 bg-white'} flex items-center justify-center`}>
                                                                                    {removed && <Check size={10} />}
                                                                                </span>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="text-[11px] font-medium text-gray-800 truncate">{r.item}</div>
                                                                                    <div className="text-[10px] text-gray-500 truncate">{r.dept}</div>
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-gray-500 italic">Al eliminar una fila su valor pasa a 0 desde el mes que elijas, sin tocar la base.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Filas añadidas — lista y editor */}
                            {(draft.addedRows || []).length > 0 && (
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1 flex items-center gap-1">
                                        <UserPlus size={10} /> Añadidas ({(draft.addedRows || []).length})
                                    </div>
                                    <div className="space-y-1.5">
                                        {(draft.addedRows || []).map(r => {
                                            const decExtra = r.extraByMonth?.[12] || 0;
                                            const isDouble = decExtra === r.monthlyAmount && r.monthlyAmount > 0;
                                            return (
                                            <div key={r.id} className="rounded-md bg-white border border-emerald-200 px-2 py-1.5">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            value={r.name}
                                                            onChange={e => updateAddedRow(r.id, { name: e.target.value })}
                                                            placeholder="Nombre"
                                                            className="w-full h-6 px-1.5 text-[11px] font-semibold rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => removeAddedRow(r.id)}
                                                        className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                                                        title="Quitar"
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                                    <select
                                                        value={r.section}
                                                        onChange={e => updateAddedRow(r.id, { section: e.target.value })}
                                                        className="h-6 px-1 rounded border border-gray-200 bg-white"
                                                    >
                                                        {SCENARIO_ROW_SECTIONS.map(s => (
                                                            <option key={s.key} value={s.key}>{s.label}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        value={r.dept}
                                                        onChange={e => updateAddedRow(r.id, { dept: e.target.value })}
                                                        className="h-6 px-1 rounded border border-gray-200 bg-white"
                                                    >
                                                        <option value="">Hub...</option>
                                                        {(r.section === 'revenue' ? revenueDepts : expenseDepts).map(d => (
                                                            <option key={d} value={d}>{d}</option>
                                                        ))}
                                                    </select>
                                                    <div className="col-span-2 flex items-center gap-1">
                                                        <span className="text-gray-500">€/mes</span>
                                                        <input
                                                            type="number"
                                                            value={r.monthlyAmount}
                                                            onChange={e => {
                                                                const val = Number(e.target.value) || 0;
                                                                const patch: Partial<ScenarioAddedRow> = { monthlyAmount: val };
                                                                // Si el usuario tenía activada "paga doble", mantener sincronía
                                                                if (isDouble) {
                                                                    patch.extraByMonth = { ...(r.extraByMonth || {}), 12: val };
                                                                }
                                                                updateAddedRow(r.id, patch);
                                                            }}
                                                            className="flex-1 h-6 px-1.5 tabular-nums rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-center gap-1">
                                                        <span className="text-gray-500">De</span>
                                                        <select
                                                            value={r.fromMonth}
                                                            onChange={e => {
                                                                const from = Number(e.target.value);
                                                                updateAddedRow(r.id, { fromMonth: from, toMonth: Math.max(r.toMonth, from) });
                                                            }}
                                                            className="h-6 px-1 rounded border border-gray-200 bg-white"
                                                        >
                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                            ))}
                                                        </select>
                                                        <span className="text-gray-500">a</span>
                                                        <select
                                                            value={r.toMonth}
                                                            onChange={e => {
                                                                const to = Number(e.target.value);
                                                                updateAddedRow(r.id, { toMonth: to, fromMonth: Math.min(r.fromMonth, to) });
                                                            }}
                                                            className="h-6 px-1 rounded border border-gray-200 bg-white"
                                                        >
                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {r.section === 'personal' && (
                                                        <div className="col-span-2 rounded bg-emerald-50/50 border border-emerald-100 px-1.5 py-1 space-y-1">
                                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isDouble}
                                                                    onChange={e => {
                                                                        const next = { ...(r.extraByMonth || {}) };
                                                                        if (e.target.checked) next[12] = r.monthlyAmount;
                                                                        else delete next[12];
                                                                        updateAddedRow(r.id, { extraByMonth: next });
                                                                    }}
                                                                    className="h-3 w-3"
                                                                />
                                                                <span className="text-emerald-800">Paga doble en diciembre</span>
                                                            </label>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-gray-600">Extra dic. (€)</span>
                                                                <input
                                                                    type="number"
                                                                    value={isDouble ? '' : (decExtra || '')}
                                                                    disabled={isDouble}
                                                                    onChange={e => {
                                                                        const v = Number(e.target.value) || 0;
                                                                        const next = { ...(r.extraByMonth || {}) };
                                                                        if (v) next[12] = v; else delete next[12];
                                                                        updateAddedRow(r.id, { extraByMonth: next });
                                                                    }}
                                                                    placeholder={isDouble ? 'automático' : '0'}
                                                                    className="flex-1 h-6 px-1.5 tabular-nums rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-300 disabled:bg-gray-50 disabled:text-gray-400"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Bloque "Añadir fila nueva" — controlado (X para cerrar) */}
                            <div className="rounded-md bg-white/60 border border-emerald-100">
                                <div className="flex items-center justify-between px-2 py-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setAddOpen(v => !v)}
                                        className="flex-1 text-left text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                                    >
                                        <UserPlus size={11} /> Añadir fila nueva
                                        <span className="ml-auto text-[10px] text-gray-400">{addOpen ? 'Ocultar' : 'Mostrar'}</span>
                                    </button>
                                    {addOpen && (
                                        <button
                                            type="button"
                                            onClick={() => setAddOpen(false)}
                                            className="ml-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                            title="Cerrar"
                                        >
                                            <X size={11} />
                                        </button>
                                    )}
                                </div>
                                {addOpen && (
                                    <div className="border-t border-emerald-100 p-2 space-y-1.5">
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <select
                                                value={newRow.section}
                                                onChange={e => setNewRow(r => ({ ...r, section: e.target.value, dept: '' }))}
                                                className="h-7 px-1.5 text-[11px] rounded border border-gray-200 bg-white"
                                            >
                                                {SCENARIO_ROW_SECTIONS.map(s => (
                                                    <option key={s.key} value={s.key}>{s.label}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={newRow.dept}
                                                onChange={e => setNewRow(r => ({ ...r, dept: e.target.value }))}
                                                className="h-7 px-1.5 text-[11px] rounded border border-gray-200 bg-white"
                                            >
                                                <option value="">Hub o vertical...</option>
                                                {deptsForNewRow.map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                            <input
                                                value={newRow.name}
                                                onChange={e => setNewRow(r => ({ ...r, name: e.target.value }))}
                                                placeholder="Nombre (ej. Nuevo trabajador)"
                                                className="col-span-2 h-7 px-2 text-[11px] rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                            />
                                            <input
                                                type="number"
                                                value={newRow.monthlyAmount}
                                                onChange={e => setNewRow(r => ({ ...r, monthlyAmount: e.target.value }))}
                                                placeholder="Coste €/mes"
                                                className="h-7 px-2 text-[11px] tabular-nums rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                            />
                                            <div className="flex items-center gap-1 text-[11px]">
                                                <select
                                                    value={newRow.fromMonth}
                                                    onChange={e => {
                                                        const from = Number(e.target.value);
                                                        setNewRow(r => ({ ...r, fromMonth: from, toMonth: Math.max(r.toMonth, from) }));
                                                    }}
                                                    className="h-7 px-1 rounded border border-gray-200 bg-white"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                        <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                    ))}
                                                </select>
                                                <span className="text-gray-500">a</span>
                                                <select
                                                    value={newRow.toMonth}
                                                    onChange={e => {
                                                        const to = Number(e.target.value);
                                                        setNewRow(r => ({ ...r, toMonth: to, fromMonth: Math.min(r.fromMonth, to) }));
                                                    }}
                                                    className="h-7 px-1 rounded border border-gray-200 bg-white"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                        <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {newRow.section === 'personal' && (
                                                <div className="col-span-2 rounded bg-emerald-50/50 border border-emerald-100 px-1.5 py-1 space-y-1 text-[11px]">
                                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newRow.doublePayDecember}
                                                            onChange={e => setNewRow(r => ({ ...r, doublePayDecember: e.target.checked, extraDecember: e.target.checked ? '' : r.extraDecember }))}
                                                            className="h-3 w-3"
                                                        />
                                                        <span className="text-emerald-800">Paga doble en diciembre</span>
                                                    </label>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-gray-600">Extra dic. (€)</span>
                                                        <input
                                                            type="number"
                                                            value={newRow.doublePayDecember ? '' : newRow.extraDecember}
                                                            disabled={newRow.doublePayDecember}
                                                            onChange={e => setNewRow(r => ({ ...r, extraDecember: e.target.value }))}
                                                            placeholder={newRow.doublePayDecember ? 'automático' : '0'}
                                                            className="flex-1 h-6 px-1.5 tabular-nums rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-300 disabled:bg-gray-50 disabled:text-gray-400"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const monthly = Number(newRow.monthlyAmount) || 0;
                                                    if (!newRow.name.trim() || !newRow.dept) return;
                                                    let extraByMonth: Record<number, number> | undefined;
                                                    if (newRow.section === 'personal') {
                                                        if (newRow.doublePayDecember) extraByMonth = { 12: monthly };
                                                        else if (Number(newRow.extraDecember) > 0) extraByMonth = { 12: Number(newRow.extraDecember) };
                                                    }
                                                    addNewRow({
                                                        section: newRow.section,
                                                        dept: newRow.dept,
                                                        name: newRow.name.trim(),
                                                        monthlyAmount: monthly,
                                                        fromMonth: newRow.fromMonth,
                                                        toMonth: newRow.toMonth,
                                                        ...(extraByMonth ? { extraByMonth } : {}),
                                                    });
                                                    setNewRow(r => ({ ...r, name: '', monthlyAmount: '', doublePayDecember: false, extraDecember: '' }));
                                                }}
                                                disabled={!newRow.name.trim() || !newRow.dept}
                                                className="col-span-2 h-7 text-[11px] gap-1"
                                            >
                                                <Plus size={11} /> Añadir fila
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-gray-500 italic">La fila añadida solo existe dentro del escenario — no se guarda en la base ni afecta a otros meses.</p>
                                    </div>
                                )}
                            </div>

                            {/* Overrides de monto — lista y editor */}
                            {(draft.amountOverrides || []).length > 0 && (
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1">
                                        <Coins size={10} /> Montos fijos ({(draft.amountOverrides || []).length})
                                    </div>
                                    <div className="space-y-1.5">
                                        {(draft.amountOverrides || []).map(o => {
                                            const sectionLabel = o.section === 'revenue' ? 'Facturación' : (EXPENSE_SECTION_LABELS[o.section] || o.section);
                                            return (
                                                <div key={o.id} className="rounded-md bg-white border border-amber-200 px-2 py-1.5">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[11px] font-semibold text-gray-800 truncate">{o.item}</div>
                                                            <div className="text-[10px] text-gray-500 truncate">{sectionLabel} · {o.dept}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => removeAmountOverride(o.id)}
                                                            className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                                                            title="Quitar override"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                                        <div className="col-span-2 flex items-center gap-1">
                                                            <span className="text-gray-500">€ mes</span>
                                                            <input
                                                                type="number"
                                                                value={o.amount}
                                                                onChange={e => updateAmountOverride(o.id, { amount: Number(e.target.value) || 0 })}
                                                                className="flex-1 h-6 px-1.5 tabular-nums rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                            />
                                                        </div>
                                                        <div className="col-span-2 flex items-center gap-1">
                                                            <span className="text-gray-500">De</span>
                                                            <select
                                                                value={o.fromMonth}
                                                                onChange={e => {
                                                                    const from = Number(e.target.value);
                                                                    updateAmountOverride(o.id, { fromMonth: from, toMonth: Math.max(o.toMonth, from) });
                                                                }}
                                                                className="h-6 px-1 rounded border border-gray-200 bg-white"
                                                            >
                                                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                    <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                                ))}
                                                            </select>
                                                            <span className="text-gray-500">a</span>
                                                            <select
                                                                value={o.toMonth}
                                                                onChange={e => {
                                                                    const to = Number(e.target.value);
                                                                    updateAmountOverride(o.id, { toMonth: to, fromMonth: Math.min(o.fromMonth, to) });
                                                                }}
                                                                className="h-6 px-1 rounded border border-gray-200 bg-white"
                                                            >
                                                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                    <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Bloque "Fijar monto" — controlado (X para cerrar) */}
                            {allRows.length > 0 && (
                                <div className="rounded-md bg-white/60 border border-amber-100">
                                    <div className="flex items-center justify-between px-2 py-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setOverrideOpen(v => !v)}
                                            className="flex-1 text-left text-[11px] font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1"
                                        >
                                            <Coins size={11} /> Fijar monto para fila existente
                                            <span className="ml-auto text-[10px] text-gray-400">{overrideOpen ? 'Ocultar' : 'Mostrar'}</span>
                                        </button>
                                        {overrideOpen && (
                                            <button
                                                type="button"
                                                onClick={() => setOverrideOpen(false)}
                                                className="ml-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                                title="Cerrar"
                                            >
                                                <X size={11} />
                                            </button>
                                        )}
                                    </div>
                                    {overrideOpen && (
                                        <div className="border-t border-amber-100 p-2 space-y-1.5">
                                            <p className="text-[10px] text-gray-500 leading-snug">
                                                Reemplaza el valor base de la fila por un monto fijo en el rango de meses que elijas. Ignora el ajuste por %.
                                            </p>
                                            {/* Picker de fila */}
                                            <input
                                                value={overrideSearch}
                                                onChange={e => setOverrideSearch(e.target.value)}
                                                placeholder="Buscar fila (nombre, hub o categoría)..."
                                                className="w-full h-7 px-2 text-[11px] rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                            />
                                            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-100 bg-white">
                                                {filteredOverrideRows.length === 0 && (
                                                    <div className="text-[11px] text-gray-400 px-2 py-3 text-center">Sin resultados</div>
                                                )}
                                                {filteredOverrideRows.slice(0, 60).map(r => {
                                                    const selected = newOverride.section === r.section && newOverride.dept === r.dept && newOverride.item === r.item;
                                                    return (
                                                        <button
                                                            key={`${r.section}-${r.dept}-${r.item}`}
                                                            onClick={() => setNewOverride(o => ({ ...o, section: r.section, dept: r.dept, item: r.item }))}
                                                            className={`w-full flex items-center gap-2 px-2 py-1 text-left transition-colors ${selected ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}
                                                        >
                                                            <span className={`flex-shrink-0 h-4 w-4 rounded-full border ${selected ? 'bg-amber-600 border-amber-600 text-white' : 'border-gray-300 bg-white'} flex items-center justify-center`}>
                                                                {selected && <Check size={9} />}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-[11px] font-medium text-gray-800 truncate">{r.item}</div>
                                                                <div className="text-[10px] text-gray-500 truncate">{r.label} · {r.dept}</div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                                {filteredOverrideRows.length > 60 && (
                                                    <div className="text-[10px] text-gray-400 px-2 py-1 text-center italic">
                                                        Mostrando 60 de {filteredOverrideRows.length} — refina la búsqueda
                                                    </div>
                                                )}
                                            </div>
                                            {/* Datos del override */}
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="col-span-2 flex items-center gap-1 text-[11px]">
                                                    <span className="text-gray-500">€ mes</span>
                                                    <input
                                                        type="number"
                                                        value={newOverride.amount}
                                                        onChange={e => setNewOverride(o => ({ ...o, amount: e.target.value }))}
                                                        placeholder="Ej. 12000"
                                                        className="flex-1 h-7 px-2 tabular-nums rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                    />
                                                </div>
                                                <div className="col-span-2 flex items-center gap-1 text-[11px]">
                                                    <span className="text-gray-500">De</span>
                                                    <select
                                                        value={newOverride.fromMonth}
                                                        onChange={e => {
                                                            const from = Number(e.target.value);
                                                            setNewOverride(o => ({ ...o, fromMonth: from, toMonth: Math.max(o.toMonth, from) }));
                                                        }}
                                                        className="h-7 px-1 rounded border border-gray-200 bg-white"
                                                    >
                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                            <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                        ))}
                                                    </select>
                                                    <span className="text-gray-500">a</span>
                                                    <select
                                                        value={newOverride.toMonth}
                                                        onChange={e => {
                                                            const to = Number(e.target.value);
                                                            setNewOverride(o => ({ ...o, toMonth: to, fromMonth: Math.min(o.fromMonth, to) }));
                                                        }}
                                                        className="h-7 px-1 rounded border border-gray-200 bg-white"
                                                    >
                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                            <option key={m} value={m}>{MONTHS_SHORT[m - 1]}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => {
                                                        const amt = Number(newOverride.amount) || 0;
                                                        if (!newOverride.item || !newOverride.section || !newOverride.dept) return;
                                                        addAmountOverride({
                                                            section: newOverride.section,
                                                            dept: newOverride.dept,
                                                            item: newOverride.item,
                                                            amount: amt,
                                                            fromMonth: newOverride.fromMonth,
                                                            toMonth: newOverride.toMonth,
                                                        });
                                                        setNewOverride(o => ({ ...o, item: '', section: '', dept: '', amount: '' }));
                                                        setOverrideSearch('');
                                                    }}
                                                    disabled={!newOverride.item || !newOverride.amount}
                                                    className="col-span-2 h-7 text-[11px] gap-1 bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
                                                >
                                                    <Plus size={11} /> Fijar monto
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-gray-500 italic">Se aplica solo a la fila seleccionada; el resto del forecast se mantiene igual.</p>
                                        </div>
                                    )}
                                </div>
                            )}
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
                    </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t bg-gray-50 px-5 py-3 flex items-center gap-2">
                    {canEdit && (
                        <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs">
                            <RotateCcw size={12} /> Limpiar
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button variant="outline" size="sm" onClick={dismiss} className="text-xs">{canEdit ? 'Cancelar' : 'Cerrar'}</Button>
                    {canEdit && (
                        <Button size="sm" onClick={handleApply} disabled={!isDirty} className="gap-1.5 text-xs">
                            <Check size={12} /> Aplicar
                        </Button>
                    )}
                </div>
            </aside>
        </>
    );
};
