import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import {
    CreditCard, FileText, Search, Copy, Check, Mail, X,
    ChevronLeft, Loader2, AlertCircle, ExternalLink, Ban
} from 'lucide-react';
import {
    paymentLinksApi,
    searchHoldedInvoices,
    type PaymentLink,
    type HoldedInvoice,
} from '@/lib/api/payment-links';

type Mode = 'from_invoice' | 'manual';
type Step = 'select_mode' | 'form' | 'result';

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number, currency = 'EUR') {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100);
}

function formatDate(unix: number | null | undefined) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysSince(unix: number | null | undefined) {
    if (!unix) return null;
    const diff = Date.now() - unix * 1000;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ── Mode Selector ──────────────────────────────────────────────────────────────

function ModeSelector({ onSelect, isDark }: { onSelect: (m: Mode) => void; isDark: boolean }) {
    return (
        <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <h1 className={cn('text-2xl font-bold mb-2', isDark ? 'text-foreground' : 'text-gray-900')}>
                    Generar link de pago
                </h1>
                <p className="text-sm text-muted-foreground">
                    Elige el tipo de link que quieres generar
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    onClick={() => onSelect('from_invoice')}
                    className={cn(
                        'group flex flex-col items-start p-6 rounded-2xl border-2 text-left transition-all hover:scale-[1.02]',
                        isDark
                            ? 'border-border hover:border-primary/60 hover:bg-primary/5 bg-card'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 bg-white'
                    )}
                >
                    <div className={cn(
                        'p-3 rounded-xl mb-4 transition-colors',
                        isDark ? 'bg-primary/15 group-hover:bg-primary/25' : 'bg-blue-100 group-hover:bg-blue-200'
                    )}>
                        <FileText size={22} className={isDark ? 'text-primary' : 'text-blue-600'} />
                    </div>
                    <h3 className={cn('font-bold text-base mb-1.5', isDark ? 'text-foreground' : 'text-gray-900')}>
                        Desde factura de Holded
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Busca y selecciona una factura existente. El importe y concepto se rellenan solos.
                    </p>
                </button>

                <button
                    onClick={() => onSelect('manual')}
                    className={cn(
                        'group flex flex-col items-start p-6 rounded-2xl border-2 text-left transition-all hover:scale-[1.02]',
                        isDark
                            ? 'border-border hover:border-primary/60 hover:bg-primary/5 bg-card'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 bg-white'
                    )}
                >
                    <div className={cn(
                        'p-3 rounded-xl mb-4 transition-colors',
                        isDark ? 'bg-primary/15 group-hover:bg-primary/25' : 'bg-blue-100 group-hover:bg-blue-200'
                    )}>
                        <CreditCard size={22} className={isDark ? 'text-primary' : 'text-blue-600'} />
                    </div>
                    <h3 className={cn('font-bold text-base mb-1.5', isDark ? 'text-foreground' : 'text-gray-900')}>
                        Pago manual
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Para cobros puntuales sin factura previa. Rellena el concepto e importe.
                    </p>
                </button>
            </div>
        </div>
    );
}

// ── Invoice Selector (Holded) ──────────────────────────────────────────────────

function InvoiceSelector({
    onSelect,
    isDark,
}: {
    onSelect: (inv: HoldedInvoice) => void;
    isDark: boolean;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<HoldedInvoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            setError('');
            try {
                const res = await searchHoldedInvoices(query);
                setResults(res.invoices);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Error buscando facturas');
            } finally {
                setLoading(false);
            }
        }, 400);
    }, [query]);

    return (
        <div>
            <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar por número de factura o cliente..."
                    className={cn(
                        'w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                        isDark
                            ? 'bg-muted border-border focus:border-primary text-foreground placeholder:text-muted-foreground'
                            : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900 placeholder:text-gray-400'
                    )}
                />
                {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>

            {error && (
                <p className="text-xs text-red-500 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={13} /> {error}
                </p>
            )}

            <div className={cn('rounded-xl border overflow-hidden', isDark ? 'border-border' : 'border-gray-200')}>
                {results.length === 0 && !loading && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        {query ? 'Sin resultados' : 'Escribe para buscar facturas pendientes'}
                    </p>
                )}
                {results.map(inv => {
                    const days = daysSince(inv.dueDate);
                    const overdue = days !== null && days > 0;
                    return (
                        <button
                            key={inv.id}
                            onClick={() => onSelect(inv)}
                            className={cn(
                                'w-full flex items-center gap-3 px-4 py-3 text-left border-b last:border-0 transition-colors',
                                isDark
                                    ? 'border-border hover:bg-muted/60'
                                    : 'border-gray-100 hover:bg-blue-50/60'
                            )}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={cn('text-xs font-bold', isDark ? 'text-primary' : 'text-blue-600')}>
                                        {inv.docNumber}
                                    </span>
                                    {overdue && (
                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                                            {days}d vencida
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{inv.contactName}</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                    Vence: {formatDate(inv.dueDate)}
                                </p>
                            </div>
                            <span className={cn('text-sm font-bold flex-shrink-0', isDark ? 'text-foreground' : 'text-gray-900')}>
                                {formatCurrency(Math.round(inv.total * 100), inv.currency)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── From Invoice Form ──────────────────────────────────────────────────────────

function FromInvoiceForm({
    onBack,
    onSuccess,
    isDark,
}: {
    onBack: () => void;
    onSuccess: (link: PaymentLink) => void;
    isDark: boolean;
}) {
    const [selected, setSelected] = useState<HoldedInvoice | null>(null);
    const [customerEmail, setCustomerEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    function handleSelect(inv: HoldedInvoice) {
        setSelected(inv);
        setCustomerEmail(inv.contactEmail || '');
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selected) return;
        setLoading(true);
        setError('');
        try {
            const res = await paymentLinksApi.createFromInvoice({
                holded_invoice_id: selected.id,
                holded_doc_number: selected.docNumber,
                concept: `Factura ${selected.docNumber} — ${selected.contactName}`,
                amount_cents: Math.round(selected.total * 100),
                currency: selected.currency || 'EUR',
                customer_email: customerEmail || undefined,
                client_name: selected.contactName,
            });
            onSuccess(res.link);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error generando el link');
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3 mb-6">
                <button type="button" onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
                    <ChevronLeft size={18} className="text-muted-foreground" />
                </button>
                <div>
                    <h2 className="font-bold text-base">Desde factura de Holded</h2>
                    <p className="text-xs text-muted-foreground">Busca y selecciona la factura</p>
                </div>
            </div>

            {!selected ? (
                <InvoiceSelector onSelect={handleSelect} isDark={isDark} />
            ) : (
                <>
                    <div className={cn(
                        'rounded-xl border p-4',
                        isDark ? 'border-primary/40 bg-primary/5' : 'border-blue-200 bg-blue-50/60'
                    )}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className={cn('text-xs font-bold uppercase tracking-wider mb-1', isDark ? 'text-primary' : 'text-blue-600')}>
                                    Factura seleccionada
                                </p>
                                <p className="font-bold text-sm">{selected.docNumber}</p>
                                <p className="text-xs text-muted-foreground">{selected.contactName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Vence: {formatDate(selected.dueDate)}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-xl">{formatCurrency(Math.round(selected.total * 100), selected.currency)}</p>
                                <button
                                    type="button"
                                    onClick={() => setSelected(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
                                >
                                    Cambiar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                            Email del cliente <span className="font-normal normal-case">(opcional, para prerellenar el checkout)</span>
                        </label>
                        <input
                            type="email"
                            value={customerEmail}
                            onChange={e => setCustomerEmail(e.target.value)}
                            placeholder="cliente@empresa.com"
                            className={inputClass(isDark)}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 flex items-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {loading ? <><Loader2 size={15} className="animate-spin" /> Generando...</> : 'Generar link de pago'}
                    </button>
                </>
            )}
        </form>
    );
}

// ── Manual Form ────────────────────────────────────────────────────────────────

function ManualForm({
    onBack,
    onSuccess,
    isDark,
}: {
    onBack: () => void;
    onSuccess: (link: PaymentLink) => void;
    isDark: boolean;
}) {
    const [concept, setConcept] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const amount = parseFloat(amountStr.replace(',', '.'));
        if (!concept.trim()) return setError('El concepto es obligatorio');
        if (isNaN(amount) || amount <= 0) return setError('El importe debe ser mayor que 0');
        setLoading(true);
        setError('');
        try {
            const res = await paymentLinksApi.createManual({
                concept: concept.trim(),
                amount_cents: Math.round(amount * 100),
            });
            onSuccess(res.link);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error generando el link');
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3 mb-6">
                <button type="button" onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
                    <ChevronLeft size={18} className="text-muted-foreground" />
                </button>
                <div>
                    <h2 className="font-bold text-base">Pago manual</h2>
                    <p className="text-xs text-muted-foreground">Concepto e importe, y listo</p>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Concepto <span className="text-red-500">*</span>
                </label>
                <input
                    autoFocus
                    value={concept}
                    onChange={e => setConcept(e.target.value)}
                    placeholder="Ej: Anticipo restyling web — Cliente"
                    className={inputClass(isDark)}
                    required
                />
            </div>

            <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Importe (€) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                    <input
                        type="text"
                        inputMode="decimal"
                        value={amountStr}
                        onChange={e => setAmountStr(e.target.value)}
                        placeholder="1500.00"
                        className={cn(inputClass(isDark), 'pr-8')}
                        required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-500 flex items-center gap-2">
                    <AlertCircle size={14} /> {error}
                </p>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
                {loading ? <><Loader2 size={15} className="animate-spin" /> Generando...</> : 'Generar link de pago'}
            </button>
        </form>
    );
}

// ── Result Screen ──────────────────────────────────────────────────────────────

function ResultScreen({
    link,
    onReset,
    isDark,
}: {
    link: PaymentLink;
    onReset: () => void;
    isDark: boolean;
}) {
    const [copied, setCopied] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailTo, setEmailTo] = useState(link.customer_email || '');
    const [emailSubject, setEmailSubject] = useState(`Link de pago: ${link.concept}`);
    const [emailSending, setEmailSending] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [emailError, setEmailError] = useState('');

    async function handleCopy() {
        await navigator.clipboard.writeText(link.stripe_payment_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }

    async function handleSendEmail(e: React.FormEvent) {
        e.preventDefault();
        if (!emailTo) return;
        setEmailSending(true);
        setEmailError('');
        try {
            await paymentLinksApi.sendEmail(link.id, {
                to: emailTo,
                subject: emailSubject,
            });
            setEmailSent(true);
            setTimeout(() => setShowEmailModal(false), 2000);
        } catch (e: unknown) {
            setEmailError(e instanceof Error ? e.message : 'Error enviando email');
        } finally {
            setEmailSending(false);
        }
    }

    return (
        <div className="max-w-lg mx-auto">
            {/* Success header */}
            <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-4">
                    <Check size={26} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold mb-1">¡Link generado!</h2>
                <p className="text-sm text-muted-foreground">
                    {link.mode === 'from_invoice'
                        ? `Factura ${link.holded_doc_number} · ${link.client_name}`
                        : link.client_name || link.concept}
                </p>
            </div>

            {/* Link box */}
            <div className={cn(
                'rounded-2xl border p-5 mb-5',
                isDark ? 'border-border bg-card' : 'border-gray-200 bg-white'
            )}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Link de pago</p>
                <div className={cn(
                    'flex items-center gap-2 p-3 rounded-xl mb-4',
                    isDark ? 'bg-muted/60' : 'bg-gray-50'
                )}>
                    <p className="text-xs text-muted-foreground truncate flex-1 font-mono">
                        {link.stripe_payment_url}
                    </p>
                    <a
                        href={link.stripe_payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ExternalLink size={13} />
                    </a>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs mb-5">
                    <div className={cn('rounded-xl p-3', isDark ? 'bg-muted/40' : 'bg-gray-50')}>
                        <p className="font-bold text-base text-foreground">
                            {formatCurrency(link.amount_cents, link.currency)}
                        </p>
                        <p className="text-muted-foreground mt-0.5">Importe</p>
                    </div>
                    <div className={cn('rounded-xl p-3', isDark ? 'bg-muted/40' : 'bg-gray-50')}>
                        <p className={cn('font-bold text-base capitalize',
                            link.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                        )}>
                            {link.status === 'active' ? 'Activo' : link.status}
                        </p>
                        <p className="text-muted-foreground mt-0.5">Estado</p>
                    </div>
                    <div className={cn('rounded-xl p-3', isDark ? 'bg-muted/40' : 'bg-gray-50')}>
                        <p className="font-bold text-base text-foreground">24 horas</p>
                        <p className="text-muted-foreground mt-0.5">Expira en</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleCopy}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                            copied
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : isDark
                                    ? 'bg-primary/15 text-primary hover:bg-primary/25'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        )}
                    >
                        {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar link</>}
                    </button>
                    <button
                        onClick={() => setShowEmailModal(true)}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                            isDark
                                ? 'bg-muted/60 text-foreground hover:bg-muted'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                    >
                        <Mail size={14} /> Enviar por email
                    </button>
                </div>
            </div>

            <button
                onClick={onReset}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
                Generar otro link
            </button>

            {/* Email Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className={cn(
                        'w-full max-w-md rounded-2xl border p-6 shadow-2xl',
                        isDark ? 'bg-card border-border' : 'bg-white border-gray-200'
                    )}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold">Enviar link por email</h3>
                            <button onClick={() => { setShowEmailModal(false); setEmailSent(false); setEmailError(''); }} className="p-1.5 rounded-lg hover:bg-muted/60">
                                <X size={16} className="text-muted-foreground" />
                            </button>
                        </div>

                        {emailSent ? (
                            <div className="text-center py-6">
                                <Check size={28} className="text-emerald-500 mx-auto mb-2" />
                                <p className="font-semibold">Email enviado correctamente</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSendEmail} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                        Destinatario <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        autoFocus
                                        value={emailTo}
                                        onChange={e => setEmailTo(e.target.value)}
                                        placeholder="cliente@empresa.com"
                                        className={inputClass(isDark)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                        Asunto
                                    </label>
                                    <input
                                        value={emailSubject}
                                        onChange={e => setEmailSubject(e.target.value)}
                                        className={inputClass(isDark)}
                                    />
                                </div>

                                {emailError && (
                                    <p className="text-sm text-red-500 flex items-center gap-1.5">
                                        <AlertCircle size={13} /> {emailError}
                                    </p>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowEmailModal(false)}
                                        className={cn(
                                            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all',
                                            isDark ? 'bg-muted/60 text-foreground hover:bg-muted' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        )}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={emailSending || !emailTo}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                    >
                                        {emailSending ? <><Loader2 size={13} className="animate-spin" /> Enviando...</> : <><Mail size={13} /> Enviar</>}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Input class helper ─────────────────────────────────────────────────────────

function inputClass(isDark: boolean) {
    return cn(
        'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors',
        isDark
            ? 'bg-muted border-border focus:border-primary text-foreground placeholder:text-muted-foreground'
            : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900 placeholder:text-gray-400'
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GeneratePaymentLink() {
    const { isDark } = useTheme();
    const [step, setStep] = useState<Step>('select_mode');
    const [mode, setMode] = useState<Mode | null>(null);
    const [generatedLink, setGeneratedLink] = useState<PaymentLink | null>(null);

    function handleModeSelect(m: Mode) {
        setMode(m);
        setStep('form');
    }

    function handleSuccess(link: PaymentLink) {
        setGeneratedLink(link);
        setStep('result');
    }

    function handleReset() {
        setStep('select_mode');
        setMode(null);
        setGeneratedLink(null);
    }

    return (
        <div className="min-h-full p-4 sm:p-6">
            <div className={cn(
                'max-w-2xl mx-auto rounded-2xl border p-6 sm:p-8',
                isDark ? 'border-border bg-card/50' : 'border-gray-200 bg-white shadow-sm'
            )}>
                {step === 'select_mode' && (
                    <ModeSelector onSelect={handleModeSelect} isDark={isDark} />
                )}

                {step === 'form' && mode === 'from_invoice' && (
                    <FromInvoiceForm
                        onBack={() => setStep('select_mode')}
                        onSuccess={handleSuccess}
                        isDark={isDark}
                    />
                )}

                {step === 'form' && mode === 'manual' && (
                    <ManualForm
                        onBack={() => setStep('select_mode')}
                        onSuccess={handleSuccess}
                        isDark={isDark}
                    />
                )}

                {step === 'result' && generatedLink && (
                    <ResultScreen link={generatedLink} onReset={handleReset} isDark={isDark} />
                )}
            </div>

            {/* Tip about cancelled mode */}
            {step === 'select_mode' && (
                <div className={cn(
                    'max-w-2xl mx-auto mt-4 px-4 py-3 rounded-xl flex items-start gap-2.5 text-xs',
                    isDark ? 'bg-muted/30 text-muted-foreground' : 'bg-gray-50 text-gray-500'
                )}>
                    <Ban size={13} className="mt-0.5 flex-shrink-0" />
                    Los links generados expiran en 24 horas (límite de Stripe). Puedes cancelarlos antes desde el historial de Pagos.
                </div>
            )}
        </div>
    );
}
