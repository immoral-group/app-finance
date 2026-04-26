import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { commissionsApi } from '@/lib/api/commissions';
import { ALL_MODULES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
    Shield,
    X,
    Loader2,
    Check,
    UserPlus,
    Edit2,
    Trash2,
    Eye,
    EyeOff,
    Users as UsersIcon,
    Activity as ActivityIcon
} from 'lucide-react';
import ActivityPanel from '@/features/activity/ActivityPanel';

const DEPT_OPTIONS = [
    { code: 'IMMED', label: 'Immedia' },
    { code: 'IMCONT', label: 'Imcontent' },
    { code: 'IMMOR', label: 'Immoralia' },
    { code: 'IMSALES', label: 'Imsales' },
];

interface UserFormData {
    email: string;
    password: string;
    display_name: string;
    role: 'superadmin' | 'dept_head' | 'user' | 'partner';
    department_code: string;
    partner_id: string;
    permissions: Record<string, { can_view: boolean; can_edit: boolean }>;
}

const DEFAULT_FORM: UserFormData = {
    email: '',
    password: '',
    display_name: '',
    role: 'user',
    department_code: '',
    partner_id: '',
    permissions: {},
};

export default function UserManagement() {
    const { isSuperAdmin } = useAuth();
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [form, setForm] = useState<UserFormData>({ ...DEFAULT_FORM });
    const [showPassword, setShowPassword] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => adminApi.getUsers(),
        enabled: isSuperAdmin(),
    });

    const { data: partnersData } = useQuery({
        queryKey: ['partners-list'],
        queryFn: () => commissionsApi.getPartners(),
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => adminApi.createUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            closeModal();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateUser(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            closeModal();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => adminApi.deleteUser(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const closeModal = () => {
        setShowModal(false);
        setEditingUser(null);
        setForm({ ...DEFAULT_FORM });
    };

    const openCreateModal = () => {
        setForm({ ...DEFAULT_FORM });
        setEditingUser(null);
        setShowModal(true);
    };

    const openEditModal = (user: any) => {
        const permMap: Record<string, { can_view: boolean; can_edit: boolean }> = {};
        (user.permissions || []).forEach((p: any) => {
            permMap[p.module] = { can_view: p.can_view, can_edit: p.can_edit };
        });
        setForm({
            email: user.email || '',
            password: user.raw_password || '',
            display_name: user.display_name || '',
            role: user.role || 'user',
            department_code: user.department_code || '',
            partner_id: user.partner_id || '',
            permissions: permMap,
        });
        setEditingUser(user.id);
        setShowModal(true);
    };

    const handleSubmit = () => {
        const permArray = Object.entries(form.permissions)
            .filter(([, v]) => v.can_view || v.can_edit)
            .map(([module, perms]) => ({
                module,
                can_view: perms.can_view,
                can_edit: perms.can_edit,
            }));

        if (editingUser) {
            const updatePayload: any = {
                display_name: form.display_name,
                role: form.role,
                department_code: form.role === 'dept_head' ? form.department_code : null,
                partner_id: form.role === 'partner' ? form.partner_id : null,
                permissions: permArray,
            };
            if (form.email) updatePayload.email = form.email;
            if (form.password) updatePayload.password = form.password;
            updateMutation.mutate({
                id: editingUser,
                data: updatePayload,
            });
        } else {
            if (!form.email || !form.password || !form.display_name) return;
            createMutation.mutate({
                email: form.email,
                password: form.password,
                display_name: form.display_name,
                role: form.role,
                department_code: form.role === 'dept_head' ? form.department_code : undefined,
                partner_id: form.role === 'partner' ? form.partner_id : undefined,
                permissions: permArray,
            });
        }
    };

    const togglePermission = (moduleKey: string, field: 'can_view' | 'can_edit') => {
        setForm(prev => {
            const current = prev.permissions[moduleKey] || { can_view: false, can_edit: false };
            const updated = { ...current, [field]: !current[field] };
            // If can_edit is true, can_view must also be true
            if (field === 'can_edit' && updated.can_edit) {
                updated.can_view = true;
            }
            // If can_view is false, can_edit must also be false
            if (field === 'can_view' && !updated.can_view) {
                updated.can_edit = false;
            }
            return {
                ...prev,
                permissions: { ...prev.permissions, [moduleKey]: updated },
            };
        });
    };

    const selectAllPermissions = (viewOnly: boolean = false) => {
        const permMap: Record<string, { can_view: boolean; can_edit: boolean }> = {};
        ALL_MODULES.forEach(m => {
            permMap[m.key] = { can_view: true, can_edit: !viewOnly };
        });
        setForm(prev => ({ ...prev, permissions: permMap }));
    };

    const clearAllPermissions = () => {
        setForm(prev => ({ ...prev, permissions: {} }));
    };

    if (!isSuperAdmin()) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">No tienes permisos para acceder a esta sección.</p>
            </div>
        );
    }

    const users = data?.users || [];
    const isSaving = createMutation.isPending || updateMutation.isPending;

    const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="h-6 w-6 text-primary" />
                        Gestión de Usuarios
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Administra usuarios, roles, permisos y actividad
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button
                        variant={activeTab === 'users' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('users')}
                        className="gap-2 text-xs sm:text-sm"
                    >
                        <UsersIcon size={16} />
                        Directorio
                    </Button>
                    <Button
                        variant={activeTab === 'activity' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('activity')}
                        className="gap-2 text-xs sm:text-sm"
                    >
                        <ActivityIcon size={16} />
                        Actividad
                    </Button>
                </div>
            </div>

            {/* TAB: ACTIVITY */}
            {activeTab === 'activity' && (
                <div className="pt-2">
                    <ActivityPanel />
                </div>
            )}

            {/* TAB: USERS */}
            {activeTab === 'users' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <Button onClick={openCreateModal} className="gap-2">
                            <UserPlus size={16} />
                            Nuevo Usuario
                        </Button>
                    </div>

                    {/* Users List */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="p-0 overflow-x-auto">
                                <table className="w-full min-w-[700px]">
                                    <thead>
                                        <tr className="border-b bg-gray-50">
                                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rol</th>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Departamento</th>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Permisos</th>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((user: any) => {
                                            const roleLabel = user.role === 'superadmin' ? 'Superadmin' : user.role === 'dept_head' ? 'Jefe Depto' : user.role === 'partner' ? 'Partner' : 'Usuario';
                                            const roleColor = user.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : user.role === 'dept_head' ? 'bg-blue-100 text-blue-700' : user.role === 'partner' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-700';
                                            const permCount = (user.permissions || []).filter((p: any) => p.can_view).length;
                                            const deptLabel = DEPT_OPTIONS.find(d => d.code === user.department_code)?.label || '—';

                                            return (
                                                <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.display_name}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor}`}>
                                                            {roleLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-600">{deptLabel}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-600">
                                                        {user.role === 'superadmin' ? (
                                                            <span className="text-xs text-purple-600 font-medium">Todos</span>
                                                        ) : (
                                                            <span className="text-xs">{permCount} módulos</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs px-2 py-1 rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {user.is_active ? 'Activo' : 'Inactivo'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button variant="ghost" size="sm" onClick={() => openEditModal(user)} className="h-8 w-8 p-0">
                                                                <Edit2 size={14} />
                                                            </Button>
                                                            {user.is_active && user.role !== 'superadmin' && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                                                    onClick={() => {
                                                                        if (confirm('¿Eliminar este usuario PERMANENTEMENTE? Esta acción no se puede deshacer.')) {
                                                                            deleteMutation.mutate(user.id);
                                                                        }
                                                                    }}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {users.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                                    No hay usuarios registrados.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    )}

                    {/* Create/Edit Modal */}
                    {showModal && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                                <CardHeader className="flex flex-row items-center justify-between pb-4">
                                    <CardTitle className="text-lg">
                                        {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={closeModal} className="h-8 w-8 p-0">
                                        <X size={16} />
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Basic Info */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Nombre</label>
                                            <Input
                                                value={form.display_name}
                                                onChange={e => setForm(prev => ({ ...prev, display_name: e.target.value }))}
                                                placeholder="Nombre completo"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Email</label>
                                            <Input
                                                type="email"
                                                value={form.email}
                                                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                                                placeholder="email@ejemplo.com"
                                                disabled={false}
                                            />
                                        </div>
                                    </div>

                                    {/* Password — show always (on edit: optional new password) */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">
                                            {editingUser ? 'Contraseña' : 'Contraseña'}
                                        </label>
                                        {editingUser && form.password && (
                                            <p className="text-xs text-muted-foreground">Contraseña actual visible. Cambia el valor para actualizar.</p>
                                        )}
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? 'text' : 'password'}
                                                value={form.password}
                                                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                                                placeholder="Mínimo 6 caracteres"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Role */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Rol</label>
                                            <select
                                                value={form.role}
                                                onChange={e => setForm(prev => ({ ...prev, role: e.target.value as any }))}
                                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
                                            >
                                                <option value="user">Usuario</option>
                                                <option value="dept_head">Jefe de Departamento</option>
                                                <option value="partner">Partner</option>
                                                <option value="superadmin">Superadmin</option>
                                            </select>
                                        </div>
                                        {form.role === 'dept_head' && (
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Departamento</label>
                                                <select
                                                    value={form.department_code}
                                                    onChange={e => setForm(prev => ({ ...prev, department_code: e.target.value }))}
                                                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {DEPT_OPTIONS.map(d => (
                                                        <option key={d.code} value={d.code}>{d.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {form.role === 'partner' && (
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Asociar a Partner</label>
                                                <select
                                                    value={form.partner_id}
                                                    onChange={e => setForm(prev => ({ ...prev, partner_id: e.target.value }))}
                                                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
                                                >
                                                    <option value="">Seleccionar partner...</option>
                                                    {(partnersData?.partners || []).map((p: any) => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* Permissions */}
                                    {form.role !== 'superadmin' && (
                                        <div className="space-y-3">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                                <label className="text-sm font-medium">Permisos por Módulo</label>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => selectAllPermissions(false)}>
                                                        Todos
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => selectAllPermissions(true)}>
                                                        Solo lectura
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={clearAllPermissions}>
                                                        Ninguno
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="border rounded-lg overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-gray-50 border-b">
                                                            <th className="text-left px-3 py-2 font-medium">Módulo</th>
                                                            <th className="text-center px-3 py-2 font-medium w-24">Ver</th>
                                                            <th className="text-center px-3 py-2 font-medium w-24">Editar</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {ALL_MODULES.filter(m => m.key !== 'user_management').map(module => {
                                                            const perm = form.permissions[module.key] || { can_view: false, can_edit: false };
                                                            return (
                                                                <tr key={module.key} className="border-b last:border-0 hover:bg-gray-50">
                                                                    <td className="px-3 py-2">{module.label}</td>
                                                                    <td className="text-center px-3 py-2">
                                                                        <button
                                                                            onClick={() => togglePermission(module.key, 'can_view')}
                                                                            className={`h-6 w-6 rounded border inline-flex items-center justify-center transition-colors ${perm.can_view
                                                                                ? 'bg-blue-500 border-blue-500 text-white'
                                                                                : 'border-gray-300 hover:border-gray-400'
                                                                                }`}
                                                                        >
                                                                            {perm.can_view && <Check size={14} />}
                                                                        </button>
                                                                    </td>
                                                                    <td className="text-center px-3 py-2">
                                                                        <button
                                                                            onClick={() => togglePermission(module.key, 'can_edit')}
                                                                            className={`h-6 w-6 rounded border inline-flex items-center justify-center transition-colors ${perm.can_edit
                                                                                ? 'bg-green-500 border-green-500 text-white'
                                                                                : 'border-gray-300 hover:border-gray-400'
                                                                                }`}
                                                                        >
                                                                            {perm.can_edit && <Check size={14} />}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {form.role === 'superadmin' && (
                                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
                                            <Shield size={14} className="inline mr-1" />
                                            Los superadmin tienen acceso completo a todos los módulos automáticamente.
                                        </div>
                                    )}

                                    {/* Error display */}
                                    {(createMutation.error || updateMutation.error) && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                            {(createMutation.error as Error)?.message || (updateMutation.error as Error)?.message}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-end gap-3 pt-4 border-t">
                                        <Button variant="outline" onClick={closeModal}>Cancelar</Button>
                                        <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
                                            {isSaving && <Loader2 size={14} className="animate-spin" />}
                                            {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
