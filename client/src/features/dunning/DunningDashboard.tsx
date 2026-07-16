import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dunningApi, OverdueInvoice } from '@/lib/api/dunning';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import {
    AlertTriangle, Clock, Mail, CheckCircle2, Settings, RefreshCw, Loader2,
    FileWarning
} from 'lucide-react';
import { DunningIntroPanel, LevelsLegend } from './DunningGuide';

function levelBadge(level: 0 | 1 | 2 | 3) {
    if (level === 0) return <Badge variant="outline" className="text-muted-foreground">Sin nivel</Badge>;
    const cfg = {
        1: { label: 'Nivel 1', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800' },
        2: { label: 'Nivel 2', cls: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800' },
        3: { label: 'Nivel 3', cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800' },
    }[level];
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>{cfg.label}</span>;
}

function KpiCard({
    icon: Icon,
    label,
    value,
    hint,
    accent = 'default',
}: {
    icon: any;
    label: string;
    value: string | number;
    hint?: string;
    accent?: 'default' | 'warning' | 'danger' | 'success';
}) {
    const accentCls = {
        default: 'text-primary bg-primary/10',
        warning: 'text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30',
        danger: 'text-red-600 bg-red-100 dark:text-red-300 dark:bg-red-900/30',
        success: 'text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30',
    }[accent];

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accentCls}`}>
                        <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
                        <p className="text-2xl font-bold text-foreground mt-0.5 truncate">{value}</p>
                        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function DunningDashboard() {
    const { data: overdueData, isLoading: overdueLoading, refetch: refetchOverdue, isFetching } = useQuery({
        queryKey: ['dunning', 'overdue'],
        queryFn: () => dunningApi.listOverdueInvoices(),
    });

    const { data: statsData, isLoading: statsLoading } = useQuery({
        queryKey: ['dunning', 'stats'],
        queryFn: () => dunningApi.getStats(),
    });

    const { data: configData } = useQuery({
        queryKey: ['dunning', 'config'],
        queryFn: () => dunningApi.getConfig(),
    });

    const invoices = overdueData?.invoices || [];

    // Reparto por nivel para las tarjetas
    const byLevel = useMemo(() => {
        const buckets: Record<'0' | '1' | '2' | '3', OverdueInvoice[]> = { '0': [], '1': [], '2': [], '3': [] };
        for (const inv of invoices) {
            buckets[String(inv.suggested_level) as '0' | '1' | '2' | '3'].push(inv);
        }
        return buckets;
    }, [invoices]);

    const totalAmount = useMemo(
        () => invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0),
        [invoices]
    );

    const isConfigured = configData?.config?.enabled;

    return (
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <FileWarning className="text-red-500" size={22} />
                        <h1 className="text-2xl font-bold text-foreground">Impagos</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Facturas vencidas y trazabilidad de recordatorios enviados a clientes.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchOverdue()}
                        disabled={isFetching}
                    >
                        {isFetching ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
                        Actualizar
                    </Button>
                    <Link to="/payments/dunning/config">
                        <Button size="sm" variant="outline">
                            <Settings size={14} className="mr-1.5" />
                            Configuración
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Panel guía — qué es este módulo y cómo funciona */}
            <DunningIntroPanel />

            {/* Banner MODO PRUEBA */}
            {configData?.config?.test_mode && (
                <div className="rounded-lg border-2 border-amber-400 bg-amber-100 dark:bg-amber-950/30 dark:border-amber-700 p-3 flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Sistema en MODO PRUEBA</p>
                        <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
                            Todos los recordatorios se redirigen a <strong>{configData.config.test_mode_email || '(sin destino)'}</strong>. Los clientes no reciben ningún email hasta que desactives el modo prueba.
                        </p>
                    </div>
                    <Link to="/payments/dunning/config">
                        <Button size="sm" variant="outline">Ir a configuración</Button>
                    </Link>
                </div>
            )}

            {/* Estado del sistema */}
            {!isConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Sistema de impagos desactivado</p>
                        <p className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5">
                            Los recordatorios automáticos no se enviarán hasta que actives el sistema desde la configuración.
                            El dashboard sigue mostrando las facturas vencidas actuales desde Holded.
                        </p>
                    </div>
                    <Link to="/payments/dunning/config">
                        <Button size="sm" variant="outline">Configurar</Button>
                    </Link>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    icon={FileWarning}
                    label="Vencidas ahora"
                    value={overdueLoading ? '…' : invoices.length}
                    hint={overdueLoading ? undefined : formatCurrency(totalAmount)}
                    accent="danger"
                />
                <KpiCard
                    icon={Mail}
                    label="Recordatorios enviados"
                    value={statsLoading ? '…' : (statsData?.total_reminders ?? 0)}
                    hint={statsData ? `N1 ${statsData.reminders_by_level['1']} · N2 ${statsData.reminders_by_level['2']} · N3 ${statsData.reminders_by_level['3']}` : undefined}
                    accent="warning"
                />
                <KpiCard
                    icon={CheckCircle2}
                    label="Casos cobrados"
                    value={statsLoading ? '…' : (statsData?.paid_cases ?? 0)}
                    hint={statsData?.avg_days_to_pay != null ? `Media: ${statsData.avg_days_to_pay} días hasta cobrar` : 'Aún sin histórico'}
                    accent="success"
                />
                <KpiCard
                    icon={Clock}
                    label="Casos abiertos"
                    value={statsLoading ? '…' : (statsData?.open_cases ?? 0)}
                    hint="Con al menos un recordatorio ya enviado"
                />
            </div>

            {/* Leyenda de niveles */}
            <LevelsLegend
                level1From={configData?.config?.level_1_days_min ?? 5}
                level1To={configData?.config?.level_1_days_max ?? 9}
                level2From={configData?.config?.level_2_days_min ?? 10}
                level2To={configData?.config?.level_2_days_max ?? 14}
                level3From={configData?.config?.level_3_days_min ?? 15}
            />

            {/* Reparto por nivel */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([1, 2, 3] as const).map(level => {
                    const cnt = byLevel[String(level) as '1' | '2' | '3'].length;
                    const sum = byLevel[String(level) as '1' | '2' | '3'].reduce((s, i) => s + Number(i.amount || 0), 0);
                    return (
                        <Card key={level}>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-3">
                                    {levelBadge(level)}
                                    <span className="text-xs text-muted-foreground">
                                        {level === 1 && `${configData?.config?.level_1_days_min ?? 5}–${configData?.config?.level_1_days_max ?? 9} días`}
                                        {level === 2 && `${configData?.config?.level_2_days_min ?? 10}–${configData?.config?.level_2_days_max ?? 14} días`}
                                        {level === 3 && `+${configData?.config?.level_3_days_min ?? 15} días`}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-bold">{cnt}</span>
                                    <span className="text-sm text-muted-foreground">{formatCurrency(sum)}</span>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Tabla facturas vencidas */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Facturas vencidas actualmente</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Datos en vivo desde Holded. Se cruzan con los recordatorios ya enviados desde esta app.
                    </p>
                </CardHeader>
                <CardContent>
                    {overdueLoading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="animate-spin mr-2" size={18} />
                            Cargando facturas de Holded…
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={32} />
                            <p className="text-sm font-semibold text-foreground">Ninguna factura vencida</p>
                            <p className="text-xs text-muted-foreground mt-1">Todo al día. 🎉</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                                    <tr>
                                        <th className="text-left py-2 px-2 font-semibold">Factura</th>
                                        <th className="text-left py-2 px-2 font-semibold">Cliente</th>
                                        <th className="text-right py-2 px-2 font-semibold">Importe</th>
                                        <th className="text-center py-2 px-2 font-semibold">Días vencida</th>
                                        <th className="text-center py-2 px-2 font-semibold">Nivel</th>
                                        <th className="text-center py-2 px-2 font-semibold">Recordatorios</th>
                                        <th className="text-left py-2 px-2 font-semibold">Último envío</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {invoices.map(inv => (
                                        <tr key={inv.invoice_id} className="hover:bg-muted/30">
                                            <td className="py-2 px-2 font-mono text-xs">{inv.invoice_number || inv.invoice_id.slice(0, 8)}</td>
                                            <td className="py-2 px-2">
                                                <div className="font-medium text-foreground">{inv.contact_name || '—'}</div>
                                                {inv.contact_email && (
                                                    <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{inv.contact_email}</div>
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-right font-semibold">
                                                {formatCurrency(inv.amount, inv.currency || 'EUR')}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                <span className={`font-bold ${inv.days_overdue >= 15 ? 'text-red-600' : inv.days_overdue >= 10 ? 'text-orange-600' : 'text-amber-600'}`}>
                                                    {inv.days_overdue}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                {levelBadge(inv.suggested_level)}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                <span className="text-xs font-semibold">{inv.reminders_count}</span>
                                            </td>
                                            <td className="py-2 px-2 text-xs text-muted-foreground">
                                                {inv.last_reminder_at
                                                    ? new Date(inv.last_reminder_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : <span className="italic">Nunca</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Nota Fase 1 */}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                <strong className="text-foreground">Fase 1 activa.</strong> Este dashboard ya lee facturas vencidas en vivo desde Holded.
                El envío automático de recordatorios y la trazabilidad completa se activan al configurar y habilitar el sistema en la siguiente fase.
            </div>
        </div>
    );
}
