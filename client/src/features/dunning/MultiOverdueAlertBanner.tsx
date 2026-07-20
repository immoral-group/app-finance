import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { dunningApi } from '@/lib/api/dunning';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';

// Alerta global bloqueante para superadmins. Se muestra como modal centrado
// con overlay: hay que verla sí o sí. Una vez cerrada, se persiste el día
// natural local en localStorage y no vuelve a aparecer hasta el día siguiente,
// aunque el usuario recargue, cambie de pestaña o abra otra sesión.

const HIDE_KEY = 'dunning:multi-alert:hidden-until-day';

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isHiddenToday(): boolean {
    try { return localStorage.getItem(HIDE_KEY) === todayKey(); }
    catch { return false; }
}

function markHiddenToday() {
    try { localStorage.setItem(HIDE_KEY, todayKey()); } catch { /* ignore */ }
}

export function MultiOverdueAlertBanner() {
    const { profile } = useAuth();
    const isSuperAdmin = profile?.role === 'superadmin';

    // Estado local: false si el usuario ya cerró (localStorage o clic en X).
    // Se inicializa leyendo localStorage y se pone a false al cerrar para
    // que el re-render sea inmediato sin depender del refetch.
    const [dismissed, setDismissed] = useState<boolean>(() => isHiddenToday());

    const query = useQuery({
        queryKey: ['dunning', 'multi-alerts'],
        queryFn: () => dunningApi.listMultiOverdueAlerts(),
        enabled: isSuperAdmin && !dismissed,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        staleTime: 60 * 1000,
    });

    // Cambio de pestaña / día: si al volver ha cambiado el día, se reactiva.
    useEffect(() => {
        if (!isSuperAdmin) return;
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (dismissed && !isHiddenToday()) {
                // Cambio de día → volvemos a mostrarla si sigue habiendo motivo.
                setDismissed(false);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [dismissed, isSuperAdmin]);

    const alerts = query.data?.alerts || [];
    const enabled = query.data?.enabled;

    const totals = useMemo(() => ({
        invoices: alerts.reduce((s, a) => s + a.invoice_count, 0),
        amount: alerts.reduce((s, a) => s + Number(a.total_amount || 0), 0),
    }), [alerts]);

    if (!isSuperAdmin) return null;
    if (dismissed) return null;
    if (!query.data || !enabled) return null;
    if (alerts.length === 0) return null;

    const amountFmt = new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    }).format(totals.amount);

    const close = () => {
        markHiddenToday();
        setDismissed(true);
    };

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="multi-overdue-alert-title"
        >
            <div className="bg-card rounded-2xl border shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Hero */}
                <div className="bg-gradient-to-br from-red-600 to-red-800 text-white px-6 py-5">
                    <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                            <AlertTriangle size={26} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-widest opacity-80 font-semibold">Alerta de impagos</p>
                            <h2 id="multi-overdue-alert-title" className="text-xl font-bold mt-0.5">
                                {alerts.length === 1
                                    ? `${alerts[0].contact_name || 'Un cliente'} acumula ${alerts[0].invoice_count} facturas vencidas`
                                    : `${alerts.length} clientes con múltiples facturas vencidas`}
                            </h2>
                            <p className="text-sm opacity-95 mt-1">
                                {totals.invoices} facturas · <strong>{amountFmt}</strong> de deuda total
                            </p>
                        </div>
                    </div>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <p className="text-xs text-muted-foreground mb-3">
                        Estos clientes tienen {query.data?.threshold ?? 2} o más facturas vencidas simultáneamente. Revisa el módulo de impagos para gestionar recordatorios y contactos.
                    </p>
                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                                <tr>
                                    <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                                    <th className="text-center px-3 py-2 font-semibold">Facturas</th>
                                    <th className="text-right px-3 py-2 font-semibold">Deuda</th>
                                    <th className="text-center px-3 py-2 font-semibold">Máx. días</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {alerts.map(a => (
                                    <tr key={a.contact_id || a.contact_name}>
                                        <td className="px-3 py-2">
                                            <div className="font-semibold text-foreground">{a.contact_name || '(sin nombre)'}</div>
                                            {a.contact_email && <div className="text-[11px] text-muted-foreground truncate max-w-[280px]">{a.contact_email}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200 px-2 py-0.5 text-xs font-bold">
                                                {a.invoice_count}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-foreground">
                                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(a.total_amount)}
                                        </td>
                                        <td className="px-3 py-2 text-center text-amber-600 dark:text-amber-400 font-semibold">
                                            {a.max_days_overdue}d
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Acciones */}
                <div className="border-t bg-muted/30 px-6 py-3 flex flex-col sm:flex-row-reverse gap-2 sm:justify-between">
                    <div className="flex gap-2 justify-end">
                        <Link to="/payments/dunning" onClick={close}>
                            <Button size="sm">
                                Ir al módulo de impagos <ExternalLink size={12} className="ml-1.5" />
                            </Button>
                        </Link>
                    </div>
                    <div className="flex gap-2 items-center">
                        <Button variant="outline" size="sm" onClick={close}>
                            Entendido, ocultar hoy
                        </Button>
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                            Volverá a aparecer mañana si sigue habiendo alertas.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
