import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, AccountProfitability } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import { Settings, ChevronDown, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Clock, DollarSign, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfitabilitySetup } from './ProfitabilitySetup';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function semaphore(margin: number | null): { color: string; bg: string; label: string } {
    if (margin === null) return { color: 'text-muted-foreground', bg: 'bg-muted', label: '—' };
    if (margin >= 60) return { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', label: `${margin.toFixed(1)}%` };
    if (margin >= 40) return { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', label: `${margin.toFixed(1)}%` };
    return { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', label: `${margin.toFixed(1)}%` };
}

function fmt(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function AccountRow({ account }: { account: AccountProfitability }) {
    const [expanded, setExpanded] = useState(false);
    const sem = semaphore(account.total_margin_pct);

    return (
        <>
            <tr
                className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <td className="px-4 py-3 w-6">
                    {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                </td>
                <td className="px-2 py-3 font-medium text-sm text-foreground whitespace-nowrap">
                    {account.client_name}
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                    {fmt(account.total_revenue)}
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {fmt(account.total_labor_cost)}
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums font-semibold text-foreground">
                    {fmt(account.total_profit)}
                </td>
                <td className="px-3 py-3 text-right">
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums', sem.bg, sem.color)}>
                        {sem.label}
                    </span>
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {account.total_hours.toFixed(1)}h
                </td>
            </tr>

            {expanded && (
                <tr className="bg-muted/20">
                    <td colSpan={7} className="px-4 py-4">
                        <MonthlyBreakdown account={account} />
                    </td>
                </tr>
            )}
        </>
    );
}

function MonthlyBreakdown({ account }: { account: AccountProfitability }) {
    const [activeMonth, setActiveMonth] = useState<number | null>(null);
    const activeMonthData = activeMonth !== null ? account.monthly[activeMonth] : null;

    return (
        <div className="space-y-4">
            {/* Monthly bar chart / table */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-muted-foreground">
                            <td className="pb-1.5 pr-3 font-medium">Mes</td>
                            {MONTH_NAMES.map(m => (
                                <td key={m} className="pb-1.5 px-1.5 text-center font-medium">{m}</td>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="space-y-1">
                        <tr>
                            <td className="pr-3 py-1 text-muted-foreground">Facturado</td>
                            {account.monthly.map((m, i) => (
                                <td key={i} className="px-1.5 py-1 text-right tabular-nums text-foreground">
                                    {m.revenue > 0 ? fmt(m.revenue) : <span className="text-muted-foreground/40">—</span>}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="pr-3 py-1 text-muted-foreground">Coste labor</td>
                            {account.monthly.map((m, i) => (
                                <td key={i} className="px-1.5 py-1 text-right tabular-nums text-muted-foreground">
                                    {m.labor_cost > 0 ? fmt(m.labor_cost) : <span className="text-muted-foreground/40">—</span>}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="pr-3 py-1 font-semibold">Margen %</td>
                            {account.monthly.map((m, i) => {
                                const s = semaphore(m.margin_pct);
                                return (
                                    <td key={i} className="px-1.5 py-1 text-center">
                                        <button
                                            onClick={() => setActiveMonth(activeMonth === i ? null : i)}
                                            className={cn(
                                                'px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums transition-all',
                                                s.bg, s.color,
                                                activeMonth === i && 'ring-2 ring-current ring-offset-1'
                                            )}
                                        >
                                            {m.margin_pct !== null ? `${m.margin_pct.toFixed(0)}%` : '—'}
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>
                        <tr>
                            <td className="pr-3 py-1 text-muted-foreground">Horas</td>
                            {account.monthly.map((m, i) => (
                                <td key={i} className="px-1.5 py-1 text-right tabular-nums text-muted-foreground text-[10px]">
                                    {m.hours > 0 ? `${m.hours.toFixed(1)}h` : <span className="text-muted-foreground/40">—</span>}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Drill-down: team members for selected month */}
            {activeMonthData && activeMonthData.members.length > 0 && (
                <div className="mt-3 border-t border-border/40 pt-3">
                    <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <Users size={12} />
                        Equipo en {MONTH_NAMES[activeMonth!]}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {activeMonthData.members.map(mb => (
                            <div key={mb.name} className="bg-card border border-border/50 rounded-lg px-3 py-2">
                                <p className="text-xs font-medium text-foreground truncate">{mb.name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {mb.hours.toFixed(1)}h · {fmt(mb.labor_cost)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ icon: Icon, label, value, sub }: {
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-primary" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                <p className="text-base font-bold text-foreground leading-tight mt-0.5">{value}</p>
                {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

export default function Profitability() {
    const [date, setDate] = useState(new Date());
    const [showSetup, setShowSetup] = useState(false);
    const { isSuperAdmin } = useAuth();

    const year = date.getFullYear();

    const { data, isLoading, error } = useQuery({
        queryKey: ['profitability-accounts', year],
        queryFn: () => adminApi.getProfitabilityAccounts(year),
        staleTime: 5 * 60_000,
    });

    const accounts = data?.accounts ?? [];

    const totalRevenue = accounts.reduce((s, a) => s + a.total_revenue, 0);
    const totalCost = accounts.reduce((s, a) => s + a.total_labor_cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const totalHours = accounts.reduce((s, a) => s + a.total_hours, 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

    const green = accounts.filter(a => (a.total_margin_pct ?? 0) >= 60).length;
    const yellow = accounts.filter(a => { const m = a.total_margin_pct ?? 0; return m >= 40 && m < 60; }).length;
    const red = accounts.filter(a => (a.total_margin_pct ?? 100) < 40).length;

    if (showSetup) {
        return <ProfitabilitySetup onBack={() => setShowSetup(false)} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Rentabilidad por Cuenta</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Margen bruto por cliente basado en horas ClickUp vs facturación</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-border/60 rounded-lg bg-card px-1">
                        <button onClick={() => setDate(d => new Date(d.getFullYear() - 1, 0))} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronLeft size={14} className="text-muted-foreground" />
                        </button>
                        <span className="text-sm font-semibold text-foreground px-2 tabular-nums">{year}</span>
                        <button onClick={() => setDate(d => new Date(d.getFullYear() + 1, 0))} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronRight size={14} className="text-muted-foreground" />
                        </button>
                    </div>
                    {isSuperAdmin() && (
                        <button
                            onClick={() => setShowSetup(true)}
                            className="h-9 px-3 rounded-lg border border-border/60 bg-card hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                        >
                            <Settings size={13} />
                            Configurar
                        </button>
                    )}
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <SummaryCard icon={DollarSign} label="Facturado" value={fmt(totalRevenue)} />
                <SummaryCard icon={TrendingDown} label="Coste labor" value={fmt(totalCost)} />
                <SummaryCard icon={TrendingUp} label="Beneficio bruto" value={fmt(totalProfit)} />
                <SummaryCard
                    icon={TrendingUp}
                    label="Margen medio"
                    value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
                    sub={`${green} verde · ${yellow} amarillo · ${red} rojo`}
                />
                <SummaryCard icon={Clock} label="Horas totales" value={`${totalHours.toFixed(0)}h`} sub={`${accounts.length} cuentas`} />
            </div>

            {/* No config warning */}
            {!isLoading && accounts.length === 0 && !error && (
                <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 text-center">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Sin datos configurados</p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">
                        Primero configura el mapeo de usuarios ClickUp y asigna listas a cada cliente.
                    </p>
                    {isSuperAdmin() && (
                        <button
                            onClick={() => setShowSetup(true)}
                            className="mt-3 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
                        >
                            Ir a Configuración
                        </button>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400">
                        {error instanceof Error ? error.message : 'Error cargando datos'}
                    </p>
                </div>
            )}

            {/* Main table */}
            {accounts.length > 0 && (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-border/50 bg-muted/40">
                                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-3 w-6" />
                                    <th className="px-2 py-3 text-left font-semibold">Cliente</th>
                                    <th className="px-3 py-3 text-right font-semibold">Facturado</th>
                                    <th className="px-3 py-3 text-right font-semibold">Coste labor</th>
                                    <th className="px-3 py-3 text-right font-semibold">Beneficio</th>
                                    <th className="px-3 py-3 text-right font-semibold">Margen</th>
                                    <th className="px-3 py-3 text-right font-semibold">Horas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading
                                    ? Array.from({ length: 6 }).map((_, i) => (
                                        <tr key={i} className="border-b border-border/30">
                                            {Array.from({ length: 7 }).map((_, j) => (
                                                <td key={j} className="px-3 py-3">
                                                    <div className="h-4 bg-muted rounded animate-pulse" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                    : accounts.map(account => (
                                        <AccountRow key={account.client_id} account={account} />
                                    ))
                                }
                            </tbody>
                            {accounts.length > 0 && (
                                <tfoot className="border-t border-border/50 bg-muted/30">
                                    <tr className="text-sm font-semibold">
                                        <td />
                                        <td className="px-2 py-3 text-foreground">Total</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-foreground">{fmt(totalRevenue)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmt(totalCost)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-foreground">{fmt(totalProfit)}</td>
                                        <td className="px-3 py-3 text-right">
                                            {avgMargin !== null && (
                                                <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-semibold', semaphore(avgMargin).bg, semaphore(avgMargin).color)}>
                                                    {avgMargin.toFixed(1)}%
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{totalHours.toFixed(1)}h</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* Semaphore legend */}
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Verde ≥ 60%
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Amarillo 40–59%
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                    Rojo &lt; 40%
                </span>
            </div>
        </div>
    );
}
