import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart,
} from 'recharts';

// ========== P&L STRUCTURE ==========
const REVENUE_STRUCTURE = [
    { dept: 'Immedia', services: ['Paid General', 'Paid imfilms', 'Setup inicial'] },
    { dept: 'Imcontent', services: ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers'] },
    { dept: 'Immoralia', services: ['Setup inicial IA', 'Automation', 'Consultoría'] },
    { dept: 'Imloyal', services: ['Web dev', 'CRM', 'Comisiones'] },
    { dept: 'Imseo', services: ['SEO', 'Comisiones'] },
    { dept: 'Immoral', services: ['Otros servicios', 'Otras comisiones'] },
    { dept: 'Imcontent', services: ['Budget Nutfruit'] },
    { dept: 'Imsales', services: ['Setup inicial (ims)'] },
    { dept: 'Imsales', services: ['Captación'] },
];

const EXPENSE_STRUCTURE = {
    personalItems: [
        { dept: 'Immedia', items: ['Alba', 'Andrés', 'Leidy'] },
        { dept: 'Imcontent', items: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie', 'Nueva Trabajadora'] },
        { dept: 'Immoralia', items: ['David', 'Manel'] },
        { dept: 'Immoral', items: ['Daniel', 'Mery', 'Yure', 'Marco', 'Externos puntuales'] },
        { dept: 'Immedia', items: ['Externos'] },
        { dept: 'Imcontent', items: ['Externos'] },
        { dept: 'Immoralia', items: ['Externos'] },
        { dept: 'Imsales', items: ['Jorge Orts'] },
    ],
    softwareItems: [
        { dept: 'Immoral', items: ['Software'] },
        { dept: 'Immedia', items: ['Software'] },
        { dept: 'Imcontent', items: ['Software'] },
        { dept: 'Immoralia', items: ['Software'] },
        { dept: 'Imsales', items: ['Software'] },
    ],
    comisionesItems: [
        { dept: 'Imfilms', items: ['The connector'] },
        { dept: 'Imcontent', items: ['Marc'] },
        { dept: 'Imseo', items: ['Christian'] },
        { dept: 'Imfashion', items: ['Gemelos'] },
        { dept: 'Imsales', items: ['Jorge'] },
        { dept: 'Imfilms', items: ['Olga'] },
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
    gastosOpItems: [
        { dept: 'Immoral', items: ['Alquiler', 'Asesoría', 'Suministros', 'Viajes y reuniones', 'Coche de empresa', 'Otras compras', 'Financiamiento (Línea de crédito)'] },
    ],
    adspentItems: [
        { dept: 'Immedia', items: ['Adspent'] },
        { dept: 'Imcontent', items: ['Adspent Nutfruit', 'Influencers'] },
    ],
};

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

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const DEPT_COLORS: Record<string, string> = {
    Immedia: '#6366f1',
    Imcontent: '#ec4899',
    Immoralia: '#f59e0b',
    Imloyal: '#10b981',
    Imseo: '#3b82f6',
    Immoral: '#8b5cf6',
    Imsales: '#ef4444',
    Imfilms: '#14b8a6',
    Imfashion: '#f97316',
};

const PIE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316'];

// Gradient pairs for bar charts
const GRADIENT_PAIRS = [
    ['#818cf8', '#4f46e5'],
    ['#f472b6', '#db2777'],
    ['#fbbf24', '#d97706'],
    ['#34d399', '#059669'],
    ['#60a5fa', '#2563eb'],
    ['#a78bfa', '#7c3aed'],
    ['#f87171', '#dc2626'],
    ['#2dd4bf', '#0d9488'],
    ['#fb923c', '#ea580c'],
];

interface Props {
    year: number;
    activeMonths: number[];
    timePeriod: 'monthly' | 'quarterly' | 'annual';
}

// Custom donut label with line from slice
const RADIAN = Math.PI / 180;
const renderDonutLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
    const pctVal = (percent * 100);
    if (pctVal < 1) return null; // Only hide truly negligible slices (<1%)
    // Line endpoint further out for readability
    const lineEnd = outerRadius + 18;
    const textRadius = outerRadius + 26;
    const lx = cx + lineEnd * Math.cos(-midAngle * RADIAN);
    const ly = cy + lineEnd * Math.sin(-midAngle * RADIAN);
    const tx = cx + textRadius * Math.cos(-midAngle * RADIAN);
    const ty = cy + textRadius * Math.sin(-midAngle * RADIAN);
    const anchor = tx > cx ? 'start' : 'end';
    return (
        <g>
            <line x1={cx + outerRadius * Math.cos(-midAngle * RADIAN)} y1={cy + outerRadius * Math.sin(-midAngle * RADIAN)} x2={lx} y2={ly} stroke="#9ca3af" strokeWidth={1} />
            <text x={tx} y={ty} fill="#374151" textAnchor={anchor} dominantBaseline="central" fontSize={11} fontWeight={500}>
                {name} ({pctVal.toFixed(1)}%)
            </text>
        </g>
    );
};

// Custom tooltip with premium styling
const PremiumTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-popover/95 backdrop-blur-md rounded-xl shadow-xl border border-border px-4 py-3 text-xs">
            {label && <p className="font-semibold text-foreground mb-1.5">{label}</p>}
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-muted-foreground">{p.name}:</span>
                    <span className="font-bold text-foreground ml-auto">{formatCurrency(Number(p.value ?? 0))}</span>
                </div>
            ))}
        </div>
    );
};

// ===== Global styles to kill focus outline on Recharts =====
const chartWrapperStyle = { outline: 'none' } as React.CSSProperties;

export default function DashboardDetalle({ year, activeMonths }: Props) {

    // Fetch its own PL data
    const { data: plRealData } = useQuery({
        queryKey: ['pl-matrix', year, 'real'],
        queryFn: () => adminApi.getPLMatrix(year, 'real'),
    });

    const plValues = useMemo(() => {
        const vals: Record<string, number> = {};
        if (!plRealData?.sections) return vals;
        const revenueSection = plRealData.sections.find((s: any) => s.code === 'REVENUE');
        revenueSection?.rows?.forEach((row: any) => {
            if (row.values && row.dept && row.name) {
                row.values.forEach((val: number, monthIdx: number) => {
                    vals[`revenue-${row.dept}-${row.name}-${monthIdx}`] = val || 0;
                });
            }
        });
        const expenseSection = plRealData.sections.find((s: any) => s.code === 'EXPENSES');
        expenseSection?.rows?.forEach((row: any) => {
            if (row.values && row.name && Array.isArray(row.values)) {
                row.values.forEach((val: number, monthIdx: number) => {
                    vals[`expense-${row.dept || 'General'}-${row.name}-${monthIdx}`] = val || 0;
                });
            }
        });
        return vals;
    }, [plRealData]);

    const getVal = (dept: string, item: string, month: number, section: 'revenue' | 'expense' = 'expense'): number => {
        return plValues[`${section}-${dept}-${item}-${month}`] || 0;
    };

    // Fetch billing matrix data for all months
    const { data: billingData } = useQuery({
        queryKey: ['billing-matrix-all', year],
        queryFn: async () => {
            const results = [];
            for (let m = 1; m <= 12; m++) {
                try {
                    const res = await adminApi.getMatrix(year, m);
                    results.push({ month: m, rows: res.rows || [] });
                } catch {
                    results.push({ month: m, rows: [] });
                }
            }
            return results;
        },
    });

    // ========== CHART DATA ==========

    // 1. Revenue Distribution by Department (Donut Chart)
    const revenueDistribution = useMemo(() => {
        if (Object.keys(plValues).length === 0) return [];
        const deptRevenue: Record<string, number> = {};
        REVENUE_STRUCTURE.forEach(g => {
            if (!deptRevenue[g.dept]) deptRevenue[g.dept] = 0;
            g.services.forEach(s => {
                for (const m of activeMonths) {
                    deptRevenue[g.dept] += getVal(g.dept, s, m, 'revenue');
                }
            });
        });
        const total = Object.values(deptRevenue).reduce((a, b) => a + b, 0);
        return Object.entries(deptRevenue)
            .filter(([, v]) => v > 0)
            .map(([dept, value]) => ({
                name: dept,
                value: Math.round(value),
                pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
            }))
            .sort((a, b) => b.value - a.value);
    }, [plValues, activeMonths]);

    // 2. Sales vs Expenses by Month
    const salesVsExpenses = useMemo(() => {
        if (Object.keys(plValues).length === 0) return [];
        return MONTHS.map((label, m) => {
            let revenue = 0;
            REVENUE_STRUCTURE.forEach(g => {
                g.services.forEach(s => { revenue += getVal(g.dept, s, m, 'revenue'); });
            });
            let expenses = 0;
            ALL_EXPENSE_KEYS.forEach(catKey => {
                (EXPENSE_KEY_MAP[catKey] || []).forEach(g => {
                    g.items.forEach(item => { expenses += getVal(g.dept, item, m); });
                });
            });
            return { name: label, Ingresos: Math.round(revenue), Gastos: Math.round(expenses) };
        });
    }, [plValues]);

    // 3. Personnel Expenses by Department
    const personalByDept = useMemo(() => {
        if (Object.keys(plValues).length === 0) return [];
        const deptPersonal: Record<string, number> = {};
        EXPENSE_STRUCTURE.personalItems.forEach(g => {
            if (!deptPersonal[g.dept]) deptPersonal[g.dept] = 0;
            g.items.forEach(item => {
                for (const m of activeMonths) { deptPersonal[g.dept] += getVal(g.dept, item, m); }
            });
        });
        return Object.entries(deptPersonal)
            .filter(([, v]) => v > 0)
            .map(([dept, value]) => ({ name: dept, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value);
    }, [plValues, activeMonths]);

    // 4. Personnel Monthly Trend
    const personalTrend = useMemo(() => {
        if (Object.keys(plValues).length === 0) return [];
        return MONTHS.map((label, m) => {
            let total = 0;
            EXPENSE_STRUCTURE.personalItems.forEach(g => {
                g.items.forEach(item => { total += getVal(g.dept, item, m); });
            });
            return { name: label, Personal: Math.round(total) };
        });
    }, [plValues]);

    // 5. Software Expenses by Department
    const softwareByDept = useMemo(() => {
        if (Object.keys(plValues).length === 0) return [];
        const deptSoftware: Record<string, number> = {};
        EXPENSE_STRUCTURE.softwareItems.forEach(g => {
            if (!deptSoftware[g.dept]) deptSoftware[g.dept] = 0;
            g.items.forEach(item => {
                for (const m of activeMonths) { deptSoftware[g.dept] += getVal(g.dept, item, m); }
            });
        });
        return Object.entries(deptSoftware)
            .filter(([, v]) => v > 0)
            .map(([dept, value]) => ({ name: dept, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value);
    }, [plValues, activeMonths]);

    // 6. Software Monthly Trend
    const softwareTrend = useMemo(() => {
        if (Object.keys(plValues).length === 0) return [];
        return MONTHS.map((label, m) => {
            let total = 0;
            EXPENSE_STRUCTURE.softwareItems.forEach(g => {
                g.items.forEach(item => { total += getVal(g.dept, item, m); });
            });
            return { name: label, Software: Math.round(total) };
        });
    }, [plValues]);

    // 7. Client Billing — FIXED: sum row.services values (same as MatrixGrid calculateRowTotal)
    const clientBilling = useMemo(() => {
        if (!billingData) return [];
        const clientTotals: Record<string, number> = {};
        const activeMonthsSet = new Set(activeMonths.map(m => m + 1));

        billingData.forEach(({ month, rows }) => {
            if (!activeMonthsSet.has(month)) return;
            rows.forEach((row: any) => {
                const name = row.client_name || 'Sin nombre';
                // Sum all service values for this client row (mirrors MatrixGrid.calculateRowTotal)
                let rowTotal = 0;
                if (row.services && typeof row.services === 'object') {
                    Object.values(row.services).forEach((v: any) => {
                        rowTotal += Number(v || 0);
                    });
                }
                if (rowTotal > 0) {
                    clientTotals[name] = (clientTotals[name] || 0) + rowTotal;
                }
            });
        });

        return Object.entries(clientTotals)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);
    }, [billingData, activeMonths]);

    // Loading state
    if (!plRealData?.sections) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="relative">
                    <div className="animate-spin rounded-full h-14 w-14 border-4 border-indigo-200 border-t-indigo-600"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-6 w-6 rounded-full bg-indigo-100 animate-pulse"></div>
                    </div>
                </div>
            </div>
        );
    }

    // SVG Gradient definitions for charts
    const GradientDefs = () => (
        <defs>
            <linearGradient id="grad-ingresos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.8} />
            </linearGradient>
            <linearGradient id="grad-gastos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0.8} />
            </linearGradient>
            <linearGradient id="grad-personal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.85} />
                <stop offset="95%" stopColor="#6d28d9" stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="grad-software" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.85} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="grad-personal-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
            <linearGradient id="grad-software-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
        </defs>
    );

    // Section card wrapper with premium styling
    const Section = ({ title, subtitle, children, className = '' }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) => (
        <div
            className={`group bg-card rounded-2xl border border-border/60 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ${className}`}
            style={chartWrapperStyle}
            tabIndex={-1}
        >
            <div className="px-6 pt-5 pb-3 flex items-start gap-3">
                <span className="mt-1 h-8 w-1 rounded-full bg-primary/70 shrink-0" />
                <div>
                    <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                </div>
            </div>
            <div className="px-4 pb-5" style={chartWrapperStyle} tabIndex={-1}>
                {children}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* ====== CSS to remove focus outlines on Recharts ====== */}
            <style>{`
                .recharts-wrapper, .recharts-wrapper svg, .recharts-surface,
                .recharts-wrapper *:focus, .recharts-wrapper *:focus-visible {
                    outline: none !important;
                    box-shadow: none !important;
                }
            `}</style>

            {/* Row 1: Revenue Donut + Ventas vs Gastos side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <Section title="Distribución de Ingresos" subtitle="Porcentaje de ingresos por departamento">
                    {revenueDistribution.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos de ingresos</div>
                    ) : (
                        <>
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={revenueDistribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={65}
                                            outerRadius={115}
                                            paddingAngle={3}
                                            labelLine={false}
                                            label={renderDonutLabel}
                                            dataKey="value"
                                            animationBegin={0}
                                            animationDuration={1000}
                                            animationEasing="ease-out"
                                            strokeWidth={0}
                                        >
                                            {revenueDistribution.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={DEPT_COLORS[entry.name] || PIE_COLORS[index % PIE_COLORS.length]}
                                                    className="drop-shadow-sm"
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<PremiumTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Summary chips */}
                            <div className="flex flex-wrap gap-2 px-2 mt-2">
                                {revenueDistribution.map((d) => (
                                    <div key={d.name} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors text-xs">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DEPT_COLORS[d.name] || '#6b7280' }} />
                                        <span className="font-medium text-gray-700">{d.name}</span>
                                        <span className="text-gray-400">·</span>
                                        <span className="font-bold text-gray-900">{formatCurrency(d.value)}</span>
                                        <span className="text-gray-400">({d.pct}%)</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </Section>

                <Section title="Ventas vs Gastos" subtitle="Comparación mensual de ingresos y gastos operativos">
                    {salesVsExpenses.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos</div>
                    ) : (
                        <div className="h-[380px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={salesVsExpenses} barCategoryGap="25%" barGap={4}>
                                    <GradientDefs />
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<PremiumTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: 8 }} />
                                    <Bar dataKey="Ingresos" fill="url(#grad-ingresos)" radius={[6, 6, 0, 0]} animationDuration={800} />
                                    <Bar dataKey="Gastos" fill="url(#grad-gastos)" radius={[6, 6, 0, 0]} animationDuration={800} animationBegin={200} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>
            </div>

            {/* Row 2: Personnel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-3 duration-600" style={{ animationDelay: '100ms' }}>
                <Section title="Personal por Departamento" subtitle="Distribución del gasto en personal">
                    {personalByDept.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos de personal</div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={personalByDept} layout="vertical" barCategoryGap="18%">
                                    <defs>
                                        {personalByDept.map((_, i) => (
                                            <linearGradient key={`pg-${i}`} id={`pg-${i}`} x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="5%" stopColor={GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][0]} />
                                                <stop offset="95%" stopColor={GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][1]} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<PremiumTooltip />} />
                                    <Bar dataKey="value" name="Personal" radius={[0, 8, 8, 0]} animationDuration={900}>
                                        {personalByDept.map((entry, index) => (
                                            <Cell key={`cell-p-${index}`} fill={DEPT_COLORS[entry.name] || `url(#pg-${index})`} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>

                <Section title="Tendencia Mensual — Personal" subtitle="Evolución mensual del gasto de personal">
                    {personalTrend.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos</div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={personalTrend}>
                                    <GradientDefs />
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<PremiumTooltip />} />
                                    <Bar dataKey="Personal" fill="url(#grad-personal)" radius={[6, 6, 0, 0]} opacity={0.85} animationDuration={800} />
                                    <Line type="monotone" dataKey="Personal" stroke="url(#grad-personal-line)" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#7c3aed' }} animationDuration={1200} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>
            </div>

            {/* Row 3: Software */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-3 duration-600" style={{ animationDelay: '200ms' }}>
                <Section title="Software por Departamento" subtitle="Distribución del gasto en software">
                    {softwareByDept.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos de software</div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={softwareByDept} layout="vertical" barCategoryGap="18%">
                                    <defs>
                                        {softwareByDept.map((_, i) => (
                                            <linearGradient key={`sg-${i}`} id={`sg-${i}`} x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="5%" stopColor={GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][0]} />
                                                <stop offset="95%" stopColor={GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][1]} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<PremiumTooltip />} />
                                    <Bar dataKey="value" name="Software" radius={[0, 8, 8, 0]} animationDuration={900}>
                                        {softwareByDept.map((entry, index) => (
                                            <Cell key={`cell-s-${index}`} fill={DEPT_COLORS[entry.name] || `url(#sg-${index})`} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>

                <Section title="Tendencia Mensual — Software" subtitle="Evolución mensual del gasto de software">
                    {softwareTrend.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos</div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={softwareTrend}>
                                    <GradientDefs />
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<PremiumTooltip />} />
                                    <Bar dataKey="Software" fill="url(#grad-software)" radius={[6, 6, 0, 0]} opacity={0.85} animationDuration={800} />
                                    <Line type="monotone" dataKey="Software" stroke="url(#grad-software-line)" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#2563eb' }} animationDuration={1200} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>
            </div>

            {/* Row 4: Client Billing */}
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-600" style={{ animationDelay: '300ms' }}>
                <Section title="Facturación por Cliente" subtitle="Top clientes por facturación (Billing Matrix)">
                    {clientBilling.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos de facturación de clientes</div>
                    ) : (
                        <div style={{ height: Math.max(350, clientBilling.length * 32 + 60) }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={clientBilling} layout="vertical" barCategoryGap="12%" margin={{ left: 10 }}>
                                    <defs>
                                        <linearGradient id="grad-billing" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.9} />
                                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.85} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={140}
                                        tick={{ fontSize: 11, fill: '#374151', fontWeight: 500 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<PremiumTooltip />} />
                                    <Bar dataKey="value" name="Facturación" fill="url(#grad-billing)" radius={[0, 8, 8, 0]} animationDuration={1000}>
                                        {clientBilling.map((_, index) => (
                                            <Cell
                                                key={`cell-c-${index}`}
                                                fill={`hsl(${240 - index * 5}, ${75 - index * 1.5}%, ${55 + index * 1}%)`}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Section>
            </div>
        </div>
    );
}
