import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi, Payment, Beneficiary } from '@/lib/api/payments';
import { payrollApi, Employee } from '@/lib/api/payroll';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrencyWithDecimals } from '@/lib/utils';
import {
    Plus, Check, X, Search, Edit, Trash2, Loader2, Users,
    Table2, Copy, ChevronLeft, ChevronRight, ClipboardCopy,
    Eye, AlertCircle, CalendarRange
} from 'lucide-react';
import { format } from 'date-fns';
import { ChangeLogPanel } from '@/components/ui/ChangeLogPanel';

type PaymentTab = 'payments' | 'beneficiaries';

const BENEFICIARY_TYPES = [
    { value: 'equipo', label: 'Equipo' },
    { value: 'influencer', label: 'Influencer' },
    { value: 'comisiones', label: 'Comisiones' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'piso_yure', label: 'Piso Yure' },
    { value: 'proveedor', label: 'Proveedor' },
];

const PAYMENT_TYPES = BENEFICIARY_TYPES;

const ISSUING_BANKS = ['BBVA', 'BBVA IVA', 'Wise', 'Mercury Business', 'Mercury Nutfruit Budget', 'Mercury Checking', 'Stripe'];
const PAYMENT_METHODS = [...ISSUING_BANKS, 'PayPal', 'Payoneer'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    pendiente: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-100' },
    programado: { label: 'Programado', color: 'text-blue-700', bg: 'bg-blue-100' },
    pagado: { label: 'Pagado', color: 'text-green-700', bg: 'bg-green-100' },
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const emptyPaymentForm = {
    payment_type: 'equipo',
    beneficiary_id: '',
    beneficiary_name: '',
    issuing_bank: '',
    invoice_received_date: '',
    amount_admk: '',
    amount_infinite: '',
    base_amount: '',
    commission_amount: '',
    incentives_amount: '',
    currency: 'EUR' as 'EUR' | 'USD' | 'COP',
    payment_date: '',
    due_date: '',
    notes: '',
};

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={handleCopy} className="inline-flex items-center ml-1 text-muted-foreground hover:text-primary transition-colors p-0.5 rounded" title="Copiar">
            {copied ? <Check size={12} className="text-green-500" /> : <ClipboardCopy size={12} />}
        </button>
    );
}

// Normalize strings for robust matching (removes accents, trims, lowercases)
function normalizeName(s: string) {
    if (!s) return "";
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function matchesEmployee(emp: Employee, benName: string) {
    const normBen = normalizeName(benName);
    const normFullMatch = normalizeName(emp.full_name) || normalizeName(`${emp.first_name || ''} ${emp.last_name || ''}`);
    const normFirst = normalizeName(emp.first_name);
    const normLast = normalizeName(emp.last_name);

    // Direct match
    if (normFullMatch === normBen) return true;

    // Check if beneficiary name contains the first name or last name
    if (normFirst && normBen.includes(normFirst) && normBen.length > 3) return true;
    if (normLast && normBen.includes(normLast) && normBen.length > 3) return true;

    // Check if employee name contains the beneficiary name (if employee name is longer)
    if (normBen && normBen.length > 3 && normFullMatch.includes(normBen)) return true;

    return false;
}

export default function Payments() {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<PaymentTab>('payments');
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [searchTerm, setSearchTerm] = useState('');

    // Date filters
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    // Modal states
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
    const [paymentForm, setPaymentForm] = useState({ ...emptyPaymentForm });

    const [showBeneficiaryForm, setShowBeneficiaryForm] = useState(false);
    const [editingBeneficiary, setEditingBeneficiary] = useState<Beneficiary | null>(null);
    const [beneficiaryForm, setBeneficiaryForm] = useState({
        name: '', type: 'transfer' as Beneficiary['type'], bank_details: '', preferred_payment_method: '', notes: ''
    });

    const [viewBankDetailsFor, setViewBankDetailsFor] = useState<{ name: string, details: string } | null>(null);

    // Filter states
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterBank, setFilterBank] = useState<string>('all');

    // Queries
    const { data: paymentsData, isLoading: loadingPayments } = useQuery({
        queryKey: ['payments-list', year, month],
        queryFn: () => paymentsApi.getPayments(year, month),
    });

    const { data: beneficiariesData, isLoading: loadingBeneficiaries } = useQuery({
        queryKey: ['beneficiaries'],
        queryFn: () => paymentsApi.getBeneficiaries(),
    });

    // Get employees for "equipo" type salary auto-fill
    const { data: employeesData } = useQuery({
        queryKey: ['employees-for-payments'],
        queryFn: () => payrollApi.getEmployees(),
    });

    const payments = paymentsData?.payments || [];
    const beneficiaries = beneficiariesData?.beneficiaries || [];
    const employees = employeesData?.employees || [];

    // Filter beneficiaries by payment type
    const filteredBeneficiaries = useMemo(() => {
        if (!paymentForm.payment_type) return beneficiaries.filter(b => b.is_active);
        return beneficiaries.filter(b => b.is_active && b.type === paymentForm.payment_type);
    }, [beneficiaries, paymentForm.payment_type]);

    // Filtered payments for table
    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            if (filterStatus !== 'all' && p.payment_status !== filterStatus) return false;
            if (filterType !== 'all' && p.payment_type !== filterType) return false;
            if (filterBank !== 'all' && p.issuing_bank !== filterBank) return false;
            if (filterDateFrom && p.payment_date && p.payment_date < filterDateFrom) return false;
            if (filterDateTo && p.payment_date && p.payment_date > filterDateTo) return false;
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                return (p.beneficiary_name?.toLowerCase().includes(q) ||
                    p.notes?.toLowerCase().includes(q) ||
                    p.payment_type.toLowerCase().includes(q));
            }
            return true;
        });
    }, [payments, filterStatus, filterType, filterBank, filterDateFrom, filterDateTo, searchTerm]);

    const programados = useMemo(() => payments.filter(p => p.payment_status === 'programado'), [payments]);

    const { pagadoEUR, pagadoUSD, pagadoCOP, pendienteEUR, pendienteUSD, pendienteCOP } = useMemo(() => {
        const pEUR = filteredPayments.filter(p => p.payment_status === 'pagado' && p.currency === 'EUR').reduce((s, p) => s + Number(p.total_amount), 0);
        const pUSD = filteredPayments.filter(p => p.payment_status === 'pagado' && p.currency === 'USD').reduce((s, p) => s + Number(p.total_amount), 0);
        const pCOP = filteredPayments.filter(p => p.payment_status === 'pagado' && p.currency === 'COP').reduce((s, p) => s + Number(p.total_amount), 0);
        const pendEUR = filteredPayments.filter(p => p.payment_status !== 'pagado' && p.currency === 'EUR').reduce((s, p) => s + Number(p.total_amount), 0);
        const pendUSD = filteredPayments.filter(p => p.payment_status !== 'pagado' && p.currency === 'USD').reduce((s, p) => s + Number(p.total_amount), 0);
        const pendCOP = filteredPayments.filter(p => p.payment_status !== 'pagado' && p.currency === 'COP').reduce((s, p) => s + Number(p.total_amount), 0);
        return { pagadoEUR: pEUR, pagadoUSD: pUSD, pagadoCOP: pCOP, pendienteEUR: pendEUR, pendienteUSD: pendUSD, pendienteCOP: pendCOP };
    }, [filteredPayments]);

    // Unique banks for filter
    const uniqueBanks = useMemo(() => {
        const banks = new Set(payments.map(p => p.issuing_bank).filter(Boolean));
        return Array.from(banks) as string[];
    }, [payments]);

    // Auto-calculate total from form fields
    const calculatedTotal = useMemo(() => {
        return (Number(paymentForm.base_amount) || 0) +
            (Number(paymentForm.incentives_amount) || 0) +
            (Number(paymentForm.commission_amount) || 0);
    }, [paymentForm.base_amount, paymentForm.incentives_amount, paymentForm.commission_amount]);

    // Get beneficiary bank details
    const getBeneficiaryBankDetails = (p: Payment) => {
        if (p.beneficiary_id) {
            const ben = beneficiaries.find(b => b.id === p.beneficiary_id);
            return ben?.bank_details || '';
        }
        return '';
    };

    // Mutations
    const createPaymentMut = useMutation({
        mutationFn: (data: any) => paymentsApi.createPayment({ ...data, fiscal_year: year, fiscal_month: month }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments-list'] }); closePaymentForm(); },
    });

    const updatePaymentMut = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => paymentsApi.updatePayment(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments-list'] }); closePaymentForm(); },
    });

    const deletePaymentMut = useMutation({
        mutationFn: (id: string) => paymentsApi.deletePayment(id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments-list'] }); },
    });

    const statusMut = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) => {
            const paymentDate = status === 'pagado' ? new Date().toISOString().slice(0, 10) : undefined;
            if (status === 'pendiente') {
                return paymentsApi.updatePayment(id, { payment_status: 'pendiente', payment_date: null as any });
            }
            return paymentsApi.updatePaymentStatus(id, status, paymentDate);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments-list'] }); },
    });

    const createBeneficiaryMut = useMutation({
        mutationFn: (data: any) => paymentsApi.createBeneficiary(data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['beneficiaries'] }); closeBeneficiaryForm(); },
    });

    const updateBeneficiaryMut = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => paymentsApi.updateBeneficiary(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['beneficiaries'] }); closeBeneficiaryForm(); },
    });

    const deleteBeneficiaryMut = useMutation({
        mutationFn: (id: string) => paymentsApi.deleteBeneficiary(id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['beneficiaries'] }); },
    });

    // Helpers
    const closePaymentForm = () => { setShowPaymentForm(false); setEditingPayment(null); setPaymentForm({ ...emptyPaymentForm }); };
    const closeBeneficiaryForm = () => { setShowBeneficiaryForm(false); setEditingBeneficiary(null); setBeneficiaryForm({ name: '', type: 'transfer', bank_details: '', preferred_payment_method: '', notes: '' }); };

    const openEditPayment = (p: Payment) => {
        setEditingPayment(p);
        setPaymentForm({
            payment_type: p.payment_type,
            beneficiary_id: p.beneficiary_id || '',
            beneficiary_name: p.beneficiary_name || '',
            issuing_bank: p.issuing_bank || '',
            invoice_received_date: p.invoice_received_date || '',
            amount_admk: p.amount_admk || '',
            amount_infinite: p.amount_infinite || '',
            base_amount: String(p.base_amount || ''),
            commission_amount: String(p.commission_amount || ''),
            incentives_amount: String(p.incentives_amount || ''),
            currency: p.currency || 'EUR',
            payment_date: p.payment_date || '',
            due_date: p.due_date || '',
            notes: p.notes || '',
        });
        setShowPaymentForm(true);
    };

    const openEditBeneficiary = (b: Beneficiary) => {
        setEditingBeneficiary(b);
        setBeneficiaryForm({
            name: b.name,
            type: b.type,
            bank_details: b.bank_details || '',
            preferred_payment_method: b.preferred_payment_method || '',
            notes: b.notes || '',
        });
        setShowBeneficiaryForm(true);
    };

    const duplicatePayment = (p: Payment) => {
        setEditingPayment(null);
        setPaymentForm({
            payment_type: p.payment_type,
            beneficiary_id: p.beneficiary_id || '',
            beneficiary_name: p.beneficiary_name || '',
            issuing_bank: p.issuing_bank || '',
            invoice_received_date: '',
            amount_admk: '',
            amount_infinite: '',
            base_amount: String(p.base_amount || ''),
            commission_amount: String(p.commission_amount || ''),
            incentives_amount: String(p.incentives_amount || ''),
            currency: p.currency || 'EUR',
            payment_date: '',
            due_date: '',
            notes: p.notes || '',
        });
        setShowPaymentForm(true);
    };

    const handleSavePayment = () => {
        const total = (Number(paymentForm.base_amount) || 0) + (Number(paymentForm.incentives_amount) || 0) + (Number(paymentForm.commission_amount) || 0);
        const data = {
            ...paymentForm,
            base_amount: Number(paymentForm.base_amount) || 0,
            commission_amount: Number(paymentForm.commission_amount) || 0,
            incentives_amount: Number(paymentForm.incentives_amount) || 0,
            total_amount: total,
            payment_status: editingPayment?.payment_status || 'pendiente',
            beneficiary_id: paymentForm.beneficiary_id || null,
            invoice_received_date: paymentForm.invoice_received_date || null,
            payment_date: paymentForm.payment_date || null,
            due_date: paymentForm.due_date || null,
        };
        if (editingPayment) {
            updatePaymentMut.mutate({ id: editingPayment.id, data });
        } else {
            createPaymentMut.mutate(data as any);
        }
    };

    const handleSaveBeneficiary = () => {
        if (editingBeneficiary) {
            updateBeneficiaryMut.mutate({ id: editingBeneficiary.id, data: beneficiaryForm });
        } else {
            createBeneficiaryMut.mutate(beneficiaryForm);
        }
    };

    const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else { setMonth(m => m - 1); } };
    const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else { setMonth(m => m + 1); } };

    const handleBeneficiarySelect = (id: string) => {
        const ben = beneficiaries.find(b => b.id === id);
        if (!ben) {
            setPaymentForm({ ...paymentForm, beneficiary_id: '', beneficiary_name: '' });
            return;
        }

        const updates: Partial<typeof paymentForm> = {
            beneficiary_id: id,
            beneficiary_name: ben.name,
            issuing_bank: ben.preferred_payment_method || paymentForm.issuing_bank,
        };

        if (paymentForm.payment_type === 'equipo') {
            const employee = employees.find(e => matchesEmployee(e, ben.name));
            if (employee && employee.current_salary > 0) {
                updates.base_amount = String(employee.current_salary);
                updates.currency = employee.currency || 'EUR';
            }
        }

        setPaymentForm({ ...paymentForm, ...updates });
    };

    const isPending = createPaymentMut.isPending || updatePaymentMut.isPending || createBeneficiaryMut.isPending || updateBeneficiaryMut.isPending;

    // ── Synchronized horizontal scrollbars (top mirror + bottom) ──
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const innerTableRef = useRef<HTMLTableElement>(null);
    const [tableScrollWidth, setTableScrollWidth] = useState(0);

    useEffect(() => {
        const update = () => {
            if (innerTableRef.current) setTableScrollWidth(innerTableRef.current.scrollWidth);
        };
        update();
        const ro = new ResizeObserver(update);
        if (innerTableRef.current) ro.observe(innerTableRef.current);
        return () => ro.disconnect();
    }, [filteredPayments.length, tab]);

    const syncFromTop = () => {
        if (tableScrollRef.current && topScrollRef.current) {
            tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
        }
    };
    const syncFromBottom = () => {
        if (tableScrollRef.current && topScrollRef.current) {
            topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
        }
    };

    return (
        <div className="space-y-6 pb-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Payments</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gestión de pagos y beneficiarios</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrevMonth}><ChevronLeft size={15} /></Button>
                    <div className="flex items-center px-4 h-9 font-semibold bg-card border border-border rounded-xl min-w-[160px] justify-center text-sm">
                        {MONTHS[month - 1]} {year}
                    </div>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleNextMonth}><ChevronRight size={15} /></Button>
                </div>
            </div>

            {/* Tabs — segmented control */}
            <div className="inline-flex bg-muted rounded-xl p-1">
                {([
                    { key: 'payments', label: 'Pagos', icon: Table2 },
                    { key: 'beneficiaries', label: 'Beneficiarios', icon: Users },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${tab === t.key
                            ? 'bg-white dark:bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                        onClick={() => setTab(t.key)}
                    >
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'payments' && (
                <div className="space-y-4">

                    {/* Programados */}
                    {programados.length > 0 && (
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="h-7 w-7 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                                    <AlertCircle className="w-4 h-4 text-blue-600" />
                                </div>
                                <h4 className="text-sm font-bold text-foreground">Próximos pagos programados</h4>
                                <span className="text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 rounded-lg">{programados.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-1">
                                {programados.map(p => (
                                    <div key={p.id} className="bg-muted/50 border border-border px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
                                        <span className="font-semibold text-foreground">{p.beneficiary_name}</span>
                                        <span className="font-bold text-blue-600 tabular">{formatCurrencyWithDecimals(p.total_amount, p.currency)}</span>
                                        {p.due_date && <span className="text-[11px] text-muted-foreground">vence {format(new Date(p.due_date), 'dd/MM/yy')}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 p-4 bg-card border border-border rounded-2xl">
                        <div className="flex items-center gap-2 flex-wrap flex-1">
                            <div className="relative w-56">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input placeholder="Buscar..." className="pl-9 h-9 rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <select className="border border-border rounded-xl px-3 h-9 text-sm bg-background" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                <option value="all">Todos los estados</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="programado">Programado</option>
                                <option value="pagado">Pagado</option>
                            </select>
                            <select className="border border-border rounded-xl px-3 h-9 text-sm bg-background" value={filterType} onChange={e => setFilterType(e.target.value)}>
                                <option value="all">Todos los tipos</option>
                                {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            {uniqueBanks.length > 0 && (
                                <select className="border border-border rounded-xl px-3 h-9 text-sm bg-background" value={filterBank} onChange={e => setFilterBank(e.target.value)}>
                                    <option value="all">Todos los bancos</option>
                                    {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            )}

                            {/* Date range filter */}
                            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 h-9 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                                <CalendarRange className="w-4 h-4 text-primary shrink-0" />
                                <input type="date" className="text-xs bg-transparent outline-none cursor-pointer w-[105px]" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                                <span className="text-muted-foreground/40">–</span>
                                <input type="date" className="text-xs bg-transparent outline-none cursor-pointer w-[105px]" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                                {(filterDateFrom || filterDateTo) && (
                                    <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }} className="text-muted-foreground hover:text-destructive transition-colors" title="Limpiar fechas">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <Button onClick={() => { setEditingPayment(null); setPaymentForm({ ...emptyPaymentForm }); setShowPaymentForm(true); }} className="gap-2 shrink-0 h-9 text-xs font-semibold">
                            <Plus size={15} /> Nuevo Pago
                        </Button>
                    </div>

                    {/* Summary row */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm bg-card border border-border rounded-2xl px-5 py-3">
                        <span className="text-xs font-semibold text-muted-foreground">{filteredPayments.length} pagos listados</span>
                        <div className="h-4 w-px bg-border" />
                        <span className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="font-semibold text-muted-foreground">Pagado:</span>
                            <span className="font-bold text-emerald-600 tabular">
                                {[pagadoEUR > 0 && formatCurrencyWithDecimals(pagadoEUR, 'EUR'), pagadoUSD > 0 && formatCurrencyWithDecimals(pagadoUSD, 'USD'), pagadoCOP > 0 && formatCurrencyWithDecimals(pagadoCOP, 'COP')].filter(Boolean).join('  ·  ') || '€0.00'}
                            </span>
                        </span>
                        <div className="h-4 w-px bg-border" />
                        <span className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            <span className="font-semibold text-muted-foreground">Pendiente:</span>
                            <span className="font-bold text-amber-600 tabular">
                                {[pendienteEUR > 0 && formatCurrencyWithDecimals(pendienteEUR, 'EUR'), pendienteUSD > 0 && formatCurrencyWithDecimals(pendienteUSD, 'USD'), pendienteCOP > 0 && formatCurrencyWithDecimals(pendienteCOP, 'COP')].filter(Boolean).join('  ·  ') || '€0.00'}
                            </span>
                        </span>
                    </div>

                    {/* Table — sticky top scrollbar + sticky header */}
                    <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
                        {/* Top mirror scrollbar (sticky, always reachable) */}
                        <div
                            ref={topScrollRef}
                            onScroll={syncFromTop}
                            className="overflow-x-auto overflow-y-hidden border-b border-border bg-muted/30"
                            style={{ height: 12 }}
                        >
                            <div style={{ width: tableScrollWidth, height: 1 }} />
                        </div>
                        <div
                            ref={tableScrollRef}
                            onScroll={syncFromBottom}
                            className="overflow-auto max-h-[65vh]"
                        >
                            <table ref={innerTableRef} className="w-full text-sm min-w-[900px]">
                                <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur border-b border-border">
                                    <tr>
                                        <th className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</th>
                                        <th className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Beneficiario</th>
                                        <th className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Datos Bancarios</th>
                                        <th className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Banco Emisor</th>
                                        <th className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fact. ADMK</th>
                                        <th className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fact. Infinite</th>
                                        <th className="h-11 px-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Base Imp.</th>
                                        <th className="h-11 px-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Incentivos</th>
                                        <th className="h-11 px-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Comisión</th>
                                        <th className="h-11 px-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total EUR</th>
                                        <th className="h-11 px-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total USD</th>
                                        <th className="h-11 px-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total COP</th>
                                        <th className="h-11 px-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Estado</th>
                                        <th className="h-11 px-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fecha Pago</th>
                                        <th className="h-11 px-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingPayments ? (
                                        <tr><td colSpan={15} className="p-12 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto w-6 h-6" /></td></tr>
                                    ) : filteredPayments.length === 0 ? (
                                        <tr><td colSpan={15} className="p-12 text-center text-sm text-muted-foreground">No se encontraron pagos.</td></tr>
                                    ) : (
                                        filteredPayments.map(p => {
                                            const sc = STATUS_CONFIG[p.payment_status] || STATUS_CONFIG.pendiente;
                                            const bankDetails = getBeneficiaryBankDetails(p);
                                            const totalEUR = p.currency === 'EUR' ? p.total_amount : 0;
                                            const totalUSD = p.currency === 'USD' ? p.total_amount : 0;
                                            const totalCOP = p.currency === 'COP' ? p.total_amount : 0;
                                            return (
                                                <tr key={p.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                                                    <td className="p-3">
                                                        <Badge variant="outline" className="text-xs">{PAYMENT_TYPES.find(t => t.value === p.payment_type)?.label || p.payment_type}</Badge>
                                                    </td>
                                                    <td className="p-3 font-semibold">
                                                        <span>{p.beneficiary_name || '—'}</span>
                                                        {p.beneficiary_name && <CopyButton text={p.beneficiary_name} />}
                                                    </td>
                                                    <td className="p-3 text-xs text-muted-foreground max-w-[150px]">
                                                        {bankDetails ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="truncate">{bankDetails.split('\n')[0]}</span>
                                                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 hover:bg-muted" onClick={() => setViewBankDetailsFor({ name: p.beneficiary_name || 'Desconocido', details: bankDetails })} title="Ver Datos Completos">
                                                                    <Eye size={12} />
                                                                </Button>
                                                            </div>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="p-3 text-muted-foreground text-xs">{p.issuing_bank || '—'}</td>
                                                    <td className="p-3 text-xs text-muted-foreground">{p.amount_admk || '—'}</td>
                                                    <td className="p-3 text-xs text-muted-foreground">{p.amount_infinite || '—'}</td>
                                                    <td className="p-3 text-right tabular">{p.base_amount ? formatCurrencyWithDecimals(p.base_amount, p.currency) : '—'}</td>
                                                    <td className="p-3 text-right tabular text-emerald-600/80">{p.incentives_amount ? formatCurrencyWithDecimals(p.incentives_amount, p.currency) : '—'}</td>
                                                    <td className="p-3 text-right tabular text-rose-600/80">{p.commission_amount ? formatCurrencyWithDecimals(p.commission_amount, p.currency) : '—'}</td>
                                                    <td className="p-3 text-right font-bold tabular">
                                                        {totalEUR > 0 ? (
                                                            <span className="flex items-center justify-end">
                                                                {formatCurrencyWithDecimals(totalEUR)}
                                                                <CopyButton text={String(totalEUR)} />
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="p-3 text-right font-bold tabular text-blue-600">
                                                        {totalUSD > 0 ? (
                                                            <span className="flex items-center justify-end">
                                                                {formatCurrencyWithDecimals(totalUSD, 'USD')}
                                                                <CopyButton text={String(totalUSD)} />
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="p-3 text-right font-bold tabular text-orange-700">
                                                        {totalCOP > 0 ? (
                                                            <span className="flex items-center justify-end">
                                                                {formatCurrencyWithDecimals(totalCOP, 'COP')}
                                                                <CopyButton text={String(totalCOP)} />
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => {
                                                                if (p.payment_status === 'pagado') {
                                                                    statusMut.mutate({ id: p.id, status: 'pendiente' });
                                                                } else {
                                                                    statusMut.mutate({ id: p.id, status: 'pagado' });
                                                                }
                                                            }}
                                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${sc.bg} ${sc.color} hover:opacity-80`}
                                                        >
                                                            {p.payment_status === 'pagado' && <Check size={12} />}
                                                            {sc.label}
                                                        </button>
                                                    </td>
                                                    <td className="p-3 text-center text-xs text-muted-foreground tabular">
                                                        {p.payment_date ? format(new Date(p.payment_date), 'dd/MM/yy') : '—'}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex justify-center gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPayment(p)} title="Editar">
                                                                <Edit size={13} />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicatePayment(p)} title="Duplicar">
                                                                <Copy size={13} />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm('¿Eliminar este pago?')) deletePaymentMut.mutate(p.id); }} title="Eliminar">
                                                                <Trash2 size={13} />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: BENEFICIARIES */}
            {tab === 'beneficiaries' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-muted-foreground">{beneficiaries.length} beneficiarios registrados</p>
                        <Button onClick={() => { setEditingBeneficiary(null); setBeneficiaryForm({ name: '', type: 'transfer', bank_details: '', preferred_payment_method: '', notes: '' }); setShowBeneficiaryForm(true); }} className="gap-2 h-9 text-xs font-semibold">
                            <Plus size={15} /> Nuevo Beneficiario
                        </Button>
                    </div>

                    <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[600px]">
                                <thead className="bg-muted/80 border-b border-border">
                                    <tr>
                                        <th className="h-11 px-4 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nombre</th>
                                        <th className="h-11 px-4 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</th>
                                        <th className="h-11 px-4 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Datos Bancarios</th>
                                        <th className="h-11 px-4 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Método de Pago</th>
                                        <th className="h-11 px-4 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notas</th>
                                        <th className="h-11 px-4 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingBeneficiaries ? (
                                        <tr><td colSpan={6} className="p-12 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto w-6 h-6" /></td></tr>
                                    ) : beneficiaries.length === 0 ? (
                                        <tr><td colSpan={6} className="p-12 text-center text-sm text-muted-foreground">No hay beneficiarios registrados.</td></tr>
                                    ) : (
                                        beneficiaries.map(b => (
                                            <tr key={b.id} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${!b.is_active ? 'opacity-50' : ''}`}>
                                                <td className="p-4 font-semibold">{b.name}</td>
                                                <td className="p-4 text-center">
                                                    <Badge variant="outline" className="text-xs">
                                                        {BENEFICIARY_TYPES.find(t => t.value === b.type)?.label || b.type}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 text-muted-foreground text-xs">{b.bank_details || '—'}</td>
                                                <td className="p-4 text-muted-foreground text-xs">{b.preferred_payment_method || '—'}</td>
                                                <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{b.notes || '—'}</td>
                                                <td className="p-4">
                                                    <div className="flex justify-center gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditBeneficiary(b)}>
                                                            <Edit size={13} />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm('¿Eliminar este beneficiario?')) deleteBeneficiaryMut.mutate(b.id); }}>
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: PAYMENT FORM */}
            {showPaymentForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closePaymentForm}>
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">{editingPayment ? 'Editar Pago' : 'Nuevo Pago'}</h2>
                            <Button variant="ghost" size="icon" onClick={closePaymentForm}><X size={18} /></Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Tipo de Pago</label>
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={paymentForm.payment_type} onChange={e => setPaymentForm({ ...paymentForm, payment_type: e.target.value, beneficiary_id: '', beneficiary_name: '' })}>
                                    {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Beneficiario</label>
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={paymentForm.beneficiary_id} onChange={e => handleBeneficiarySelect(e.target.value)}>
                                    <option value="">Seleccionar beneficiario...</option>
                                    {filteredBeneficiaries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                {filteredBeneficiaries.length === 0 && (
                                    <p className="text-[10px] text-amber-600 mt-0.5">No hay beneficiarios de tipo "{PAYMENT_TYPES.find(t => t.value === paymentForm.payment_type)?.label}"</p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Nombre Beneficiario</label>
                                <Input value={paymentForm.beneficiary_name} onChange={e => setPaymentForm({ ...paymentForm, beneficiary_name: e.target.value })} placeholder="Nombre del beneficiario" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Banco Emisor</label>
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={paymentForm.issuing_bank} onChange={e => setPaymentForm({ ...paymentForm, issuing_bank: e.target.value })}>
                                    <option value="">Seleccionar banco...</option>
                                    {ISSUING_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Fecha Recepción Factura</label>
                                <Input type="date" value={paymentForm.invoice_received_date} onChange={e => setPaymentForm({ ...paymentForm, invoice_received_date: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Moneda</label>
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={paymentForm.currency} onChange={e => setPaymentForm({ ...paymentForm, currency: e.target.value as 'EUR' | 'USD' | 'COP' })}>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="COP">COP ($)</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Nº Factura ADMK</label>
                                <Input value={paymentForm.amount_admk} onChange={e => setPaymentForm({ ...paymentForm, amount_admk: e.target.value })} placeholder="Nº factura ADMK" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Nº Factura Infinite</label>
                                <Input value={paymentForm.amount_infinite} onChange={e => setPaymentForm({ ...paymentForm, amount_infinite: e.target.value })} placeholder="Nº factura Infinite" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Base Imponible</label>
                                <Input type="number" step="0.01" value={paymentForm.base_amount} onChange={e => setPaymentForm({ ...paymentForm, base_amount: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Incentivos</label>
                                <Input type="number" step="0.01" value={paymentForm.incentives_amount} onChange={e => setPaymentForm({ ...paymentForm, incentives_amount: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Comisión</label>
                                <Input type="number" step="0.01" value={paymentForm.commission_amount} onChange={e => setPaymentForm({ ...paymentForm, commission_amount: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Total a Pagar (calculado)</label>
                                <div className="h-10 px-3 border rounded-md bg-muted/30 flex items-center text-sm font-bold">
                                    {formatCurrencyWithDecimals(calculatedTotal, paymentForm.currency)}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Fecha de Vencimiento</label>
                                <Input type="date" value={paymentForm.due_date} onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })} />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <label className="text-xs font-medium">Observaciones</label>
                                <textarea className="w-full px-3 py-2 border rounded-md bg-background text-sm min-h-[60px] resize-y" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Notas adicionales..." />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6 pt-4 border-t">
                            <Button variant="outline" className="flex-1" onClick={closePaymentForm}>Cancelar</Button>
                            <Button className="flex-1" onClick={handleSavePayment} disabled={isPending || calculatedTotal <= 0}>
                                {isPending && <Loader2 className="animate-spin mr-2" size={16} />}
                                {editingPayment ? 'Guardar Cambios' : 'Crear Pago'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: BENEFICIARY FORM */}
            {showBeneficiaryForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeBeneficiaryForm}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">{editingBeneficiary ? 'Editar Beneficiario' : 'Nuevo Beneficiario'}</h2>
                            <Button variant="ghost" size="icon" onClick={closeBeneficiaryForm}><X size={18} /></Button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Nombre *</label>
                                <Input value={beneficiaryForm.name} onChange={e => setBeneficiaryForm({ ...beneficiaryForm, name: e.target.value })} placeholder="Nombre completo o razón social" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Tipo</label>
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={beneficiaryForm.type} onChange={e => setBeneficiaryForm({ ...beneficiaryForm, type: e.target.value as Beneficiary['type'] })}>
                                    {BENEFICIARY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Datos Bancarios</label>
                                <textarea className="w-full px-3 py-2 border rounded-md bg-background text-sm min-h-[60px] resize-y" value={beneficiaryForm.bank_details} onChange={e => setBeneficiaryForm({ ...beneficiaryForm, bank_details: e.target.value })} placeholder="IBAN, cuenta, etc." />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Método de Pago Preferido</label>
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={beneficiaryForm.preferred_payment_method} onChange={e => setBeneficiaryForm({ ...beneficiaryForm, preferred_payment_method: e.target.value })}>
                                    <option value="">Seleccionar...</option>
                                    {PAYMENT_METHODS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Notas</label>
                                <textarea className="w-full px-3 py-2 border rounded-md bg-background text-sm min-h-[60px] resize-y" value={beneficiaryForm.notes} onChange={e => setBeneficiaryForm({ ...beneficiaryForm, notes: e.target.value })} placeholder="Notas adicionales..." />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6 pt-4 border-t">
                            <Button variant="outline" className="flex-1" onClick={closeBeneficiaryForm}>Cancelar</Button>
                            <Button className="flex-1" onClick={handleSaveBeneficiary} disabled={isPending || !beneficiaryForm.name}>
                                {isPending && <Loader2 className="animate-spin mr-2" size={16} />}
                                {editingBeneficiary ? 'Guardar Cambios' : 'Crear Beneficiario'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Historial de cambios */}
            <ChangeLogPanel module="payments" />

            {/* MODAL: VIEW BANK DETAILS */}
            {viewBankDetailsFor && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setViewBankDetailsFor(null)}>
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold truncate pr-4" title={viewBankDetailsFor.name}>Datos de {viewBankDetailsFor.name}</h3>
                            <Button variant="ghost" size="icon" onClick={() => setViewBankDetailsFor(null)} className="shrink-0"><X size={18} /></Button>
                        </div>
                        <div className="bg-muted/30 p-4 rounded-md border font-mono text-sm whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto w-full custom-scrollbar">
                            {viewBankDetailsFor.details}
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setViewBankDetailsFor(null)}>Cerrar</Button>
                            <Button onClick={() => {
                                navigator.clipboard.writeText(viewBankDetailsFor.details);
                                setViewBankDetailsFor(null);
                            }} className="gap-2">
                                <Copy size={16} /> Copiar Todo
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
