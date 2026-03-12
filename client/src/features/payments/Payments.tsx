import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi, Payment, Beneficiary } from '@/lib/api/payments';
import { payrollApi, Employee } from '@/lib/api/payroll';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import {
    Plus, Check, X, Search, Edit, Trash2, Loader2, Users,
    Table2, Copy, ChevronLeft, ChevronRight, ClipboardCopy,
    Eye, AlertCircle, CalendarRange
} from 'lucide-react';
import { format } from 'date-fns';

type PaymentTab = 'payments' | 'beneficiaries';

const BENEFICIARY_TYPES = [
    { value: 'equipo', label: 'Equipo' },
    { value: 'influencer', label: 'Influencer' },
    { value: 'comisiones', label: 'Comisiones' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'piso_yure', label: 'Piso Yure' },
];

const PAYMENT_TYPES = BENEFICIARY_TYPES;

const ISSUING_BANKS = ['BBVA', 'Wise', 'Mercury Business', 'Mercury Nutfruit Budget'];

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
    currency: 'EUR' as 'EUR' | 'USD',
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

    const { pagadoEUR, pagadoUSD, pendienteEUR, pendienteUSD } = useMemo(() => {
        const pEUR = filteredPayments.filter(p => p.payment_status === 'pagado' && p.currency === 'EUR').reduce((s, p) => s + Number(p.total_amount), 0);
        const pUSD = filteredPayments.filter(p => p.payment_status === 'pagado' && p.currency === 'USD').reduce((s, p) => s + Number(p.total_amount), 0);
        const pendEUR = filteredPayments.filter(p => p.payment_status !== 'pagado' && p.currency === 'EUR').reduce((s, p) => s + Number(p.total_amount), 0);
        const pendUSD = filteredPayments.filter(p => p.payment_status !== 'pagado' && p.currency === 'USD').reduce((s, p) => s + Number(p.total_amount), 0);
        return { pagadoEUR: pEUR, pagadoUSD: pUSD, pendienteEUR: pendEUR, pendienteUSD: pendUSD };
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
                    <p className="text-muted-foreground mt-1">Gestión de pagos y beneficiarios</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft size={16} /></Button>
                    <div className="flex items-center px-4 py-2 font-semibold bg-white border rounded-md min-w-[180px] justify-center text-sm">
                        {MONTHS[month - 1]} {year}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight size={16} /></Button>
                </div>
            </div>

            <div className="flex gap-2 border-b pb-1">
                {([
                    { key: 'payments', label: 'Pagos', icon: Table2 },
                    { key: 'beneficiaries', label: 'Beneficiarios', icon: Users },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${tab === t.key
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                        onClick={() => setTab(t.key)}
                    >
                        <t.icon size={16} />
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'payments' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">

                    {/* Alerta de Programados (Cintillo) */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-900 p-4 rounded-lg flex items-start gap-3 w-full shadow-sm">
                        <AlertCircle className="w-5 h-5 mt-0.5 text-blue-600 shrink-0" />
                        <div className="w-full">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                Próximos pagos programados este mes
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">{programados.length}</Badge>
                            </h4>
                            {programados.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2 w-full max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                    {programados.map(p => (
                                        <div key={p.id} className="bg-white border border-blue-100 px-3 py-1.5 rounded-md text-sm flex items-center gap-2 shadow-sm">
                                            <span className="font-medium text-blue-950">{p.beneficiary_name}</span>
                                            <span className="text-muted-foreground/40">|</span>
                                            <span className="font-bold text-blue-700">{formatCurrency(p.total_amount, p.currency)}</span>
                                            {p.due_date && <span className="text-xs text-blue-600/70">Vence: {format(new Date(p.due_date), 'dd/MM/yy')}</span>}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm mt-1 text-blue-600/70">No tienes ningún pago en estado "Programado" actualmente.</p>
                            )}
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 p-4 bg-card border rounded-lg">
                        <div className="flex items-center gap-3 flex-wrap flex-1">
                            <div className="relative w-56">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <select className="border rounded-md px-3 py-2 text-sm bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                <option value="all">Todos los estados</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="programado">Programado</option>
                                <option value="pagado">Pagado</option>
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm bg-white" value={filterType} onChange={e => setFilterType(e.target.value)}>
                                <option value="all">Todos los tipos</option>
                                {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            {uniqueBanks.length > 0 && (
                                <select className="border rounded-md px-3 py-2 text-sm bg-white" value={filterBank} onChange={e => setFilterBank(e.target.value)}>
                                    <option value="all">Todos los bancos</option>
                                    {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            )}

                            {/* Date range filter */}
                            <div className="flex items-center gap-2 bg-muted/30 border rounded-md px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring focus-within:border-primary transition-all">
                                <CalendarRange className="w-4 h-4 text-primary shrink-0" />
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase text-muted-foreground font-semibold leading-none mb-1">Desde fecha</span>
                                        <input type="date" className="text-sm bg-transparent outline-none cursor-pointer w-[110px]" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                                    </div>
                                    <span className="text-muted-foreground/30 text-xl font-light">-</span>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase text-muted-foreground font-semibold leading-none mb-1">Hasta fecha</span>
                                        <input type="date" className="text-sm bg-transparent outline-none cursor-pointer w-[110px]" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                                    </div>
                                </div>
                                {(filterDateFrom || filterDateTo) && (
                                    <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }} className="ml-2 text-muted-foreground hover:text-destructive bg-white rounded-full p-1 shadow-sm border transition-colors" title="Limpiar fechas">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <Button onClick={() => { setEditingPayment(null); setPaymentForm({ ...emptyPaymentForm }); setShowPaymentForm(true); }} className="gap-2 shrink-0">
                            <Plus size={16} /> Nuevo Pago
                        </Button>
                    </div>

                    {/* Summary row */}
                    <div className="flex gap-6 text-sm bg-card border rounded-md px-4 py-2 font-medium">
                        <span className="text-muted-foreground">{filteredPayments.length} pagos listados</span>
                        <div className="h-5 w-px bg-border" />
                        <span className="text-green-600 flex items-center gap-2">
                            <span>Pagado:</span>
                            {pagadoEUR > 0 && <span>{formatCurrency(pagadoEUR, 'EUR')}</span>}
                            {pagadoEUR > 0 && pagadoUSD > 0 && <span className="text-muted-foreground/50">|</span>}
                            {pagadoUSD > 0 && <span>{formatCurrency(pagadoUSD, 'USD')}</span>}
                            {pagadoEUR === 0 && pagadoUSD === 0 && <span>€0.00</span>}
                        </span>
                        <div className="h-5 w-px bg-border" />
                        <span className="text-amber-600 flex items-center gap-2">
                            <span>Pendiente:</span>
                            {pendienteEUR > 0 && <span>{formatCurrency(pendienteEUR, 'EUR')}</span>}
                            {pendienteEUR > 0 && pendienteUSD > 0 && <span className="text-muted-foreground/50">|</span>}
                            {pendienteUSD > 0 && <span>{formatCurrency(pendienteUSD, 'USD')}</span>}
                            {pendienteEUR === 0 && pendienteUSD === 0 && <span>€0.00</span>}
                        </span>
                    </div>

                    {/* Table */}
                    <Card>
                        <div className="rounded-md border overflow-x-auto min-h-[400px]">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-10 px-3 text-left font-medium text-muted-foreground">Tipo</th>
                                        <th className="h-10 px-3 text-left font-medium text-muted-foreground">Beneficiario</th>
                                        <th className="h-10 px-3 text-left font-medium text-muted-foreground">Datos Bancarios</th>
                                        <th className="h-10 px-3 text-left font-medium text-muted-foreground">Banco Emisor</th>
                                        <th className="h-10 px-3 text-left font-medium text-muted-foreground">Fact. ADMK</th>
                                        <th className="h-10 px-3 text-left font-medium text-muted-foreground">Fact. Infinite</th>
                                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">Base Imp.</th>
                                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">Incentivos</th>
                                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">Comisión</th>
                                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">Total EUR</th>
                                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">Total USD</th>
                                        <th className="h-10 px-3 text-center font-medium text-muted-foreground">Estado</th>
                                        <th className="h-10 px-3 text-center font-medium text-muted-foreground">Fecha Pago</th>
                                        <th className="h-10 px-3 text-center font-medium text-muted-foreground w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingPayments ? (
                                        <tr><td colSpan={14} className="p-8 text-center text-muted-foreground bg-white"><Loader2 className="animate-spin mx-auto w-6 h-6" /></td></tr>
                                    ) : filteredPayments.length === 0 ? (
                                        <tr><td colSpan={14} className="p-8 text-center text-muted-foreground bg-white">No se encontraron pagos.</td></tr>
                                    ) : (
                                        filteredPayments.map(p => {
                                            const sc = STATUS_CONFIG[p.payment_status] || STATUS_CONFIG.pendiente;
                                            const bankDetails = getBeneficiaryBankDetails(p);
                                            const totalEUR = p.currency === 'EUR' ? p.total_amount : 0;
                                            const totalUSD = p.currency === 'USD' ? p.total_amount : 0;
                                            return (
                                                <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                                                    <td className="p-3">
                                                        <Badge variant="outline" className="text-xs">{PAYMENT_TYPES.find(t => t.value === p.payment_type)?.label || p.payment_type}</Badge>
                                                    </td>
                                                    <td className="p-3 font-medium">
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
                                                    <td className="p-3 text-muted-foreground">{p.issuing_bank || '—'}</td>
                                                    <td className="p-3 text-xs text-muted-foreground">{p.amount_admk || '—'}</td>
                                                    <td className="p-3 text-xs text-muted-foreground">{p.amount_infinite || '—'}</td>
                                                    <td className="p-3 text-right">{p.base_amount ? formatCurrency(p.base_amount, p.currency) : '—'}</td>
                                                    <td className="p-3 text-right text-emerald-600/80">{p.incentives_amount ? formatCurrency(p.incentives_amount, p.currency) : '—'}</td>
                                                    <td className="p-3 text-right text-rose-600/80">{p.commission_amount ? formatCurrency(p.commission_amount, p.currency) : '—'}</td>
                                                    <td className="p-3 text-right font-bold">
                                                        {totalEUR > 0 ? (
                                                            <span className="flex items-center justify-end">
                                                                {formatCurrency(totalEUR)}
                                                                <CopyButton text={String(totalEUR)} />
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-blue-600">
                                                        {totalUSD > 0 ? (
                                                            <span className="flex items-center justify-end">
                                                                {formatCurrency(totalUSD, 'USD')}
                                                                <CopyButton text={String(totalUSD)} />
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
                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${sc.bg} ${sc.color} hover:opacity-80`}
                                                        >
                                                            {p.payment_status === 'pagado' && <Check size={12} />}
                                                            {sc.label}
                                                        </button>
                                                    </td>
                                                    <td className="p-3 text-center text-xs text-muted-foreground">
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
                    </Card>
                </div>
            )}

            {/* TAB: BENEFICIARIES */}
            {tab === 'beneficiaries' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center justify-between">
                        <p className="text-muted-foreground">{beneficiaries.length} beneficiarios registrados</p>
                        <Button onClick={() => { setEditingBeneficiary(null); setBeneficiaryForm({ name: '', type: 'transfer', bank_details: '', preferred_payment_method: '', notes: '' }); setShowBeneficiaryForm(true); }} className="gap-2">
                            <Plus size={16} /> Nuevo Beneficiario
                        </Button>
                    </div>

                    <Card>
                        <div className="rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Nombre</th>
                                        <th className="h-10 px-4 text-center font-medium text-muted-foreground">Tipo</th>
                                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Datos Bancarios</th>
                                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Método de Pago</th>
                                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Notas</th>
                                        <th className="h-10 px-4 text-center font-medium text-muted-foreground w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingBeneficiaries ? (
                                        <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                                    ) : beneficiaries.length === 0 ? (
                                        <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No hay beneficiarios registrados.</td></tr>
                                    ) : (
                                        beneficiaries.map(b => (
                                            <tr key={b.id} className={`border-b hover:bg-muted/30 transition-colors ${!b.is_active ? 'opacity-50' : ''}`}>
                                                <td className="p-4 font-medium">{b.name}</td>
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
                    </Card>
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
                        <div className="grid grid-cols-2 gap-4">
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
                                <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={paymentForm.currency} onChange={e => setPaymentForm({ ...paymentForm, currency: e.target.value as 'EUR' | 'USD' })}>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="USD">USD ($)</option>
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
                                <Input type="number" value={paymentForm.base_amount} onChange={e => setPaymentForm({ ...paymentForm, base_amount: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Incentivos</label>
                                <Input type="number" value={paymentForm.incentives_amount} onChange={e => setPaymentForm({ ...paymentForm, incentives_amount: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Comisión</label>
                                <Input type="number" value={paymentForm.commission_amount} onChange={e => setPaymentForm({ ...paymentForm, commission_amount: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Total a Pagar (calculado)</label>
                                <div className="h-10 px-3 border rounded-md bg-muted/30 flex items-center text-sm font-bold">
                                    {formatCurrency(calculatedTotal, paymentForm.currency)}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Fecha de Vencimiento</label>
                                <Input type="date" value={paymentForm.due_date} onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })} />
                            </div>
                            <div className="col-span-2 space-y-1">
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
                                    {ISSUING_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
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
