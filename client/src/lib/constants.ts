export type DepartmentCode = 'IMMED' | 'IMCONT' | 'IMMOR' | 'IMSALES' | 'GEN';

type DepartmentColors = {
    bg: string;
    border: string;
    text: string;
    light: string;
}

export const DEPARTMENT_COLORS: Record<DepartmentCode, DepartmentColors> = {
    IMMED: {
        bg: 'bg-immedia-bg',
        border: 'border-immedia-border',
        text: 'text-immedia-text',
        light: 'bg-immedia-light',
    },
    IMCONT: {
        bg: 'bg-imcontent-bg',
        border: 'border-imcontent-border',
        text: 'text-imcontent-text',
        light: 'bg-imcontent-light',
    },
    IMMOR: {
        bg: 'bg-immoralia-bg',
        border: 'border-immoralia-border',
        text: 'text-immoralia-text',
        light: 'bg-immoralia-light',
    },
    GEN: {
        bg: 'bg-general-bg',
        border: 'border-general-border',
        text: 'text-general-text',
        light: 'bg-general-light',
    },
    IMSALES: {
        bg: 'bg-emerald-100',
        border: 'border-emerald-300',
        text: 'text-emerald-700',
        light: 'bg-emerald-50',
    }
};

export const DEPARTMENTS = [
    { id: '1', name: 'Imcontent', code: 'IMCONT' as DepartmentCode },
    { id: '2', name: 'Immedia', code: 'IMMED' as DepartmentCode },
    { id: '3', name: 'Immoralia', code: 'IMMOR' as DepartmentCode },
    { id: '4', name: 'Immoral Admin', code: 'GEN' as DepartmentCode },
    { id: '5', name: 'Imsales', code: 'IMSALES' as DepartmentCode },
];

export type NavItem = {
    label: string;
    path: string;
    icon?: string;
    requiredPermission?: string;  // module key from user_permissions
    superadminOnly?: boolean;
    children?: { label: string; path: string; deptCode?: string; requiredPermission?: string }[];
};

export const ALL_MODULES = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'billing', label: 'Billing Matrix' },
    { key: 'media_investment', label: 'Media Investment' },
    { key: 'payrolls', label: 'Payrolls' },
    { key: 'payments', label: 'Payments' },
    { key: 'payment_links', label: 'Generar link de pago' },
    { key: 'commissions', label: 'Commissions' },
    { key: 'pl_matrix', label: 'P&L Matrix' },
    { key: 'departamentos', label: 'Departamentos' },
    { key: 'clients', label: 'Clients & Fees' },
    { key: 'client_billing', label: 'Facturación por Cliente' },
    { key: 'settings', label: 'Settings' },
    { key: 'user_management', label: 'Gestión de Usuarios' },
    { key: 'imsales_billing', label: 'Billing Imsales' },
    { key: 'developers', label: 'Developers' },
    { key: 'profitability', label: 'Rentabilidad x Cuenta' },
];

export const NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard', path: '/', icon: 'LayoutDashboard', requiredPermission: 'dashboard' },
    { label: 'Billing Matrix', path: '/billing', icon: 'Receipt', requiredPermission: 'billing' },
    { label: 'Media Investment', path: '/media-investment', icon: 'BarChart3', requiredPermission: 'media_investment' },
    { label: 'Payrolls', path: '/payroll', icon: 'Wallet', requiredPermission: 'payrolls' },
    {
        label: 'Payments',
        path: '/payments',
        icon: 'CreditCard',
        requiredPermission: 'payments',
        children: [
            { label: 'Pagos', path: '/payments' },
            { label: 'Generar link de pago', path: '/payments/generate-link', requiredPermission: 'payment_links' },
        ],
    },
    { label: 'Commissions', path: '/commissions', icon: 'Handshake', requiredPermission: 'commissions' },
    { label: 'P&L Matrix', path: '/pl-matrix', icon: 'LineChart', requiredPermission: 'pl_matrix' },
    {
        label: 'Departamentos',
        path: '/departamentos',
        icon: 'Building2',
        requiredPermission: 'departamentos',
        children: [
            { label: 'Immedia', path: '/departamentos/immedia', deptCode: 'IMMED' },
            { label: 'Imcontent', path: '/departamentos/imcontent', deptCode: 'IMCONT' },
            { label: 'Immoralia', path: '/departamentos/immoralia', deptCode: 'IMMOR' },
            { label: 'Imsales', path: '/departamentos/imsales', deptCode: 'IMSALES' },
        ]
    },
    { label: 'Billing Imsales', path: '/imsales-billing', icon: 'ShoppingCart', requiredPermission: 'imsales_billing' },
    { label: 'Clients & Fees', path: '/clients', icon: 'Users', requiredPermission: 'clients' },
    { label: 'Client Billing', path: '/client-billing', icon: 'PieChart', requiredPermission: 'client_billing' },
    { label: 'Settings', path: '/settings', icon: 'Settings', requiredPermission: 'settings', superadminOnly: true },
    { label: 'Gestión de Usuarios', path: '/users', icon: 'Shield', requiredPermission: 'user_management', superadminOnly: true },
    { label: 'Developers', path: '/developers', icon: 'Activity', requiredPermission: 'developers', superadminOnly: true },
    { label: 'Rentabilidad x Cuenta', path: '/profitability', icon: 'PieChart', requiredPermission: 'profitability', superadminOnly: true },
];

