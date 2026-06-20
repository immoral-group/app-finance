import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Download, MessageSquare, X, Check, Trash2, CheckCircle2, Plus, Pencil, FileSpreadsheet, FileText, Info, Sparkles, Save, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { useUrlState } from '@/hooks/useUrlState';
import { ChangeLogPanel } from '@/components/ui/ChangeLogPanel';
import { ForecastScenariosModal, NewFeatureBubble, resolveMultiplier, isScenarioEmpty, scenarioSummary, HUBS, type ForecastScenario, type SavedScenario } from './ForecastScenarios';

const TABS = ['Real', 'Presupuesto', 'Comparación', 'Forecast'] as const;
type TabType = typeof TABS[number];
type StructureGroup = { dept: string; items?: string[]; services?: string[] };

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Revenue structure matching the user's Excel exactly
const REVENUE_STRUCTURE = [
    { dept: 'Immedia', services: ['Paid General', 'Paid imfilms', 'Setup inicial'] },
    { dept: 'Imcontent', services: ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers', 'Diseño de Landing'] },
    { dept: 'Immoralia', services: ['Setup inicial IA', 'Automation', 'Consultoría'] },
    { dept: 'Imloyal', services: ['Web dev', 'CRM', 'Comisiones'] },
    { dept: 'Imseo', services: ['SEO', 'Comisiones'] },
    { dept: 'Immoral', services: ['Otros servicios', 'Otras comisiones'] },
    { dept: 'Imcontent', services: ['Budget Nutfruit'] },
    { dept: 'Imsales', services: ['Setup inicial (ims)'] },
    { dept: 'Imsales', services: ['Captación'] },
];

// Expense structure matching the images
const EXPENSE_STRUCTURE = {
    personalItems: [
        { dept: 'Immedia', items: ['Alba', 'Andrés', 'Leidy'] },
        { dept: 'Imcontent', items: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie'] },
        { dept: 'Immoralia', items: ['David', 'Manel', 'Julian'] },
        { dept: 'Immoral', items: ['Daniel', 'Mery', 'Yure', 'Marco', 'Externos puntuales'] },
        { dept: 'Immedia', items: ['Externos'] },
        { dept: 'Imcontent', items: ['Externos'] },
        { dept: 'Immoralia', items: ['Externos'] },
        { dept: 'Imsales', items: ['Jorge Orts'] },
        { dept: 'Imfilms', items: ['Olga Garasym'] },
    ],
    comisionesItems: [
        { dept: 'Imfilms', items: ['The connector'] },
        { dept: 'Imcontent', items: ['Marc'] },
        { dept: 'Imseo', items: ['Christian'] },
        { dept: 'Imfashion', items: ['Gemelos'] },
        { dept: 'Imsales', items: ['Jorge'] },
        { dept: 'Imfilms', items: ['Olga'] },
        { dept: 'Immoralia', items: ['David'] },
    ],
    marketingItems: [
        { dept: 'Imfilms', items: ['Marketing'] },
        { dept: 'Imcontent', items: ['Marketing'] },
        { dept: 'Immedia', items: ['Marketing'] },
        { dept: 'Immoralia', items: ['Marketing'] },
        { dept: 'Imsales', items: ['Marketing'] },
        { dept: 'Immoral', items: ['Marketing'] },
        { dept: 'Imfashion', items: ['Marketing'] },
    ],
    formacionItems: [
        { dept: 'Imcontent', items: ['Formación'] },
        { dept: 'Immedia', items: ['Formación'] },
        { dept: 'Immoralia', items: ['Formación'] },
        { dept: 'Imsales', items: ['Formación'] },
        { dept: 'Immoral', items: ['Formación'] },
        { dept: 'Imfashion', items: ['Formación'] },
    ],
    softwareItems: [
        { dept: 'Immoral', items: ['Software'] },
        { dept: 'Immedia', items: ['Software'] },
        { dept: 'Imcontent', items: ['Software'] },
        { dept: 'Immoralia', items: ['Software'] },
        { dept: 'Imsales', items: ['Software'] },
    ],
    gastosOpItems: [
        { dept: 'Immoral', items: ['Alquiler', 'Asesoría', 'Suministros', 'Viajes y reuniones', 'Coche de empresa', 'Otras compras', 'Financiamiento (Línea de crédito)'] },
    ],
    adspentItems: [
        { dept: 'Immedia', items: ['Adspent'] },
        { dept: 'Imcontent', items: ['Adspent Nutfruit', 'Influencers'] },
    ]
};

interface CellData {
    value: number;
    comment?: string;
    assigned_to?: string[];
}

// ─── Helper: parse API data into a flat key→value map ────────────────────────
// Uses section_key from expense rows to differentiate same-name items (e.g. David in personal vs comisiones)
// For legacy data without section_key, maps to all matching sections in EXPENSE_STRUCTURE
function parseMatrixData(matrixData: any, typeParam: 'real' | 'budget' | 'estimated'): Record<string, CellData> {
    const values: Record<string, CellData> = {};
    if (!matrixData?.sections) return values;

    // Build reverse mapping: "dept::item" → [section_key, section_key, ...]
    // This maps each expense item to the section(s) it appears in
    const expenseSectionMap: Record<string, string[]> = {};
    const sectionEntries: [string, string, { dept: string; items: string[] }[]][] = [
        ['personalItems', 'personal', EXPENSE_STRUCTURE.personalItems],
        ['comisionesItems', 'comisiones', EXPENSE_STRUCTURE.comisionesItems],
        ['marketingItems', 'marketing', EXPENSE_STRUCTURE.marketingItems],
        ['formacionItems', 'formacion', EXPENSE_STRUCTURE.formacionItems],
        ['softwareItems', 'software', EXPENSE_STRUCTURE.softwareItems],
        ['gastosOpItems', 'gastosOp', EXPENSE_STRUCTURE.gastosOpItems],
        ['adspentItems', 'adspent', EXPENSE_STRUCTURE.adspentItems],
    ];
    sectionEntries.forEach(([, sectionKey, deptItems]) => {
        deptItems.forEach(({ dept, items }) => {
            items.forEach(item => {
                const mapKey = `${dept}::${item}`;
                if (!expenseSectionMap[mapKey]) expenseSectionMap[mapKey] = [];
                if (!expenseSectionMap[mapKey].includes(sectionKey)) {
                    expenseSectionMap[mapKey].push(sectionKey);
                }
            });
        });
    });

    const setCellValue = (key: string, val: number, meta: any) => {
        values[key] = {
            value: val || 0,
            comment: meta.comment,
            assigned_to: meta.assigned_to
        };
    };

    // Process revenue rows
    const revenueSection = matrixData.sections.find((s: any) => s.code === 'REVENUE');
    if (revenueSection?.rows) {
        revenueSection.rows.forEach((row: any) => {
            if (row.values && Array.isArray(row.values)) {
                const dept = row.dept || 'General';
                row.values.forEach((val: number, monthIdx: number) => {
                    const key = `revenue-${dept}-${row.name}-${monthIdx}-${typeParam}`;
                    const meta = row.metadata?.[monthIdx] || {};
                    setCellValue(key, val, meta);
                });
            }
        });
    }

    // Process expense rows
    // IMPORTANT: Process legacy rows (no section_key) FIRST, then rows with explicit section_key SECOND.
    // This ensures explicit section_key records (from user saves) overwrite legacy mappings.
    const expenseSection = matrixData.sections.find((s: any) => s.code === 'EXPENSES');
    if (expenseSection?.rows) {
        const legacyRows = expenseSection.rows.filter((r: any) => !r.section_key);
        const sectionKeyRows = expenseSection.rows.filter((r: any) => !!r.section_key);

        // Process legacy rows first (they map to all matching sections)
        legacyRows.forEach((row: any) => {
            if (row.values && Array.isArray(row.values)) {
                const dept = row.dept || 'General';
                row.values.forEach((val: number, monthIdx: number) => {
                    const meta = row.metadata?.[monthIdx] || {};
                    const mapKey = `${dept}::${row.name}`;
                    const matchingSections = expenseSectionMap[mapKey];
                    if (matchingSections && matchingSections.length > 0) {
                        matchingSections.forEach(sectionKey => {
                            const key = `${sectionKey}-${dept}-${row.name}-${monthIdx}-${typeParam}`;
                            setCellValue(key, val, meta);
                        });
                    } else {
                        const key = `expense-${dept}-${row.name}-${monthIdx}-${typeParam}`;
                        setCellValue(key, val, meta);
                    }
                });
            }
        });

        // Process section_key rows second (they OVERRIDE legacy mappings)
        sectionKeyRows.forEach((row: any) => {
            if (row.values && Array.isArray(row.values)) {
                const dept = row.dept || 'General';
                row.values.forEach((val: number, monthIdx: number) => {
                    const meta = row.metadata?.[monthIdx] || {};
                    const key = `${row.section_key}-${dept}-${row.name}-${monthIdx}-${typeParam}`;
                    setCellValue(key, val, meta);
                });
            }
        });
    }

    return values;
}

// CommentModal — compartido con DepartmentPL
interface CommentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (val: string, assignedTo: string[]) => void;
    onStatusChange?: (status: 'done' | 'deleted') => void;
    initialValue: string;
    initialAssignedTo: string[];
    title: string;
    users: any[];
    noteId?: string; // Presente solo si la nota ya existe
}

export const CommentModal = ({ isOpen, onClose, onSave, onStatusChange, initialValue, initialAssignedTo, title, users, noteId }: CommentModalProps) => {
    const [value, setValue] = useState(initialValue);
    const [assigned, setAssigned] = useState<string[]>(initialAssignedTo || []);

    useEffect(() => {
        setValue(initialValue);
        setAssigned(initialAssignedTo || []);
    }, [initialValue, initialAssignedTo, isOpen]);

    const toggleUser = (userId: string) => {
        setAssigned(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-[450px] p-4 animate-in fade-in zoom-in duration-200 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg">{title}</h3>
                    <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Comentario</label>
                    <textarea
                        className="w-full h-24 p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Escriba una nota..."
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Asignar a:</label>
                    <div className="border rounded-md p-2 max-h-[150px] overflow-y-auto space-y-1">
                        {users.map(user => (
                            <div
                                key={user.id}
                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-gray-100 ${assigned.includes(user.id) ? 'bg-blue-50' : ''}`}
                                onClick={() => toggleUser(user.id)}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${assigned.includes(user.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                    {assigned.includes(user.id) && <Check className="h-3 w-3 text-white" />}
                                </div>
                                <span className="text-sm">{user.display_name || user.email}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Acciones de estado — solo si la nota ya existe */}
                {noteId && onStatusChange && (
                    <div className="flex gap-2 pt-1 border-t">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-green-700 border-green-300 hover:bg-green-50 gap-1.5"
                            onClick={() => { onStatusChange('done'); onClose(); }}
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            Realizado
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-red-700 border-red-300 hover:bg-red-50 gap-1.5"
                            onClick={() => { onStatusChange('deleted'); onClose(); }}
                        >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                        </Button>
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-1">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => onSave(value, assigned)}>Guardar</Button>
                </div>
            </div>
        </div>
    );
};

// ── Modal "Qué es Forecast" — compartido con DepartmentPL ─────────────────────
export const ForecastInfoModal = ({ onClose }: { onClose: () => void }) => {
    const [leaving, setLeaving] = useState(false);
    const dismiss = () => {
        setLeaving(true);
        setTimeout(onClose, 200);
    };
    return (
        <>
            <div
                className={`fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
                onClick={dismiss}
            />
            <div
                className={`fixed z-[202] left-1/2 top-1/2 w-full max-w-sm px-4 transition-all duration-200 ${leaving ? 'opacity-0 -translate-x-1/2 -translate-y-[46%]' : 'opacity-100 -translate-x-1/2 -translate-y-1/2'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                    <div
                        className="relative px-6 pt-8 pb-7 flex flex-col items-center text-center"
                        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)' }}
                    >
                        <button
                            onClick={dismiss}
                            className="absolute top-4 right-4 h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        >
                            <X size={14} className="text-white" />
                        </button>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-3">Forecast</span>
                        <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl mb-3 shadow-lg ring-1 ring-white/20">
                            🔮
                        </div>
                        <p className="text-base font-bold text-white leading-snug">¿Cómo cerraría el año si seguimos así?</p>
                        <p className="text-xs text-white/75 mt-1.5 leading-relaxed">Proyección del cierre asumiendo el mismo ritmo actual de facturación y gastos.</p>
                    </div>
                    <div className="bg-white px-6 py-5 space-y-3.5">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-sm">📈</span>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                <span className="font-semibold text-gray-900">Es un escenario hipotético</span>, no un presupuesto ni un objetivo. Muestra cómo cerraríamos el año si mantenemos el comportamiento actual.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-sm">⚖️</span>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                <span className="font-semibold text-gray-900">Si los gastos suben, la rentabilidad baja</span> en proporción. Sirve para anticipar el impacto antes de que pase.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 text-sm">✏️</span>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                <span className="font-semibold text-gray-900">Es editable e independiente del Presupuesto</span>. Ajusta los meses que aún no han pasado para simular distintos escenarios.
                            </p>
                        </div>
                        <button
                            onClick={dismiss}
                            className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

// ── Tour interactivo P&L Matrix — spotlight sobre las pestañas Presupuesto y Forecast ────
const PLMatrixTour = ({ onClose }: { onClose: () => void }) => {
    const [step, setStep] = useState(0); // 0 intro, 1 presupuesto, 2 forecast, 3 outro
    const [target, setTarget] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [leaving, setLeaving] = useState(false);

    const totalSteps = 4;

    const computeTarget = (selector: string) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const pad = 6;
        return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    };

    useEffect(() => {
        const update = () => {
            if (step === 1) setTarget(computeTarget('[data-tour-tab="Presupuesto"]'));
            else if (step === 2) setTarget(computeTarget('[data-tour-tab="Forecast"]'));
            else setTarget(null);
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [step]);

    const dismiss = () => {
        setLeaving(true);
        setTimeout(onClose, 220);
    };

    const next = () => {
        if (step < totalSteps - 1) setStep(step + 1);
        else dismiss();
    };
    const prev = () => { if (step > 0) setStep(step - 1); };

    // Backdrop: si hay target, usamos box-shadow para hacer el "agujero" del spotlight.
    // Si no, oscurecemos toda la pantalla.

    return (
        <>
            {/* Mesh animado de fondo */}
            <style>{`
                @keyframes pl-mesh { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,-15px) scale(1.05)} }
                @keyframes pl-mesh2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-25px,20px) scale(1.08)} }
                @keyframes pl-tour-in { from{opacity:0; transform: translate(-50%, calc(-50% + 16px))} to{opacity:1; transform: translate(-50%, -50%)} }
                @keyframes pl-tour-tt-in { from{opacity:0; transform: translateY(8px)} to{opacity:1; transform: translateY(0)} }
                @keyframes pl-arrow-bob { 0%,100%{transform: translateY(0)} 50%{transform: translateY(6px)} }
                @keyframes pl-stagger { from{opacity:0; transform: translateY(10px)} to{opacity:1; transform: translateY(0)} }
            `}</style>

            {/* Spotlight overlay */}
            {target ? (
                <div
                    className={`fixed z-[200] rounded-xl pointer-events-none transition-all duration-300 ease-out ${leaving ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                        left: target.x,
                        top: target.y,
                        width: target.w,
                        height: target.h,
                        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.78)',
                    }}
                />
            ) : (
                <div
                    className={`fixed inset-0 z-[200] transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
                    style={{ background: 'rgba(15, 23, 42, 0.78)' }}
                    onClick={dismiss}
                />
            )}

            {/* Mesh blobs decorativos detrás del modal centrado */}
            {step === 0 || step === 3 ? (
                <>
                    <div
                        className="fixed z-[200] pointer-events-none"
                        style={{
                            top: '20%', left: '15%', width: 320, height: 320,
                            background: 'radial-gradient(circle, rgba(99,102,241,0.6) 0%, transparent 60%)',
                            filter: 'blur(40px)',
                            animation: 'pl-mesh 8s ease-in-out infinite',
                        }}
                    />
                    <div
                        className="fixed z-[200] pointer-events-none"
                        style={{
                            bottom: '15%', right: '12%', width: 380, height: 380,
                            background: 'radial-gradient(circle, rgba(236,72,153,0.55) 0%, transparent 60%)',
                            filter: 'blur(45px)',
                            animation: 'pl-mesh2 10s ease-in-out infinite',
                        }}
                    />
                </>
            ) : null}

            {/* Step 0: Intro centrado */}
            {step === 0 && (
                <div
                    className="fixed z-[202] left-1/2 top-1/2 w-full max-w-2xl px-4"
                    style={{ animation: 'pl-tour-in 0.4s cubic-bezier(0.22, 1, 0.36, 1)', transform: 'translate(-50%, -50%)' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white">
                        <div
                            className="relative px-6 pt-7 pb-6 text-center"
                            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                        >
                            <button onClick={dismiss} className="absolute top-3 right-3 h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                                <X size={14} />
                            </button>
                            <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-widest uppercase text-white/80 bg-white/15 rounded-full px-2.5 py-0.5" style={{ animation: 'pl-stagger 0.4s 0.05s both' }}>
                                <Sparkles size={11} /> Tour rápido · 30 segundos
                            </div>
                            <h2 className="mt-3 text-2xl font-extrabold text-white" style={{ animation: 'pl-stagger 0.4s 0.15s both' }}>
                                2 pestañas que cambian cómo planificas
                            </h2>
                            <p className="text-xs text-white/85 mt-2 leading-relaxed max-w-md mx-auto" style={{ animation: 'pl-stagger 0.4s 0.25s both' }}>
                                Te muestro qué hace cada una. Las verás resaltadas arriba.
                            </p>
                        </div>
                        <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-3.5" style={{ animation: 'pl-stagger 0.5s 0.35s both' }}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center text-xl">🎯</span>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Presupuesto</div>
                                        <div className="text-sm font-extrabold text-gray-900">El objetivo</div>
                                    </div>
                                </div>
                                <p className="text-[11.5px] text-gray-600 leading-relaxed">
                                    Lo que <span className="font-semibold text-gray-900">queremos lograr</span>. Una meta definida.
                                </p>
                            </div>
                            <div className="rounded-xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-3.5" style={{ animation: 'pl-stagger 0.5s 0.5s both' }}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center text-xl">🔮</span>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Forecast</div>
                                        <div className="text-sm font-extrabold text-gray-900">La proyección</div>
                                    </div>
                                </div>
                                <p className="text-[11.5px] text-gray-600 leading-relaxed">
                                    Cómo <span className="font-semibold text-gray-900">cerraremos</span> si seguimos al ritmo actual.
                                </p>
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-between border-t border-gray-100">
                            <button onClick={dismiss} className="text-xs text-gray-500 hover:text-gray-800 font-medium">Saltar tour</button>
                            <button
                                onClick={next}
                                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all active:scale-95 shadow-md inline-flex items-center gap-1.5"
                                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                            >
                                Mostrarme <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 1 / 2: Tooltip cerca de la pestaña resaltada */}
            {(step === 1 || step === 2) && target && (
                <div
                    className="fixed z-[202] w-[300px]"
                    style={{
                        top: target.y + target.h + 14,
                        left: Math.max(8, Math.min(window.innerWidth - 308, target.x + target.w / 2 - 150)),
                        animation: 'pl-tour-tt-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                >
                    {/* Flecha hacia arriba bobbing */}
                    <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2"
                        style={{ animation: 'pl-arrow-bob 1.6s ease-in-out infinite' }}
                    >
                        <div className="w-3 h-3 rotate-45" style={{ background: step === 1 ? '#059669' : '#6366f1' }} />
                    </div>
                    <div
                        className="rounded-xl shadow-2xl ring-1 ring-white/20 overflow-hidden"
                        style={{ background: step === 1 ? 'linear-gradient(135deg, #059669 0%, #14b8a6 100%)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                    >
                        <div className="px-4 pt-3.5 pb-3 text-white">
                            <div className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest uppercase text-white/80 bg-white/15 rounded-full px-2 py-0.5 inline-flex mb-2">
                                Paso {step} de 2 · {step === 1 ? 'Presupuesto' : 'Forecast'}
                            </div>
                            <div className="text-sm font-bold leading-snug mb-1">
                                {step === 1 ? '🎯 Aquí planificas tu objetivo' : '🔮 Aquí proyectas el cierre real'}
                            </div>
                            <p className="text-[11.5px] text-white/90 leading-relaxed">
                                {step === 1
                                    ? 'Editas mes a mes lo que quieres facturar y gastar. Sirve para comparar contra el Real al final de año.'
                                    : 'Refleja a dónde te lleva tu ritmo actual. Editable y permite simular escenarios "¿qué pasaría si…?".'}
                            </p>
                        </div>
                        <div className="px-4 py-2 bg-black/15 flex items-center justify-between">
                            <button onClick={prev} className="text-[11px] text-white/70 hover:text-white font-medium inline-flex items-center gap-1">
                                <ChevronLeft size={12} /> Atrás
                            </button>
                            <div className="flex items-center gap-1">
                                {[0, 1, 2, 3].map(i => (
                                    <span
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
                                    />
                                ))}
                            </div>
                            <button onClick={next} className="text-[11px] text-white font-bold inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md">
                                {step === 2 ? 'Casi' : 'Siguiente'} <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Outro */}
            {step === 3 && (
                <div
                    className="fixed z-[202] left-1/2 top-1/2 w-full max-w-md px-4"
                    style={{ animation: 'pl-tour-in 0.4s cubic-bezier(0.22, 1, 0.36, 1)', transform: 'translate(-50%, -50%)' }}
                >
                    <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white">
                        <div
                            className="relative px-6 pt-6 pb-5 text-center"
                            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                        >
                            <div className="text-4xl mb-1.5" style={{ animation: 'pl-stagger 0.4s 0.05s both' }}>🚀</div>
                            <h2 className="text-lg font-extrabold text-white" style={{ animation: 'pl-stagger 0.4s 0.15s both' }}>¡Listo!</h2>
                            <p className="text-xs text-white/85 mt-1 max-w-xs mx-auto" style={{ animation: 'pl-stagger 0.4s 0.25s both' }}>
                                Cuando estés en Forecast o Presupuesto descubre también <span className="font-bold text-white">Escenarios</span> — simula qué pasaría si…
                            </p>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-between border-t border-gray-100">
                            <button onClick={prev} className="text-xs text-gray-500 hover:text-gray-800 font-medium inline-flex items-center gap-1">
                                <ChevronLeft size={12} /> Atrás
                            </button>
                            <button
                                onClick={dismiss}
                                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all active:scale-95 shadow-md"
                                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                            >
                                Empezar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const CellInput = ({
    initialValue,
    onSave,
}: {
    initialValue: number;
    onSave: (val: number) => void;
}) => {
    const [localValue, setLocalValue] = useState(initialValue ? String(initialValue) : '');
    const isFocused = useRef(false);

    useEffect(() => {
        if (!isFocused.current) {
            setLocalValue(initialValue ? String(initialValue) : '');
        }
    }, [initialValue]);

    return (
        <input
            type="text"
            inputMode="decimal"
            value={localValue}
            onFocus={(e) => {
                isFocused.current = true;
                e.target.select();
            }}
            onChange={(e) => {
                setLocalValue(e.target.value);
                e.target.dataset.dirty = '1';
            }}
            onBlur={(e) => {
                isFocused.current = false;
                if (e.target.dataset.dirty !== '1') return;
                const raw = e.target.value.trim();
                const numVal = Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
                onSave(numVal);
                e.target.dataset.dirty = '';
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-full h-full px-1 py-1 text-right text-xs bg-transparent border-0 focus:outline-none focus:bg-yellow-50"
            style={{ minWidth: '50px', MozAppearance: 'textfield' } as React.CSSProperties}
        />
    );
};

export default function PLMatrix() {
    const [year, setYear] = useUrlState('year', new Date().getFullYear(), (v) => Number(v));
    const [activeTab, setActiveTab] = useUrlState<TabType>('tab', 'Real');
    const [cellValues, setCellValues] = useState<Record<string, CellData>>({});
    const [forecastInfoOpen, setForecastInfoOpen] = useState(false);
    const [forecastInfoSeen, setForecastInfoSeen] = useState(() => localStorage.getItem('forecast_info_seen_v2') === '1');
    const [welcomeOpen, setWelcomeOpen] = useState(() => localStorage.getItem('pl_matrix_tour_v2_seen') !== '1');
    const [scenarioOpen, setScenarioOpen] = useState(false);
    // Escenario independiente por pestaña (Forecast / Presupuesto). Cada uno guarda su propia simulación.
    const [forecastScenario, setForecastScenario] = useState<ForecastScenario | null>(null);
    const [budgetScenario, setBudgetScenario] = useState<ForecastScenario | null>(null);
    // Si el escenario activo proviene de uno guardado, recordamos su id para ofrecer "Actualizar".
    const [forecastFromId, setForecastFromId] = useState<string | null>(null);
    const [budgetFromId, setBudgetFromId] = useState<string | null>(null);
    const activeScenario = activeTab === 'Forecast' ? forecastScenario : activeTab === 'Presupuesto' ? budgetScenario : null;
    const activeFromId = activeTab === 'Forecast' ? forecastFromId : activeTab === 'Presupuesto' ? budgetFromId : null;
    const setActiveScenario = (s: ForecastScenario | null, fromId?: string) => {
        if (activeTab === 'Forecast') {
            setForecastScenario(s);
            setForecastFromId(s ? (fromId || null) : null);
        } else if (activeTab === 'Presupuesto') {
            setBudgetScenario(s);
            setBudgetFromId(s ? (fromId || null) : null);
        }
    };
    // Popover de guardar (desde el chip)
    const [saveBoxOpen, setSaveBoxOpen] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveSharedDepts, setSaveSharedDepts] = useState<string[]>([]);
    const openSaveBox = () => {
        const fromSaved = activeFromId ? savedScenarios.find(s => s.id === activeFromId) : null;
        setSaveName(activeScenario?.name || fromSaved?.name || '');
        setSaveSharedDepts(fromSaved ? [...fromSaved.shared_with_depts] : []);
        setSaveBoxOpen(true);
    };
    const [scenarioBtnSeen, setScenarioBtnSeen] = useState(() => localStorage.getItem('forecast_scenarios_seen_v2') === '1');

    // scope para los escenarios — separa biblioteca Forecast y Presupuesto
    const scenarioScope: 'forecast' | 'budget' = activeTab === 'Presupuesto' ? 'budget' : 'forecast';

    // Biblioteca de escenarios (DB) — filtrada por scope
    const { data: scenariosData } = useQuery({
        queryKey: ['forecast-scenarios', scenarioScope],
        queryFn: () => adminApi.getForecastScenarios({ scope: scenarioScope }),
        staleTime: 30000,
        enabled: activeTab === 'Forecast' || activeTab === 'Presupuesto',
    });
    const savedScenarios: SavedScenario[] = scenariosData?.scenarios || [];
    const savedScenariosCount = savedScenarios.length;

    const saveScenarioMutation = useMutation({
        mutationFn: (payload: { name: string; scenario: ForecastScenario; shared_with_depts: string[] }) =>
            adminApi.saveForecastScenario({ ...payload, scope: scenarioScope }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] });
            toast.success(`Escenario "${vars.name}" guardado`);
        },
        onError: (err: any) => toast.error(err?.message || 'Error al guardar escenario'),
    });

    const updateScenarioMutation = useMutation({
        mutationFn: (vars: { id: string; patch: { name?: string; scenario?: ForecastScenario; shared_with_depts?: string[] } }) =>
            adminApi.updateForecastScenario(vars.id, vars.patch),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] });
            toast.success('Escenario actualizado');
        },
        onError: (err: any) => toast.error(err?.message || 'Error al actualizar escenario'),
    });

    const deleteScenarioMutation = useMutation({
        mutationFn: (id: string) => adminApi.deleteForecastScenario(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] });
            toast.success('Escenario eliminado');
        },
        onError: () => toast.error('Error al eliminar escenario'),
    });
    const openScenarioPanel = () => {
        setScenarioOpen(true);
        if (!scenarioBtnSeen) {
            localStorage.setItem('forecast_scenarios_seen_v2', '1');
            setScenarioBtnSeen(true);
        }
    };
    const openForecastInfo = () => {
        setForecastInfoOpen(true);
        if (!forecastInfoSeen) {
            localStorage.setItem('forecast_info_seen_v2', '1');
            setForecastInfoSeen(true);
        }
    };
    const queryClient = useQueryClient();

    // Context menu state (right-click → shows "Insertar Nota")
    const [contextMenu, setContextMenu] = useState<{
        x: number,
        y: number,
        section: string,
        dept: string,
        item: string,
        monthIdx: number,
        viewType: 'budget' | 'real' | 'comparison' | 'estimated'
    } | null>(null);

    const [editingComment, setEditingComment] = useState<{
        isOpen: boolean,
        section: string,
        dept: string,
        item: string,
        monthIdx: number,
        initialValue: string,
        initialAssignedTo: string[],
        saveType: 'budget' | 'real' | 'comparison' | 'estimated',
        noteId?: string
    } | null>(null);

    const [hoveredCell, setHoveredCell] = useState<{
        section: string,
        dept: string,
        item: string,
        monthIdx: number,
        viewType: 'real' | 'budget' | 'comparison' | 'estimated',
        x: number,
        y: number
    } | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const { data: usersData } = useQuery({
        queryKey: ['users'],
        queryFn: adminApi.getUsers
    });
    const users = usersData?.users || [];

    const typeParam: 'budget' | 'real' | 'estimated' =
        activeTab === 'Presupuesto' ? 'budget' :
        activeTab === 'Forecast' ? 'estimated' :
        'real';

    // ── Queries ──────────────────────────────────────────────────────────────
    const { data: matrixData, isLoading: _loadingMatrix } = useQuery({
        queryKey: ['pl-matrix', year, typeParam],
        queryFn: () => adminApi.getPLMatrix(year, typeParam),
        enabled: activeTab !== 'Comparación',
    });

    const { data: realData, isLoading: loadingReal } = useQuery({
        queryKey: ['pl-matrix', year, 'real'],
        queryFn: () => adminApi.getPLMatrix(year, 'real'),
        enabled: activeTab === 'Comparación',
    });

    const { data: budgetData, isLoading: loadingBudget } = useQuery({
        queryKey: ['pl-matrix', year, 'budget'],
        queryFn: () => adminApi.getPLMatrix(year, 'budget'),
        enabled: activeTab === 'Comparación',
    });

    // Custom rows query — filtered by year
    const { data: customRowsData } = useQuery({
        queryKey: ['pl-custom-rows', year],
        queryFn: () => adminApi.getCustomRows(year),
        staleTime: 60000,
    });
    const customRows = customRowsData?.rows || [];

    // Add custom row mutation
    const addRowMutation = useMutation({
        mutationFn: adminApi.addCustomRow,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-custom-rows'] });
            queryClient.invalidateQueries({ queryKey: ['pl-matrix'] });
            toast.success('Fila añadida correctamente');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Error al añadir fila');
        }
    });

    const deleteRowMutation = useMutation({
        mutationFn: adminApi.deleteCustomRow,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-custom-rows'] });
            queryClient.invalidateQueries({ queryKey: ['pl-matrix'] });
            toast.success('Fila eliminada');
        },
        onError: () => toast.error('Error al eliminar fila')
    });

    const renameRowMutation = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => adminApi.renameCustomRow(id, name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-custom-rows'] });
            queryClient.invalidateQueries({ queryKey: ['pl-matrix'] });
            toast.success('Fila renombrada');
        },
        onError: () => toast.error('Error al renombrar fila')
    });

    const handleAddRow = (blockType: 'revenue' | 'expense', sectionKey: string, dept: string) => {
        const name = prompt(`Nombre de la nueva fila en ${dept}:`);
        if (!name || !name.trim()) return;
        addRowMutation.mutate({ block_type: blockType, section_key: sectionKey, dept, item_name: name.trim(), fiscal_year: year });
    };

    // Helper: find custom row ID for a given (blockType, sectionKey, dept, itemName)
    const findCustomRowId = (blockType: string, sectionKey: string, dept: string, itemName: string) => {
        return customRows.find(r =>
            r.block_type === blockType && r.section_key === sectionKey && r.dept === dept && r.item_name === itemName
        )?.id;
    };

    const handleDeleteRow = (blockType: string, sectionKey: string, dept: string, itemName: string) => {
        const id = findCustomRowId(blockType, sectionKey, dept, itemName);
        if (!id) return;
        if (!confirm(`¿Eliminar la fila "${itemName}"?`)) return;
        deleteRowMutation.mutate(id);
    };

    const handleRenameRow = (blockType: string, sectionKey: string, dept: string, itemName: string) => {
        const id = findCustomRowId(blockType, sectionKey, dept, itemName);
        if (!id) return;
        const newName = prompt('Nuevo nombre:', itemName);
        if (!newName || !newName.trim() || newName.trim() === itemName) return;
        renameRowMutation.mutate({ id, name: newName.trim() });
    };

    // ── Merge custom rows into structures ─────────────────────────────────────
    const mergedExpenseStructure = useMemo(() => {
        const expCustom = customRows.filter(r => r.block_type === 'expense');
        const merged = { ...EXPENSE_STRUCTURE };

        // Deep clone each array
        const keys = Object.keys(merged) as (keyof typeof EXPENSE_STRUCTURE)[];
        keys.forEach(k => {
            merged[k] = merged[k].map(g => ({ ...g, items: [...g.items] }));
        });

        // Section key → structure key mapping
        const sectionToKey: Record<string, keyof typeof EXPENSE_STRUCTURE> = {
            personal: 'personalItems',
            comisiones: 'comisionesItems',
            marketing: 'marketingItems',
            formacion: 'formacionItems',
            software: 'softwareItems',
            gastosOp: 'gastosOpItems',
            adspent: 'adspentItems',
        };

        expCustom.forEach(cr => {
            const structKey = sectionToKey[cr.section_key];
            if (!structKey) return;
            const arr = merged[structKey];
            // Find existing dept group or create one
            let group = arr.find(g => g.dept === cr.dept);
            if (!group) {
                group = { dept: cr.dept, items: [] };
                arr.push(group);
            }
            if (!group.items.includes(cr.item_name)) {
                group.items.push(cr.item_name);
            }
        });

        return merged;
    }, [customRows]);

    const mergedRevenueStructure = useMemo(() => {
        const revCustom = customRows.filter(r => r.block_type === 'revenue');
        const merged = REVENUE_STRUCTURE.map(g => ({ ...g, services: [...g.services] }));

        revCustom.forEach(cr => {
            // Find a group matching the dept (use section_key as dept identifier for revenue)
            let group = merged.find(g => g.dept === cr.dept);
            if (!group) {
                group = { dept: cr.dept, services: [] };
                merged.push(group);
            }
            if (!group.services.includes(cr.item_name)) {
                group.services.push(cr.item_name);
            }
        });

        return merged;
    }, [customRows]);

    // Notes query — loads ALL notes for the year from pl_cell_notes table
    const { data: notesData } = useQuery({
        queryKey: ['pl-notes', year],
        queryFn: () => adminApi.getPLNotes(year),
        staleTime: 30000,
    });
    const cellNotes = notesData?.notes || {};

    // Helper: note key builder — works for all view_types
    const getNoteKey = (viewType: string, section: string, dept: string, item: string, monthIdx: number) =>
        `${viewType}-${section}-${dept}-${item}-${monthIdx}`;

    // getCellNote: returns note for any cell+viewType (PLMatrix uses 'real','budget','comparison')
    const getCellNote = (viewType: string, section: string, dept: string, item: string, monthIdx: number): {
        id?: string; comment: string; assigned_to: string[]; status?: string
    } | null =>
        cellNotes[getNoteKey(viewType, section, dept, item, monthIdx)] || null;

    // ── State Population ─────────────────────────────────────────────────────
    // Parse matrix data and merge into cellValues.
    // Uses string key to avoid re-parsing on background refetches while the user
    // is actively editing (prevents overwriting in-progress input).
    const prevMatrixRef = useRef<string | null>(null);

    useEffect(() => {
        if (!matrixData?.sections) return;
        const currentKey = JSON.stringify([year, typeParam]);
        if (prevMatrixRef.current === currentKey) return;
        prevMatrixRef.current = currentKey;
        const newValues = parseMatrixData(matrixData, typeParam);
        // Replace entirely when year or type changes to avoid stale values bleeding across years
        setCellValues(newValues);
    }, [matrixData, typeParam, year]);

    // Clear cellValues and cache when year changes to prevent stale data bleeding across years
    useEffect(() => {
        setCellValues({});
        prevMatrixRef.current = null;
        queryClient.removeQueries({ queryKey: ['pl-matrix', year] });
    }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

    // When switching tabs, clear the TARGET tab's cache and reset prevMatrixRef.
    // Without this, React Query returns stale cache immediately, prevMatrixRef
    // marks it as "seen", and the subsequent fresh network response is skipped —
    // causing saved values to disappear until the user leaves and re-enters.
    const handleTabChange = (tab: TabType) => {
        const targetType =
            tab === 'Presupuesto' ? 'budget' :
            tab === 'Forecast' ? 'estimated' :
            tab === 'Real' ? 'real' : null;
        if (targetType) {
            queryClient.removeQueries({ queryKey: ['pl-matrix', year, targetType] });
        }
        prevMatrixRef.current = null;
        setActiveTab(tab);
    };

    const realValues = realData ? parseMatrixData(realData, 'real') : {};
    const budgetValues = budgetData ? parseMatrixData(budgetData, 'budget') : {};

    // Populate cellValues from comparison data (so comments work in comparison tab)
    useEffect(() => {
        if (activeTab !== 'Comparación') return;
        const merged: Record<string, CellData> = {};
        Object.entries(realValues).forEach(([k, v]) => { merged[k] = v; });
        Object.entries(budgetValues).forEach(([k, v]) => { merged[k] = v; });
        if (Object.keys(merged).length > 0) {
            setCellValues(prev => ({ ...prev, ...merged }));
        }
    }, [activeTab, realData, budgetData]);

    // ── Mutations ────────────────────────────────────────────────────────────
    const saveMutation = useMutation({
        mutationFn: adminApi.savePLMatrixCell,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-matrix', year] });
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Error al guardar');
        }
    });

    // ── Helpers ──────────────────────────────────────────────────────────────
    // Keep the original section key (personal, comisiones, etc.) instead of
    // normalizing to 'expense' — this prevents key collisions between items
    // with the same name in different categories (e.g., David in personal vs comisiones)
    const getCellKey = (section: string, dept: string, item: string, monthIdx: number) => {
        return `${section}-${dept}-${item}-${monthIdx}-${typeParam}`;
    };

    const getCellValue = (section: string, dept: string, item: string, monthIdx: number): CellData => {
        const base = cellValues[getCellKey(section, dept, item, monthIdx)] || { value: 0 };
        const tabAllowsScenario = activeTab === 'Forecast' || activeTab === 'Presupuesto';
        if (!tabAllowsScenario || !activeScenario) return base;
        const mult = resolveMultiplier(activeScenario, section, dept, item, monthIdx);
        if (mult === 1) return base;
        return { ...base, value: Math.round(base.value * mult * 100) / 100 };
    };

    const getCompareValue = (
        valuesMap: Record<string, CellData>,
        type: 'real' | 'budget',
        section: string,
        dept: string,
        item: string,
        monthIdx: number
    ): number => {
        const key = `${section}-${dept}-${item}-${monthIdx}-${type}`;
        return valuesMap[key]?.value || 0;
    };

    const handleCellChange = (section: string, dept: string, item: string, monthIdx: number, value: string) => {
        const key = getCellKey(section, dept, item, monthIdx);
        setCellValues(prev => ({
            ...prev,
            [key]: { ...prev[key], value: Number(value) || 0 }
        }));
    };

    const noteSaveMutation = useMutation({
        mutationFn: adminApi.savePLNote,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-notes', year] });
            toast.success('Nota guardada');
        },
        onError: () => {
            toast.error('Error al guardar la nota');
        }
    });

    const noteStatusMutation = useMutation({
        mutationFn: adminApi.updatePLNoteStatus,
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['pl-notes', year] });
            toast.success(vars.status === 'done' ? 'Nota marcada como realizada' : 'Nota eliminada');
        },
        onError: () => {
            toast.error('Error al actualizar la nota');
        }
    });

    const handleSaveComment = (val: string, assignedTo: string[]) => {
        if (!editingComment) return;
        const { section, dept, item, monthIdx, saveType } = editingComment;
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        setEditingComment(null);
        // Save to dedicated pl_cell_notes table
        noteSaveMutation.mutate({
            year,
            view_type: saveType,
            section: normalizedSection,
            dept,
            item,
            month: monthIdx + 1,
            comment: val,
            assigned_to: assignedTo
        });
    };

    const handleContextMenu = (e: React.MouseEvent, section: string, dept: string, item: string, monthIdx: number, viewType?: 'budget' | 'real' | 'comparison' | 'estimated') => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            section, dept, item, monthIdx,
            viewType: viewType || (activeTab === 'Comparación' ? 'comparison' : typeParam)
        });
    };

    const openCommentModal = (section: string, dept: string, item: string, monthIdx: number, viewType: 'budget' | 'real' | 'comparison' | 'estimated') => {
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        const existingNote = getCellNote(viewType, normalizedSection, dept, item, monthIdx);
        setEditingComment({
            isOpen: true,
            section, dept, item, monthIdx,
            initialValue: existingNote?.comment || '',
            initialAssignedTo: existingNote?.assigned_to || [],
            saveType: viewType,
            noteId: existingNote?.id
        });
    };

    const handleMouseEnter = (e: React.MouseEvent, section: string, dept: string, item: string, monthIdx: number, viewType?: 'real' | 'budget' | 'comparison' | 'estimated') => {
        const effectiveType = viewType || (activeTab === 'Comparación' ? 'comparison' : typeParam);
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        const note = getCellNote(effectiveType, normalizedSection, dept, item, monthIdx);
        if (!note?.comment && (!note?.assigned_to || note.assigned_to.length === 0)) return;

        const rect = (e.target as HTMLElement).getBoundingClientRect();
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredCell({
                section, dept, item, monthIdx,
                viewType: effectiveType,
                x: rect.right + 10,
                y: rect.top
            });
        }, 500);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredCell(null);
    };

    const fmt = (val: number) => Math.round(val * 100) / 100;
    const fmtDisplay = (val: number) => val ? Math.round(val).toLocaleString('de-DE') : '0';

    const calculateRowTotal = (section: string, dept: string, item: string): number => {
        let total = 0;
        for (let i = 0; i < 12; i++) total += getCellValue(section, dept, item, i).value;
        return fmt(total);
    };

    const calculateSectionTotal = (section: string, structure: { dept: string; items?: string[]; services?: string[] }[]): number[] => {
        const totals = Array(12).fill(0);
        structure.forEach(group => {
            const items = group.items || group.services || [];
            items.forEach(item => {
                for (let i = 0; i < 12; i++) totals[i] += getCellValue(section, group.dept, item, i).value;
            });
        });
        return totals.map(t => fmt(t));
    };

    const calcCompareSectionTotal = (
        valuesMap: Record<string, CellData>,
        type: 'real' | 'budget',
        section: string,
        structure: StructureGroup[]
    ): number[] => {
        const totals = Array(12).fill(0);
        structure.forEach(group => {
            const items = group.items || group.services || [];
            items.forEach(item => {
                for (let i = 0; i < 12; i++) {
                    totals[i] += getCompareValue(valuesMap, type, section, group.dept, item, i);
                }
            });
        });
        return totals.map(t => fmt(t));
    };

    // ── Values Calculation ─────────────────────────────────────────────────────
    const ingresosTotals = calculateSectionTotal('revenue', mergedRevenueStructure);
    const ingresosAnual = ingresosTotals.reduce((a, b) => a + b, 0);

    // Calculate each expense category subtotal for Gastos de Explotación row
    const EXPENSE_KEYS_LIST = ['personal', 'comisiones', 'marketing', 'formacion', 'software', 'adspent', 'gastosOp'] as const;
    const expenseCategoryTotals: Record<string, number[]> = {};
    EXPENSE_KEYS_LIST.forEach(key => {
        const items = mergedExpenseStructure[`${key}Items` as keyof typeof EXPENSE_STRUCTURE];
        expenseCategoryTotals[key] = calculateSectionTotal(key, items);
    });

    const gastosTotals = Array(12).fill(0);
    EXPENSE_KEYS_LIST.forEach(key => {
        expenseCategoryTotals[key].forEach((v, i) => gastosTotals[i] += v);
    });
    const gastosAnual = gastosTotals.reduce((a, b) => a + b, 0);

    const ebitdaTotals = ingresosTotals.map((v, i) => v - gastosTotals[i]);
    const ebitdaAnual = ingresosAnual - gastosAnual;

    // Comparison Calculations
    const calcAllExpenses = (valuesMap: Record<string, CellData>, type: 'real' | 'budget') => {
        const totals = Array(12).fill(0);
        ['personal', 'comisiones', 'marketing', 'formacion', 'software', 'adspent', 'gastosOp'].forEach(key => {
            const items = mergedExpenseStructure[`${key}Items` as keyof typeof EXPENSE_STRUCTURE];
            items.forEach((group: any) => {
                const its = group.items || group.services || [];
                its.forEach((item: string) => {
                    for (let i = 0; i < 12; i++) {
                        totals[i] += getCompareValue(valuesMap, type, key, group.dept, item, i);
                    }
                });
            });
        });
        return totals.map(t => fmt(t));
    };

    const realRevTotals = calcCompareSectionTotal(realValues, 'real', 'revenue', mergedRevenueStructure);
    const budgetRevTotals = calcCompareSectionTotal(budgetValues, 'budget', 'revenue', mergedRevenueStructure);
    const realExpTotals = calcAllExpenses(realValues, 'real');
    const budgetExpTotals = calcAllExpenses(budgetValues, 'budget');
    const realEbitda = realRevTotals.map((v, i) => fmt(v - realExpTotals[i]));
    const budgetEbitda = budgetRevTotals.map((v, i) => fmt(v - budgetExpTotals[i]));

    // Alerts
    const EXPENSE_KEYS = ['personal', 'comisiones', 'marketing', 'formacion', 'software', 'adspent', 'gastosOp'] as const;
    const EXPENSE_LABELS: Record<string, string> = {
        personal: 'Personal', comisiones: 'Comisiones', marketing: 'Marketing',
        formacion: 'Formación', software: 'Software', adspent: 'Adspent', gastosOp: 'Gastos Op.',
    };
    const [selectedAlertMonth, setSelectedAlertMonth] = useState(new Date().getMonth());
    const alertMonthIdx = selectedAlertMonth;

    const revRealMonth = realRevTotals[alertMonthIdx] || 0;
    const revBudgetMonth = budgetRevTotals[alertMonthIdx] || 0;
    const revDiffMonth = fmt(revRealMonth - revBudgetMonth);
    const revRealAnnual = realRevTotals.reduce((a, b) => a + b, 0);
    const revBudgetAnnual = budgetRevTotals.reduce((a, b) => a + b, 0);
    const revDiffAnnual = fmt(revRealAnnual - revBudgetAnnual);

    const calcExpenseSubCat = (valuesMap: Record<string, CellData>, type: 'real' | 'budget', key: string) => {
        const items = mergedExpenseStructure[`${key}Items` as keyof typeof EXPENSE_STRUCTURE];
        return calcCompareSectionTotal(valuesMap, type, key, items as StructureGroup[]);
    };

    const expenseAlerts = EXPENSE_KEYS.map(key => {
        const rT = calcExpenseSubCat(realValues, 'real', key);
        const bT = calcExpenseSubCat(budgetValues, 'budget', key);
        return {
            label: EXPENSE_LABELS[key],
            diffM: fmt((rT[alertMonthIdx] || 0) - (bT[alertMonthIdx] || 0)),
            diffA: fmt(rT.reduce((a, b) => a + b, 0) - bT.reduce((a, b) => a + b, 0)),
        };
    });
    const overBudgetMonth = expenseAlerts.filter(e => e.diffM > 0);
    const overBudgetAnnual = expenseAlerts.filter(e => e.diffA > 0);

    const isLoadingComparison = loadingReal || loadingBudget;

    const isPastYear = year < new Date().getFullYear();

    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    // ── Export helpers ───────────────────────────────────────────────────────
    type ExportRow = { label: string; values: number[]; isHeader?: boolean; isTotal?: boolean; isEbitda?: boolean };

    const buildExportRows = (): ExportRow[] => {
        const rows: ExportRow[] = [];

        // INGRESOS
        rows.push({ label: 'INGRESOS', values: Array(12).fill(0), isHeader: true });
        mergedRevenueStructure.forEach((group: any) => {
            (group.services || []).forEach((item: string) => {
                const vals = Array.from({ length: 12 }, (_, i) => getCellValue('revenue', group.dept, item, i).value);
                rows.push({ label: `  ${group.dept} · ${item}`, values: vals });
            });
        });
        rows.push({ label: 'TOTAL INGRESOS', values: ingresosTotals, isTotal: true });

        // GASTOS — cada categoría con su subtotal
        const expSections: [string, any[], string][] = [
            ['Personal', mergedExpenseStructure.personalItems, 'personal'],
            ['Comisiones', mergedExpenseStructure.comisionesItems, 'comisiones'],
            ['Marketing', mergedExpenseStructure.marketingItems, 'marketing'],
            ['Formación', mergedExpenseStructure.formacionItems, 'formacion'],
            ['Software', mergedExpenseStructure.softwareItems, 'software'],
            ['Gastos Operativos', mergedExpenseStructure.gastosOpItems, 'gastosOp'],
            ['Ad Spend', mergedExpenseStructure.adspentItems, 'adspent'],
        ];
        expSections.forEach(([title, struct, key]) => {
            rows.push({ label: title, values: Array(12).fill(0), isHeader: true });
            (struct as any[]).forEach((group: any) => {
                (group.items || []).forEach((item: string) => {
                    const vals = Array.from({ length: 12 }, (_, i) => getCellValue(key, group.dept, item, i).value);
                    rows.push({ label: `  ${group.dept} · ${item}`, values: vals });
                });
            });
            rows.push({ label: `Total ${title}`, values: expenseCategoryTotals[key] || Array(12).fill(0), isTotal: true });
        });

        // TOTAL GASTOS
        rows.push({ label: 'TOTAL GASTOS', values: gastosTotals, isTotal: true });

        // EBITDA
        rows.push({ label: 'EBITDA', values: ebitdaTotals, isEbitda: true });

        return rows;
    };

    const handleExportCSV = () => {
        const exportRows = buildExportRows();
        const BOM = '﻿';
        const headers = ['Concepto', ...MONTHS_FULL, 'TOTAL ANUAL'];
        const lines = exportRows.map(r => {
            const total = r.values.reduce((a, b) => a + b, 0);
            const cells = [r.label, ...r.values.map(v => String(v)), String(total)];
            return cells.map(c => (c.includes(';') || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(';');
        });
        const csv = BOM + [headers.join(';'), ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `PL_Matrix_${activeTab}_${year}.csv`;
        a.click(); URL.revokeObjectURL(url);
        setExportMenuOpen(false);
    };

    const handleExportPDF = () => {
        const exportRows = buildExportRows();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        doc.setFontSize(11);
        doc.text(`P&L Matrix — ${activeTab} ${year}`, 14, 13);
        const head = [['Concepto', ...MONTHS, 'TOTAL']];
        const body = exportRows.map(r => {
            const total = r.values.reduce((a, b) => a + b, 0);
            return [r.label, ...r.values.map(v => v ? v.toLocaleString('es-ES') : '-'), total ? total.toLocaleString('es-ES') : '-'];
        });
        autoTable(doc, {
            head, body, startY: 18,
            styles: { fontSize: 5, cellPadding: 1 },
            headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 5 },
            columnStyles: { 0: { cellWidth: 42 } },
            didParseCell: (data) => {
                if (data.section !== 'body') return;
                const row = exportRows[data.row.index];
                if (row?.isHeader) {
                    data.cell.styles.fillColor = [226, 232, 240];
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [30, 41, 59];
                } else if (row?.isTotal) {
                    data.cell.styles.fillColor = [241, 245, 249];
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [15, 23, 42];
                } else if (row?.isEbitda) {
                    data.cell.styles.fillColor = [30, 41, 59];
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [255, 255, 255];
                }
            }
        });
        doc.save(`PL_Matrix_${activeTab}_${year}.pdf`);
        setExportMenuOpen(false);
    };

    // ── Render Helpers ───────────────────────────────────────────────────────
    const renderEditableCell = (section: string, dept: string, item: string, monthIdx: number) => {
        const cell = getCellValue(section, dept, item, monthIdx);
        const normalizedNoteSection = section === 'revenue' ? 'revenue' : 'expense';
        const note = getCellNote(typeParam, normalizedNoteSection, dept, item, monthIdx);
        const hasNote = !!note?.comment || (note?.assigned_to && note.assigned_to.length > 0);
        const saveSection = section === 'revenue' ? 'revenue' : 'expense';
        const sectionKeyForSave = section === 'revenue' ? undefined : section;
        const currentVal = cell.value;
        const scenarioActive = (activeTab === 'Forecast' || activeTab === 'Presupuesto') && !!activeScenario && !isScenarioEmpty(activeScenario);

        if (scenarioActive) {
            const mult = resolveMultiplier(activeScenario, section, dept, item, monthIdx);
            const baseVal = (cellValues[getCellKey(section, dept, item, monthIdx)] || { value: 0 }).value;
            const tinted = mult !== 1 && baseVal !== 0;
            const deltaPct = Math.round((mult - 1) * 100);
            const isUp = deltaPct > 0;
            return (
                <td
                    key={monthIdx}
                    className={`border border-gray-200 px-1 py-1 text-right text-xs relative ${tinted ? (isUp ? 'bg-emerald-100/80 text-emerald-900' : 'bg-rose-100/80 text-rose-900') : ''}`}
                    title={tinted ? `Base: ${baseVal ? Math.round(baseVal).toLocaleString('de-DE') : '0'} · Escenario: ${currentVal ? Math.round(currentVal).toLocaleString('de-DE') : '0'} (${isUp ? '+' : ''}${deltaPct}%)` : undefined}
                >
                    <div className="font-semibold tabular-nums">{currentVal ? fmtDisplay(currentVal) : <span className="text-gray-300">0</span>}</div>
                    {tinted && (
                        <>
                            <div className="text-[9px] line-through opacity-60 tabular-nums">{baseVal ? Math.round(baseVal).toLocaleString('de-DE') : '0'}</div>
                            <div className={`text-[9px] font-bold ${isUp ? 'text-emerald-700' : 'text-rose-700'}`}>{isUp ? '+' : ''}{deltaPct}%</div>
                        </>
                    )}
                    {hasNote && (
                        <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-red-500 border-l-transparent pointer-events-none" />
                    )}
                </td>
            );
        }

        return (
            <td
                key={monthIdx}
                className="border border-gray-200 p-0 relative"
                onContextMenu={(e) => handleContextMenu(e, section, dept, item, monthIdx)}
                onMouseEnter={(e) => handleMouseEnter(e, section, dept, item, monthIdx)}
                onMouseLeave={handleMouseLeave}
            >
                <CellInput
                    initialValue={currentVal}
                    onSave={(numVal) => {
                        handleCellChange(section, dept, item, monthIdx, String(numVal));
                        saveMutation.mutate({
                            year,
                            month: monthIdx + 1,
                            dept,
                            item,
                            section: saveSection,
                            section_key: sectionKeyForSave,
                            value: numVal,
                            type: typeParam,
                        });
                    }}
                />
                {hasNote && (
                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-red-500 border-l-transparent pointer-events-none" />
                )}
            </td>
        );
    };

    const renderRevenueRows = () => {
        const rows: React.ReactNode[] = [];
        // Budget tab: always editable. Real tab: only editable for past years (manual entry)
        const scenarioActive = (activeTab === 'Forecast' || activeTab === 'Presupuesto') && !!activeScenario && !isScenarioEmpty(activeScenario);
        const isRevenueEditable = !scenarioActive && (activeTab === 'Presupuesto' || activeTab === 'Forecast' || (activeTab === 'Real' && isPastYear));
        mergedRevenueStructure.forEach((group, groupIdx) => {
            group.services.forEach((service, serviceIdx) => {
                rows.push(
                    <tr key={`rev-${groupIdx}-${serviceIdx}`} className="hover:bg-gray-50">
                        {serviceIdx === 0 ? (
                            <td
                                rowSpan={group.services.length}
                                className="border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 align-middle text-center relative group/dept"
                            >
                                {group.dept}
                                <button
                                    onClick={() => handleAddRow('revenue', group.dept, group.dept)}
                                    className="absolute bottom-0 right-0 p-0.5 opacity-0 group-hover/dept:opacity-100 transition-opacity bg-purple-500 text-white rounded-tl hover:bg-purple-600"
                                    title="Añadir fila"
                                >
                                    <Plus className="h-3 w-3" />
                                </button>
                            </td>
                        ) : null}
                        <td className="border border-gray-200 px-2 py-1 text-xs text-gray-900">
                            <div className="flex items-center justify-between group/item">
                                <span>{service}</span>
                                {findCustomRowId('revenue', group.dept, group.dept, service) && (
                                    <span className="flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button onClick={() => handleRenameRow('revenue', group.dept, group.dept, service)} className="p-0.5 hover:text-blue-600" title="Renombrar"><Pencil className="h-3 w-3" /></button>
                                        <button onClick={() => handleDeleteRow('revenue', group.dept, group.dept, service)} className="p-0.5 hover:text-red-600" title="Eliminar"><Trash2 className="h-3 w-3" /></button>
                                    </span>
                                )}
                            </div>
                        </td>
                        {isRevenueEditable
                            ? MONTHS_FULL.map((_, monthIdx) => renderEditableCell('revenue', group.dept, service, monthIdx))
                            : MONTHS_FULL.map((_, monthIdx) => {
                                const val = getCellValue('revenue', group.dept, service, monthIdx).value;
                                return (
                                    <td key={monthIdx} className="border border-gray-200 px-1 py-1 text-right text-xs">
                                        {val ? fmtDisplay(val) : <span className="text-gray-300">0</span>}
                                    </td>
                                );
                            })}
                        <td className="border border-gray-200 px-1 py-1 text-right text-xs font-medium bg-gray-50">
                            {fmtDisplay(calculateRowTotal('revenue', group.dept, service))}
                        </td>
                    </tr>
                );
            });
        });
        return rows;
    };

    const renderExpenseCategory = (
        categoryName: string,
        items: { dept: string; items: string[] }[],
        sectionKey: string,
        bgColor: string = 'bg-orange-50'
    ) => {
        const rows: React.ReactNode[] = [];
        const categoryTotals = calculateSectionTotal(sectionKey, items);
        const categoryAnnual = categoryTotals.reduce((a, b) => a + b, 0);

        rows.push(
            <tr key={`cat-${sectionKey}`} className={bgColor}>
                <td className="border border-orange-200 px-2 py-1.5 text-xs font-semibold text-orange-800"></td>
                <td className="border border-orange-200 px-2 py-1.5 text-xs font-semibold text-orange-800">{categoryName}</td>
                {categoryTotals.map((val, i) => (
                    <td key={i} className="border border-orange-200 px-1 py-1.5 text-right text-xs font-medium text-orange-700">{fmtDisplay(val)}</td>
                ))}
                <td className="border border-orange-200 px-1 py-1.5 text-right text-xs font-semibold text-orange-800">{fmtDisplay(categoryAnnual)}</td>
            </tr>
        );

        items.forEach((group, groupIdx) => {
            group.items.forEach((item, itemIdx) => {
                rows.push(
                    <tr key={`${sectionKey}-${groupIdx}-${itemIdx}`} className="hover:bg-gray-50">
                        {itemIdx === 0 ? (
                            <td
                                rowSpan={group.items.length}
                                className="border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 align-middle text-center relative group/dept"
                            >
                                {group.dept}
                                <button
                                    onClick={() => handleAddRow('expense', sectionKey, group.dept)}
                                    className="absolute bottom-0 right-0 p-0.5 opacity-0 group-hover/dept:opacity-100 transition-opacity bg-orange-500 text-white rounded-tl hover:bg-orange-600"
                                    title="Añadir fila"
                                >
                                    <Plus className="h-3 w-3" />
                                </button>
                            </td>
                        ) : null}
                        <td className="border border-gray-200 px-2 py-1 text-xs text-gray-900">
                            <div className="flex items-center justify-between group/item">
                                <span>{item}</span>
                                {findCustomRowId('expense', sectionKey, group.dept, item) && (
                                    <span className="flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button onClick={() => handleRenameRow('expense', sectionKey, group.dept, item)} className="p-0.5 hover:text-blue-600" title="Renombrar"><Pencil className="h-3 w-3" /></button>
                                        <button onClick={() => handleDeleteRow('expense', sectionKey, group.dept, item)} className="p-0.5 hover:text-red-600" title="Eliminar"><Trash2 className="h-3 w-3" /></button>
                                    </span>
                                )}
                            </div>
                        </td>
                        {MONTHS_FULL.map((_, monthIdx) => renderEditableCell(sectionKey, group.dept, item, monthIdx))}
                        <td className="border border-gray-200 px-1 py-1 text-right text-xs font-medium bg-gray-50">
                            {fmtDisplay(calculateRowTotal(sectionKey, group.dept, item))}
                        </td>
                    </tr>
                );
            });
        });

        rows.push(
            <tr key={`spacer-${sectionKey}`}>
                <td colSpan={15} className="border border-gray-100 py-1 bg-white"></td>
            </tr>
        );
        return rows;
    };

    const renderComparisonSection = (
        label: string,
        sectionKey: string,
        structure: StructureGroup[],
        headerColor: string,
        rowBgColor: string
    ) => {
        const rows: React.ReactNode[] = [];
        const isExpense = sectionKey !== 'revenue';

        const diffColor = (diff: number) => {
            if (isExpense) return diff <= 0 ? 'text-green-700' : 'text-red-600';
            return diff >= 0 ? 'text-green-700' : 'text-red-600';
        };

        const realTotals = calcCompareSectionTotal(realValues, 'real', sectionKey, structure);
        const budgetTotals = calcCompareSectionTotal(budgetValues, 'budget', sectionKey, structure);
        const realAnnual = realTotals.reduce((a, b) => a + b, 0);
        const budgetAnnual = budgetTotals.reduce((a, b) => a + b, 0);
        const diffAnnual = fmt(realAnnual - budgetAnnual);
        const pctAnnual = budgetAnnual !== 0 ? fmt(((realAnnual - budgetAnnual) / Math.abs(budgetAnnual)) * 100) : null;

        rows.push(
            <tr key={`cmp-hdr-${sectionKey}`} className={headerColor}>
                <td colSpan={2} className="border border-gray-300 px-2 py-1.5 font-bold text-xs">{label}</td>
                {MONTHS.map((_, i) => {
                    const r = realTotals[i];
                    const b = budgetTotals[i];
                    const diff = fmt(r - b);
                    const pct = b !== 0 ? fmt(((r - b) / Math.abs(b)) * 100) : null;
                    return (
                        <td key={i} className="border border-gray-300 px-1 py-1.5 text-right text-xs font-semibold">
                            <div className="text-blue-900 font-bold">{r || 0}</div>
                            <div className="text-gray-500 font-normal">{b || 0}</div>
                            <div className={diffColor(diff)}>
                                {diff >= 0 ? '+' : ''}{diff}
                                {pct !== null && <span className="ml-1 text-[10px]">({pct >= 0 ? '+' : ''}{pct}%)</span>}
                            </div>
                        </td>
                    );
                })}
                <td className="border border-gray-300 px-1 py-1.5 text-right text-xs font-bold">
                    <div className="text-blue-900">{fmt(realAnnual)}</div>
                    <div className="text-gray-500 font-normal">{fmt(budgetAnnual)}</div>
                    <div className={diffColor(diffAnnual)}>
                        {diffAnnual >= 0 ? '+' : ''}{diffAnnual}
                        {pctAnnual !== null && <span className="ml-1 text-[10px]">({pctAnnual >= 0 ? '+' : ''}{pctAnnual}%)</span>}
                    </div>
                </td>
            </tr>
        );

        structure.forEach((group, groupIdx) => {
            const items = group.items || group.services || [];
            items.forEach((item, itemIdx) => {
                rows.push(
                    <tr key={`cmp-${sectionKey}-${groupIdx}-${itemIdx}`} className={`hover:bg-gray-50 ${rowBgColor}`}>
                        {itemIdx === 0 ? (
                            <td rowSpan={items.length} className="border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-50 align-middle text-center">
                                {group.dept}
                            </td>
                        ) : null}
                        <td className="border border-gray-200 px-2 py-1 text-xs text-gray-800">{item}</td>
                        {MONTHS.map((_, monthIdx) => {
                            const r = getCompareValue(realValues, 'real', sectionKey, group.dept, item, monthIdx);
                            const b = getCompareValue(budgetValues, 'budget', sectionKey, group.dept, item, monthIdx);
                            const diff = fmt(r - b);
                            const pct = b !== 0 ? fmt(((r - b) / Math.abs(b)) * 100) : null;
                            return (
                                <td key={monthIdx} className="border border-gray-200 px-1 py-0.5 text-right text-xs relative"
                                    onContextMenu={(e) => handleContextMenu(e, sectionKey, group.dept, item, monthIdx, 'comparison')}
                                    onMouseEnter={(e) => handleMouseEnter(e, sectionKey, group.dept, item, monthIdx, 'comparison')}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    {(() => {
                                        const noteC = getCellNote('comparison', sectionKey === 'revenue' ? 'revenue' : 'expense', group.dept, item, monthIdx);
                                        const hasNote = !!(noteC?.comment || (noteC?.assigned_to && noteC.assigned_to.length > 0));
                                        return hasNote ? <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-red-500 border-l-transparent pointer-events-none" /> : null;
                                    })()}
                                    <div className="text-blue-900 font-semibold">{r || 0}</div>
                                    <div className="text-gray-400">{b || 0}</div>
                                    {(r !== 0 || b !== 0) && (
                                        <div className={diffColor(diff)}>
                                            {diff >= 0 ? '+' : ''}{diff}
                                            {pct !== null && <span className="text-[9px] ml-0.5">({pct >= 0 ? '+' : ''}{pct}%)</span>}
                                        </div>
                                    )}
                                </td>
                            );
                        })}
                        {(() => {
                            const rAnn = Array.from({ length: 12 }, (_, i) => getCompareValue(realValues, 'real', sectionKey, group.dept, item, i)).reduce((a, b) => a + b, 0);
                            const bAnn = Array.from({ length: 12 }, (_, i) => getCompareValue(budgetValues, 'budget', sectionKey, group.dept, item, i)).reduce((a, b) => a + b, 0);
                            const dAnn = fmt(rAnn - bAnn);
                            const pAnn = bAnn !== 0 ? fmt(((rAnn - bAnn) / Math.abs(bAnn)) * 100) : null;
                            return (
                                <td className="border border-gray-200 px-1 py-0.5 text-right text-xs font-medium bg-gray-50">
                                    <div className="text-blue-900 font-semibold">{fmt(rAnn)}</div>
                                    <div className="text-gray-400">{fmt(bAnn)}</div>
                                    {(rAnn !== 0 || bAnn !== 0) && (
                                        <div className={diffColor(dAnn)}>
                                            {dAnn >= 0 ? '+' : ''}{dAnn}
                                            {pAnn !== null && <span className="text-[9px] ml-0.5">({pAnn >= 0 ? '+' : ''}{pAnn}%)</span>}
                                        </div>
                                    )}
                                </td>
                            );
                        })()}
                    </tr>
                );
            });
        });

        rows.push(
            <tr key={`cmp-spacer-${sectionKey}`}>
                <td colSpan={15} className="border border-gray-100 py-1 bg-white"></td>
            </tr>
        );
        return rows;
    };

    return (
        <div className="space-y-4 -mx-6 -mt-6">
            <div className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {activeTab === 'Real' ? 'P&L REAL' : activeTab === 'Presupuesto' ? 'PRESUPUESTO' : activeTab === 'Forecast' ? 'FORECAST' : 'COMPARACIÓN REAL vs PRESUPUESTO'} {year}
                        {activeTab === 'Forecast' && (
                            <span className="relative inline-flex items-center">
                                {!forecastInfoSeen && (
                                    <span className="absolute -inset-1 rounded-full bg-indigo-400/40 animate-ping pointer-events-none" />
                                )}
                                <button
                                    onClick={openForecastInfo}
                                    title="Qué es Forecast"
                                    className="relative inline-flex items-center justify-center h-6 w-6 rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors bg-white"
                                >
                                    <Info size={15} />
                                </button>
                                {!forecastInfoSeen && (
                                    <NewFeatureBubble
                                        title="Qué es Forecast"
                                        description="Lee cómo se proyecta el cierre de año"
                                        onDismiss={() => { localStorage.setItem('forecast_info_seen_v2', '1'); setForecastInfoSeen(true); }}
                                        align="start"
                                    />
                                )}
                            </span>
                        )}
                        {(activeTab === 'Forecast' || activeTab === 'Presupuesto') && activeScenario && !isScenarioEmpty(activeScenario) && (
                            <span className="relative inline-flex items-center">
                                <span
                                    className="ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow"
                                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                                    title={scenarioSummary(activeScenario)}
                                >
                                    <Sparkles size={11} />
                                    <span>{activeScenario.name || 'Escenario'}</span>
                                    <span className="opacity-80 font-normal max-w-[260px] truncate">· {scenarioSummary(activeScenario)}</span>
                                    <button
                                        onClick={openSaveBox}
                                        className="ml-1 h-4 w-4 rounded-full bg-white/20 hover:bg-white/35 inline-flex items-center justify-center"
                                        title={activeFromId ? 'Actualizar o guardar como nuevo' : 'Guardar este escenario'}
                                    >
                                        <Save size={10} />
                                    </button>
                                    <button
                                        onClick={() => setActiveScenario(null)}
                                        className="h-4 w-4 rounded-full bg-white/20 hover:bg-white/35 inline-flex items-center justify-center"
                                        title="Volver a la vista base"
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                                {saveBoxOpen && (() => {
                                    const allDepts = [...HUBS];
                                    const fromSaved = activeFromId ? savedScenarios.find(s => s.id === activeFromId) : null;
                                    const doSave = (asNew: boolean) => {
                                        const finalName = saveName.trim() || activeScenario.name.trim() || 'Sin nombre';
                                        const finalScenario = { ...activeScenario, name: finalName };
                                        if (fromSaved && !asNew) {
                                            updateScenarioMutation.mutate({
                                                id: fromSaved.id,
                                                patch: { name: finalName, scenario: finalScenario, shared_with_depts: saveSharedDepts },
                                            });
                                            setActiveScenario(finalScenario, fromSaved.id);
                                        } else {
                                            saveScenarioMutation.mutate(
                                                { name: finalName, scenario: finalScenario, shared_with_depts: saveSharedDepts },
                                                {
                                                    onSuccess: (data: any) => {
                                                        if (data?.scenario?.id) setActiveScenario(finalScenario, data.scenario.id);
                                                    },
                                                }
                                            );
                                        }
                                        setSaveBoxOpen(false);
                                    };
                                    return (
                                        <>
                                            <div className="fixed inset-0 z-[150]" onClick={() => setSaveBoxOpen(false)} />
                                            <div className="absolute top-full left-0 mt-2 z-[151] w-[340px] bg-white rounded-lg shadow-2xl ring-1 ring-black/5 p-3 space-y-3">
                                                <div className="text-xs font-bold text-gray-800">
                                                    {fromSaved ? `Guardar cambios en "${fromSaved.name}"` : 'Guardar escenario'}
                                                </div>
                                                <input
                                                    autoFocus
                                                    value={saveName}
                                                    onChange={e => setSaveName(e.target.value)}
                                                    placeholder="Nombre del escenario..."
                                                    className="w-full h-8 px-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                />
                                                {allDepts.length > 0 && (
                                                    <div>
                                                        <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1">
                                                            <Users size={11} /> Compartir con Hubs (opcional)
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {allDepts.map(d => {
                                                                const active = saveSharedDepts.includes(d);
                                                                return (
                                                                    <button
                                                                        key={d}
                                                                        onClick={() => setSaveSharedDepts(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                                                                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'}`}
                                                                    >
                                                                        {d}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex justify-end gap-1.5 pt-1">
                                                    <Button variant="outline" size="sm" onClick={() => setSaveBoxOpen(false)} className="text-xs">Cancelar</Button>
                                                    {fromSaved && (
                                                        <Button variant="outline" size="sm" onClick={() => doSave(true)} className="text-xs">Guardar como nuevo</Button>
                                                    )}
                                                    <Button size="sm" onClick={() => doSave(false)} className="gap-1 text-xs">
                                                        <Save size={11} /> {fromSaved ? 'Actualizar' : 'Guardar'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </span>
                        )}
                    </h1>
                    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                        {TABS.map(tab => (
                            <Button key={tab} data-tour-tab={tab} variant={activeTab === tab ? 'default' : 'ghost'} size="sm" onClick={() => handleTabChange(tab)} className="text-xs h-7 px-3">{tab}</Button>
                        ))}
                    </div>
                    {activeTab === 'Comparación' && (
                        <div className="flex items-center gap-3 text-xs text-gray-500 ml-2">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-gray-800 rounded-sm"></span> Real</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-gray-400 rounded-sm"></span> Presupuesto</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-green-500 rounded-sm"></span> Diferencia</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setYear(year - 1)}>← {year - 1}</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setYear(year + 1)}>{year + 1} →</Button>
                    {(activeTab === 'Forecast' || activeTab === 'Presupuesto') && (
                        <div className="relative inline-flex items-center">
                            {!scenarioBtnSeen && (
                                <span className="absolute -inset-1 rounded-lg bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-cyan-500 opacity-60 blur-md animate-pulse pointer-events-none" />
                            )}
                            <Button
                                size="sm"
                                onClick={openScenarioPanel}
                                className="relative gap-1 h-7 text-xs text-white border-0 shadow-md"
                                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                            >
                                <Sparkles size={12} /> Escenarios
                                {savedScenariosCount > 0 && (
                                    <span
                                        className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-white text-indigo-700 text-[10px] font-bold shadow-sm"
                                        title={`${savedScenariosCount} escenario${savedScenariosCount > 1 ? 's' : ''} guardado${savedScenariosCount > 1 ? 's' : ''}`}
                                    >
                                        {savedScenariosCount}
                                    </span>
                                )}
                            </Button>
                            {!scenarioBtnSeen && (
                                <NewFeatureBubble
                                    title="Simula escenarios"
                                    description="Qué pasa si suben los gastos o baja la facturación"
                                    onDismiss={() => { localStorage.setItem('forecast_scenarios_seen_v2', '1'); setScenarioBtnSeen(true); }}
                                    align="end"
                                />
                            )}
                        </div>
                    )}
                    <div className="relative ml-2">
                        <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => setExportMenuOpen(o => !o)}>
                            <Download size={12} /> Exportar
                        </Button>
                        {exportMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                                <div className="absolute right-0 mt-1 z-50 bg-white border rounded-lg shadow-lg w-44 py-1 animate-in fade-in zoom-in duration-150">
                                    <button onClick={handleExportCSV} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors">
                                        <FileSpreadsheet size={15} className="text-green-600" /> Excel (.csv)
                                    </button>
                                    <button onClick={handleExportPDF} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors">
                                        <FileText size={15} className="text-red-500" /> PDF
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Forecast — info */}
            {forecastInfoOpen && (
                <ForecastInfoModal onClose={() => setForecastInfoOpen(false)} />
            )}

            {/* Tour P&L Matrix — primera visita */}
            {welcomeOpen && (
                <PLMatrixTour onClose={() => {
                    localStorage.setItem('pl_matrix_tour_v2_seen', '1');
                    setWelcomeOpen(false);
                }} />
            )}

            {/* Panel Escenarios */}
            {scenarioOpen && (() => {
                const revenueDepts = Array.from(new Set(mergedRevenueStructure.map(g => g.dept)));
                const expenseDepts = Array.from(new Set(
                    Object.values(mergedExpenseStructure).flatMap((arr: any[]) => arr.map(g => g.dept))
                ));
                // Flatten estructuras a items para drill-down
                const revenueItems = mergedRevenueStructure.flatMap(g => g.services.map(s => ({ dept: g.dept, name: s })));
                const sectionKeyMap: Record<string, string> = {
                    personalItems: 'personal', comisionesItems: 'comisiones', marketingItems: 'marketing',
                    formacionItems: 'formacion', softwareItems: 'software', gastosOpItems: 'gastosOp', adspentItems: 'adspent',
                };
                const expenseItems = Object.entries(mergedExpenseStructure).flatMap(([k, groups]: [string, any]) =>
                    (groups as any[]).flatMap(g => g.items.map((i: string) => ({ section: sectionKeyMap[k] || k, dept: g.dept, name: i })))
                );
                const targetLabel: 'Forecast' | 'Presupuesto' = activeTab === 'Presupuesto' ? 'Presupuesto' : 'Forecast';
                return (
                    <ForecastScenariosModal
                        initial={activeScenario}
                        revenueDepts={revenueDepts}
                        expenseDepts={expenseDepts}
                        revenueItems={revenueItems}
                        expenseItems={expenseItems}
                        targetLabel={targetLabel}
                        savedList={savedScenarios}
                        canEdit={true}
                        shareableDepts={[...HUBS]}
                        onApply={(s, fromId) => setActiveScenario(isScenarioEmpty(s) ? null : s, fromId)}
                        onUpdate={(id, patch) => updateScenarioMutation.mutate({ id, patch })}
                        onDelete={(id, name) => {
                            if (!confirm(`¿Eliminar "${name}"?`)) return;
                            deleteScenarioMutation.mutate(id);
                        }}
                        onClose={() => setScenarioOpen(false)}
                    />
                );
            })()}

            {/* Context Menu (right-click) */}
            {contextMenu && (
                <div className="fixed z-[100] bg-white border rounded shadow-lg py-1 w-44" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div className="px-3 py-1 bg-slate-100 text-xs font-bold border-b mb-1 truncate">
                        {contextMenu.dept} - {contextMenu.item}
                    </div>
                    <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 flex items-center gap-2"
                        onClick={() => {
                            openCommentModal(contextMenu.section, contextMenu.dept, contextMenu.item, contextMenu.monthIdx, contextMenu.viewType);
                            setContextMenu(null);
                        }}
                    >
                        <MessageSquare className="h-4 w-4" />
                        {(() => {
                            const normalizedSection = contextMenu.section === 'revenue' ? 'revenue' : 'expense';
                            const existingNote = getCellNote(contextMenu.viewType, normalizedSection, contextMenu.dept, contextMenu.item, contextMenu.monthIdx);
                            return (existingNote?.comment || (existingNote?.assigned_to && existingNote.assigned_to.length > 0)) ? 'Editar Nota' : 'Insertar Nota';
                        })()}
                    </button>
                </div>
            )}

            {/* Popover */}
            {hoveredCell && (() => {
                const normalizedSection = hoveredCell.section === 'revenue' ? 'revenue' : 'expense';
                const note = getCellNote(
                    hoveredCell.viewType,
                    normalizedSection,
                    hoveredCell.dept,
                    hoveredCell.item,
                    hoveredCell.monthIdx
                );
                if (!note?.comment && (!note?.assigned_to || note.assigned_to.length === 0)) return null;
                const assignedUsers = users.filter((u: any) => note?.assigned_to?.includes(u.id));

                return (
                    <div
                        className="fixed z-[100] bg-white border rounded-lg shadow-xl p-3 w-[250px] animate-in fade-in zoom-in duration-200"
                        style={{ top: hoveredCell.y, left: hoveredCell.x }}
                    >
                        {note?.comment && <div className="text-sm text-gray-800 mb-2 whitespace-pre-wrap">{note.comment}</div>}

                        {assignedUsers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2 border-t pt-2">
                                <span className="text-xs text-gray-500 w-full mb-1">Asignado a:</span>
                                {assignedUsers.map((u: any) => (
                                    <div key={u.id} className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
                                        <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white font-bold">
                                            {(u.display_name || u.email).substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="text-[10px] text-blue-700 truncate max-w-[80px]">{u.display_name || u.email}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Comment Modal */}
            {editingComment && (
                <CommentModal
                    isOpen={editingComment.isOpen}
                    onClose={() => setEditingComment(null)}
                    onSave={handleSaveComment}
                    onStatusChange={(status) => {
                        if (editingComment?.noteId) {
                            noteStatusMutation.mutate({ id: editingComment.noteId, status });
                        }
                        setEditingComment(null);
                    }}
                    initialValue={editingComment.initialValue}
                    initialAssignedTo={editingComment.initialAssignedTo}
                    title="Nota de P&L"
                    users={users}
                    noteId={editingComment.noteId}
                />
            )}

            {activeTab === 'Comparación' && (
                <div className="space-y-3 px-2">
                    {isLoadingComparison ? (
                        <div className="flex items-center justify-center py-20 text-gray-500">Cargando datos...</div>
                    ) : (
                        <>
                            {/* Alerts Panel */}
                            <div className="grid grid-cols-2 gap-3">
                                {/* Current Month */}
                                <div className="bg-white border rounded-xl p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-sm text-gray-700">📅 Resumen Mensual</h3>
                                        <select
                                            value={selectedAlertMonth}
                                            onChange={(e) => setSelectedAlertMonth(Number(e.target.value))}
                                            className="text-xs border rounded-md px-2 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        >
                                            {MONTHS_FULL.map((m, i) => (
                                                <option key={i} value={i}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={`flex items-center justify-between rounded-lg px-3 py-2 mb-2 ${revDiffMonth >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-700">Facturación</p>
                                            <p className="text-xs text-gray-500">Real: <span className="text-blue-900 font-bold">{Math.round(revRealMonth).toLocaleString('es-ES')}</span> · Meta: {Math.round(revBudgetMonth).toLocaleString('es-ES')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-bold ${revDiffMonth >= 0 ? 'text-green-700' : 'text-red-600'}`}>{revDiffMonth >= 0 ? '✓ Meta alcanzada' : '✗ Bajo meta'}</p>
                                            <p className={`text-xs ${revDiffMonth >= 0 ? 'text-green-600' : 'text-red-500'}`}>{revDiffMonth >= 0 ? '+' : ''}{Math.round(revDiffMonth).toLocaleString('es-ES')}</p>
                                        </div>
                                    </div>
                                    {overBudgetMonth.length === 0 ? (
                                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 font-medium">✓ Todos los gastos dentro del presupuesto</div>
                                    ) : (
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold text-red-700 mb-1">⚠ Gastos sobre presupuesto:</p>
                                            {overBudgetMonth.map(e => (
                                                <div key={e.label} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                                                    <span className="text-xs font-medium text-gray-700">{e.label}</span>
                                                    <span className="text-xs font-bold text-red-600">+{Math.round(e.diffM).toLocaleString('es-ES')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Annual */}
                                <div className="bg-white border rounded-xl p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-sm text-gray-700">📊 {year} — Resumen Anual</h3><span className="text-xs text-gray-400">Acumulado</span></div>
                                    <div className={`flex items-center justify-between rounded-lg px-3 py-2 mb-2 ${revDiffAnnual >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-700">Facturación</p>
                                            <p className="text-xs text-gray-500">Real: <span className="text-blue-900 font-bold">{Math.round(revRealAnnual).toLocaleString('es-ES')}</span> · Meta: {Math.round(revBudgetAnnual).toLocaleString('es-ES')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-bold ${revDiffAnnual >= 0 ? 'text-green-700' : 'text-red-600'}`}>{revDiffAnnual >= 0 ? '✓ Meta alcanzada' : '✗ Bajo meta'}</p>
                                            <p className={`text-xs ${revDiffAnnual >= 0 ? 'text-green-600' : 'text-red-500'}`}>{revDiffAnnual >= 0 ? '+' : ''}{Math.round(revDiffAnnual).toLocaleString('es-ES')}</p>
                                        </div>
                                    </div>
                                    {overBudgetAnnual.length === 0 ? (
                                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 font-medium">✓ Todos los gastos dentro del presupuesto anual</div>
                                    ) : (
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold text-red-700 mb-1">⚠ Gastos sobre presupuesto anual:</p>
                                            {overBudgetAnnual.map(e => (
                                                <div key={e.label} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                                                    <span className="text-xs font-medium text-gray-700">{e.label}</span>
                                                    <span className="text-xs font-bold text-red-600">+{Math.round(e.diffA).toLocaleString('es-ES')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-xs" style={{ minWidth: '1200px' }}>
                                    <thead>
                                        <tr className="bg-white">
                                            <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '100px' }}></th>
                                            <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '160px' }}></th>
                                            {MONTHS.map((month, i) => <th key={i} className="border border-gray-300 px-1 py-2 text-center font-medium text-xs" style={{ width: '80px', minWidth: '80px' }}>{month}</th>)}
                                            <th className="border border-gray-300 px-1 py-2 text-center font-semibold text-xs bg-gray-100" style={{ width: '90px', minWidth: '90px' }}>Anual</th>
                                        </tr>
                                        <tr className="bg-gray-50 text-[10px] text-gray-500">
                                            <td colSpan={2} className="border border-gray-200 px-2 py-1">Departamento / Concepto</td>
                                            {MONTHS.map((_, i) => <td key={i} className="border border-gray-200 px-1 py-1 text-right"><div>Real</div><div>Presup.</div><div>Dif.</div></td>)}
                                            <td className="border border-gray-200 px-1 py-1 text-right"><div>Real</div><div>Presup.</div><div>Dif.</div></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {renderComparisonSection('INGRESOS DE EXPLOTACIÓN', 'revenue', mergedRevenueStructure, 'bg-purple-100 text-purple-900', '')}
                                        {/* Gastos de Explotación summary row in Comparison */}
                                        {(() => {
                                            const realGastosTotals = calcAllExpenses(realValues, 'real');
                                            const budgetGastosTotals = calcAllExpenses(budgetValues, 'budget');
                                            const realGastosAnnual = realGastosTotals.reduce((a, b) => a + b, 0);
                                            const budgetGastosAnnual = budgetGastosTotals.reduce((a, b) => a + b, 0);
                                            const diffAnnual = fmt(realGastosAnnual - budgetGastosAnnual);
                                            const pctAnnual = budgetGastosAnnual !== 0 ? fmt(((realGastosAnnual - budgetGastosAnnual) / Math.abs(budgetGastosAnnual)) * 100) : null;
                                            const diffColor = (d: number) => d <= 0 ? 'text-green-700' : 'text-red-600';
                                            return (
                                                <tr className="bg-red-100 text-red-900">
                                                    <td colSpan={2} className="border border-red-300 px-2 py-1.5 font-bold text-xs">GASTOS DE EXPLOTACIÓN</td>
                                                    {MONTHS.map((_, i) => {
                                                        const r = realGastosTotals[i];
                                                        const b = budgetGastosTotals[i];
                                                        const diff = fmt(r - b);
                                                        const pct = b !== 0 ? fmt(((r - b) / Math.abs(b)) * 100) : null;
                                                        return (
                                                            <td key={i} className="border border-red-300 px-1 py-1.5 text-right text-xs font-semibold">
                                                                <div className="text-red-900 font-bold">{fmtDisplay(r)}</div>
                                                                <div className="text-red-400 font-normal">{fmtDisplay(b)}</div>
                                                                <div className={diffColor(diff)}>
                                                                    {diff >= 0 ? '+' : ''}{fmtDisplay(diff)}
                                                                    {pct !== null && <span className="ml-1 text-[10px]">({pct >= 0 ? '+' : ''}{pct}%)</span>}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="border border-red-300 px-1 py-1.5 text-right text-xs font-bold">
                                                        <div className="text-red-900">{fmtDisplay(realGastosAnnual)}</div>
                                                        <div className="text-red-400 font-normal">{fmtDisplay(budgetGastosAnnual)}</div>
                                                        <div className={diffColor(diffAnnual)}>
                                                            {diffAnnual >= 0 ? '+' : ''}{fmtDisplay(diffAnnual)}
                                                            {pctAnnual !== null && <span className="ml-1 text-[10px]">({pctAnnual >= 0 ? '+' : ''}{pctAnnual}%)</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                        {renderComparisonSection('Gastos de personal', 'personal', mergedExpenseStructure.personalItems, 'bg-orange-100 text-orange-900', '')}
                                        {renderComparisonSection('Comisiones', 'comisiones', mergedExpenseStructure.comisionesItems, 'bg-orange-50 text-orange-800', '')}
                                        {renderComparisonSection('Marketing', 'marketing', mergedExpenseStructure.marketingItems, 'bg-orange-50 text-orange-800', '')}
                                        {renderComparisonSection('Formación', 'formacion', mergedExpenseStructure.formacionItems, 'bg-orange-50 text-orange-800', '')}
                                        {renderComparisonSection('Software', 'software', mergedExpenseStructure.softwareItems, 'bg-orange-50 text-orange-800', '')}
                                        {renderComparisonSection('Adspent', 'adspent', mergedExpenseStructure.adspentItems, 'bg-orange-50 text-orange-800', '')}
                                        {renderComparisonSection('Gastos Operativos', 'gastosOp', mergedExpenseStructure.gastosOpItems, 'bg-orange-50 text-orange-800', '')}
                                        <tr className="bg-blue-100">
                                            <td colSpan={2} className="border border-blue-300 px-2 py-2 font-bold text-blue-900 text-sm">EBITDA</td>
                                            {realEbitda.map((r, i) => {
                                                const b = budgetEbitda[i];
                                                const diff = fmt(r - b);
                                                const pct = b !== 0 ? fmt(((r - b) / Math.abs(b)) * 100) : null;
                                                return (
                                                    <td key={i} className="border border-blue-300 px-1 py-2 text-right font-bold text-blue-800">
                                                        <div>{r}</div><div className="text-blue-400 font-normal">{b}</div>
                                                        <div className={diff >= 0 ? 'text-green-700' : 'text-red-600'}>{diff >= 0 ? '+' : ''}{diff}{pct !== null && <span className="text-[10px] ml-1">({pct >= 0 ? '+' : ''}{pct}%)</span>}</div>
                                                    </td>
                                                );
                                            })}
                                            {(() => {
                                                const rAnn = fmt(realEbitda.reduce((a, b) => a + b, 0));
                                                const bAnn = fmt(budgetEbitda.reduce((a, b) => a + b, 0));
                                                const dAnn = fmt(rAnn - bAnn);
                                                const pAnn = bAnn !== 0 ? fmt(((rAnn - bAnn) / Math.abs(bAnn)) * 100) : null;
                                                return (
                                                    <td className="border border-blue-300 px-1 py-2 text-right font-bold text-blue-900 text-sm">
                                                        <div>{rAnn}</div><div className="text-blue-400 font-normal">{bAnn}</div>
                                                        <div className={dAnn >= 0 ? 'text-green-700' : 'text-red-600'}>{dAnn >= 0 ? '+' : ''}{dAnn}{pAnn !== null && <span className="text-[10px] ml-1">({pAnn >= 0 ? '+' : ''}{pAnn}%)</span>}</div>
                                                    </td>
                                                );
                                            })()}
                                        </tr>
                                        {/* Ingresos financieros */}
                                        <tr className="bg-green-50">
                                            <td colSpan={2} className="border border-green-300 px-2 py-1.5 font-semibold text-green-900 text-xs">Ingresos financieros</td>
                                            {realRevTotals.map((r, i) => {
                                                const b = budgetRevTotals[i];
                                                return (
                                                    <td key={i} className="border border-green-200 px-1 py-1.5 text-right text-xs">
                                                        <div className="text-green-900 font-semibold">{fmtDisplay(r)}</div>
                                                        <div className="text-green-400">{fmtDisplay(b)}</div>
                                                    </td>
                                                );
                                            })}
                                            <td className="border border-green-200 px-1 py-1.5 text-right text-xs font-bold">
                                                <div className="text-green-900">{fmtDisplay(realRevTotals.reduce((a, b) => a + b, 0))}</div>
                                                <div className="text-green-400">{fmtDisplay(budgetRevTotals.reduce((a, b) => a + b, 0))}</div>
                                            </td>
                                        </tr>
                                        {/* Gastos financieros */}
                                        {(() => {
                                            const realGT = calcAllExpenses(realValues, 'real');
                                            const budgetGT = calcAllExpenses(budgetValues, 'budget');
                                            return (
                                                <tr className="bg-red-50">
                                                    <td colSpan={2} className="border border-red-200 px-2 py-1.5 font-semibold text-red-900 text-xs">Gastos financieros</td>
                                                    {realGT.map((r, i) => (
                                                        <td key={i} className="border border-red-200 px-1 py-1.5 text-right text-xs">
                                                            <div className="text-red-900 font-semibold">{fmtDisplay(r)}</div>
                                                            <div className="text-red-400">{fmtDisplay(budgetGT[i])}</div>
                                                        </td>
                                                    ))}
                                                    <td className="border border-red-200 px-1 py-1.5 text-right text-xs font-bold">
                                                        <div className="text-red-900">{fmtDisplay(realGT.reduce((a, b) => a + b, 0))}</div>
                                                        <div className="text-red-400">{fmtDisplay(budgetGT.reduce((a, b) => a + b, 0))}</div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                        {/* EBITDA % */}
                                        <tr className="bg-indigo-50">
                                            <td colSpan={2} className="border border-indigo-300 px-2 py-1.5 font-semibold text-indigo-900 text-xs">EBITDA %</td>
                                            {realEbitda.map((r, i) => {
                                                const revR = realRevTotals[i] || 0;
                                                const revB = budgetRevTotals[i] || 0;
                                                const pctR = revR !== 0 ? Math.round((r / revR) * 100) : 0;
                                                const pctB = revB !== 0 ? Math.round((budgetEbitda[i] / revB) * 100) : 0;
                                                return (
                                                    <td key={i} className="border border-indigo-200 px-1 py-1.5 text-right text-xs">
                                                        <div className={`font-semibold ${pctR >= 0 ? 'text-indigo-900' : 'text-red-600'}`}>{pctR}%</div>
                                                        <div className="text-indigo-400">{pctB}%</div>
                                                    </td>
                                                );
                                            })}
                                            {(() => {
                                                const rRevAnn = realRevTotals.reduce((a, b) => a + b, 0);
                                                const bRevAnn = budgetRevTotals.reduce((a, b) => a + b, 0);
                                                const rEbAnn = realEbitda.reduce((a, b) => a + b, 0);
                                                const bEbAnn = budgetEbitda.reduce((a, b) => a + b, 0);
                                                const pctR = rRevAnn !== 0 ? Math.round((rEbAnn / rRevAnn) * 100) : 0;
                                                const pctB = bRevAnn !== 0 ? Math.round((bEbAnn / bRevAnn) * 100) : 0;
                                                return (
                                                    <td className="border border-indigo-200 px-1 py-1.5 text-right text-xs font-bold">
                                                        <div className={pctR >= 0 ? 'text-indigo-900' : 'text-red-600'}>{pctR}%</div>
                                                        <div className="text-indigo-400">{pctB}%</div>
                                                    </td>
                                                );
                                            })()}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab !== 'Comparación' && (
                <div className="overflow-x-auto px-2">
                    <table className="w-full border-collapse text-xs" style={{ minWidth: '1200px' }}>
                        <thead>
                            <tr className="bg-white">
                                <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '100px' }}></th>
                                <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '160px' }}></th>
                                {MONTHS_FULL.map((month, i) => <th key={i} className="border border-gray-300 px-1 py-2 text-center font-medium text-xs" style={{ width: '70px', minWidth: '70px' }}>{month}</th>)}
                                <th className="border border-gray-300 px-1 py-2 text-center font-semibold text-xs bg-gray-100" style={{ width: '80px', minWidth: '80px' }}>Anual</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="bg-purple-100">
                                <td colSpan={2} className="border border-purple-300 px-2 py-1.5 font-bold text-purple-900 text-xs">INGRESOS DE EXPLOTACIÓN</td>
                                {ingresosTotals.map((val, i) => <td key={i} className="border border-purple-300 px-1 py-1.5 text-right font-semibold text-purple-800">{fmtDisplay(val)}</td>)}
                                <td className="border border-purple-300 px-1 py-1.5 text-right font-bold text-purple-900">{fmtDisplay(ingresosAnual)}</td>
                            </tr>
                            {renderRevenueRows()}
                            {/* Gastos de Explotación — sum of all expense category subtotals */}
                            <tr className="bg-red-100">
                                <td colSpan={2} className="border border-red-300 px-2 py-1.5 font-bold text-red-900 text-xs">GASTOS DE EXPLOTACIÓN</td>
                                {gastosTotals.map((val, i) => <td key={i} className="border border-red-300 px-1 py-1.5 text-right font-semibold text-red-800">{fmtDisplay(val)}</td>)}
                                <td className="border border-red-300 px-1 py-1.5 text-right font-bold text-red-900">{fmtDisplay(gastosAnual)}</td>
                            </tr>
                            {renderExpenseCategory('Gastos de personal', mergedExpenseStructure.personalItems, 'personal', 'bg-orange-100 text-orange-900')}
                            {renderExpenseCategory('Comisiones', mergedExpenseStructure.comisionesItems, 'comisiones')}
                            {renderExpenseCategory('Marketing', mergedExpenseStructure.marketingItems, 'marketing')}
                            {renderExpenseCategory('Formación', mergedExpenseStructure.formacionItems, 'formacion')}
                            {renderExpenseCategory('Software', mergedExpenseStructure.softwareItems, 'software')}
                            {renderExpenseCategory('Adspent', mergedExpenseStructure.adspentItems, 'adspent')}
                            {renderExpenseCategory('Gastos Operativos', mergedExpenseStructure.gastosOpItems, 'gastosOp')}
                            <tr className="bg-blue-100 sticky bottom-0 z-10 shadow-sm">
                                <td colSpan={2} className="border border-blue-300 px-2 py-2 font-bold text-blue-900 text-sm">EBITDA</td>
                                {ebitdaTotals.map((val, i) => <td key={i} className={`border border-blue-300 px-1 py-2 text-right font-bold text-sm ${val >= 0 ? 'text-blue-900' : 'text-red-600'}`}>{fmtDisplay(val)}</td>)}
                                <td className={`border border-blue-300 px-1 py-2 text-right font-bold text-sm ${ebitdaAnual >= 0 ? 'text-blue-900' : 'text-red-600'}`}>{fmtDisplay(ebitdaAnual)}</td>
                            </tr>
                            {/* Ingresos financieros */}
                            <tr className="bg-green-50">
                                <td colSpan={2} className="border border-green-300 px-2 py-1.5 font-semibold text-green-900 text-xs">Ingresos financieros</td>
                                {ingresosTotals.map((val, i) => <td key={i} className="border border-green-200 px-1 py-1.5 text-right text-xs font-semibold text-green-800">{fmtDisplay(val)}</td>)}
                                <td className="border border-green-200 px-1 py-1.5 text-right text-xs font-bold text-green-900">{fmtDisplay(ingresosAnual)}</td>
                            </tr>
                            {/* Gastos financieros */}
                            <tr className="bg-red-50">
                                <td colSpan={2} className="border border-red-200 px-2 py-1.5 font-semibold text-red-900 text-xs">Gastos financieros</td>
                                {gastosTotals.map((val, i) => <td key={i} className="border border-red-200 px-1 py-1.5 text-right text-xs font-semibold text-red-800">{fmtDisplay(val)}</td>)}
                                <td className="border border-red-200 px-1 py-1.5 text-right text-xs font-bold text-red-900">{fmtDisplay(gastosAnual)}</td>
                            </tr>
                            {/* EBITDA % */}
                            <tr className="bg-indigo-50">
                                <td colSpan={2} className="border border-indigo-300 px-2 py-1.5 font-semibold text-indigo-900 text-xs">EBITDA %</td>
                                {ebitdaTotals.map((val, i) => {
                                    const rev = ingresosTotals[i] || 0;
                                    const pct = rev !== 0 ? Math.round((val / rev) * 100) : 0;
                                    return <td key={i} className={`border border-indigo-200 px-1 py-1.5 text-right text-xs font-semibold ${pct >= 0 ? 'text-indigo-800' : 'text-red-600'}`}>{pct}%</td>;
                                })}
                                <td className={`border border-indigo-200 px-1 py-1.5 text-right text-xs font-bold ${ingresosAnual !== 0 ? (ebitdaAnual / ingresosAnual >= 0 ? 'text-indigo-900' : 'text-red-600') : 'text-indigo-900'}`}>
                                    {ingresosAnual !== 0 ? Math.round((ebitdaAnual / ingresosAnual) * 100) : 0}%
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Historial de cambios */}
            <ChangeLogPanel module="pl" />
        </div>
    );
}
