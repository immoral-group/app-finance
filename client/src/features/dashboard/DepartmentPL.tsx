import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Download, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, MessageSquare, Calendar } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { CommentModal } from '@/features/pl/PLMatrix';
import { useUrlState } from '@/hooks/useUrlState';

const TABS = ['Dashboard', 'Real', 'Presupuesto', 'Comparación'] as const;
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

    const [year, setYear] = useUrlState('year', new Date().getFullYear(), (v) => Number(v));
    const [activeTab, setActiveTab] = useUrlState<TabType>('tab', 'Dashboard');
    const [bannerMonth, setBannerMonth] = useState<number | 'ytd'>('ytd');
    const [cellValues, setCellValues] = useState<Record<string, number>>({});
    const queryClient = useQueryClient();
    const hoverTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const typeParam = activeTab === 'Presupuesto' ? 'budget' : 'real';

    // ── Notes state ───────────────────────────────────────────────────────────
    // IMPORTANT: dept notes use 'dept-real'/'dept-budget'/'dept-comparison' — completely separate
    // from PLMatrix notes. Same table, different view_type per tab.
    type DeptNoteType = 'dept-real' | 'dept-budget' | 'dept-comparison';
    const deptNoteType: DeptNoteType =
        activeTab === 'Presupuesto' ? 'dept-budget' :
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
        queryFn: () => adminApi.getPLMatrix(year, 'real' as 'budget' | 'real'),
    });

    const { data: budgetData } = useQuery({
        queryKey: ['pl-matrix', year, 'budget'],
        queryFn: () => adminApi.getPLMatrix(year, 'budget'),
    });

    // Custom rows query — filtered by year
    const { data: customRowsData } = useQuery({
        queryKey: ['pl-custom-rows', year],
        queryFn: () => adminApi.getCustomRows(year),
        staleTime: 60000,
    });
    const customRows = customRowsData?.rows || [];

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
        return merged;
    }, [customRows]);

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
        return merged;
    }, [customRows]);

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

    const getCellKey = (section: string, dept: string, item: string, monthIdx: number) => {
        return `${section}-${dept}-${item}-${monthIdx}-${typeParam}`;
    };

    const getCellValue = (section: string, dept: string, item: string, monthIdx: number): number => {
        return cellValues[getCellKey(section, dept, item, monthIdx)] || 0;
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

    // --- Group Cost Calculation helper ---
    const calculateGroupCost = (valuesMap: Record<string, number>): number[] => {
        // 1) Total General Revenue
        const totalGeneralRevenue = Array(12).fill(0);
        mergedRevenueStructure.forEach(group => {
            group.services.forEach(service => {
                for (let i = 0; i < 12; i++) {
                    totalGeneralRevenue[i] += getCompValue(valuesMap, 'revenue', group.dept, service, i);
                }
            });
        });

        // 2) Dept Revenue
        const deptRevTotals = calcCompSectionTotal(valuesMap, 'revenue', deptRevenue);

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
                        immoralExpensesMonthly[i] += getCompValue(valuesMap, catKey, 'Immoral', item, i);
                    }
                });
            });
        });

        // 5) Group Cost
        const isImmoral = deptNames.includes('Immoral');
        return groupPct.map((pct, i) =>
            isImmoral ? 0 : fmtCurrency(immoralExpensesMonthly[i] * pct)
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
        const normalizedSection = section === 'revenue' ? 'revenue' : 'expense';
        const note = getCellNote(deptNoteType, normalizedSection, dept, item, monthIdx);
        const hasNote = !!note?.comment || (note?.assigned_to && note.assigned_to.length > 0);
        return (
            <td
                key={monthIdx}
                className="border border-gray-200 px-1 py-1 text-right text-xs tabular-nums relative cursor-context-menu"
                onContextMenu={(e) => handleContextMenu(e, section, dept, item, monthIdx)}
                onMouseEnter={(e) => handleMouseEnter(e, section, dept, item, monthIdx)}
                onMouseLeave={handleMouseLeave}
            >
                {hasNote && (
                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-orange-500 border-l-transparent pointer-events-none" />
                )}
                {value ? fmtDisplay(value) : <span className="text-gray-300">0</span>}
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

        const renderCompRow = (label: string, realVals: number[], budgetVals: number[], diffVals: number[], bold: boolean = false, bgClass: string = '') => (
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
                    {diffVals.map((v, i) => <td key={i} className={`border border-gray-200 px-1 py-0.5 text-right text-xs tabular-nums ${v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : ''}`}>{fmtDisplay(v)}</td>)}
                    <td className={`border border-gray-200 px-1 py-0.5 text-right text-xs font-medium bg-gray-50 tabular-nums ${fmtCurrency(diffVals.reduce((a, b) => a + b, 0)) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmtDisplay(fmtCurrency(diffVals.reduce((a, b) => a + b, 0)))}
                    </td>
                </tr>
            </>
        );

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

                        {!deptNames.includes('Immoral') && (
                            <>
                                {renderCompRow('GROUP (Immoral %)', realGroupCost, budgetGroupCost, diffGroupCost, false, 'bg-red-50')}
                                <tr><td colSpan={15} className="py-1 bg-white border-0"></td></tr>
                            </>
                        )}

                        {renderCompRow('GASTOS TOTALES', realExpTotals.map(v => fmtCurrency(v)), budgetExpTotals.map(v => fmtCurrency(v)), diffExpTotals, true, 'bg-orange-50')}
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

        // === Group cost = ALL Immoral expenses * Group% (per month) ===
        const isImmoral = deptNames.includes('Immoral');
        const groupCostMonthly = groupPct.map((pct, i) =>
            isImmoral ? 0 : fmtCurrency(immoralExpensesMonthly[i] * (pct / 100))
        );

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

        const budgetResultadoMonthly = budgetRevTotals.map((v, i) => fmtCurrency(v - budgetExpMonthly[i]));

        // Current month index (0-indexed)
        const currentMonth = new Date().getMonth();

        // Determine the effective month range based on the banner month selector
        const bannerEndMonth = bannerMonth === 'ytd' ? currentMonth : (bannerMonth as number);

        // --- Chart Data ---
        const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

        // 4) Budget alert: compare real vs budget for recent months
        const alertMonths: { month: string; idx: number; realResult: number; budgetResult: number; diff: number; pct: number }[] = [];
        const alertStart = bannerMonth === 'ytd' ? 0 : (bannerMonth as number);
        const alertEnd = bannerEndMonth;
        for (let i = alertStart; i <= alertEnd; i++) {
            const realRes = resultadoMonthly[i];
            const budgetRes = budgetResultadoMonthly[i];
            const diff = fmtCurrency(realRes - budgetRes);
            const pct = budgetRes !== 0 ? fmtCurrency((diff / Math.abs(budgetRes)) * 100) : 0;
            alertMonths.push({
                month: MONTHS[i],
                idx: i,
                realResult: realRes,
                budgetResult: budgetRes,
                diff,
                pct
            });
        }

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
            ? budgetExpMonthly[singleMonthIdx] || 0
            : budgetExpMonthly.slice(0, bannerEndMonth + 1).reduce((a, b) => a + b, 0);
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

                    {/* 3-panel grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                        {/* Ingresos vs Presupuesto */}
                        <div className={`p-4 ${revOk ? 'bg-emerald-50/50' : 'bg-red-50/40'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {revOk ? <TrendingUp size={16} className="text-emerald-600" /> : <TrendingDown size={16} className="text-red-500" />}
                                <span className="text-xs font-bold text-gray-700">Ingresos</span>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Real</span>
                                    <span className="font-bold text-gray-900">{fmtDisplay(ytdRevReal)} €</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Presupuesto</span>
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
                                    <span className="text-gray-500">Real</span>
                                    <span className="font-bold text-gray-900">{fmtDisplay(ytdExpReal)} €</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Presupuesto</span>
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
                                    <span className="text-gray-500">Real</span>
                                    <span className={`font-bold ${ytdResultReal >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtDisplay(ytdResultReal)} €</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Presupuesto</span>
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

                    {/* Monthly chips */}
                    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Detalle por mes (resultado neto vs presupuesto)</p>
                        <div className="flex gap-1.5 flex-wrap">
                            {alertMonths.map(am => {
                                const ok = am.diff >= 0;
                                return (
                                    <div
                                        key={am.idx}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${ok
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                            : 'bg-red-100 text-red-800 border border-red-200'
                                            }`}
                                        title={`Real: ${fmtDisplay(am.realResult)} € | Presup: ${fmtDisplay(am.budgetResult)} € | Dif: ${fmtDisplay(am.diff)} €`}
                                    >
                                        {ok ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                        {am.month.slice(0, 3)}
                                        <span className="font-bold">{am.diff > 0 ? '+' : ''}{fmtDisplay(am.diff)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
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

                {/* === CHARTS GRID (AFTER SUMMARY TABLE) === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chart 1: Ventas vs Gastos */}
                    <div className="bg-white rounded-xl border p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-800 mb-4">📊 Ventas vs Gastos por Mes</h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={salesVsExpenseData} barGap={2}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    formatter={currencyFormatter}
                                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="Ventas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Gastos" fill="#f97316" radius={[4, 4, 0, 0]} />
                                <ReferenceLine y={0} stroke="#000" strokeDasharray="3 3" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Chart 2: Dept % of Total General Billing */}
                    <div className="bg-white rounded-xl border p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-800 mb-4">📈 % Facturación de {deptLabel} vs Total General</h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={deptPctData}>
                                <defs>
                                    <linearGradient id="billingGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 'auto']} />
                                <Tooltip
                                    formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Area type="monotone" dataKey={`${deptLabel} %`} stroke="#8b5cf6" fill="url(#billingGrad)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Chart 3: Expense Trend Line */}
                    <div className="bg-white rounded-xl border p-5 shadow-sm lg:col-span-2">
                        <h3 className="text-sm font-bold text-gray-800 mb-4">📉 Tendencia de Gastos por Categoría</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={expenseTrendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    formatter={currencyFormatter}
                                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                {catMonthly.map((cat, idx) => (
                                    <Line
                                        key={cat.label}
                                        type="monotone"
                                        dataKey={cat.label}
                                        stroke={expColors[idx % expColors.length]}
                                        strokeWidth={1.5}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                ))}
                                <Line type="monotone" dataKey="Group %" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="Total" stroke="#1e293b" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        );
    };

    // --- Calculate totals for Real/Presupuesto view ---
    const ingresosTotals = calculateSectionTotal('revenue', deptRevenue);
    const ingresosAnual = ingresosTotals.reduce((a, b) => a + b, 0);

    // Group Cost for the active tab (either Real or Presupuesto)
    const activeTabGroupCost = calculateGroupCost(activeTab === 'Presupuesto' ? compBudgetValues : compRealValues);
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
    const renderHeader = (title: string) => (
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-4">
                <h1 className="text-lg font-bold text-gray-900">
                    {title}
                </h1>
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    {TABS.map(tab => (
                        <Button
                            key={tab}
                            variant={activeTab === tab ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab(tab)}
                            className="text-xs h-7 px-3"
                        >
                            {tab}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setYear(year - 1)}>
                    ← {year - 1}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setYear(year + 1)}>
                    {year + 1} →
                </Button>
                {activeTab !== 'Dashboard' && (
                    <Button size="sm" className="gap-1 ml-2 h-7 text-xs">
                        <Download size={12} />
                        Exportar
                    </Button>
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
        </>
    );

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
            {renderHeader(`P&L ${deptLabel.toUpperCase()} — ${activeTab === 'Real' ? 'REAL' : 'PRESUPUESTO'} ${year}`)}

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
                        {!deptNames.includes('Immoral') && (
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
