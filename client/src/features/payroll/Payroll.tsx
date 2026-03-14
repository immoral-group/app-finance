import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollApi, Employee, CreateEmployeeDTO } from '@/lib/api/payroll';
import { settingsApi } from '@/lib/api/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import {
    X, History,
    Plus, Pencil, UserCheck, UserX, TrendingUp,
    Search, Trash2, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Modal = 'none' | 'create' | 'edit' | 'salary_history' | 'update_salary' | 'confirm_delete';

const EMPTY_CREATE: CreateEmployeeDTO = {
    first_name: '',
    last_name: '',
    email: '',
    hire_date: format(new Date(), 'yyyy-MM-dd'),
    current_salary: 0,
    position: '',
    primary_department_id: '',
    currency: 'EUR',
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Payroll() {
    const queryClient = useQueryClient();
    const [modal, setModal] = useState<Modal>('none');
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    // Filtros
    const [search, setSearch] = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    // Formulario crear empleado
    const [createForm, setCreateForm] = useState<CreateEmployeeDTO>(EMPTY_CREATE);

    // Formulario editar empleado
    const [editForm, setEditForm] = useState({
        first_name: '', last_name: '', email: '', position: '', primary_department_id: '', employee_code: '', currency: 'EUR' as 'EUR' | 'USD'
    });

    // Formulario modificación de sueldo (CEO)
    // 'adjustment' es el monto a SUMAR/RESTAR al salario actual
    const [salaryForm, setSalaryForm] = useState({
        employee_id: '',
        adjustment: '',       // monto del ajuste (+/-)
        effective_from: format(new Date(), 'yyyy-MM-dd'),
        change_reason: '',
    });

    // ── Queries ──────────────────────────────────────────────────────────────
    const { data: employeesData, isLoading: loadingEmployees } = useQuery({
        queryKey: ['employees'],
        queryFn: () => payrollApi.getEmployees(),
    });

    const { data: employeeDetail } = useQuery({
        queryKey: ['employee', selectedEmployee?.id],
        queryFn: () => payrollApi.getEmployee(selectedEmployee!.id),
        enabled: !!selectedEmployee && (modal === 'salary_history'),
    });

    const { data: departmentsData } = useQuery({
        queryKey: ['departments'],
        queryFn: () => settingsApi.getDepartments(),
    });

    // ── Mutations ─────────────────────────────────────────────────────────────
    const createMutation = useMutation({
        mutationFn: () => payrollApi.createEmployee(createForm),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            setModal('none');
            setCreateForm(EMPTY_CREATE);
        },
    });

    const editMutation = useMutation({
        mutationFn: () => payrollApi.updateEmployee(selectedEmployee!.id, editForm),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            setModal('none');
        },
    });

    const toggleStatusMutation = useMutation({
        mutationFn: (emp: Employee) =>
            payrollApi.updateEmployee(emp.id, { is_active: !emp.is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
        },
    });

    const salaryMutation = useMutation({
        mutationFn: () => {
            const emp = employees.find(e => e.id === salaryForm.employee_id);
            const currentSalary = emp ? Number(emp.current_salary) : 0;
            const adjustment = Number(salaryForm.adjustment);
            const newSalary = currentSalary + adjustment;
            return payrollApi.updateSalary(salaryForm.employee_id, {
                new_salary: newSalary,
                effective_from: salaryForm.effective_from,
                change_reason: salaryForm.change_reason || (adjustment >= 0 ? 'Aumento salarial' : 'Ajuste salarial'),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: ['employee'] });
            setModal('none');
            setSalaryForm({ employee_id: '', adjustment: '', effective_from: format(new Date(), 'yyyy-MM-dd'), change_reason: '' });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => payrollApi.deleteEmployee(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            setModal('none');
            setSelectedEmployee(null);
        },
    });

    // ── Helpers ───────────────────────────────────────────────────────────────
    const employees = employeesData?.employees || [];
    const departments = departmentsData || [];

    // Empleados filtrados
    const filteredEmployees = useMemo(() => {
        return employees.filter((emp) => {
            const q = search.toLowerCase();
            const matchSearch = !q ||
                emp.full_name?.toLowerCase().includes(q) ||
                emp.position?.toLowerCase().includes(q) ||
                emp.employee_code?.toLowerCase().includes(q);
            const matchDept = !deptFilter || emp.primary_department_id === deptFilter;
            const matchStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && emp.is_active) ||
                (statusFilter === 'inactive' && !emp.is_active);
            return matchSearch && matchDept && matchStatus;
        });
    }, [employees, search, deptFilter, statusFilter]);


    const openEdit = (emp: Employee) => {
        setSelectedEmployee(emp);
        setEditForm({
            first_name: emp.first_name,
            last_name: emp.last_name,
            email: emp.email || '',
            position: emp.position,
            primary_department_id: emp.primary_department_id || '',
            employee_code: emp.employee_code,
            currency: emp.currency || 'EUR',
        });
        setModal('edit');
    };

    const openHistory = (emp: Employee) => {
        setSelectedEmployee(emp);
        setModal('salary_history');
    };

    const openUpdateSalary = (emp?: Employee) => {
        setSalaryForm({
            employee_id: emp?.id || '',
            adjustment: '',
            effective_from: format(new Date(), 'yyyy-MM-dd'),
            change_reason: '',
        });
        setModal('update_salary');
    };

    const openConfirmDelete = (emp: Employee) => {
        setSelectedEmployee(emp);
        setModal('confirm_delete');
    };

    const closeModal = () => { setModal('none'); setSelectedEmployee(null); };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Gestión de Empleados</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Administra tu equipo, salarios e historial de ajustes.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" className="gap-2 text-xs md:text-sm" onClick={() => openUpdateSalary()}>
                        <TrendingUp size={16} /> Modificar Sueldo
                    </Button>
                    <Button className="gap-2 text-xs md:text-sm" onClick={() => { setCreateForm(EMPTY_CREATE); setModal('create'); }}>
                        <Plus size={16} /> Nuevo Empleado
                    </Button>
                </div>
            </div>

            {/* Barra de búsqueda y filtros — siempre visibles */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre, cargo o código..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <select
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm w-full sm:min-w-[180px] sm:w-auto"
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                >
                    <option value="">Todos los departamentos</option>
                    {departments.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
                <select
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm w-full sm:min-w-[150px] sm:w-auto"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                </select>
                {(search || deptFilter || statusFilter !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setDeptFilter(''); setStatusFilter('all'); }} className="text-muted-foreground whitespace-nowrap">
                        <X size={14} className="mr-1" /> Limpiar
                    </Button>
                )}
            </div>

            {/* Tabla de empleados */}
            <Card className="overflow-x-auto">

                <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Trabajador</th>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cargo</th>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Departamento</th>
                            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Divisa</th>
                            <th className="h-10 px-4 text-right font-medium text-muted-foreground">Salario Actual</th>
                            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Estado</th>
                            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Historial</th>
                            <th className="h-10 px-4 text-right font-medium text-muted-foreground">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingEmployees ? (
                            <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Cargando empleados...</td></tr>
                        ) : filteredEmployees.length === 0 ? (
                            <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                                {employees.length === 0 ? 'No hay empleados registrados. Haz clic en "Nuevo Empleado".' : 'No se encontraron empleados con esos filtros.'}
                            </td></tr>
                        ) : (
                            filteredEmployees.map((emp) => (
                                <tr key={emp.id} className="border-b hover:bg-muted/30 transition-colors">
                                    <td className="p-4">
                                        <div className="font-medium">{emp.full_name}</div>
                                        <div className="text-xs text-muted-foreground">{emp.employee_code}</div>
                                    </td>
                                    <td className="p-4 text-muted-foreground">{emp.position}</td>
                                    <td className="p-4 text-muted-foreground">{(emp as any).department?.name || '—'}</td>
                                    <td className="p-4 text-center">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${emp.currency === 'USD' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {emp.currency || 'EUR'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-semibold">{formatCurrency(emp.current_salary, emp.currency || 'EUR')}</td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => toggleStatusMutation.mutate(emp)}
                                            disabled={toggleStatusMutation.isPending}
                                            title={emp.is_active ? 'Clic para desactivar' : 'Clic para activar'}
                                            className="transition-transform hover:scale-105"
                                        >
                                            <Badge
                                                variant={emp.is_active ? 'default' : 'secondary'}
                                                className={`cursor-pointer select-none ${emp.is_active ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}
                                            >
                                                {emp.is_active
                                                    ? <><UserCheck size={12} className="inline mr-1" />Activo</>
                                                    : <><UserX size={12} className="inline mr-1" />Inactivo</>}
                                            </Badge>
                                        </button>
                                    </td>
                                    <td className="p-4 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => openHistory(emp)} title="Ver historial de salarios">
                                            <History size={16} />
                                        </Button>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(emp)} title="Editar datos">
                                                <Pencil size={14} />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => openUpdateSalary(emp)} title="Modificar sueldo">
                                                <TrendingUp size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost" size="sm"
                                                onClick={() => openConfirmDelete(emp)}
                                                title="Eliminar permanentemente"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </Card>

            {/* ══════════════════════════════════════════════════════════════
                MODAL: CREAR EMPLEADO
            ══════════════════════════════════════════════════════════════ */}
            {
                modal === 'create' && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <Card className="w-full max-w-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
                            <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-white z-10 border-b">
                                <div>
                                    <CardTitle className="flex items-center gap-2"><Plus size={18} /> Nuevo Empleado</CardTitle>
                                    <CardDescription>Completa los datos para registrar un nuevo trabajador.</CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={closeModal}><X size={20} /></Button>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Nombre *</label>
                                        <Input value={createForm.first_name} onChange={e => setCreateForm({ ...createForm, first_name: e.target.value })} placeholder="Ej: Juan" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Apellido *</label>
                                        <Input value={createForm.last_name} onChange={e => setCreateForm({ ...createForm, last_name: e.target.value })} placeholder="Ej: Pérez" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Email *</label>
                                        <Input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} placeholder="juan@empresa.com" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Cargo *</label>
                                        <Input value={createForm.position} onChange={e => setCreateForm({ ...createForm, position: e.target.value })} placeholder="Ej: Diseñador Senior" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Departamento *</label>
                                        <select
                                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                            value={createForm.primary_department_id}
                                            onChange={e => setCreateForm({ ...createForm, primary_department_id: e.target.value })}
                                        >
                                            <option value="">Seleccionar departamento...</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Moneda de Pago *</label>
                                        <select
                                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                            value={createForm.currency || 'EUR'}
                                            onChange={e => setCreateForm({ ...createForm, currency: e.target.value as 'USD' | 'EUR' })}
                                        >
                                            <option value="EUR">Euros (EUR)</option>
                                            <option value="USD">Dólares (USD)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Salario Inicial *</label>
                                        <Input type="number" value={createForm.current_salary || ''} onChange={e => setCreateForm({ ...createForm, current_salary: Number(e.target.value) })} placeholder="0.00" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Fecha de Ingreso *</label>
                                        <Input type="date" value={createForm.hire_date} onChange={e => setCreateForm({ ...createForm, hire_date: e.target.value })} />
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" className="flex-1" onClick={closeModal}>Cancelar</Button>
                                    <Button
                                        className="flex-1"
                                        onClick={() => createMutation.mutate()}
                                        disabled={
                                            !createForm.first_name || !createForm.last_name || !createForm.email ||
                                            !createForm.position || !createForm.primary_department_id ||
                                            !createForm.current_salary ||
                                            createMutation.isPending
                                        }
                                    >
                                        {createMutation.isPending ? 'Guardando...' : 'Crear Empleado'}
                                    </Button>
                                </div>
                                {createMutation.isError && (
                                    <p className="text-sm text-red-500 text-center">Error al crear el empleado. Verifica los datos.</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* ══════════════════════════════════════════════════════════════
                MODAL: EDITAR EMPLEADO
            ══════════════════════════════════════════════════════════════ */}
            {
                modal === 'edit' && selectedEmployee && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <Card className="w-full max-w-xl bg-white shadow-xl">
                            <CardHeader className="flex flex-row items-center justify-between border-b">
                                <div>
                                    <CardTitle className="flex items-center gap-2"><Pencil size={18} /> Editar Empleado</CardTitle>
                                    <CardDescription>{selectedEmployee.full_name}</CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={closeModal}><X size={20} /></Button>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Nombre</label>
                                        <Input value={editForm.first_name} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Apellido</label>
                                        <Input value={editForm.last_name} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Email</label>
                                        <Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Código de Empleado</label>
                                        <Input value={editForm.employee_code} onChange={e => setEditForm({ ...editForm, employee_code: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Cargo</label>
                                        <Input value={editForm.position} onChange={e => setEditForm({ ...editForm, position: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Departamento</label>
                                        <select
                                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                            value={editForm.primary_department_id}
                                            onChange={e => setEditForm({ ...editForm, primary_department_id: e.target.value })}
                                        >
                                            <option value="">Seleccionar departamento...</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Moneda de Pago</label>
                                    <select
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                        value={editForm.currency || 'EUR'}
                                        onChange={e => setEditForm({ ...editForm, currency: e.target.value as 'EUR' | 'USD' })}
                                    >
                                        <option value="EUR">Euros (EUR)</option>
                                        <option value="USD">Dólares (USD)</option>
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" className="flex-1" onClick={closeModal}>Cancelar</Button>
                                    <Button className="flex-1" onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
                                        {editMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* ══════════════════════════════════════════════════════════════
                MODAL: MODIFICAR SUELDO (CEO)
            ══════════════════════════════════════════════════════════════ */}
            {
                modal === 'update_salary' && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <Card className="w-full max-w-lg bg-white shadow-xl">
                            <CardHeader className="flex flex-row items-center justify-between border-b">
                                <div>
                                    <CardTitle className="flex items-center gap-2"><TrendingUp size={18} /> Modificar Sueldo</CardTitle>
                                    <CardDescription>Registra un ajuste salarial para un trabajador.</CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={closeModal}><X size={20} /></Button>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                {/* Selección de empleado */}
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Trabajador *</label>
                                    <select
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                        value={salaryForm.employee_id}
                                        onChange={e => setSalaryForm({ ...salaryForm, employee_id: e.target.value })}
                                    >
                                        <option value="">Seleccionar trabajador...</option>
                                        {employees.filter(e => e.is_active).map(e => (
                                            <option key={e.id} value={e.id}>
                                                {e.full_name} — {e.position} ({formatCurrency(e.current_salary, e.currency || 'EUR')})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Salario actual (informativo) */}
                                {salaryForm.employee_id && (() => {
                                    const emp = employees.find(e => e.id === salaryForm.employee_id);
                                    return emp ? (
                                        <div className="p-3 bg-muted/30 rounded-lg flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">Salario actual</span>
                                            <span className="font-bold text-lg">{formatCurrency(emp.current_salary, emp.currency || 'EUR')}</span>
                                        </div>
                                    ) : null;
                                })()}

                                {/* Monto del ajuste */}
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Monto del Aumento / Ajuste *</label>
                                    <Input
                                        type="number"
                                        placeholder="Ej: 200 (positivo = aumento, negativo = reducción)"
                                        value={salaryForm.adjustment}
                                        onChange={e => setSalaryForm({ ...salaryForm, adjustment: e.target.value })}
                                    />
                                    {salaryForm.adjustment && (() => {
                                        const emp = employees.find((e: any) => e.id === salaryForm.employee_id);
                                        const current = emp ? Number(emp.current_salary) : 0;
                                        const adj = Number(salaryForm.adjustment);
                                        const newSal = current + adj;
                                        const isIncrease = adj >= 0;
                                        return (
                                            <p className={`text-sm font-medium mt-1 ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                                                {isIncrease ? '↑' : '↓'} Nuevo salario: {formatCurrency(newSal, emp?.currency || 'EUR')}
                                                <span className="text-muted-foreground font-normal ml-2">
                                                    ({isIncrease ? '+' : ''}{formatCurrency(adj, emp?.currency || 'EUR')})
                                                </span>
                                            </p>
                                        );
                                    })()}
                                </div>

                                {/* Fecha efectiva */}
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Fecha Efectiva *</label>
                                    <Input
                                        type="date"
                                        value={salaryForm.effective_from}
                                        onChange={e => setSalaryForm({ ...salaryForm, effective_from: e.target.value })}
                                    />
                                </div>

                                {/* Motivo */}
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Motivo del Ajuste <span className="text-muted-foreground text-xs">(opcional)</span></label>
                                    <Input
                                        placeholder="Ej: Revisión anual, Promoción, Ajuste por inflación..."
                                        value={salaryForm.change_reason}
                                        onChange={e => setSalaryForm({ ...salaryForm, change_reason: e.target.value })}
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" className="flex-1" onClick={closeModal}>Cancelar</Button>
                                    <Button
                                        className="flex-1"
                                        onClick={() => salaryMutation.mutate()}
                                        disabled={
                                            !salaryForm.employee_id || !salaryForm.adjustment ||
                                            salaryMutation.isPending
                                        }
                                    >
                                        {salaryMutation.isPending ? 'Guardando...' : 'Registrar Modificación'}
                                    </Button>
                                </div>
                                {salaryMutation.isError && (
                                    <p className="text-sm text-red-500 text-center">Error al actualizar el sueldo.</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* ══════════════════════════════════════════════════════════════
                MODAL: HISTORIAL DE SALARIOS
            ══════════════════════════════════════════════════════════════ */}
            {
                modal === 'salary_history' && selectedEmployee && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <Card className="w-full max-w-2xl bg-white shadow-xl max-h-[85vh] overflow-y-auto">
                            <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-white z-10 border-b">
                                <div>
                                    <CardTitle className="flex items-center gap-2"><History size={18} /> Historial de Salarios</CardTitle>
                                    <CardDescription>{selectedEmployee.full_name} — {selectedEmployee.position}</CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={closeModal}><X size={20} /></Button>
                            </CardHeader>
                            <CardContent className="p-6 space-y-5">
                                {/* Salario actual + última modificación */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Salario Actual</p>
                                        <p className="text-2xl font-bold text-primary">{formatCurrency(selectedEmployee.current_salary, selectedEmployee.currency || 'EUR')}</p>
                                    </div>
                                    {(() => {
                                        const history: any[] = (employeeDetail?.employee as any)?.salary_history || [];
                                        const sorted = [...history].sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
                                        const last = sorted[0];
                                        if (!last || !last.old_salary) return (
                                            <div className="p-4 bg-muted/20 rounded-lg">
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Salario Inicial</p>
                                                <p className="text-sm text-muted-foreground">Sin modificaciones previas</p>
                                            </div>
                                        );
                                        const diff = last.new_salary - last.old_salary;
                                        const pct = ((diff / last.old_salary) * 100).toFixed(1);
                                        return (
                                            <div className={`p-4 rounded-lg border ${diff >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Última Modificación</p>
                                                <p className={`text-lg font-bold ${diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                    {diff >= 0 ? '+' : ''}{formatCurrency(diff, selectedEmployee.currency || 'EUR')} ({diff >= 0 ? '+' : ''}{pct}%)
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {format(new Date(last.effective_from), 'dd MMM yyyy')} — {last.change_reason || 'Sin motivo'}
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Tabla historial */}
                                <div className="border rounded-md overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-2 text-left">Anterior</th>
                                                <th className="px-4 py-2 text-left">Modificación</th>
                                                <th className="px-4 py-2 text-left">Nuevo</th>
                                                <th className="px-4 py-2 text-left">Fecha Efectiva</th>
                                                <th className="px-4 py-2 text-left">Motivo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!employeeDetail ? (
                                                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Cargando historial...</td></tr>
                                            ) : (() => {
                                                const history: any[] = (employeeDetail.employee as any)?.salary_history || [];
                                                if (history.length === 0) return (
                                                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sin historial disponible.</td></tr>
                                                );
                                                const sorted = [...history].sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
                                                return sorted.map((h: any, i: number) => {
                                                    const diff = h.old_salary ? h.new_salary - h.old_salary : null;
                                                    const pct = diff && h.old_salary ? ((diff / h.old_salary) * 100).toFixed(1) : null;
                                                    return (
                                                        <tr key={i} className={`border-b last:border-0 hover:bg-muted/20 ${i === 0 ? 'bg-muted/10' : ''}`}>
                                                            <td className="px-4 py-3 text-muted-foreground">{h.old_salary ? formatCurrency(h.old_salary, selectedEmployee.currency || 'EUR') : <span className="italic text-xs">Inicial</span>}</td>
                                                            <td className="px-4 py-3">
                                                                {diff !== null ? (
                                                                    <span className={`font-semibold text-xs px-2 py-0.5 rounded-full ${diff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                        {diff >= 0 ? '↑' : '↓'} {diff >= 0 ? '+' : ''}{formatCurrency(diff, selectedEmployee.currency || 'EUR')} ({diff >= 0 ? '+' : ''}{pct}%)
                                                                    </span>
                                                                ) : <span className="text-xs text-muted-foreground">Salario inicial</span>}
                                                            </td>
                                                            <td className="px-4 py-3 font-semibold text-green-700">{formatCurrency(h.new_salary, selectedEmployee.currency || 'EUR')}</td>
                                                            <td className="px-4 py-3 text-sm">{format(new Date(h.effective_from), 'dd MMM yyyy')}</td>
                                                            <td className="px-4 py-3 text-xs text-muted-foreground">{h.change_reason || '—'}</td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex justify-end">
                                    <Button onClick={() => openUpdateSalary(selectedEmployee)} className="gap-2">
                                        <TrendingUp size={16} /> Registrar Nuevo Ajuste
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )
            }
            {/* ══════════════════════════════════════════════════════════════
                MODAL: CONFIRMAR ELIMINACIÓN
            ══════════════════════════════════════════════════════════════ */}
            {
                modal === 'confirm_delete' && selectedEmployee && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <Card className="w-full max-w-md bg-white shadow-xl">
                            <CardHeader className="flex flex-row items-center justify-between border-b">
                                <CardTitle className="flex items-center gap-2 text-destructive">
                                    <AlertTriangle size={18} /> Eliminar Empleado
                                </CardTitle>
                                <Button variant="ghost" size="icon" onClick={closeModal}><X size={20} /></Button>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                                    <p className="font-semibold text-destructive">¿Eliminar permanentemente a {selectedEmployee.full_name}?</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Esta acción <strong>no se puede deshacer</strong>. Se eliminarán todos sus datos y su historial de salarios.
                                    </p>
                                </div>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <p><span className="font-medium">Código:</span> {selectedEmployee.employee_code}</p>
                                    <p><span className="font-medium">Cargo:</span> {selectedEmployee.position}</p>
                                    <p><span className="font-medium">Salario:</span> {formatCurrency(selectedEmployee.current_salary, selectedEmployee.currency || 'EUR')}</p>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" className="flex-1" onClick={closeModal}>Cancelar</Button>
                                    <Button
                                        variant="destructive"
                                        className="flex-1"
                                        onClick={() => deleteMutation.mutate(selectedEmployee.id)}
                                        disabled={deleteMutation.isPending}
                                    >
                                        {deleteMutation.isPending ? 'Eliminando...' : 'Sí, Eliminar'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )
            }
        </div >
    );
}
