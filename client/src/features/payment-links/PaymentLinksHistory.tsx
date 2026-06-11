import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import {
    Copy, Check, Mail, Ban, RefreshCw, ExternalLink,
    Loader2, AlertCircle, X, Link2
} from 'lucide-react';
import { paymentLinksApi, type PaymentLink, type PaymentLinkStatus } from '@/lib/api/payment-links';
import { useNavigate } from 'react-router-dom';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(cents: number, currency = 'EUR') {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100);
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const STATUS_CONFIG: Record<PaymentLinkStatus, { label: string; classes: string }> = {
    active:    { label: 'Activo',     classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    paid:      { label: 'Pagado',     classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    expired:   { label: 'Expirado',   classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
    cancelled: { label: 'Cancelado',  classes: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
    failed:    { label: 'Fallido',    classes: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
};

// ── Email Modal ────────────────────────────────────────────────────────────────

function SendEmailModal({
    link,
    onClose,
    isDark,
}: {
    link: PaymentLink;
    onClose: () => void;
    isDark: boolean;
}) {
    const [emailTo, setEmailTo] = useState(link.customer_email || '');
    const [emailSubject, setEmailSubject] = useState(`Link de pago: ${link.concept}`);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);
        setError('');
        try {
            await paymentLinksApi.sendEmail(link.id, { to: emailTo, subject: emailSubject });
            setSent(true);
            setTimeout(onClose, 1800);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error enviando email');
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={cn(
                'w-full max-w-md rounded-2xl border p-6 shadow-2xl',
                isDark ? 'bg-card border-border' : 'bg-white border-gray-200'
            )}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold">Reenviar link por email</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60">
                        <X size={16} className="text-muted-foreground" />
                    </button>
                </div>

                {sent ? (
                    <div className="text-center py-6">
                        <Check size={28} className="text-emerald-500 mx-auto mb-2" />
                        <p className="font-semibold">Email enviado</p>
                    </div>
                ) : (
                    <form onSubmit={handleSend} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                Destinatario <span className="text-red-500">*</span>
                            </label>
                            <input
                                autoFocus
                                type="email"
                                value={emailTo}
                                onChange={e => setEmailTo(e.target.value)}
                                placeholder="cliente@empresa.com"
                                required
                                className={cn(
                                    'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                                    isDark
                                        ? 'bg-muted border-border focus:border-primary text-foreground placeholder:text-muted-foreground'
                                        : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900 placeholder:text-gray-400'
                                )}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                Asunto
                            </label>
                            <input
                                value={emailSubject}
                                onChange={e => setEmailSubject(e.target.value)}
                                className={cn(
                                    'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                                    isDark
                                        ? 'bg-muted border-border focus:border-primary text-foreground placeholder:text-muted-foreground'
                                        : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900 placeholder:text-gray-400'
                                )}
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-red-500 flex items-center gap-1.5">
                                <AlertCircle size={13} /> {error}
                            </p>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className={cn(
                                    'flex-1 py-2.5 rounded-xl text-sm font-semibold',
                                    isDark ? 'bg-muted/60 text-foreground hover:bg-muted' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                )}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={sending || !emailTo}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {sending ? <><Loader2 size={13} className="animate-spin" /> Enviando...</> : <><Mail size={13} /> Enviar</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

// ── Row ────────────────────────────────────────────────────────────────────────

function LinkRow({ link, isDark }: { link: PaymentLink; isDark: boolean }) {
    const queryClient = useQueryClient();
    const [copied, setCopied] = useState(false);
    const [showEmail, setShowEmail] = useState(false);

    const cancelMutation = useMutation({
        mutationFn: () => paymentLinksApi.cancel(link.id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-links'] }),
    });

    async function handleCopy() {
        await navigator.clipboard.writeText(link.stripe_payment_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const cfg = STATUS_CONFIG[link.status];
    const isActive = link.status === 'active';

    return (
        <>
            <div className={cn(
                'grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[2fr_1fr_auto_auto_auto] items-center gap-3 px-4 py-3.5 border-b last:border-0 transition-colors',
                isDark ? 'border-border hover:bg-muted/30' : 'border-gray-100 hover:bg-gray-50/60'
            )}>
                {/* Info */}
                <div className="min-w-0">
                    <p className={cn('text-sm font-semibold truncate', isDark ? 'text-foreground' : 'text-gray-900')}>
                        {link.concept}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">{formatDateTime(link.created_at)}</span>
                        {link.created_by_email && (
                            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[160px]">
                                · {link.created_by_email}
                            </span>
                        )}
                        {link.mode === 'from_invoice' && link.holded_doc_number && (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', isDark ? 'bg-primary/15 text-primary' : 'bg-blue-50 text-blue-600')}>
                                {link.holded_doc_number}
                            </span>
                        )}
                    </div>
                </div>

                {/* Amount — hidden on mobile */}
                <div className="hidden sm:block text-right">
                    <p className="text-sm font-bold">{formatCurrency(link.amount_cents, link.currency)}</p>
                    {link.paid_at && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                            Pagado {formatDateTime(link.paid_at)}
                        </p>
                    )}
                </div>

                {/* Status */}
                <span className={cn('text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap', cfg.classes)}>
                    {cfg.label}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {isActive && (
                        <>
                            <button
                                onClick={handleCopy}
                                title="Copiar link"
                                className={cn(
                                    'p-1.5 rounded-lg transition-colors',
                                    copied
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                                )}
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <a
                                href={link.stripe_payment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir link"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            >
                                <ExternalLink size={14} />
                            </a>
                            <button
                                onClick={() => setShowEmail(true)}
                                title="Enviar por email"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            >
                                <Mail size={14} />
                            </button>
                            <button
                                onClick={() => cancelMutation.mutate()}
                                disabled={cancelMutation.isPending}
                                title="Cancelar link"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                            >
                                {cancelMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                            </button>
                        </>
                    )}
                    {!isActive && link.status === 'paid' && (
                        <span className="text-xs text-muted-foreground px-2">
                            {formatCurrency(link.amount_cents, link.currency)}
                        </span>
                    )}
                </div>
            </div>

            {showEmail && (
                <SendEmailModal link={link} onClose={() => setShowEmail(false)} isDark={isDark} />
            )}
        </>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: string; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'paid', label: 'Pagados' },
    { value: 'expired', label: 'Expirados' },
    { value: 'cancelled', label: 'Cancelados' },
];

export default function PaymentLinksHistory() {
    const { isDark } = useTheme();
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('');

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['payment-links', statusFilter],
        queryFn: () => paymentLinksApi.list(statusFilter ? { status: statusFilter } : undefined),
    });

    const links = data?.links ?? [];

    return (
        <div className="p-4 sm:p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-lg font-bold">Historial de links de pago</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {links.length} link{links.length !== 1 ? 's' : ''}
                        {statusFilter ? ` · ${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className={cn(
                            'p-2 rounded-xl transition-colors',
                            isDark ? 'hover:bg-muted/60 text-muted-foreground' : 'hover:bg-gray-100 text-gray-500'
                        )}
                    >
                        <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => navigate('/payments/generate-link')}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all flex items-center gap-2"
                    >
                        <Link2 size={14} /> Nuevo link
                    </button>
                </div>
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5 flex-wrap">
                {STATUS_FILTERS.map(f => (
                    <button
                        key={f.value}
                        onClick={() => setStatusFilter(f.value)}
                        className={cn(
                            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                            statusFilter === f.value
                                ? isDark
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-blue-100 text-blue-700'
                                : isDark
                                    ? 'bg-muted/40 text-muted-foreground hover:bg-muted/70'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className={cn('rounded-2xl border overflow-hidden', isDark ? 'border-border bg-card/50' : 'border-gray-200 bg-white shadow-sm')}>
                {isLoading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={20} className="animate-spin text-muted-foreground" />
                    </div>
                )}

                {isError && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <AlertCircle size={20} className="text-red-500" />
                        <p className="text-sm text-muted-foreground">Error cargando el historial</p>
                        <button onClick={() => refetch()} className="text-xs text-blue-500 hover:underline">
                            Reintentar
                        </button>
                    </div>
                )}

                {!isLoading && !isError && links.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Link2 size={28} className="text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                            {statusFilter ? 'No hay links con ese estado' : 'Aún no se ha generado ningún link'}
                        </p>
                        {!statusFilter && (
                            <button
                                onClick={() => navigate('/payments/generate-link')}
                                className="text-xs font-semibold text-blue-500 hover:underline"
                            >
                                Generar el primero
                            </button>
                        )}
                    </div>
                )}

                {!isLoading && !isError && links.length > 0 && (
                    <div>
                        {/* Column headers */}
                        <div className={cn(
                            'hidden sm:grid grid-cols-[2fr_1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-b',
                            isDark ? 'border-border bg-muted/20' : 'border-gray-100 bg-gray-50/80'
                        )}>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Concepto</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">Importe</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estado</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Acciones</span>
                        </div>
                        {links.map(link => (
                            <LinkRow key={link.id} link={link} isDark={isDark} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
