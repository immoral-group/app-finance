import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, BudgetRequest } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Download, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, MessageSquare, Calendar, Send, Check, X, Trash2, ClipboardList, Info as InfoIcon, FileText, FileSpreadsheet } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { CommentModal, ForecastInfoModal } from '@/features/pl/PLMatrix';
import { ForecastScenariosModal, NewFeatureBubble, resolveMultiplier, isScenarioEmpty, isItemRemoved, addedRowValue, scenarioSummary, type ForecastScenario, type SavedScenario, type ScenarioAddedRow } from '@/features/pl/ForecastScenarios';
import { Sparkles } from 'lucide-react';
import { useUrlState } from '@/hooks/useUrlState';
import NutfruitBudget from './NutfruitBudget';
import IcexBudget from './IcexBudget';
import BillingHubMirror from '@/features/billing/BillingHubMirror';
import RevenueCellDetailModal from '@/features/billing/RevenueCellDetailModal';
import { RealDetailInfoModal, FacturacionInfoModal } from '@/features/billing/HubsInfoModals';

// Premium tooltip shared across all dashboard charts
function PremiumTooltip({ active, payload, label, formatter }: any) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="rounded-xl border border-border bg-card/95 backdrop-blur shadow-xl px-3 py-2 text-xs">
            <p className="font-semibold text-foreground mb-1.5">{label}</p>
            <div className="space-y-1">
                {payload.map((entry: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                            {entry.name}
                        </span>
                        <span className="font-semibold text-foreground tabular-nums">
                            {formatter ? formatter(entry.value) : entry.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const TABS = ['Dashboard', 'Real', 'Presupuesto', 'Comparación', 'Forecast', 'Solicitudes', 'Facturación'] as const;
type TabType = typeof TABS[number];

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Hours per person per month (default constant, can be customized in the future)
const HOURS_PER_PERSON_MONTH = 160;

// All departments that map from URL to display & filter
const DEPT_MAP: Record<string, { label: string; deptNames: string[] }> = {
    immedia: { label: 'Immedia', deptNames: ['Immedia'] },
    imcontent: { label: 'Imcontent', deptNames: ['Imcontent'] },
    immoralia: { label: 'Immoralia', deptNames: ['Immoralia'] },
    imsales: { label: 'Imsales', deptNames: ['Imsales'] },
};

// Full revenue structure (same as PLMatrix)
const REVENUE_STRUCTURE = [
    { dept: 'Immedia', services: ['Paid General', 'Paid imfilms', 'Setup inicial'] },
    { dept: 'Imcontent', services: ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers'] },
    { dept: 'Immoralia', services: ['Setup inicial IA', 'Automation', 'Consultoría'] },
    { dept: 'Imloyal', services: ['Web dev', 'CRM', 'Comisiones'] },
    { dept: 'Imseo', services: ['SEO', 'Comisiones'] },
    { dept: 'Immoral', services: ['Otros servicios', 'Otras comisiones'] },
    { dept: 'Imcontent', services: ['Budget Nutfruit'] },
    { dept: 'Imsales', services: ['Setup inicial (ims)', 'Captación'] },
];

// Full expense structure (same as PLMatrix)
const EXPENSE_STRUCTURE = {
    personalItems: [
        { dept: 'Immedia', items: ['Alba', 'Andrés', 'Leidy'] },
        { dept: 'Imcontent', items: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie'] },
        { dept: 'Immoralia', items: ['David', 'Manel'] },
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

// Map expense structure keys (same as Dashboard.tsx)
const EXPENSE_KEY_MAP: Record<string, { dept: string; items: string[] }[]> = {
    personal: EXPENSE_STRUCTURE.personalItems,
    comisiones: EXPENSE_STRUCTURE.comisionesItems,
    marketing: EXPENSE_STRUCTURE.marketingItems,
    formacion: EXPENSE_STRUCTURE.formacionItems,
    software: EXPENSE_STRUCTURE.softwareItems,
    gastosOp: EXPENSE_STRUCTURE.gastosOpItems,
    adspent: EXPENSE_STRUCTURE.adspentItems,
};
const ALL_EXPENSE_KEYS = Object.keys(EXPENSE_KEY_MAP);

// Filter a structure array by department names
function filterByDept(
    items: { dept: string; items?: string[]; services?: string[] }[],
    deptNames: string[]
): { dept: string; items: string[]; services?: string[] }[] {
    return items
        .filter(g => deptNames.includes(g.dept))
        .map(g => ({
            ...g,
            items: g.items || g.services || [],
        }));
}

export default function DepartmentPL() {
    const { deptCode } = useParams<{ deptCode: string }>();
    const config = DEPT_MAP[deptCode || ''];
    const deptNames = config?.deptNames || [deptCode || ''];
    const deptLabel = config?.label || deptCode || 'Departamento';
    // Departamentos sin allocación de Group cost (Immoral %).
    // 'Imsales' está temporalmente exento — para reactivarlo, quitar 'Imsales' de esta línea.
    const isGroupCostExempt = deptNames.includes('Immoral') || deptNames.includes('Imsales');

    const { profile, isSuperAdmin } = useAuth();
    const [year, setYear] = useUrlState('year', new Date().getFullYear(), (v) => Number(v));
    const [activeTab, setActiveTab] = useUrlState<TabType>('tab', 'Dashboard');
    const [bannerMonth, setBannerMonth] = useState<number | 'ytd'>('ytd');
    const [forecastInfoOpen, setForecastInfoOpen] = useState(false);
    const [forecastInfoSeen, setForecastInfoSeen] = useState(() => localStorage.getItem('forecast_info_seen_v2') === '1');
    // Info modals para las dos nuevas funciones de facturación
    const [realDetailInfoOpen, setRealDetailInfoOpen] = useState(false);
    const [realDetailInfoSeen, setRealDetailInfoSeen] = useState(() => localStorage.getItem('real_billing_detail_seen_v1') === '1');
    const [facturacionInfoOpen, setFacturacionInfoOpen] = useState(false);
    const [facturacionInfoSeen, setFacturacionInfoSeen] = useState(() => localStorage.getItem('facturacion_info_seen_v1') === '1');
    const openRealDetailInfo = () => {
        setRealDetailInfoOpen(true);
        if (!realDetailInfoSeen) {
            localStorage.setItem('real_billing_detail_seen_v1', '1');
            setRealDetailInfoSeen(true);
        }
    };
    const openFacturacionInfo = () => {
        setFacturacionInfoOpen(true);
        if (!facturacionInfoSeen) {
            localStorage.setItem('facturacion_info_seen_v1', '1');
            setFacturacionInfoSeen(true);
        }
    };
    const [scenarioOpen, setScenarioOpen] = useState(false);
    const [activeScenario, setActiveScenario] = useState<ForecastScenario | null>(null);

    // Scope basado en pestaña activa (escenarios Forecast vs Presupuesto)
    const deptScenarioScope: 'forecast' | 'budget' = activeTab === 'Presupuesto' ? 'budget' : 'forecast';

    // TODOS los escenarios compartidos con este depto (ambos scopes) — para mostrar notificaciones y badges
    const { data: scenariosAllData } = useQuery({
        queryKey: ['forecast-scenarios', deptLabel, 'all'],
        queryFn: () => adminApi.getForecastScenarios({ dept: deptLabel }),
        enabled: !!deptLabel,
        staleTime: 30000,
    });
    const sharedScenariosAll: SavedScenario[] = scenariosAllData?.scenarios || [];
    // Lista filtrada por scope que ve el modal (solo lectura)
    const sharedScenarios: SavedScenario[] = sharedScenariosAll.filter((s: any) => (s.scope || 'forecast') === deptScenarioScope);
    const sharedScenariosCount = sharedScenarios.length;

    // Escenarios compartidos que el usuario aún no ha visto (localStorage por usuario+escenario)
    const seenKey = `dept_seen_scenarios_${deptLabel}_${profile?.id || 'anon'}`;
    const [seenScenarioIds, setSeenScenarioIds] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch { return []; }
    });
    const unseenScenarios = sharedScenariosAll.filter(s => !seenScenarioIds.includes(s.id));
    const unseenByScope = {
        forecast: unseenScenarios.filter((s: any) => (s.scope || 'forecast') === 'forecast').length,
        budget: unseenScenarios.filter((s: any) => (s.scope || 'forecast') === 'budget').length,
    };
    const markScenarioSeen = (id: string) => {
        const next = Array.from(new Set([...seenScenarioIds, id]));
        localStorage.setItem(seenKey, JSON.stringify(next));
        setSeenScenarioIds(next);
    };
    const dismissAllNotifications = () => {
        const allIds = sharedScenariosAll.map(s => s.id);
        const next = Array.from(new Set([...seenScenarioIds, ...allIds]));
        localStorage.setItem(seenKey, JSON.stringify(next));
        setSeenScenarioIds(next);
    };
    const openForecastInfo = () => {
        setForecastInfoOpen(true);
        if (!forecastInfoSeen) {
            localStorage.setItem('forecast_info_seen_v2', '1');
            setForecastInfoSeen(true);
        }
    };
    const [cellValues, setCellValues] = useState<Record<string, number>>({});
    const queryClient = useQueryClient();
    const hoverTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    // ── Budget Requests state ─────────────────────────────────────────────────
    // draftEdits: key = `${section}-${dept}-${item}-${monthIdx}` → requested value
    const [draftEdits, setDraftEdits] = useState<Record<string, number>>({});
    const [requestReason, setRequestReason] = useState('');
    const [rejectNoteId, setRejectNoteId] = useState<string | null>(null);
    const [rejectNote, setRejectNote] = useState('');
    const [submitSuccess, setSubmitSuccess] = useState(false);

    const typeParam: 'budget' | 'real' | 'estimated' =
        activeTab === 'Presupuesto' ? 'budget' :
        activeTab === 'Forecast' ? 'estimated' :
        'real';

    // ── Notes state ───────────────────────────────────────────────────────────
    // IMPORTANT: dept notes use 'dept-real'/'dept-budget'/'dept-comparison' — completely separate
    // from PLMatrix notes. Same table, different view_type per tab.
    type DeptNoteType = 'dept-real' | 'dept-budget' | 'dept-comparison' | 'dept-estimated';
    const deptNoteType: DeptNoteType =
        activeTab === 'Presupuesto' ? 'dept-budget' :
            activeTab === 'Forecast' ? 'dept-estimated' :
                activeTab === 'Comparación' ? 'dept-comparison' :
                    'dept-real';

    const [contextMenu, setContextMenu] = useState<{
        x: number; y: number;
        section: string; dept: string; item: string;
        monthIdx: number; viewType: DeptNoteType;
    } | null>(null);

    const [editingComment, setEditingComment] = useState<{
        isOpen: boolean; section: string; dept: string; item: string;
        monthIdx: number; initialValue: string; initialAssignedTo: string[];
        saveType: DeptNoteType; noteId?: string;
    } | null>(null);

    const [hoveredCell, setHoveredCell] = useState<{
        section: string; dept: string; item: string; monthIdx: number;
        viewType: DeptNoteType; x: number; y: number;
    } | null>(null);

    // Modal de detalle de facturación al clicar celdas de ingreso en pestaña Real
    const [revenueDetail, setRevenueDetail] = useState<{
        dept: string; service: string; monthIdx: number; total: number;
    } | null>(null);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handler = () => setContextMenu(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);


    // ── Notes query & mutation ────────────────────────────────────────────────
    const { data: notesData } = useQuery({
        queryKey: ['pl-notes', year],
        queryFn: () => adminApi.getPLNotes(year),
        staleTime: 30000,
    });
    const cellNotes = notesData?.notes || {};

    const { data: usersData } = useQuery({
        queryKey: ['users'],
        queryFn: adminApi.getUsers
    });
    const users = usersData?.users || [];

    const noteSaveMutation = useMutation({
        mutationFn: adminApi.savePLNote,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-notes', year] });
        },
        onError: () => { console.error('Error saving note'); }
    });

    const getNoteKey = (viewType: string, section: string, dept: string, item: string, monthIdx: number) =>
        `${viewType}-${section}-${dept}-${item}-${monthIdx}`;

    const getCellNote = (viewType: string, section: string, dept: string, item: string, monthIdx: number): {
        id?: string; comment: string; assigned_to: string[]; status?: string
    } | null =>
        cellNotes[getNoteKey(viewType, section, dept, item, monthIdx)] || null;

    const noteStatusMutation = useMutation({
        mutationFn: adminApi.updatePLNoteStatus,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pl-notes', year] });
        },
        onError: () => { console.error('Error updating note status'); }
    });

    // ── Budget Request queries & mutations ────────────────────────────────────
    const { data: budgetRequestsData, isLoading: budgetRequestsLoading } = useQuery({
        queryKey: ['budget-requests', year, deptLabel],
        queryFn: () => adminApi.getBudgetRequests({ year, dept: deptLabel }),
        enabled: activeTab === 'Solicitudes',
        staleTime: 30000,
    });
    const budgetRequests: BudgetRequest[] = budgetRequestsData?.requests || [];
    const pendingRequests = budgetRequests.filter(r => r.status === 'pending');

    const submitBudgetRequestsMutation = useMutation({
        mutationFn: (requests: Partial<BudgetRequest>[]) =>
            adminApi.createBudgetRequestsBulk({
                requests,
                requested_by: profile?.id,
                requested_by_email: profile?.email || undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] });
            setDraftEdits({});
            setRequestReason('');
            setSubmitSuccess(true);
            setTimeout(() => setSubmitSuccess(false), 3000);
        },
    });

    const approveMutation = useMutation({
        mutationFn: (id: string) => adminApi.approveBudgetRequest(id, {
            reviewed_by: profile?.id,
            reviewed_by_email: profile?.email || undefined,
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] }),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, notes }: { id: string; notes: string }) => adminApi.rejectBudgetRequest(id, {
            reviewed_by: profile?.id,
            reviewed_by_email: profile?.email || undefined,
            review_notes: notes,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] });
            setRejectNoteId(null);
            setRejectNote('');
        },
    });

    const approveDeptMutation = useMutation({
        mutationFn: () => adminApi.approveDeptBudgetRequests({
            fiscal_year: year,
            dept: deptLabel,
            reviewed_by: profile?.id,
            reviewed_by_email: profile?.email || undefined,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] });
            queryClient.invalidateQueries({ queryKey: ['pl-matrix', year] });
        },
    });

    const [bulkRejectNote, setBulkRejectNote] = useState('');
    const [showBulkRejectInput, setShowBulkRejectInput] = useState(false);

    const rejectDeptMutation = useMutation({
        mutationFn: (notes: string) => adminApi.rejectDeptBudgetRequests({
            fiscal_year: year,
            dept: deptLabel,
            reviewed_by: profile?.id,
            reviewed_by_email: profile?.email || undefined,
            review_notes: notes || undefined,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] });
            setShowBulkRejectInput(false);
            setBulkRejectNote('');
        },
    });

    const deleteRequestMutation = useMutation({
        mutationFn: (id: string) => adminApi.deleteBudgetRequest(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] }),
    });

    const deleteAllDeptMutation = useMutation({
        mutationFn: () => adminApi.deleteAllDeptBudgetRequests({ fiscal_year: year, dept: deptLabel }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-requests', year, deptLabel] }),
    });


    // Limpiar borradores al cambiar de departamento
    useEffect(() => {
        setDraftEdits({});
        setRequestReason('');
    }, [deptCode]);

    const handleContextMenu = (e: React.MouseEvent, section: string, dept: string, item: string, monthIdx: number) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX, y: e.clientY,
            section, dept, item, monthIdx,
            viewType: deptNoteType
        });
    };

    const handleMouseEnter = (e: React.MouseEvent, section: string, dept: string, item: string, monthIdx: number) => {
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        const note = getCellNote(deptNoteType, normalizedSection, dept, item, monthIdx);
        if (!note?.comment && (!note?.assigned_to || note.assigned_to.length === 0)) return;
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredCell({ section, dept, item, monthIdx, viewType: deptNoteType, x: rect.right + 10, y: rect.top });
        }, 300);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredCell(null);
    };

    const openNoteModal = (section: string, dept: string, item: string, monthIdx: number) => {
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        const existingNote = getCellNote(deptNoteType, normalizedSection, dept, item, monthIdx);
        setEditingComment({
            isOpen: true, section, dept, item, monthIdx,
            initialValue: existingNote?.comment || '',
            initialAssignedTo: existingNote?.assigned_to || [],
            saveType: deptNoteType,
            noteId: existingNote?.id
        });
    };

    const handleSaveNote = (val: string, assignedTo: string[]) => {
        if (!editingComment) return;
        const { section, dept, item, monthIdx, saveType } = editingComment;
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        setEditingComment(null);
        noteSaveMutation.mutate({
            year, view_type: saveType, section: normalizedSection,
            dept, item, month: monthIdx + 1, comment: val, assigned_to: assignedTo
        });
    };

    // Fetch for Real/Presupuesto/Dashboard
    const { data: matrixData, isLoading } = useQuery({
        queryKey: ['pl-matrix', year, typeParam],
        queryFn: () => adminApi.getPLMatrix(year, typeParam),
        enabled: activeTab !== 'Comparación',
    });

    // Fetch both for Comparación and Dashboard
    const { data: realData } = useQuery({
        queryKey: ['pl-matrix', year, 'real'],
        queryFn: () => adminApi.getPLMatrix(year, 'real'),
    });

    const { data: budgetData } = useQuery({
        queryKey: ['pl-matrix', year, 'budget'],
        queryFn: () => adminApi.getPLMatrix(year, 'budget'),
    });

    const { data: estimatedData } = useQuery({
        queryKey: ['pl-matrix', year, 'estimated'],
        queryFn: () => adminApi.getPLMatrix(year, 'estimated'),
    });

    // Custom rows query — filtered by year
    const { data: customRowsData } = useQuery({
        queryKey: ['pl-custom-rows', year],
        queryFn: () => adminApi.getCustomRows(year),
        staleTime: 60000,
    });
    const customRows = customRowsData?.rows || [];

    // Filas añadidas por el escenario activo — solo en pestañas donde aplica
    const scenarioAddedRows: ScenarioAddedRow[] = useMemo(() => {
        const tabAllows = activeTab === 'Forecast' || activeTab === 'Presupuesto';
        if (!tabAllows || !activeScenario) return [];
        return activeScenario.addedRows || [];
    }, [activeTab, activeScenario]);

    // Merge custom rows into structures
    const mergedExpenseKeyMap = useMemo(() => {
        const expCustom = customRows.filter(r => r.block_type === 'expense');
        const merged: Record<string, { dept: string; items: string[] }[]> = {};
        Object.keys(EXPENSE_KEY_MAP).forEach(k => {
            merged[k] = EXPENSE_KEY_MAP[k].map(g => ({ ...g, items: [...g.items] }));
        });
        expCustom.forEach(cr => {
            if (!merged[cr.section_key]) return;
            let group = merged[cr.section_key].find(g => g.dept === cr.dept);
            if (!group) {
                group = { dept: cr.dept, items: [] };
                merged[cr.section_key].push(group);
            }
            if (!group.items.includes(cr.item_name)) group.items.push(cr.item_name);
        });
        // Inyectar filas añadidas del escenario (solo secciones de gasto)
        scenarioAddedRows.forEach(row => {
            if (row.section === 'revenue') return;
            if (!merged[row.section]) merged[row.section] = [];
            let group = merged[row.section].find(g => g.dept === row.dept);
            if (!group) {
                group = { dept: row.dept, items: [] };
                merged[row.section].push(group);
            }
            if (!group.items.includes(row.name)) group.items.push(row.name);
        });
        return merged;
    }, [customRows, scenarioAddedRows]);

    const mergedRevenueStructure = useMemo(() => {
        const revCustom = customRows.filter(r => r.block_type === 'revenue');
        const merged = REVENUE_STRUCTURE.map(g => ({ ...g, services: [...g.services] }));
        revCustom.forEach(cr => {
            let group = merged.find(g => g.dept === cr.dept);
            if (!group) {
                group = { dept: cr.dept, services: [] };
                merged.push(group);
            }
            if (!group.services.includes(cr.item_name)) group.services.push(cr.item_name);
        });
        // Inyectar filas añadidas del escenario (solo revenue)
        scenarioAddedRows.forEach(row => {
            if (row.section !== 'revenue') return;
            let group = merged.find(g => g.dept === row.dept);
            if (!group) {
                group = { dept: row.dept, services: [] };
                merged.push(group);
            }
            if (!group.services.includes(row.name)) group.services.push(row.name);
        });
        return merged;
    }, [customRows, scenarioAddedRows]);

    // Populate cellValues from API data.
    // Uses string key to avoid re-parsing on background refetches while editing.
    const prevMatrixRef = useRef<string | null>(null);

    // Build reverse mapping for expense items: "dept::item" → [section_key, ...]
    // Uses merged structure so custom rows are included
    const expenseSectionMap = useMemo(() => {
        const map: Record<string, string[]> = {};
        Object.entries(mergedExpenseKeyMap).forEach(([sectionKey, deptItems]) => {
            deptItems.forEach(({ dept, items }) => {
                items.forEach(item => {
                    const k = `${dept}::${item}`;
                    if (!map[k]) map[k] = [];
                    if (!map[k].includes(sectionKey)) map[k].push(sectionKey);
                });
            });
        });
        return map;
    }, [mergedExpenseKeyMap]);

    useEffect(() => {
        if (!matrixData?.sections) return;

        const currentKey = JSON.stringify([year, typeParam]);
        if (prevMatrixRef.current === currentKey) return;
        prevMatrixRef.current = currentKey;

        const newValues: Record<string, number> = {};

        const revenueSection = matrixData.sections.find((s: any) => s.code === 'REVENUE');
        if (revenueSection?.rows) {
            revenueSection.rows.forEach((row: any) => {
                if (row.values && row.dept && row.name) {
                    row.values.forEach((val: number, monthIdx: number) => {
                        const key = `revenue-${row.dept}-${row.name}-${monthIdx}-${typeParam}`;
                        newValues[key] = val || 0;
                    });
                }
            });
        }

        const expenseSection = matrixData.sections.find((s: any) => s.code === 'EXPENSES');
        if (expenseSection?.rows) {
            // Process legacy rows (no section_key) FIRST, then section_key rows SECOND
            const legacyRows = expenseSection.rows.filter((r: any) => !r.section_key);
            const sectionKeyRows = expenseSection.rows.filter((r: any) => !!r.section_key);

            legacyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        const mapKey = `${dept}::${row.name}`;
                        const matchingSections = expenseSectionMap[mapKey];
                        if (matchingSections && matchingSections.length > 0) {
                            matchingSections.forEach((sk: string) => {
                                newValues[`${sk}-${dept}-${row.name}-${monthIdx}-${typeParam}`] = val || 0;
                            });
                        } else {
                            newValues[`expense-${dept}-${row.name}-${monthIdx}-${typeParam}`] = val || 0;
                        }
                    });
                }
            });

            sectionKeyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        const key = `${row.section_key}-${dept}-${row.name}-${monthIdx}-${typeParam}`;
                        newValues[key] = val || 0;
                    });
                }
            });
        }

        setCellValues(prev => ({ ...prev, ...newValues }));
    }, [matrixData, typeParam, expenseSectionMap, year]);

    // Remove cache on unmount so the next visit always fetches fresh data
    useEffect(() => {
        return () => {
            queryClient.removeQueries({ queryKey: ['pl-matrix', year] });
        };
    }, [year, queryClient]);

    // Populate comparison data
    const [compRealValues, setCompRealValues] = useState<Record<string, number>>({});
    const [compBudgetValues, setCompBudgetValues] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!realData?.sections) return;
        const vals: Record<string, number> = {};
        const revenueSection = realData.sections.find((s: any) => s.code === 'REVENUE');
        revenueSection?.rows?.forEach((row: any) => {
            if (row.values && row.dept && row.name) {
                row.values.forEach((val: number, monthIdx: number) => {
                    vals[`revenue-${row.dept}-${row.name}-${monthIdx}`] = val || 0;
                });
            }
        });
        const expenseSection = realData.sections.find((s: any) => s.code === 'EXPENSES');
        if (expenseSection?.rows) {
            const legacyRows = expenseSection.rows.filter((r: any) => !r.section_key);
            const sectionKeyRows = expenseSection.rows.filter((r: any) => !!r.section_key);
            legacyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        const mapKey = `${dept}::${row.name}`;
                        const ms = expenseSectionMap[mapKey];
                        if (ms && ms.length > 0) {
                            ms.forEach((sk: string) => { vals[`${sk}-${dept}-${row.name}-${monthIdx}`] = val || 0; });
                        } else {
                            vals[`expense-${dept}-${row.name}-${monthIdx}`] = val || 0;
                        }
                    });
                }
            });
            sectionKeyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        vals[`${row.section_key}-${dept}-${row.name}-${monthIdx}`] = val || 0;
                    });
                }
            });
        }
        setCompRealValues(vals);
    }, [realData, expenseSectionMap]);

    useEffect(() => {
        if (!budgetData?.sections) return;
        const vals: Record<string, number> = {};
        const revenueSection = budgetData.sections.find((s: any) => s.code === 'REVENUE');
        revenueSection?.rows?.forEach((row: any) => {
            if (row.values && row.dept && row.name) {
                row.values.forEach((val: number, monthIdx: number) => {
                    vals[`revenue-${row.dept}-${row.name}-${monthIdx}`] = val || 0;
                });
            }
        });
        const expenseSection = budgetData.sections.find((s: any) => s.code === 'EXPENSES');
        if (expenseSection?.rows) {
            const legacyRows = expenseSection.rows.filter((r: any) => !r.section_key);
            const sectionKeyRows = expenseSection.rows.filter((r: any) => !!r.section_key);
            legacyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        const mapKey = `${dept}::${row.name}`;
                        const ms = expenseSectionMap[mapKey];
                        if (ms && ms.length > 0) {
                            ms.forEach((sk: string) => { vals[`${sk}-${dept}-${row.name}-${monthIdx}`] = val || 0; });
                        } else {
                            vals[`expense-${dept}-${row.name}-${monthIdx}`] = val || 0;
                        }
                    });
                }
            });
            sectionKeyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        vals[`${row.section_key}-${dept}-${row.name}-${monthIdx}`] = val || 0;
                    });
                }
            });
        }
        setCompBudgetValues(vals);
    }, [budgetData, expenseSectionMap]);

    const [compEstimatedValues, setCompEstimatedValues] = useState<Record<string, number>>({});
    useEffect(() => {
        if (!estimatedData?.sections) return;
        const vals: Record<string, number> = {};
        const revenueSection = estimatedData.sections.find((s: any) => s.code === 'REVENUE');
        revenueSection?.rows?.forEach((row: any) => {
            if (row.values && row.dept && row.name) {
                row.values.forEach((val: number, monthIdx: number) => {
                    vals[`revenue-${row.dept}-${row.name}-${monthIdx}`] = val || 0;
                });
            }
        });
        const expenseSection = estimatedData.sections.find((s: any) => s.code === 'EXPENSES');
        if (expenseSection?.rows) {
            const legacyRows = expenseSection.rows.filter((r: any) => !r.section_key);
            const sectionKeyRows = expenseSection.rows.filter((r: any) => !!r.section_key);
            legacyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        const mapKey = `${dept}::${row.name}`;
                        const ms = expenseSectionMap[mapKey];
                        if (ms && ms.length > 0) {
                            ms.forEach((sk: string) => { vals[`${sk}-${dept}-${row.name}-${monthIdx}`] = val || 0; });
                        } else {
                            vals[`expense-${dept}-${row.name}-${monthIdx}`] = val || 0;
                        }
                    });
                }
            });
            sectionKeyRows.forEach((row: any) => {
                if (row.values && row.name && Array.isArray(row.values)) {
                    const dept = row.dept || 'General';
                    row.values.forEach((val: number, monthIdx: number) => {
                        vals[`${row.section_key}-${dept}-${row.name}-${monthIdx}`] = val || 0;
                    });
                }
            });
        }
        setCompEstimatedValues(vals);
    }, [estimatedData, expenseSectionMap]);

    const getCellKey = (section: string, dept: string, item: string, monthIdx: number) => {
        return `${section}-${dept}-${item}-${monthIdx}-${typeParam}`;
    };

    const getCellValue = (section: string, dept: string, item: string, monthIdx: number): number => {
        const base = cellValues[getCellKey(section, dept, item, monthIdx)] || 0;
        const tabAllows = activeTab === 'Forecast' || activeTab === 'Presupuesto';
        if (!tabAllows || !activeScenario) return base;
        // Fila añadida por el escenario — valor viene del propio escenario
        const added = (activeScenario.addedRows || []).find(r => r.section === section && r.dept === dept && r.name === item);
        if (added) return addedRowValue(added, monthIdx);
        // Fila eliminada por el escenario — vale 0 desde su fromMonth
        if (isItemRemoved(activeScenario, section, dept, item, monthIdx)) return 0;
        const mult = resolveMultiplier(activeScenario, section, dept, item, monthIdx);
        if (mult === 1) return base;
        return Math.round(base * mult * 100) / 100;
    };

    const fmtCurrency = (val: number) => Math.round(val * 100) / 100;

    const fmtDisplay = (val: number) => {
        const rounded = Math.round(val);
        return rounded.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    const calculateRowTotal = (section: string, dept: string, item: string): number => {
        let total = 0;
        for (let i = 0; i < 12; i++) {
            total += getCellValue(section, dept, item, i);
        }
        return fmtCurrency(total);
    };

    const calculateSectionTotal = (section: string, structure: { dept: string; items?: string[]; services?: string[] }[]): number[] => {
        const totals = Array(12).fill(0);
        structure.forEach(group => {
            const items = group.items || group.services || [];
            items.forEach(item => {
                for (let i = 0; i < 12; i++) {
                    totals[i] += getCellValue(section, group.dept, item, i);
                }
            });
        });
        return totals.map(t => fmtCurrency(t));
    };

    // --- Comparison helpers ---
    const getCompValue = (source: Record<string, number>, section: string, dept: string, item: string, monthIdx: number): number => {
        return source[`${section}-${dept}-${item}-${monthIdx}`] || 0;
    };

    const calcCompSectionTotal = (source: Record<string, number>, section: string, structure: { dept: string; items?: string[]; services?: string[] }[]): number[] => {
        const totals = Array(12).fill(0);
        structure.forEach(group => {
            const items = group.items || group.services || [];
            items.forEach(item => {
                for (let i = 0; i < 12; i++) {
                    totals[i] += getCompValue(source, section, group.dept, item, i);
                }
            });
        });
        return totals.map(t => fmtCurrency(t));
    };

    // Aplica escenario activo al leer de los mapas de comparación (Real / Budget)
    const getScenarioValue = (source: Record<string, number>, section: string, dept: string, item: string, monthIdx: number): number => {
        const base = source[`${section}-${dept}-${item}-${monthIdx}`] || 0;
        const tabAllows = activeTab === 'Forecast' || activeTab === 'Presupuesto';
        if (!tabAllows || !activeScenario) return base;
        const added = (activeScenario.addedRows || []).find(r => r.section === section && r.dept === dept && r.name === item);
        if (added) return addedRowValue(added, monthIdx);
        if (isItemRemoved(activeScenario, section, dept, item, monthIdx)) return 0;
        const mult = resolveMultiplier(activeScenario, section, dept, item, monthIdx);
        return base * mult;
    };

    // --- Group Cost Calculation helper ---
    const calculateGroupCost = (valuesMap: Record<string, number>): number[] => {
        // 1) Total General Revenue
        const totalGeneralRevenue = Array(12).fill(0);
        mergedRevenueStructure.forEach(group => {
            group.services.forEach(service => {
                for (let i = 0; i < 12; i++) {
                    totalGeneralRevenue[i] += getScenarioValue(valuesMap, 'revenue', group.dept, service, i);
                }
            });
        });

        // 2) Dept Revenue
        const deptRevTotals = Array(12).fill(0);
        deptRevenue.forEach(group => {
            (group.services || []).forEach(service => {
                for (let i = 0; i < 12; i++) {
                    deptRevTotals[i] += getScenarioValue(valuesMap, 'revenue', group.dept, service, i);
                }
            });
        });

        // 3) Group Pct
        const groupPct = deptRevTotals.map((v, i) =>
            totalGeneralRevenue[i] > 0 ? (v / totalGeneralRevenue[i]) : 0
        );

        // 4) ALL Immoral Expenses
        const immoralExpensesMonthly = Array(12).fill(0);
        ALL_EXPENSE_KEYS.forEach(catKey => {
            const items = mergedExpenseKeyMap[catKey] || [];
            items.filter(g => g.dept === 'Immoral').forEach(g => {
                g.items.forEach(item => {
                    for (let i = 0; i < 12; i++) {
                        immoralExpensesMonthly[i] += getScenarioValue(valuesMap, catKey, 'Immoral', item, i);
                    }
                });
            });
        });

        // 5) Group Cost — 0 for depts in isGroupCostExempt
        return groupPct.map((pct, i) =>
            isGroupCostExempt ? 0 : fmtCurrency(immoralExpensesMonthly[i] * pct)
        );
    };

    // --- Filter structures for this department ---
    const deptRevenue = mergedRevenueStructure.filter(g => deptNames.includes(g.dept));
    const deptPersonal = filterByDept(mergedExpenseKeyMap['personal'] || [], deptNames);
    const deptComisiones = filterByDept(mergedExpenseKeyMap['comisiones'] || [], deptNames);
    const deptMarketing = filterByDept(mergedExpenseKeyMap['marketing'] || [], deptNames);
    const deptFormacion = filterByDept(mergedExpenseKeyMap['formacion'] || [], deptNames);
    const deptSoftware = filterByDept(mergedExpenseKeyMap['software'] || [], deptNames);
    const deptGastosOp = filterByDept(mergedExpenseKeyMap['gastosOp'] || [], deptNames);
    const deptAdspent = filterByDept(mergedExpenseKeyMap['adspent'] || [], deptNames);

    // All expense categories for this department
    const expCats = [
        { key: 'personal', label: 'Personal', items: deptPersonal },
        { key: 'comisiones', label: 'Comisiones', items: deptComisiones },
        { key: 'marketing', label: 'Marketing', items: deptMarketing },
        { key: 'formacion', label: 'Formación', items: deptFormacion },
        { key: 'software', label: 'Software', items: deptSoftware },
        { key: 'adspent', label: deptCode === 'imcontent' ? 'Adspent / Influencers' : 'Adspent', items: deptAdspent },
        { key: 'gastosOp', label: 'Gastos Operativos', items: deptGastosOp },
    ].filter(cat => cat.items.length > 0);

    // --- Read-only cell renderer (with note indicator) ---
    const renderReadOnlyCell = (section: string, dept: string, item: string, monthIdx: number) => {
        const value = getCellValue(section, dept, item, monthIdx);
        const baseVal = cellValues[getCellKey(section, dept, item, monthIdx)] || 0;
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        const note = getCellNote(deptNoteType, normalizedSection, dept, item, monthIdx);
        const hasNote = !!note?.comment || (note?.assigned_to && note.assigned_to.length > 0);
        const scenarioActive = (activeTab === 'Forecast' || activeTab === 'Presupuesto') && !!activeScenario && !isScenarioEmpty(activeScenario);
        const addedRow = scenarioActive ? (activeScenario!.addedRows || []).find(r => r.section === section && r.dept === dept && r.name === item) : undefined;
        const removed = scenarioActive && isItemRemoved(activeScenario, section, dept, item, monthIdx);
        const mult = scenarioActive ? resolveMultiplier(activeScenario, section, dept, item, monthIdx) : 1;
        const tinted = scenarioActive && !addedRow && !removed && mult !== 1 && baseVal !== 0;
        const deltaPct = Math.round((mult - 1) * 100);
        const isUp = deltaPct > 0;
        const isRevenueRealClickable = activeTab === 'Real' && section === 'revenue' && value > 0 && !addedRow;

        if (addedRow) {
            return (
                <td
                    key={monthIdx}
                    className="border border-violet-200 px-1 py-1 text-right text-xs tabular-nums relative bg-violet-100/70 text-violet-900"
                    title={`Fila añadida por el escenario: ${addedRow.name} (${addedRow.monthlyAmount.toLocaleString('de-DE')} €/mes de ${MONTHS[addedRow.fromMonth - 1]} a ${MONTHS[addedRow.toMonth - 1]})`}
                >
                    <div className="font-semibold">{value ? fmtDisplay(value) : <span className="text-violet-300">0</span>}</div>
                    <div className="text-[9px] font-bold text-violet-700">NUEVA</div>
                </td>
            );
        }
        if (removed) {
            const removedRow = activeScenario!.removedItems!.find(r => r.section === section && r.dept === dept && r.item === item)!;
            return (
                <td
                    key={monthIdx}
                    className="border border-rose-200 px-1 py-1 text-right text-xs tabular-nums relative bg-rose-100/70 text-rose-900"
                    title={`Fila eliminada por el escenario a partir de ${MONTHS[removedRow.fromMonth - 1]}`}
                >
                    <div className="font-semibold line-through opacity-70">{baseVal ? Math.round(baseVal).toLocaleString('de-DE') : '0'}</div>
                    <div className="text-[9px] font-bold text-rose-700">−100%</div>
                </td>
            );
        }
        return (
            <td
                key={monthIdx}
                className={`border border-gray-200 px-1 py-1 text-right text-xs tabular-nums relative ${isRevenueRealClickable ? 'cursor-pointer hover:bg-indigo-50 hover:ring-1 hover:ring-inset hover:ring-indigo-300 hover:text-indigo-900 transition-colors' : 'cursor-context-menu'} ${tinted ? (isUp ? 'bg-emerald-100/80 text-emerald-900' : 'bg-rose-100/80 text-rose-900') : ''}`}
                onContextMenu={(e) => handleContextMenu(e, section, dept, item, monthIdx)}
                onMouseEnter={(e) => handleMouseEnter(e, section, dept, item, monthIdx)}
                onMouseLeave={handleMouseLeave}
                onClick={isRevenueRealClickable ? () => setRevenueDetail({ dept, service: item, monthIdx, total: value }) : undefined}
                title={isRevenueRealClickable
                    ? 'Click para ver detalle de clientes facturados'
                    : (tinted ? `Base: ${Math.round(baseVal).toLocaleString('de-DE')} · Escenario: ${Math.round(value).toLocaleString('de-DE')} (${isUp ? '+' : ''}${deltaPct}%)` : undefined)}
            >
                {hasNote && (
                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-orange-500 border-l-transparent pointer-events-none" />
                )}
                {tinted ? (
                    <>
                        <div className="font-semibold">{value ? fmtDisplay(value) : '0'}</div>
                        <div className="text-[9px] line-through opacity-60">{Math.round(baseVal).toLocaleString('de-DE')}</div>
                        <div className={`text-[9px] font-bold ${isUp ? 'text-emerald-700' : 'text-rose-700'}`}>{isUp ? '+' : ''}{deltaPct}%</div>
                    </>
                ) : (
                    value ? fmtDisplay(value) : <span className="text-gray-300">0</span>
                )}
            </td>
        );
    };

    const renderRevenueRows = () => {
        const rows: React.ReactNode[] = [];
        deptRevenue.forEach((group, groupIdx) => {
            group.services.forEach((service, serviceIdx) => {
                rows.push(
                    <tr key={`rev-${groupIdx}-${serviceIdx}`} className="hover:bg-gray-50">
                        {serviceIdx === 0 ? (
                            <td
                                rowSpan={group.services.length}
                                className="border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 align-middle text-center"
                            >
                                {group.dept}
                            </td>
                        ) : null}
                        <td className="border border-gray-200 px-2 py-1 text-xs text-gray-900">
                            {service}
                        </td>
                        {MONTHS.map((_, monthIdx) => renderReadOnlyCell('revenue', group.dept, service, monthIdx))}
                        <td className="border border-gray-200 px-1 py-1 text-right text-xs font-medium bg-gray-50 tabular-nums">
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
        if (items.length === 0) return null;

        const rows: React.ReactNode[] = [];
        const categoryTotals = calculateSectionTotal(sectionKey, items);
        const categoryAnnual = categoryTotals.reduce((a, b) => a + b, 0);

        // Category header
        rows.push(
            <tr key={`cat-${sectionKey}`} className={bgColor}>
                <td className="border border-orange-200 px-2 py-1.5 text-xs font-semibold text-orange-800"></td>
                <td className="border border-orange-200 px-2 py-1.5 text-xs font-semibold text-orange-800">
                    {categoryName}
                </td>
                {categoryTotals.map((val, i) => (
                    <td key={i} className="border border-orange-200 px-1 py-1.5 text-right text-xs font-medium text-orange-700 tabular-nums">
                        {fmtDisplay(val)}
                    </td>
                ))}
                <td className="border border-orange-200 px-1 py-1.5 text-right text-xs font-semibold text-orange-800 tabular-nums">
                    {fmtDisplay(categoryAnnual)}
                </td>
            </tr>
        );

        // Item rows
        items.forEach((group, groupIdx) => {
            group.items.forEach((item, itemIdx) => {
                rows.push(
                    <tr key={`${sectionKey}-${groupIdx}-${itemIdx}`} className="hover:bg-gray-50">
                        {itemIdx === 0 ? (
                            <td
                                rowSpan={group.items.length}
                                className="border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 align-middle text-center"
                            >
                                {group.dept}
                            </td>
                        ) : null}
                        <td className="border border-gray-200 px-2 py-1 text-xs text-gray-900">
                            {item}
                        </td>
                        {MONTHS.map((_, monthIdx) => renderReadOnlyCell(sectionKey, group.dept, item, monthIdx))}
                        <td className="border border-gray-200 px-1 py-1 text-right text-xs font-medium bg-gray-50 tabular-nums">
                            {fmtDisplay(calculateRowTotal(sectionKey, group.dept, item))}
                        </td>
                    </tr>
                );
            });
        });

        // Spacer
        rows.push(
            <tr key={`spacer-${sectionKey}`}>
                <td colSpan={15} className="border border-gray-100 py-1 bg-white"></td>
            </tr>
        );

        return rows;
    };

    // --- Comparison rendering ---
    const renderComparisonTable = () => {
        const realRevTotals = calcCompSectionTotal(compRealValues, 'revenue', deptRevenue);
        const budgetRevTotals = calcCompSectionTotal(compBudgetValues, 'revenue', deptRevenue);
        const diffRevTotals = realRevTotals.map((v, i) => fmtCurrency(v - budgetRevTotals[i]));

        const realExpTotals = Array(12).fill(0);
        const budgetExpTotals = Array(12).fill(0);
        expCats.forEach(cat => {
            const rTotals = calcCompSectionTotal(compRealValues, cat.key, cat.items);
            const bTotals = calcCompSectionTotal(compBudgetValues, cat.key, cat.items);
            rTotals.forEach((v, i) => realExpTotals[i] += v);
            bTotals.forEach((v, i) => budgetExpTotals[i] += v);
        });

        // --- GROUP COST & RESULTADO ---
        const realGroupCost = calculateGroupCost(compRealValues);
        const budgetGroupCost = calculateGroupCost(compBudgetValues);
        const diffGroupCost = realGroupCost.map((v, i) => fmtCurrency(v - budgetGroupCost[i]));

        // Add Group Cost to total expenses
        realGroupCost.forEach((v, i) => realExpTotals[i] += v);
        budgetGroupCost.forEach((v, i) => budgetExpTotals[i] += v);

        const diffExpTotals = realExpTotals.map((v, i) => fmtCurrency(v - budgetExpTotals[i]));

        const realEbitda = realRevTotals.map((v, i) => fmtCurrency(v - realExpTotals[i]));
        const budgetEbitda = budgetRevTotals.map((v, i) => fmtCurrency(v - budgetExpTotals[i]));
        const diffEbitda = realEbitda.map((v, i) => fmtCurrency(v - budgetEbitda[i]));

        // isExpense: para filas de gasto, real < budget = bueno (verde). Para ingresos/EBITDA: real > budget = bueno (verde).
        const renderCompRow = (label: string, realVals: number[], budgetVals: number[], diffVals: number[], bold: boolean = false, bgClass: string = '', isExpense: boolean = false) => {
            const colorFor = (v: number) => {
                if (v === 0) return '';
                const isGood = isExpense ? v < 0 : v > 0;
                return isGood ? 'text-green-700' : 'text-red-600';
            };
            const totalDiff = fmtCurrency(diffVals.reduce((a, b) => a + b, 0));
            const totalIsGood = isExpense ? totalDiff <= 0 : totalDiff >= 0;
            return (
                <>
                    <tr className={`${bgClass} ${bold ? 'font-bold' : ''}`}>
                        <td rowSpan={3} className={`border border-gray-300 px-2 py-1 text-xs ${bold ? 'font-bold' : 'font-medium'} text-gray-800 align-middle`}>
                            {label}
                        </td>
                        <td className="border border-gray-200 px-2 py-0.5 text-xs text-blue-700 font-medium">Real</td>
                        {realVals.map((v, i) => <td key={i} className="border border-gray-200 px-1 py-0.5 text-right text-xs tabular-nums">{fmtDisplay(v)}</td>)}
                        <td className="border border-gray-200 px-1 py-0.5 text-right text-xs font-medium bg-gray-50 tabular-nums">{fmtDisplay(fmtCurrency(realVals.reduce((a, b) => a + b, 0)))}</td>
                    </tr>
                    <tr className={bgClass}>
                        <td className="border border-gray-200 px-2 py-0.5 text-xs text-green-700 font-medium">Presup.</td>
                        {budgetVals.map((v, i) => <td key={i} className="border border-gray-200 px-1 py-0.5 text-right text-xs tabular-nums">{fmtDisplay(v)}</td>)}
                        <td className="border border-gray-200 px-1 py-0.5 text-right text-xs font-medium bg-gray-50 tabular-nums">{fmtDisplay(fmtCurrency(budgetVals.reduce((a, b) => a + b, 0)))}</td>
                    </tr>
                    <tr className={bgClass}>
                        <td className="border border-gray-200 px-2 py-0.5 text-xs text-red-700 font-medium">Dif.</td>
                        {diffVals.map((v, i) => <td key={i} className={`border border-gray-200 px-1 py-0.5 text-right text-xs tabular-nums ${colorFor(v)}`}>{fmtDisplay(v)}</td>)}
                        <td className={`border border-gray-200 px-1 py-0.5 text-right text-xs font-medium bg-gray-50 tabular-nums ${totalIsGood ? 'text-green-700' : 'text-red-600'}`}>
                            {fmtDisplay(totalDiff)}
                        </td>
                    </tr>
                </>
            );
        };

        return (
            <div className="overflow-x-auto px-2">
                <table className="w-full border-collapse text-xs" style={{ minWidth: '1200px' }}>
                    <thead>
                        <tr className="bg-white">
                            <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '140px' }}>Concepto</th>
                            <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '70px' }}>Tipo</th>
                            {MONTHS.map((month, i) => (
                                <th key={i} className="border border-gray-300 px-1 py-2 text-center font-medium text-xs" style={{ width: '70px', minWidth: '70px' }}>
                                    {month}
                                </th>
                            ))}
                            <th className="border border-gray-300 px-1 py-2 text-center font-semibold text-xs bg-gray-100" style={{ width: '80px', minWidth: '80px' }}>
                                Anual
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderCompRow('INGRESOS', realRevTotals, budgetRevTotals, diffRevTotals, true, 'bg-purple-50')}
                        <tr><td colSpan={15} className="py-1 bg-white border-0"></td></tr>

                        {!isGroupCostExempt && (
                            <>
                                {renderCompRow('GROUP (Immoral %)', realGroupCost, budgetGroupCost, diffGroupCost, false, 'bg-red-50', true)}
                                <tr><td colSpan={15} className="py-1 bg-white border-0"></td></tr>
                            </>
                        )}

                        {renderCompRow('GASTOS TOTALES', realExpTotals.map(v => fmtCurrency(v)), budgetExpTotals.map(v => fmtCurrency(v)), diffExpTotals, true, 'bg-orange-50', true)}
                        <tr><td colSpan={15} className="py-1 bg-white border-0"></td></tr>

                        {renderCompRow('EBITDA', realEbitda, budgetEbitda, diffEbitda, true, 'bg-blue-50')}
                    </tbody>
                </table>
            </div>
        );
    };

    // --- Dashboard Tab: Rich visual dashboard with charts ---
    const renderDashboardTab = () => {
        // Use Real data for Dashboard view
        const revTotals = calcCompSectionTotal(compRealValues, 'revenue', deptRevenue);
        const revAnual = fmtCurrency(revTotals.reduce((a, b) => a + b, 0));

        // Budget revenue for comparison
        const budgetRevTotals = calcCompSectionTotal(compBudgetValues, 'revenue', deptRevenue);

        // === TOTAL GENERAL revenue (all depts) for Group % calculation ===
        const totalGeneralRevenue = Array(12).fill(0);
        mergedRevenueStructure.forEach(group => {
            group.services.forEach(service => {
                for (let i = 0; i < 12; i++) {
                    totalGeneralRevenue[i] += getCompValue(compRealValues, 'revenue', group.dept, service, i);
                }
            });
        });

        // === Group % = dept revenue / total general revenue per month ===
        const groupPct = revTotals.map((v, i) =>
            totalGeneralRevenue[i] > 0 ? fmtCurrency((v / totalGeneralRevenue[i]) * 100) : 0
        );

        // === ALL Immoral expenses per month (for Group % distribution — same logic as Dashboard cards) ===
        const immoralExpensesMonthly = Array(12).fill(0);
        ALL_EXPENSE_KEYS.forEach(catKey => {
            const items = mergedExpenseKeyMap[catKey] || [];
            items.filter(g => g.dept === 'Immoral').forEach(g => {
                g.items.forEach(item => {
                    for (let i = 0; i < 12; i++) {
                        immoralExpensesMonthly[i] += getCompValue(compRealValues, catKey, 'Immoral', item, i);
                    }
                });
            });
        });

        // === Group cost = ALL Immoral expenses * Group% (per month) — 0 for depts in isGroupCostExempt ===
        const groupCostMonthly = groupPct.map((pct, i) =>
            isGroupCostExempt ? 0 : fmtCurrency(immoralExpensesMonthly[i] * (pct / 100))
        );
        // Budget group cost — calculated symmetrically using compBudgetValues so the
        // "Presupuesto" expense card and the budget net result include the same Immoral % share that Real does.
        const budgetGroupCostMonthly = calculateGroupCost(compBudgetValues);

        // Calculate each expense category monthly
        const catMonthly: { label: string; totals: number[] }[] = [];
        let totalExpMonthly = Array(12).fill(0);
        let budgetExpMonthly = Array(12).fill(0);

        expCats.forEach(cat => {
            const totals = calcCompSectionTotal(compRealValues, cat.key, cat.items);
            const bTotals = calcCompSectionTotal(compBudgetValues, cat.key, cat.items);
            catMonthly.push({ label: cat.label, totals });
            totals.forEach((v, i) => totalExpMonthly[i] += v);
            bTotals.forEach((v, i) => budgetExpMonthly[i] += v);
        });
        totalExpMonthly = totalExpMonthly.map(v => fmtCurrency(v));
        budgetExpMonthly = budgetExpMonthly.map(v => fmtCurrency(v));

        // Total expenses INCLUDING Group cost
        const totalExpWithGroup = totalExpMonthly.map((v, i) => fmtCurrency(v + groupCostMonthly[i]));
        const budgetExpWithGroup = budgetExpMonthly.map((v, i) => fmtCurrency(v + budgetGroupCostMonthly[i]));

        const resultadoMonthly = revTotals.map((v, i) => fmtCurrency(v - totalExpWithGroup[i]));
        const resultadoAnual = fmtCurrency(revAnual - totalExpWithGroup.reduce((a, b) => a + b, 0));

        // === COST PER HOUR calculations ===
        // Count people PER MONTH dynamically: a person counts in a month only if their personal cost > 0 that month
        // This ensures adding a new worker in a future month doesn't retroactively change past months
        const deptPeoplePerMonth = Array(12).fill(0).map((_, monthIdx) => {
            let count = 0;
            deptPersonal.forEach(group => {
                group.items.forEach(item => {
                    if (item.toLowerCase().includes('externo')) return; // skip Externos
                    const val = getCompValue(compRealValues, 'personal', group.dept, item, monthIdx);
                    if (val > 0) count++;
                });
            });
            return count;
        });

        // Personal cost monthly (from real values)
        const personalCostMonthly = calcCompSectionTotal(compRealValues, 'personal', deptPersonal);

        // Horas totales por mes = 160 * personas ese mes
        const totalHoursPerMonth = deptPeoplePerMonth.map(p => HOURS_PER_PERSON_MONTH * p);

        // Coste/Hora = personal cost / horas totales (por mes)
        const costPerHourMonthly = personalCostMonthly.map((v, i) =>
            totalHoursPerMonth[i] > 0 ? fmtCurrency(v / totalHoursPerMonth[i]) : 0
        );

        // Coste/Hora Real = total gastos (con Group) / horas totales (por mes)
        const costPerHourRealMonthly = totalExpWithGroup.map((v, i) =>
            totalHoursPerMonth[i] > 0 ? fmtCurrency(v / totalHoursPerMonth[i]) : 0
        );

        const budgetResultadoMonthly = budgetRevTotals.map((v, i) => fmtCurrency(v - budgetExpWithGroup[i]));

        // Last CLOSED month index (0-indexed). We bill in arrears, so YTD must accumulate
        // up to the previous month, not the current one — otherwise Budget includes the current
        // month (already populated) but Real doesn't (not closed yet), creating a false negative.
        // - Past year (selected < today's year): all 12 months closed → 11
        // - Current year: previous month → today's month - 1 (can be -1 in January)
        // - Future year: no month closed → -1
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonthIdx = today.getMonth();
        const lastClosedMonth =
            year < todayYear ? 11 :
            year > todayYear ? -1 :
            todayMonthIdx - 1;
        const ytdHasClosedMonths = lastClosedMonth >= 0;

        // Determine the effective month range based on the banner month selector
        const bannerEndMonth = bannerMonth === 'ytd' ? lastClosedMonth : (bannerMonth as number);

        // --- Chart Data ---
        const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        // Dynamic YTD range label shown next to Real/Presupuesto when "Acumulado (YTD)" is selected
        const ytdRangeLabel = !ytdHasClosedMonths
            ? ''
            : lastClosedMonth === 0
                ? MONTH_SHORT[0]
                : `de ${MONTH_SHORT[0]} a ${MONTH_SHORT[lastClosedMonth]}`;
        const showYtdRange = bannerMonth === 'ytd' && !!ytdRangeLabel;

        // 1) Ventas vs Gastos bar chart data
        const salesVsExpenseData = MONTH_SHORT.map((m, i) => ({
            name: m,
            Ventas: fmtCurrency(revTotals[i]),
            Gastos: fmtCurrency(totalExpWithGroup[i]),
        }));

        // 2) Dept % of total general billing per month
        const deptPctData = MONTH_SHORT.map((m, i) => ({
            name: m,
            [`${deptLabel} %`]: groupPct[i],
        }));

        // 3) Expense trend line data (per category)
        const expenseTrendData = MONTH_SHORT.map((m, i) => {
            const point: Record<string, string | number> = { name: m };
            catMonthly.forEach(cat => {
                point[cat.label] = fmtCurrency(cat.totals[i]);
            });
            point['Group %'] = fmtCurrency(groupCostMonthly[i]);
            point['Total'] = fmtCurrency(totalExpWithGroup[i]);
            return point;
        });

        // Expense category colors
        const expColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

        // === SEPARATE budget comparisons for banner ===
        const isSingleMonth = bannerMonth !== 'ytd';
        const singleMonthIdx = bannerMonth as number;

        // Revenue: real vs budget
        const ytdRevReal = isSingleMonth
            ? revTotals[singleMonthIdx] || 0
            : revTotals.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
        const ytdRevBudget = isSingleMonth
            ? budgetRevTotals[singleMonthIdx] || 0
            : budgetRevTotals.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
        const ytdRevDiff = fmtCurrency(ytdRevReal - ytdRevBudget);
        const ytdRevPct = ytdRevBudget !== 0 ? fmtCurrency((ytdRevDiff / Math.abs(ytdRevBudget)) * 100) : 0;
        const revOk = ytdRevDiff >= 0;

        // Expenses: real vs budget (for expenses, LOWER is better)
        const ytdExpReal = isSingleMonth
            ? totalExpWithGroup[singleMonthIdx] || 0
            : totalExpWithGroup.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
        const ytdExpBudget = isSingleMonth
            ? budgetExpWithGroup[singleMonthIdx] || 0
            : budgetExpWithGroup.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
        const ytdExpDiff = fmtCurrency(ytdExpReal - ytdExpBudget);
        const ytdExpPct = ytdExpBudget !== 0 ? fmtCurrency((ytdExpDiff / Math.abs(ytdExpBudget)) * 100) : 0;
        const expOk = ytdExpDiff <= 0; // expenses below budget = good

        // Net result
        const ytdResultReal = isSingleMonth
            ? resultadoMonthly[singleMonthIdx] || 0
            : resultadoMonthly.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
        const ytdResultBudget = isSingleMonth
            ? budgetResultadoMonthly[singleMonthIdx] || 0
            : budgetResultadoMonthly.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
        const ytdResultDiff = fmtCurrency(ytdResultReal - ytdResultBudget);
        const resultOk = ytdResultDiff >= 0;

        const bannerPeriodLabel = bannerMonth === 'ytd' ? 'YTD' : MONTHS[bannerMonth as number];

        // Custom tooltip formatter
        const currencyFormatter = (value: any) =>
            Math.round(Number(value || 0)).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

        return (
            <div className="space-y-6 px-4 pb-6 pt-4">
                {/* === BUDGET ALERT BANNER — 3 panels === */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {/* Header with month selector */}
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">📊 Rendimiento vs Presupuesto</span>
                            <span className="text-xs text-gray-400">({bannerPeriodLabel})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-gray-400" />
                            <select
                                value={bannerMonth === 'ytd' ? 'ytd' : bannerMonth}
                                onChange={(e) => setBannerMonth(e.target.value === 'ytd' ? 'ytd' : Number(e.target.value))}
                                className="text-xs font-medium rounded-lg px-2 py-1.5 border border-gray-200 bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                <option value="ytd">Acumulado (YTD)</option>
                                {MONTHS.map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* YTD fallback: no closed months yet (January of current year, or future year) */}
                    {bannerMonth === 'ytd' && !ytdHasClosedMonths ? (
                        <div className="p-8 text-center text-sm text-gray-500">
                            Sin meses cerrados aún
                        </div>
                    ) : (
                    /* 3-panel grid */
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                        {/* Ingresos vs Presupuesto */}
                        <div className={`p-4 ${revOk ? 'bg-emerald-50/50' : 'bg-red-50/40'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {revOk ? <TrendingUp size={16} className="text-emerald-600" /> : <TrendingDown size={16} className="text-red-500" />}
                                <span className="text-xs font-bold text-gray-700">Ingresos</span>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                        Real
                                        {showYtdRange && <span className="ml-1 text-[10px] text-gray-400 font-normal">({ytdRangeLabel})</span>}
                                    </span>
                                    <span className="font-bold text-gray-900">{fmtDisplay(ytdRevReal)} €</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                        Presupuesto
                                        {showYtdRange && <span className="ml-1 text-[10px] text-gray-400 font-normal">({ytdRangeLabel})</span>}
                                    </span>
                                    <span className="font-medium text-gray-600">{fmtDisplay(ytdRevBudget)} €</span>
                                </div>
                                <div className={`flex justify-between text-xs pt-1 border-t ${revOk ? 'border-emerald-200' : 'border-red-200'}`}>
                                    <span className={`font-bold ${revOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {revOk ? '✅ Por encima' : '⚠️ Por debajo'}
                                    </span>
                                    <span className={`font-bold ${revOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {ytdRevDiff > 0 ? '+' : ''}{fmtDisplay(ytdRevDiff)} € ({ytdRevPct > 0 ? '+' : ''}{ytdRevPct}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Gastos vs Presupuesto */}
                        <div className={`p-4 ${expOk ? 'bg-emerald-50/50' : 'bg-red-50/40'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {expOk ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-500" />}
                                <span className="text-xs font-bold text-gray-700">Gastos</span>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                        Real
                                        {showYtdRange && <span className="ml-1 text-[10px] text-gray-400 font-normal">({ytdRangeLabel})</span>}
                                    </span>
                                    <span className="font-bold text-gray-900">{fmtDisplay(ytdExpReal)} €</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                        Presupuesto
                                        {showYtdRange && <span className="ml-1 text-[10px] text-gray-400 font-normal">({ytdRangeLabel})</span>}
                                    </span>
                                    <span className="font-medium text-gray-600">{fmtDisplay(ytdExpBudget)} €</span>
                                </div>
                                <div className={`flex justify-between text-xs pt-1 border-t ${expOk ? 'border-emerald-200' : 'border-red-200'}`}>
                                    <span className={`font-bold ${expOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {expOk ? '✅ Dentro del presupuesto' : '🚨 Exceden presupuesto'}
                                    </span>
                                    <span className={`font-bold ${expOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {ytdExpDiff > 0 ? '+' : ''}{fmtDisplay(ytdExpDiff)} € ({ytdExpPct > 0 ? '+' : ''}{ytdExpPct}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Resultado Neto */}
                        <div className={`p-4 ${resultOk ? 'bg-emerald-50/70' : 'bg-red-50/60'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {resultOk ? <TrendingUp size={16} className="text-emerald-600" /> : <TrendingDown size={16} className="text-red-500" />}
                                <span className="text-xs font-bold text-gray-700">Resultado Neto</span>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                        Real
                                        {showYtdRange && <span className="ml-1 text-[10px] text-gray-400 font-normal">({ytdRangeLabel})</span>}
                                    </span>
                                    <span className={`font-bold ${ytdResultReal >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtDisplay(ytdResultReal)} €</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                        Presupuesto
                                        {showYtdRange && <span className="ml-1 text-[10px] text-gray-400 font-normal">({ytdRangeLabel})</span>}
                                    </span>
                                    <span className="font-medium text-gray-600">{fmtDisplay(ytdResultBudget)} €</span>
                                </div>
                                <div className={`flex justify-between text-xs pt-1 border-t ${resultOk ? 'border-emerald-200' : 'border-red-200'}`}>
                                    <span className={`font-bold ${resultOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {resultOk ? '✅ Positivo' : '⚠️ Negativo'}
                                    </span>
                                    <span className={`font-bold ${resultOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {ytdResultDiff > 0 ? '+' : ''}{fmtDisplay(ytdResultDiff)} €
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Detalle por mes (chips) — ocultado a petición */}
                </div>

                {/* === SUMMARY TABLE (FIRST) === */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <h3 className="text-sm font-bold text-gray-800 px-5 pt-4 pb-2">📋 Resumen Mensual</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '1200px' }}>
                            <thead>
                                <tr className="bg-white">
                                    <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '180px' }}>Concepto</th>
                                    {MONTHS.map((month, i) => (
                                        <th key={i} className="border border-gray-300 px-1 py-2 text-center font-medium text-xs" style={{ width: '70px', minWidth: '70px' }}>
                                            {month}
                                        </th>
                                    ))}
                                    <th className="border border-gray-300 px-1 py-2 text-center font-semibold text-xs bg-gray-100" style={{ width: '90px', minWidth: '90px' }}>
                                        Anual
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Facturación */}
                                <tr className="bg-purple-100">
                                    <td className="border border-purple-300 px-2 py-2 font-bold text-purple-900 text-xs">
                                        Facturación
                                    </td>
                                    {revTotals.map((val, i) => (
                                        <td key={i} className="border border-purple-300 px-1 py-2 text-right font-semibold text-purple-800 tabular-nums">
                                            {fmtDisplay(val)}
                                        </td>
                                    ))}
                                    <td className="border border-purple-300 px-1 py-2 text-right font-bold text-purple-900 tabular-nums">
                                        {fmtDisplay(revAnual)}
                                    </td>
                                </tr>

                                {/* Spacer */}
                                <tr><td colSpan={14} className="py-1 bg-white border-0"></td></tr>

                                {/* Expense breakdown rows */}
                                {catMonthly.map((cat, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700">
                                            {cat.label}
                                        </td>
                                        {cat.totals.map((val, i) => (
                                            <td key={i} className="border border-gray-200 px-1 py-1.5 text-right text-xs text-red-600 tabular-nums">
                                                {val ? fmtDisplay(val) : <span className="text-gray-300">0</span>}
                                            </td>
                                        ))}
                                        <td className="border border-gray-200 px-1 py-1.5 text-right text-xs font-medium text-red-700 bg-gray-50 tabular-nums">
                                            {fmtDisplay(fmtCurrency(cat.totals.reduce((a, b) => a + b, 0)))}
                                        </td>
                                    </tr>
                                ))}

                                {/* Total Gastos (without Group) */}
                                <tr className="bg-orange-100">
                                    <td className="border border-orange-300 px-2 py-1.5 font-bold text-orange-900 text-xs">
                                        Total Gastos Directos
                                    </td>
                                    {totalExpMonthly.map((val, i) => (
                                        <td key={i} className="border border-orange-300 px-1 py-1.5 text-right font-semibold text-orange-800 tabular-nums">
                                            {fmtDisplay(val)}
                                        </td>
                                    ))}
                                    <td className="border border-orange-300 px-1 py-1.5 text-right font-bold text-orange-900 tabular-nums">
                                        {fmtDisplay(fmtCurrency(totalExpMonthly.reduce((a, b) => a + b, 0)))}
                                    </td>
                                </tr>

                                {/* Spacer */}
                                <tr><td colSpan={14} className="py-1 bg-white border-0"></td></tr>

                                {/* Group % row */}
                                <tr className="bg-indigo-50">
                                    <td className="border border-indigo-200 px-2 py-1.5 text-xs font-semibold text-indigo-800">
                                        Group % <span className="font-normal text-indigo-500">({deptLabel})</span>
                                    </td>
                                    {groupPct.map((pct, i) => (
                                        <td key={i} className="border border-indigo-200 px-1 py-1.5 text-right text-xs font-medium text-indigo-700 tabular-nums">
                                            {pct > 0 ? `${pct.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                                        </td>
                                    ))}
                                    <td className="border border-indigo-200 px-1 py-1.5 text-right text-xs font-bold text-indigo-800 bg-indigo-100 tabular-nums">
                                        {revAnual > 0 && totalGeneralRevenue.reduce((a, b) => a + b, 0) > 0
                                            ? `${fmtCurrency((revAnual / totalGeneralRevenue.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%`
                                            : '—'}
                                    </td>
                                </tr>

                                {/* Group cost row (allocated general expenses) */}
                                <tr className="bg-indigo-50/50">
                                    <td className="border border-indigo-200 px-2 py-1.5 text-xs font-medium text-indigo-700">
                                        Gastos Generales (Group)
                                    </td>
                                    {groupCostMonthly.map((val, i) => (
                                        <td key={i} className="border border-indigo-200 px-1 py-1.5 text-right text-xs text-red-600 tabular-nums">
                                            {val > 0 ? fmtDisplay(val) : <span className="text-gray-300">0</span>}
                                        </td>
                                    ))}
                                    <td className="border border-indigo-200 px-1 py-1.5 text-right text-xs font-medium text-red-700 bg-indigo-100 tabular-nums">
                                        {fmtDisplay(fmtCurrency(groupCostMonthly.reduce((a, b) => a + b, 0)))}
                                    </td>
                                </tr>

                                {/* Spacer */}
                                <tr><td colSpan={14} className="py-1 bg-white border-0"></td></tr>

                                {/* EBITDA (= Resultado before financial items) */}
                                <tr className="bg-green-100">
                                    <td className="border border-green-400 px-2 py-2 font-bold text-green-900 text-sm">
                                        EBITDA
                                    </td>
                                    {resultadoMonthly.map((val, i) => (
                                        <td key={i} className={`border border-green-400 px-1 py-2 text-right font-bold tabular-nums ${val >= 0 ? 'text-green-800' : 'text-red-600'}`}>
                                            {fmtDisplay(val)}
                                        </td>
                                    ))}
                                    <td className={`border border-green-400 px-1 py-2 text-right font-bold text-sm tabular-nums ${resultadoAnual >= 0 ? 'text-green-900' : 'text-red-600'}`}>
                                        {fmtDisplay(resultadoAnual)}
                                    </td>
                                </tr>

                                {/* EBITDA % */}
                                <tr className="bg-green-50">
                                    <td className="border border-green-300 px-2 py-1.5 text-xs font-semibold text-green-800">
                                        EBITDA %
                                    </td>
                                    {resultadoMonthly.map((val, i) => {
                                        const pct = revTotals[i] > 0 ? (val / revTotals[i]) * 100 : 0;
                                        return (
                                            <td key={i} className={`border border-green-300 px-1 py-1.5 text-right text-xs font-medium tabular-nums ${pct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                                {pct !== 0 ? `${pct.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                                            </td>
                                        );
                                    })}
                                    <td className={`border border-green-300 px-1 py-1.5 text-right text-xs font-bold bg-green-100 tabular-nums ${revAnual > 0 && resultadoAnual >= 0 ? 'text-green-800' : 'text-red-600'}`}>
                                        {revAnual > 0 ? `${((resultadoAnual / revAnual) * 100).toFixed(1)}%` : '—'}
                                    </td>
                                </tr>

                                {/* Spacer */}
                                <tr><td colSpan={14} className="py-1 bg-white border-0"></td></tr>

                                {/* Ingresos financieros = total facturación del departamento */}
                                <tr className="bg-emerald-50/60 hover:bg-emerald-50">
                                    <td className="border border-emerald-200 px-2 py-1.5 text-xs font-semibold text-emerald-800">
                                        Ingresos financieros
                                    </td>
                                    {revTotals.map((val, i) => (
                                        <td key={i} className={`border border-emerald-200 px-1 py-1.5 text-right text-xs font-medium tabular-nums ${val > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
                                            {val > 0 ? fmtDisplay(val) : '0'}
                                        </td>
                                    ))}
                                    <td className="border border-emerald-200 px-1 py-1.5 text-right text-xs font-bold text-emerald-800 bg-emerald-100 tabular-nums">
                                        {fmtDisplay(revAnual)}
                                    </td>
                                </tr>

                                {/* Gastos financieros = total gastos del departamento */}
                                <tr className="bg-red-50/60 hover:bg-red-50">
                                    <td className="border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-800">
                                        Gastos financieros
                                    </td>
                                    {totalExpWithGroup.map((val, i) => (
                                        <td key={i} className={`border border-red-200 px-1 py-1.5 text-right text-xs font-medium tabular-nums ${val > 0 ? 'text-red-700' : 'text-gray-300'}`}>
                                            {val > 0 ? fmtDisplay(val) : '0'}
                                        </td>
                                    ))}
                                    <td className="border border-red-200 px-1 py-1.5 text-right text-xs font-bold text-red-800 bg-red-100 tabular-nums">
                                        {fmtDisplay(fmtCurrency(totalExpWithGroup.reduce((a, b) => a + b, 0)))}
                                    </td>
                                </tr>

                                {/* Spacer */}
                                <tr><td colSpan={14} className="py-1 bg-white border-0"></td></tr>

                                {/* Resultado Final */}
                                <tr className="bg-blue-100">
                                    <td className="border border-blue-400 px-2 py-2 font-bold text-blue-900 text-sm">
                                        Resultado Final
                                    </td>
                                    {resultadoMonthly.map((val, i) => (
                                        <td key={i} className={`border border-blue-400 px-1 py-2 text-right font-bold tabular-nums ${val >= 0 ? 'text-blue-800' : 'text-red-600'}`}>
                                            {fmtDisplay(val)}
                                        </td>
                                    ))}
                                    <td className={`border border-blue-400 px-1 py-2 text-right font-bold text-sm tabular-nums ${resultadoAnual >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
                                        {fmtDisplay(resultadoAnual)}
                                    </td>
                                </tr>

                                {/* Spacer */}
                                <tr><td colSpan={14} className="py-1 bg-white border-0"></td></tr>

                                {/* === COST PER HOUR SECTION === */}
                                {/* Personas en el Departamento */}
                                <tr className="bg-cyan-50">
                                    <td className="border border-cyan-300 px-2 py-1.5 text-xs font-semibold text-cyan-800">
                                        👥 Personas en el Departamento
                                    </td>
                                    {deptPeoplePerMonth.map((count, i) => (
                                        <td key={i} className="border border-cyan-300 px-1 py-1.5 text-right text-xs font-medium text-cyan-700 tabular-nums">
                                            {count > 0 ? count : <span className="text-gray-300">—</span>}
                                        </td>
                                    ))}
                                    <td className="border border-cyan-300 px-1 py-1.5 text-right text-xs font-bold text-cyan-800 bg-cyan-100 tabular-nums">
                                        {(() => {
                                            const maxPeople = Math.max(...deptPeoplePerMonth);
                                            return maxPeople > 0 ? `${maxPeople} máx` : '—';
                                        })()}
                                    </td>
                                </tr>

                                {/* Coste/Hora (solo personal) */}
                                <tr className="bg-cyan-50/70">
                                    <td className="border border-cyan-200 px-2 py-1.5 text-xs font-medium text-cyan-700">
                                        Coste/Hora <span className="font-normal text-cyan-500">(Personal)</span>
                                    </td>
                                    {costPerHourMonthly.map((val, i) => (
                                        <td key={i} className="border border-cyan-200 px-1 py-1.5 text-right text-xs font-medium text-cyan-700 tabular-nums">
                                            {val > 0 ? `${fmtDisplay(val)} €` : <span className="text-gray-300">—</span>}
                                        </td>
                                    ))}
                                    <td className="border border-cyan-200 px-1 py-1.5 text-right text-xs font-bold text-cyan-800 bg-cyan-100 tabular-nums">
                                        {(() => {
                                            const totalPersonal = personalCostMonthly.reduce((a, b) => a + b, 0);
                                            const totalHoursYear = totalHoursPerMonth.reduce((a, b) => a + b, 0);
                                            return totalHoursYear > 0 ? `${fmtDisplay(fmtCurrency(totalPersonal / totalHoursYear))} €` : '—';
                                        })()}
                                    </td>
                                </tr>

                                {/* Horas Totales */}
                                <tr className="bg-cyan-50/50">
                                    <td className="border border-cyan-200 px-2 py-1.5 text-xs font-medium text-cyan-700">
                                        Horas Totales <span className="font-normal text-cyan-500">({HOURS_PER_PERSON_MONTH}h/persona)</span>
                                    </td>
                                    {totalHoursPerMonth.map((hours, i) => (
                                        <td key={i} className="border border-cyan-200 px-1 py-1.5 text-right text-xs font-medium text-cyan-700 tabular-nums">
                                            {hours > 0 ? fmtDisplay(hours) : <span className="text-gray-300">—</span>}
                                        </td>
                                    ))}
                                    <td className="border border-cyan-200 px-1 py-1.5 text-right text-xs font-bold text-cyan-800 bg-cyan-100 tabular-nums">
                                        {(() => {
                                            const totalHoursYear = totalHoursPerMonth.reduce((a, b) => a + b, 0);
                                            return totalHoursYear > 0 ? fmtDisplay(totalHoursYear) : '—';
                                        })()}
                                    </td>
                                </tr>

                                {/* Coste/Hora Real (todos los gastos) */}
                                <tr className="bg-cyan-100">
                                    <td className="border border-cyan-400 px-2 py-2 font-bold text-cyan-900 text-xs">
                                        💰 Coste/Hora Real
                                    </td>
                                    {costPerHourRealMonthly.map((val, i) => (
                                        <td key={i} className={`border border-cyan-400 px-1 py-2 text-right font-bold text-xs tabular-nums ${val > 0 ? 'text-cyan-800' : 'text-gray-300'}`}>
                                            {val > 0 ? `${fmtDisplay(val)} €` : '—'}
                                        </td>
                                    ))}
                                    <td className="border border-cyan-400 px-1 py-2 text-right font-bold text-xs text-cyan-900 bg-cyan-200 tabular-nums">
                                        {(() => {
                                            const totalExp = totalExpWithGroup.reduce((a, b) => a + b, 0);
                                            const totalHoursYear = totalHoursPerMonth.reduce((a, b) => a + b, 0);
                                            return totalHoursYear > 0 ? `${fmtDisplay(fmtCurrency(totalExp / totalHoursYear))} €` : '—';
                                        })()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* === NUTFRUIT BUDGET (Imcontent only) === */}
                {deptCode === 'imcontent' && <NutfruitBudget year={year} />}

                {/* === ICEX BUDGET (Immedia only) === */}
                {deptCode === 'immedia' && <IcexBudget year={year} />}

                {/* === CHARTS GRID (AFTER SUMMARY TABLE) === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Chart 1: Ventas vs Gastos */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                            <div className="h-9 w-9 rounded-xl bg-violet-50 flex items-center justify-center">
                                <TrendingUp size={16} className="text-violet-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold tracking-tight text-foreground">Ventas vs Gastos</h3>
                                <p className="text-[11px] text-muted-foreground">Comparativa mensual del ejercicio {year}</p>
                            </div>
                        </div>
                        <div className="px-2 pb-4">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={salesVsExpenseData} barGap={4} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="barVentas" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.55} />
                                        </linearGradient>
                                        <linearGradient id="barGastos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#fb923c" stopOpacity={1} />
                                            <stop offset="100%" stopColor="#fb923c" stopOpacity={0.55} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={42} />
                                    <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} content={<PremiumTooltip formatter={currencyFormatter} />} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: 8 }} />
                                    <Bar dataKey="Ventas" fill="url(#barVentas)" radius={[6, 6, 0, 0]} maxBarSize={26} />
                                    <Bar dataKey="Gastos" fill="url(#barGastos)" radius={[6, 6, 0, 0]} maxBarSize={26} />
                                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart 2: Dept % of Total General Billing */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                            <div className="h-9 w-9 rounded-xl bg-sky-50 flex items-center justify-center">
                                <TrendingUp size={16} className="text-sky-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold tracking-tight text-foreground">Peso de {deptLabel}</h3>
                                <p className="text-[11px] text-muted-foreground">% sobre la facturación total del grupo</p>
                            </div>
                        </div>
                        <div className="px-2 pb-4">
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={deptPctData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="billingGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit="%" domain={[0, 'auto']} axisLine={false} tickLine={false} width={42} />
                                    <Tooltip content={<PremiumTooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />} />
                                    <Area type="monotone" dataKey={`${deptLabel} %`} stroke="#0ea5e9" fill="url(#billingGrad)" strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart 3: Expense Trend Line */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden lg:col-span-2">
                        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                            <div className="h-9 w-9 rounded-xl bg-rose-50 flex items-center justify-center">
                                <TrendingDown size={16} className="text-rose-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold tracking-tight text-foreground">Tendencia de gastos por categoría</h3>
                                <p className="text-[11px] text-muted-foreground">Evolución mensual y total de gastos</p>
                            </div>
                        </div>
                        <div className="px-2 pb-4">
                            <ResponsiveContainer width="100%" height={320}>
                                <LineChart data={expenseTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={42} />
                                    <Tooltip content={<PremiumTooltip formatter={currencyFormatter} />} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: 8 }} />
                                    {catMonthly.map((cat, idx) => (
                                        <Line
                                            key={cat.label}
                                            type="monotone"
                                            dataKey={cat.label}
                                            stroke={expColors[idx % expColors.length]}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                                        />
                                    ))}
                                    <Line type="monotone" dataKey="Group %" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                                    <Line type="monotone" dataKey="Total" stroke="#0f172a" strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- Calculate totals for Real/Presupuesto view ---
    const ingresosTotals = calculateSectionTotal('revenue', deptRevenue);
    const ingresosAnual = ingresosTotals.reduce((a, b) => a + b, 0);

    // Group Cost for the active tab (either Real or Presupuesto)
    const activeTabSource =
        activeTab === 'Presupuesto' ? compBudgetValues :
        activeTab === 'Forecast' ? compEstimatedValues :
        compRealValues;
    const activeTabGroupCost = calculateGroupCost(activeTabSource);
    const activeTabGroupCostAnual = activeTabGroupCost.reduce((a, b) => a + b, 0);

    const gastosTotals = Array(12).fill(0);
    expCats.forEach(cat => {
        const totals = calculateSectionTotal(cat.key, cat.items);
        totals.forEach((v, i) => gastosTotals[i] += v);
    });
    // Add Group Cost to the total expenses!
    activeTabGroupCost.forEach((v, i) => gastosTotals[i] += v);

    const gastosAnual = gastosTotals.reduce((a, b) => a + b, 0);

    const ebitdaTotals = ingresosTotals.map((v, i) => v - gastosTotals[i]);
    const ebitdaAnual = ingresosAnual - gastosAnual;

    // --- Header (shared across all tabs) ---
    // ── Export helpers (Real/Presupuesto/Forecast/Comparación) ────────────────
    const tabLabel = (): string => {
        if (activeTab === 'Real') return 'Real';
        if (activeTab === 'Presupuesto') return 'Presupuesto';
        if (activeTab === 'Forecast') return 'Forecast';
        if (activeTab === 'Comparación') return 'Comparacion';
        return String(activeTab);
    };

    const exportFileBase = () => `PL_${deptLabel}_${tabLabel()}_${year}`;

    // Construye filas para Real/Presupuesto/Forecast a partir del estado actual
    type ExportRow = { section: string; dept: string; item: string; values: number[]; total: number; bold?: boolean };
    const buildExportRowsSingle = (): ExportRow[] => {
        const rows: ExportRow[] = [];
        // Cabecera Ingresos
        rows.push({ section: 'INGRESOS DE EXPLOTACIÓN', dept: '', item: '', values: ingresosTotals, total: ingresosAnual, bold: true });
        deptRevenue.forEach(g => g.services.forEach(s => {
            const values = MONTHS.map((_, i) => getCellValue('revenue', g.dept, s, i));
            rows.push({ section: 'Ingresos', dept: g.dept, item: s, values, total: values.reduce((a, b) => a + b, 0) });
        }));
        // Gastos
        rows.push({ section: 'GASTOS DE EXPLOTACIÓN', dept: '', item: '', values: gastosTotals, total: gastosAnual, bold: true });
        expCats.forEach(cat => {
            cat.items.forEach(grp => grp.items.forEach(it => {
                const values = MONTHS.map((_, i) => getCellValue(cat.key, grp.dept, it, i));
                rows.push({ section: cat.label, dept: grp.dept, item: it, values, total: values.reduce((a, b) => a + b, 0) });
            }));
        });
        if (!isGroupCostExempt) {
            rows.push({ section: 'Group (Immoral %)', dept: 'Immoral', item: 'Group cost', values: activeTabGroupCost, total: activeTabGroupCostAnual });
        }
        // EBITDA
        rows.push({ section: 'EBITDA', dept: '', item: '', values: ebitdaTotals, total: ebitdaAnual, bold: true });
        return rows;
    };

    // Comparación: filas con sub-filas Real / Presup / Dif
    type CompRow = { label: string; real: number[]; budget: number[]; diff: number[]; isExpense?: boolean };
    const buildComparisonRows = (): CompRow[] => {
        const realRev = calcCompSectionTotal(compRealValues, 'revenue', deptRevenue);
        const budRev = calcCompSectionTotal(compBudgetValues, 'revenue', deptRevenue);
        const rows: CompRow[] = [];
        rows.push({
            label: 'INGRESOS',
            real: realRev, budget: budRev,
            diff: realRev.map((v, i) => v - budRev[i]),
        });
        const realExp = Array(12).fill(0);
        const budExp = Array(12).fill(0);
        expCats.forEach(cat => {
            calcCompSectionTotal(compRealValues, cat.key, cat.items).forEach((v, i) => realExp[i] += v);
            calcCompSectionTotal(compBudgetValues, cat.key, cat.items).forEach((v, i) => budExp[i] += v);
        });
        const realGC = calculateGroupCost(compRealValues);
        const budGC = calculateGroupCost(compBudgetValues);
        realGC.forEach((v, i) => realExp[i] += v);
        budGC.forEach((v, i) => budExp[i] += v);
        rows.push({
            label: 'GASTOS',
            real: realExp, budget: budExp,
            diff: realExp.map((v, i) => v - budExp[i]),
            isExpense: true,
        });
        const realEb = realRev.map((v, i) => v - realExp[i]);
        const budEb = budRev.map((v, i) => v - budExp[i]);
        rows.push({
            label: 'EBITDA',
            real: realEb, budget: budEb,
            diff: realEb.map((v, i) => v - budEb[i]),
        });
        return rows;
    };

    const handleExportCSV = () => {
        const BOM = '﻿';
        const headers = ['Sección', 'Depto', 'Concepto', ...MONTHS, 'Anual'];
        let body: (string | number)[][] = [];
        if (activeTab === 'Comparación') {
            const cRows = buildComparisonRows();
            cRows.forEach(r => {
                body.push([r.label, '', 'Real', ...r.real.map(v => Math.round(v)), Math.round(r.real.reduce((a, b) => a + b, 0))]);
                body.push(['', '', 'Presupuesto', ...r.budget.map(v => Math.round(v)), Math.round(r.budget.reduce((a, b) => a + b, 0))]);
                body.push(['', '', 'Diferencia', ...r.diff.map(v => Math.round(v)), Math.round(r.diff.reduce((a, b) => a + b, 0))]);
            });
        } else {
            const rows = buildExportRowsSingle();
            body = rows.map(r => [r.section, r.dept, r.item, ...r.values.map(v => Math.round(v)), Math.round(r.total)]);
        }
        const csv = BOM + [headers, ...body]
            .map(row => row.map(c => {
                const s = String(c);
                return (s.includes(';') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(';'))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportFileBase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exportado: ${a.download}`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`P&L ${deptLabel} — ${tabLabel()} ${year}`, 14, 16);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(`Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, 22);
        doc.setTextColor(0);

        const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const head = [['Sección', 'Depto', 'Concepto', ...MONTHS_SHORT, 'Anual']];
        const body: any[][] = [];
        const boldRows: number[] = [];
        const expenseDiffRows: number[] = [];

        if (activeTab === 'Comparación') {
            const cRows = buildComparisonRows();
            cRows.forEach(r => {
                boldRows.push(body.length);
                body.push([r.label, '', 'Real',
                    ...r.real.map(v => Math.round(v).toLocaleString('de-DE')),
                    Math.round(r.real.reduce((a, b) => a + b, 0)).toLocaleString('de-DE')]);
                body.push(['', '', 'Presupuesto',
                    ...r.budget.map(v => Math.round(v).toLocaleString('de-DE')),
                    Math.round(r.budget.reduce((a, b) => a + b, 0)).toLocaleString('de-DE')]);
                if (r.isExpense) expenseDiffRows.push(body.length);
                body.push(['', '', 'Diferencia',
                    ...r.diff.map(v => Math.round(v).toLocaleString('de-DE')),
                    Math.round(r.diff.reduce((a, b) => a + b, 0)).toLocaleString('de-DE')]);
            });
        } else {
            const rows = buildExportRowsSingle();
            rows.forEach((r, idx) => {
                if (r.bold) boldRows.push(idx);
                body.push([r.section, r.dept, r.item,
                    ...r.values.map(v => Math.round(v).toLocaleString('de-DE')),
                    Math.round(r.total).toLocaleString('de-DE')]);
            });
        }

        autoTable(doc, {
            startY: 26,
            head, body,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5, halign: 'right' },
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'right' },
            columnStyles: {
                0: { halign: 'left', cellWidth: 32, fontStyle: 'bold' },
                1: { halign: 'left', cellWidth: 22 },
                2: { halign: 'left', cellWidth: 38 },
                15: { fillColor: [239, 246, 255], fontStyle: 'bold' },
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    if (boldRows.includes(data.row.index)) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [224, 231, 255];
                    }
                }
                if (data.section === 'head' && (data.column.index === 0 || data.column.index === 1 || data.column.index === 2)) {
                    data.cell.styles.halign = 'left';
                }
            },
        });
        doc.save(`${exportFileBase()}.pdf`);
        toast.success(`Descargado: ${exportFileBase()}.pdf`);
    };

    const renderHeader = (title: string) => (
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-4">
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {title}
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
                                <InfoIcon size={15} />
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
                    {activeTab === 'Real' && (
                        <span className="relative inline-flex items-center">
                            {!realDetailInfoSeen && (
                                <span className="absolute -inset-1 rounded-full bg-indigo-400/40 animate-ping pointer-events-none" />
                            )}
                            <button
                                onClick={openRealDetailInfo}
                                title="Nuevo: clic en ingresos para ver detalle"
                                className="relative inline-flex items-center justify-center h-6 w-6 rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors bg-white"
                            >
                                <InfoIcon size={15} />
                            </button>
                            {!realDetailInfoSeen && (
                                <NewFeatureBubble
                                    title="Clic en los ingresos"
                                    description="Tildea un monto de ingreso para ver qué clientes lo componen"
                                    onDismiss={() => { localStorage.setItem('real_billing_detail_seen_v1', '1'); setRealDetailInfoSeen(true); }}
                                    align="start"
                                />
                            )}
                        </span>
                    )}
                    {activeTab === 'Facturación' && (
                        <span className="relative inline-flex items-center">
                            {!facturacionInfoSeen && (
                                <span className="absolute -inset-1 rounded-full bg-indigo-400/40 animate-ping pointer-events-none" />
                            )}
                            <button
                                onClick={openFacturacionInfo}
                                title="Qué es Facturación"
                                className="relative inline-flex items-center justify-center h-6 w-6 rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors bg-white"
                            >
                                <InfoIcon size={15} />
                            </button>
                            {!facturacionInfoSeen && (
                                <NewFeatureBubble
                                    title="Detalle de facturación del hub"
                                    description="Vista espejo de Billing Matrix · alterna entre mensual y anual"
                                    onDismiss={() => { localStorage.setItem('facturacion_info_seen_v1', '1'); setFacturacionInfoSeen(true); }}
                                    align="start"
                                />
                            )}
                        </span>
                    )}
                    {(activeTab === 'Forecast' || activeTab === 'Presupuesto') && activeScenario && !isScenarioEmpty(activeScenario) && (
                        <span
                            className="ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow"
                            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                            title={scenarioSummary(activeScenario)}
                        >
                            <Sparkles size={11} />
                            <span>{activeScenario.name || 'Escenario'}</span>
                            <span className="opacity-80 font-normal max-w-[220px] truncate">· {scenarioSummary(activeScenario)}</span>
                            <button
                                onClick={() => setActiveScenario(null)}
                                className="ml-1 h-4 w-4 rounded-full bg-white/20 hover:bg-white/35 inline-flex items-center justify-center"
                                title="Volver a la vista base"
                            >
                                <X size={10} />
                            </button>
                        </span>
                    )}
                </h1>
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    {TABS.map(tab => {
                        const tabHasUnseen =
                            (tab === 'Forecast' && unseenByScope.forecast > 0) ||
                            (tab === 'Presupuesto' && unseenByScope.budget > 0);
                        return (
                            <Button
                                key={tab}
                                variant={activeTab === tab ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab(tab)}
                                className="relative text-xs h-7 px-3"
                            >
                                {tab}
                                {tabHasUnseen && (
                                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" title="Tienes un escenario nuevo en esta pestaña" />
                                )}
                            </Button>
                        );
                    })}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setYear(year - 1)}>
                    ← {year - 1}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setYear(year + 1)}>
                    {year + 1} →
                </Button>
                {(activeTab === 'Forecast' || activeTab === 'Presupuesto') && sharedScenariosCount > 0 && (
                    <Button
                        size="sm"
                        onClick={() => setScenarioOpen(true)}
                        className="relative gap-1 h-7 text-xs text-white border-0 shadow-md ml-2"
                        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                    >
                        <Sparkles size={12} /> Escenarios
                        <span
                            className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-white text-indigo-700 text-[10px] font-bold shadow-sm"
                            title={`${sharedScenariosCount} compartido${sharedScenariosCount > 1 ? 's' : ''}`}
                        >
                            {sharedScenariosCount}
                        </span>
                    </Button>
                )}
                {activeTab !== 'Dashboard' && activeTab !== 'Solicitudes' && activeTab !== 'Facturación' && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="gap-1 ml-2 h-7 text-xs">
                                <Download size={12} />
                                Exportar
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={handleExportCSV} className="gap-2 cursor-pointer">
                                <FileSpreadsheet size={14} className="text-emerald-600" />
                                <span className="text-xs font-medium">Exportar CSV</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
                                <FileText size={14} className="text-rose-600" />
                                <span className="text-xs font-medium">Exportar PDF</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );

    // Shared overlays rendered on every tab
    const renderOverlays = () => (
        <>
            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-[200] bg-white border rounded-lg shadow-lg py-1 w-48 animate-in fade-in zoom-in duration-150"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => {
                            openNoteModal(contextMenu.section, contextMenu.dept, contextMenu.item, contextMenu.monthIdx);
                            setContextMenu(null);
                        }}
                    >
                        <MessageSquare size={14} />
                        {getCellNote(contextMenu.viewType, contextMenu.section === 'revenue' ? 'revenue' : 'expense', contextMenu.dept, contextMenu.item, contextMenu.monthIdx)?.comment
                            ? 'Editar Nota'
                            : 'Insertar Nota'}
                    </button>
                </div>
            )}

            {/* Hover Popover */}
            {hoveredCell && (() => {
                const normalizedSection = hoveredCell.section === 'revenue' ? 'revenue' : 'expense';
                const note = getCellNote(hoveredCell.viewType, normalizedSection, hoveredCell.dept, hoveredCell.item, hoveredCell.monthIdx);
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
                                        <span className="text-xs text-blue-700">{u.display_name || u.email}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">Clic derecho para editar nota</p>
                    </div>
                );
            })()}

            {/* Note Modal */}
            {editingComment && (
                <CommentModal
                    isOpen={editingComment.isOpen}
                    onClose={() => setEditingComment(null)}
                    onSave={handleSaveNote}
                    onStatusChange={(status) => {
                        if (editingComment?.noteId) {
                            noteStatusMutation.mutate({ id: editingComment.noteId, status });
                        }
                        setEditingComment(null);
                    }}
                    initialValue={editingComment.initialValue}
                    initialAssignedTo={editingComment.initialAssignedTo}
                    title={`Nota — ${editingComment.item} (${MONTHS[editingComment.monthIdx]})`}
                    users={users}
                    noteId={editingComment.noteId}
                />
            )}

            {/* Info modals (Real detail + Facturación) */}
            {realDetailInfoOpen && <RealDetailInfoModal onClose={() => setRealDetailInfoOpen(false)} />}
            {facturacionInfoOpen && <FacturacionInfoModal onClose={() => setFacturacionInfoOpen(false)} />}

            {/* Detalle de facturación al hacer click en celda de ingreso (Real) */}
            {revenueDetail && (
                <RevenueCellDetailModal
                    isOpen={!!revenueDetail}
                    onClose={() => setRevenueDetail(null)}
                    year={year}
                    monthIdx={revenueDetail.monthIdx}
                    dept={revenueDetail.dept}
                    serviceName={revenueDetail.service}
                    expectedTotal={revenueDetail.total}
                />
            )}
        </>
    );

    // ── Budget Request helpers ────────────────────────────────────────────────
    const draftKey = (section: string, dept: string, item: string, monthIdx: number) =>
        `${section}|||${dept}|||${item}|||${monthIdx}`;

    const getBudgetCellValue = (section: string, dept: string, item: string, monthIdx: number) => {
        const key = `${section}-${dept}-${item}-${monthIdx}`;
        return compBudgetValues[key] ?? 0;
    };

    const getDraftValue = (section: string, dept: string, item: string, monthIdx: number) => {
        const k = draftKey(section, dept, item, monthIdx);
        return k in draftEdits ? draftEdits[k] : getBudgetCellValue(section, dept, item, monthIdx);
    };

    const setDraftValue = (section: string, dept: string, item: string, monthIdx: number, val: number) => {
        setDraftEdits(prev => ({ ...prev, [draftKey(section, dept, item, monthIdx)]: val }));
    };

    const clearDraft = (section: string, dept: string, item: string, monthIdx: number) => {
        setDraftEdits(prev => {
            const next = { ...prev };
            delete next[draftKey(section, dept, item, monthIdx)];
            return next;
        });
    };

    const handleSubmitRequests = () => {
        const requests: Partial<BudgetRequest>[] = Object.entries(draftEdits)
            .filter(([k]) => {
                // Solo incluir claves del departamento actual
                const [, keyDept] = k.split('|||');
                return deptNames.includes(keyDept);
            })
            .map(([k, requested_value]) => {
                const [section, dept, item, monthIdxStr] = k.split('|||');
                const month_idx = parseInt(monthIdxStr);
                const current_value = getBudgetCellValue(section, dept, item, month_idx);
                const expCat = expCats.find(c => c.key === section);
                return {
                    fiscal_year: year,
                    dept: deptLabel,
                    section,
                    category: section === 'revenue' ? 'Ingresos' : (expCat?.label || section),
                    item,
                    month_idx,
                    current_value,
                    requested_value,
                    reason: requestReason || undefined,
                };
            })
            .filter(r => r.requested_value !== r.current_value);

        if (requests.length === 0) return;
        submitBudgetRequestsMutation.mutate(requests);
    };

    // ── Solicitudes Tab Render ────────────────────────────────────────────────
    const renderSolicitudesTab = () => {
        const fmtEur = (v: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0);

        const statusBadge = (status: string) => {
            if (status === 'approved') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium"><Check size={10} />Aprobado</span>;
            if (status === 'rejected') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium"><X size={10} />Rechazado</span>;
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">⏳ Pendiente</span>;
        };

        const isAdmin = isSuperAdmin();
        const draftCount = Object.keys(draftEdits).length;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth(); // 0-indexed
        const isPastYear = year < currentYear;

        const isMonthLocked = (mIdx: number) => isPastYear || (year === currentYear && mIdx < currentMonth);

        // Secciones agrupadas por categoría: ingresos + cada categoría de gastos
        type SolicitudSection = {
            key: string;
            label: string;
            color: string;
            headerBg: string;
            rows: { section: string; dept: string; item: string }[];
        };

        const sections: SolicitudSection[] = [];

        const revRows = deptRevenue.flatMap(group =>
            (group.services || []).map((item: string) => ({ section: 'revenue', dept: group.dept, item }))
        );
        if (revRows.length > 0) sections.push({ key: 'revenue', label: 'INGRESOS DE EXPLOTACIÓN', color: 'text-purple-800', headerBg: 'bg-purple-100 border-purple-300', rows: revRows });

        expCats.forEach(cat => {
            const rows = cat.items.flatMap((group: { dept: string; items: string[] }) =>
                group.items.map((item: string) => ({ section: cat.key, dept: group.dept, item }))
            );
            if (rows.length > 0) {
                sections.push({ key: cat.key, label: cat.label.toUpperCase(), color: 'text-orange-800', headerBg: 'bg-orange-50 border-orange-200', rows });
            }
        });

        return (
            <div className="px-4 pb-10 space-y-6 max-w-screen-2xl mx-auto">

                {/* ── Panel de revisión (admin) ── */}
                {isAdmin && (
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-slate-100 rounded-lg">
                                    <ClipboardList size={15} className="text-slate-600" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-slate-800 text-sm">Revisión de solicitudes — {deptLabel} {year}</h2>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {budgetRequests.length === 0 ? 'Sin solicitudes' : `${budgetRequests.length} solicitud(es) · ${pendingRequests.length} pendiente(s)`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {pendingRequests.length > 0 && (
                                    <Button
                                        size="sm"
                                        className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1.5 shadow-sm"
                                        onClick={() => approveDeptMutation.mutate()}
                                        disabled={approveDeptMutation.isPending}
                                    >
                                        <Check size={12} />
                                        Aprobar todos ({pendingRequests.length})
                                    </Button>
                                )}
                                {pendingRequests.length > 0 && !showBulkRejectInput && (
                                    <Button
                                        size="sm"
                                        className="h-8 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 gap-1.5"
                                        onClick={() => setShowBulkRejectInput(true)}
                                    >
                                        <X size={12} />
                                        Rechazar todos
                                    </Button>
                                )}
                                {showBulkRejectInput && (
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="text"
                                            placeholder="Motivo del rechazo..."
                                            value={bulkRejectNote}
                                            onChange={e => setBulkRejectNote(e.target.value)}
                                            className="text-xs border border-red-200 rounded px-2 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-red-300"
                                            autoFocus
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') rejectDeptMutation.mutate(bulkRejectNote);
                                                if (e.key === 'Escape') setShowBulkRejectInput(false);
                                            }}
                                        />
                                        <button
                                            className="px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                                            onClick={() => rejectDeptMutation.mutate(bulkRejectNote)}
                                            disabled={rejectDeptMutation.isPending}
                                        >
                                            Confirmar
                                        </button>
                                        <button
                                            className="px-2 py-1.5 rounded hover:bg-slate-100 text-slate-400 text-xs"
                                            onClick={() => setShowBulkRejectInput(false)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                                {budgetRequests.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 gap-1"
                                        onClick={() => {
                                            if (confirm(`¿Eliminar todas las solicitudes de ${deptLabel} en ${year}?`)) {
                                                deleteAllDeptMutation.mutate();
                                            }
                                        }}
                                        disabled={deleteAllDeptMutation.isPending}
                                    >
                                        <Trash2 size={12} />
                                        Eliminar todo
                                    </Button>
                                )}
                            </div>
                        </div>

                        {budgetRequestsLoading && (
                            <div className="px-5 py-6 text-center text-sm text-slate-400">Cargando...</div>
                        )}

                        {!budgetRequestsLoading && budgetRequests.length === 0 && (
                            <div className="px-5 py-8 text-center text-sm text-slate-400">
                                No hay solicitudes para {deptLabel} en {year}.
                            </div>
                        )}

                        {budgetRequests.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Categoría</th>
                                            <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Item</th>
                                            <th className="px-4 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Mes</th>
                                            <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Presupuesto actual</th>
                                            <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Valor solicitado</th>
                                            <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Diferencia</th>
                                            <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Motivo</th>
                                            <th className="px-4 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Estado</th>
                                            <th className="px-4 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Aprobar / Rechazar</th>
                                            <th className="px-4 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Eliminar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {budgetRequests.map(req => {
                                            const diff = req.requested_value - req.current_value;
                                            return (
                                                <tr key={req.id} className={`hover:bg-slate-50 transition-colors ${req.status === 'approved' ? 'opacity-60' : ''}`}>
                                                    <td className="px-4 py-2.5">
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">{req.category}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 font-medium text-slate-800">{req.item}</td>
                                                    <td className="px-4 py-2.5 text-center text-slate-500">{MONTHS[req.month_idx]}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtEur(req.current_value)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-indigo-700">{fmtEur(req.requested_value)}</td>
                                                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                        {diff > 0 ? '+' : ''}{fmtEur(diff)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-500 max-w-[180px]">
                                                        {req.reason ? (
                                                            <span className="italic truncate block" title={req.reason}>"{req.reason}"</span>
                                                        ) : <span className="text-slate-300">—</span>}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">{statusBadge(req.status)}</td>
                                                    <td className="px-4 py-2.5">
                                                        {req.status === 'pending' && (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-medium border border-green-200 transition-colors"
                                                                    onClick={() => approveMutation.mutate(req.id)}
                                                                    disabled={approveMutation.isPending}
                                                                >
                                                                    <Check size={11} /> Aprobar
                                                                </button>
                                                                {rejectNoteId === req.id ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Motivo rechazo..."
                                                                            value={rejectNote}
                                                                            onChange={e => setRejectNote(e.target.value)}
                                                                            className="text-xs border border-red-200 rounded px-1.5 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-red-300"
                                                                            autoFocus
                                                                            onKeyDown={e => {
                                                                                if (e.key === 'Enter') rejectMutation.mutate({ id: req.id, notes: rejectNote });
                                                                                if (e.key === 'Escape') setRejectNoteId(null);
                                                                            }}
                                                                        />
                                                                        <button className="p-1 text-red-600 hover:bg-red-50 rounded" onClick={() => rejectMutation.mutate({ id: req.id, notes: rejectNote })}>
                                                                            <Check size={11} />
                                                                        </button>
                                                                        <button className="p-1 text-slate-400 hover:bg-slate-100 rounded" onClick={() => setRejectNoteId(null)}>
                                                                            <X size={11} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-medium border border-red-200 transition-colors"
                                                                        onClick={() => setRejectNoteId(req.id)}
                                                                    >
                                                                        <X size={11} /> Rechazar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {req.status !== 'pending' && req.review_notes && (
                                                            <span className="text-slate-400 text-[10px] italic">"{req.review_notes}"</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <button
                                                            className="p-1.5 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                                                            title="Eliminar solicitud"
                                                            onClick={() => {
                                                                if (confirm(`¿Eliminar la solicitud de "${req.item}"?`)) {
                                                                    deleteRequestMutation.mutate(req.id);
                                                                }
                                                            }}
                                                            disabled={deleteRequestMutation.isPending}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Editor de borrador ── */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b bg-gradient-to-r from-indigo-50 to-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-indigo-100 rounded-lg">
                                <Send size={14} className="text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-slate-800 text-sm">Nueva solicitud de cambio — {deptLabel} {year}</h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Los valores mostrados son el <strong className="text-slate-500">presupuesto aprobado actual</strong>. Edita las celdas que quieras cambiar y envía la solicitud.
                                    {isPastYear && <span className="ml-1 text-amber-500 font-medium">· Año pasado — solo lectura.</span>}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {draftCount > 0 && (
                                <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                    {draftCount} cambio{draftCount !== 1 ? 's' : ''} sin enviar
                                </span>
                            )}
                            {submitSuccess && (
                                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                    <Check size={11} /> Solicitud enviada
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '1200px' }}>
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-100 border-b border-slate-300">
                                    <th className="border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-600 text-[10px] uppercase tracking-wide" style={{ width: '140px' }}>Item</th>
                                    {MONTHS.map((m, i) => {
                                        const locked = isMonthLocked(i);
                                        return (
                                            <th key={i} className={`px-1 py-2 text-center font-semibold text-[10px] uppercase tracking-wide ${locked ? 'text-slate-300 bg-slate-50' : 'text-slate-600'}`} style={{ minWidth: '72px' }}>
                                                {m.substring(0, 3)}
                                                {locked && <span className="block text-[8px] font-normal text-slate-300">🔒</span>}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {sections.map(sec => (
                                    <React.Fragment key={sec.key}>
                                        {/* Cabecera de sección */}
                                        <tr>
                                            <td colSpan={13} className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-t-2 ${sec.headerBg} ${sec.color}`}>
                                                {sec.label}
                                            </td>
                                        </tr>
                                        {sec.rows.map((row, rowIdx) => {
                                            const rowHasDraft = MONTHS.some((_, mIdx) => {
                                                const k = draftKey(row.section, row.dept, row.item, mIdx);
                                                return k in draftEdits && draftEdits[k] !== getBudgetCellValue(row.section, row.dept, row.item, mIdx);
                                            });
                                            return (
                                                <tr key={rowIdx} className={`border-b border-slate-50 ${rowHasDraft ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'} transition-colors`}>
                                                    <td className="border-r border-slate-100 px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap">{row.item}</td>
                                                    {MONTHS.map((_, mIdx) => {
                                                        const locked = isMonthLocked(mIdx);
                                                        const current = getBudgetCellValue(row.section, row.dept, row.item, mIdx);
                                                        const k = draftKey(row.section, row.dept, row.item, mIdx);
                                                        const isDirty = k in draftEdits && draftEdits[k] !== current;
                                                        const displayVal = getDraftValue(row.section, row.dept, row.item, mIdx);

                                                        if (locked) {
                                                            return (
                                                                <td key={mIdx} className="px-1 py-1.5 text-right tabular-nums text-slate-300 bg-slate-50/50 select-none" title="Mes cerrado">
                                                                    {current > 0 ? fmtEur(current) : <span className="text-slate-200">—</span>}
                                                                </td>
                                                            );
                                                        }

                                                        return (
                                                            <td key={mIdx} className={`px-0.5 py-0.5 ${isDirty ? 'bg-indigo-100 ring-1 ring-inset ring-indigo-300' : ''}`}>
                                                                <div className="relative group">
                                                                    {isDirty && (
                                                                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 z-10" />
                                                                    )}
                                                                    <input
                                                                        type="number"
                                                                        value={displayVal || ''}
                                                                        onChange={e => {
                                                                            const v = parseFloat(e.target.value) || 0;
                                                                            setDraftValue(row.section, row.dept, row.item, mIdx, v);
                                                                        }}
                                                                        onFocus={e => { if (!draftEdits[k] && current > 0) e.target.select(); }}
                                                                        onBlur={e => {
                                                                            const v = parseFloat(e.target.value) || 0;
                                                                            if (v === current) clearDraft(row.section, row.dept, row.item, mIdx);
                                                                        }}
                                                                        className={`w-full text-right px-1.5 py-1 text-xs focus:outline-none focus:bg-white rounded tabular-nums transition-colors
                                                                            ${isDirty ? 'bg-indigo-50 font-semibold text-indigo-800' : 'bg-transparent text-slate-500 hover:bg-slate-50'}`}
                                                                        placeholder={current > 0 ? new Intl.NumberFormat('es-ES').format(current) : '—'}
                                                                    />
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer con motivo y envío */}
                    {!isPastYear && (
                        <div className="px-5 py-4 border-t bg-slate-50">
                            {draftCount > 0 ? (
                                <div className="flex items-end gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Motivo de la solicitud <span className="font-normal text-slate-400">(opcional)</span></label>
                                        <textarea
                                            value={requestReason}
                                            onChange={e => setRequestReason(e.target.value)}
                                            placeholder="Explica brevemente el motivo de los cambios solicitados..."
                                            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 h-16 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-2 px-4 shadow-sm"
                                            onClick={handleSubmitRequests}
                                            disabled={submitBudgetRequestsMutation.isPending}
                                        >
                                            <Send size={12} />
                                            Enviar {draftCount} solicitud{draftCount !== 1 ? 'es' : ''}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 text-xs text-slate-400 hover:text-slate-600 gap-1.5"
                                            onClick={() => setDraftEdits({})}
                                        >
                                            <Trash2 size={11} />
                                            Limpiar cambios
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 text-center">
                                    Edita cualquier celda para comenzar una solicitud de cambio de presupuesto.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- DASHBOARD TAB ---
    if (activeTab === 'Dashboard') {
        return (
            <div className="space-y-4 -mx-6 -mt-6">
                {renderHeader(`${deptLabel.toUpperCase()} — DASHBOARD ${year}`)}
                {renderDashboardTab()}
                {isLoading && (
                    <div className="fixed inset-0 bg-white/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-lg p-4">Cargando...</div>
                    </div>
                )}
                {renderOverlays()}
            </div>
        );
    }

    // --- SOLICITUDES TAB ---
    if (activeTab === 'Solicitudes') {
        return (
            <div className="space-y-4 -mx-6 -mt-6">
                {renderHeader(`SOLICITUDES PRESUPUESTO — ${deptLabel.toUpperCase()} ${year}`)}
                {renderSolicitudesTab()}
                {renderOverlays()}
            </div>
        );
    }

    // --- FACTURACIÓN TAB (espejo de Billing Matrix filtrado por hub) ---
    if (activeTab === 'Facturación') {
        return (
            <div className="space-y-4 -mx-6 -mt-6">
                {renderHeader(`FACTURACIÓN — ${deptLabel.toUpperCase()} ${year}`)}
                <BillingHubMirror deptCode={deptCode || ''} deptLabel={deptLabel} />
                {renderOverlays()}
            </div>
        );
    }

    // --- COMPARACIÓN TAB ---
    if (activeTab === 'Comparación') {
        return (
            <div className="space-y-4 -mx-6 -mt-6">
                {renderHeader(`P&L ${deptLabel.toUpperCase()} — COMPARACIÓN ${year}`)}
                {renderComparisonTable()}
                {renderOverlays()}
            </div>
        );
    }

    // --- REAL / PRESUPUESTO TAB ---

    // Group cost computations are handled inside `gastosTotals` and `ebitdaTotals` directly above.

    return (
        <div className="space-y-4 -mx-6 -mt-6">
            {renderHeader(`P&L ${deptLabel.toUpperCase()} — ${activeTab === 'Real' ? 'REAL' : activeTab === 'Forecast' ? 'FORECAST' : 'PRESUPUESTO'} ${year}`)}

            {forecastInfoOpen && <ForecastInfoModal onClose={() => setForecastInfoOpen(false)} />}
            {scenarioOpen && (
                <ForecastScenariosModal
                    initial={activeScenario}
                    revenueDepts={deptNames}
                    expenseDepts={deptNames}
                    targetLabel={activeTab === 'Presupuesto' ? 'Presupuesto' : 'Forecast'}
                    savedList={sharedScenarios}
                    canEdit={false}
                    shareableDepts={[]}
                    onApply={(s) => setActiveScenario(isScenarioEmpty(s) ? null : s)}
                    onUpdate={() => { /* dept heads no pueden actualizar */ }}
                    onDelete={() => { /* dept heads no pueden borrar */ }}
                    onClose={() => {
                        setScenarioOpen(false);
                        // Al abrir el panel, marcamos como vistos los escenarios listados
                        dismissAllNotifications();
                    }}
                />
            )}

            {/* Notificación de escenarios compartidos no vistos — aparece en cualquier pestaña */}
            {unseenScenarios.length > 0 && (
                <div className="mx-6 mt-3 space-y-1.5">
                    {unseenScenarios.map(s => {
                        const scope: 'forecast' | 'budget' = ((s as any).scope === 'budget' ? 'budget' : 'forecast');
                        const scopeLabel = scope === 'budget' ? 'Presupuesto' : 'Forecast';
                        const author = s.created_by_email?.split('@')[0] || 'Un superadmin';
                        const targetTab: TabType = scope === 'budget' ? 'Presupuesto' : 'Forecast';
                        return (
                            <div
                                key={s.id}
                                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 shadow-md ring-1 ring-white/20 text-white"
                                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                            >
                                <span className="flex-shrink-0 h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-base">🔔</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-extrabold tracking-wider text-white/80 uppercase">Escenario compartido contigo</div>
                                    <div className="text-sm font-bold truncate">
                                        "{s.name}" · disponible en <span className="underline">{scopeLabel}</span>
                                    </div>
                                    <div className="text-[11px] text-white/85">
                                        {author} compartió este escenario con {deptLabel}. Ve a la pestaña {scopeLabel} y ábrelo desde ✨ Escenarios.
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setActiveTab(targetTab); setScenarioOpen(true); markScenarioSeen(s.id); }}
                                    className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors"
                                >
                                    Ir a {scopeLabel}
                                </button>
                                <button
                                    onClick={() => markScenarioSeen(s.id)}
                                    className="h-6 w-6 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors"
                                    title="Descartar"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Spreadsheet (read-only) */}
            <div className="overflow-x-auto px-2">
                <table className="w-full border-collapse text-xs" style={{ minWidth: '1200px' }}>
                    <thead>
                        <tr className="bg-white">
                            <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '100px' }}></th>
                            <th className="border border-gray-300 px-2 py-2 text-left font-medium" style={{ width: '160px' }}></th>
                            {MONTHS.map((month, i) => (
                                <th key={i} className="border border-gray-300 px-1 py-2 text-center font-medium text-xs" style={{ width: '70px', minWidth: '70px' }}>
                                    {month}
                                </th>
                            ))}
                            <th className="border border-gray-300 px-1 py-2 text-center font-semibold text-xs bg-gray-100" style={{ width: '80px', minWidth: '80px' }}>
                                Anual
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {/* INGRESOS DE EXPLOTACIÓN */}
                        <tr className="bg-purple-100">
                            <td colSpan={2} className="border border-purple-300 px-2 py-1.5 font-bold text-purple-900 text-xs">
                                INGRESOS DE EXPLOTACIÓN
                            </td>
                            {ingresosTotals.map((val, i) => (
                                <td key={i} className="border border-purple-300 px-1 py-1.5 text-right font-semibold text-purple-800 tabular-nums">
                                    {fmtDisplay(val)}
                                </td>
                            ))}
                            <td className="border border-purple-300 px-1 py-1.5 text-right font-bold text-purple-900 tabular-nums">
                                {fmtDisplay(ingresosAnual)}
                            </td>
                        </tr>

                        {renderRevenueRows()}

                        {/* Spacer */}
                        <tr><td colSpan={15} className="py-2 bg-white border-0"></td></tr>

                        {/* GASTOS DE EXPLOTACIÓN */}
                        <tr className="bg-orange-100">
                            <td colSpan={2} className="border border-orange-300 px-2 py-1.5 font-bold text-orange-900 text-xs">
                                GASTOS DE EXPLOTACIÓN
                            </td>
                            {gastosTotals.map((val, i) => (
                                <td key={i} className="border border-orange-300 px-1 py-1.5 text-right font-semibold text-orange-800 tabular-nums">
                                    {fmtDisplay(val)}
                                </td>
                            ))}
                            <td className="border border-orange-300 px-1 py-1.5 text-right font-bold text-orange-900 tabular-nums">
                                {fmtDisplay(gastosAnual)}
                            </td>
                        </tr>

                        {renderExpenseCategory('Gastos de personal', deptPersonal, 'personal')}
                        {renderExpenseCategory('Comisiones', deptComisiones, 'comisiones')}
                        {renderExpenseCategory('Marketing', deptMarketing, 'marketing')}
                        {renderExpenseCategory('Formación', deptFormacion, 'formacion')}
                        {renderExpenseCategory('Software', deptSoftware, 'software')}
                        {renderExpenseCategory('Adspent', deptAdspent, 'adspent')}
                        {renderExpenseCategory('Gastos Operativos', deptGastosOp, 'gastosOp')}

                        {/* GROUP COST (Integration into Gastos) */}
                        {!isGroupCostExempt && (
                            <tr className="bg-red-50 hover:bg-red-100 transition-colors">
                                <td className="border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-800"></td>
                                <td className="border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-800">
                                    Group (Immoral %)
                                </td>
                                {activeTabGroupCost.map((val, i) => (
                                    <td key={i} className="border border-red-200 px-1 py-1.5 text-right font-medium text-red-800 tabular-nums">
                                        {fmtDisplay(val)}
                                    </td>
                                ))}
                                <td className="border border-red-200 px-1 py-1.5 text-right font-bold text-red-900 tabular-nums">
                                    {fmtDisplay(activeTabGroupCostAnual)}
                                </td>
                            </tr>
                        )}

                        {/* EBITDA == RESULTADO FINAL */}
                        <tr className="bg-blue-100">
                            <td colSpan={2} className="border border-blue-300 px-2 py-2 font-bold text-blue-900 text-sm">
                                EBITDA
                            </td>
                            {ebitdaTotals.map((val, i) => (
                                <td key={i} className="border border-blue-300 px-1 py-2 text-right font-bold text-blue-800 tabular-nums">
                                    {fmtDisplay(val)}
                                </td>
                            ))}
                            <td className="border border-blue-300 px-1 py-2 text-right font-bold text-blue-900 text-sm tabular-nums">
                                {fmtDisplay(ebitdaAnual)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {isLoading && (
                <div className="fixed inset-0 bg-white/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-4">Cargando...</div>
                </div>
            )}

            {renderOverlays()}
        </div>
    );
}
