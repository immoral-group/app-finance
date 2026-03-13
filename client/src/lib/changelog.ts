// ─────────────────────────────────────────────────────────
// Changelog / What's New entries
// Each entry can be tied to a module key from ALL_MODULES.
// If moduleKey is undefined → visible to ALL users.
// If superadminOnly → only superadmins see it.
// ─────────────────────────────────────────────────────────

export interface ChangelogEntry {
    id: string;
    date: string; // ISO date (YYYY-MM-DD)
    title: string;
    description: string;
    type: 'new_module' | 'improvement' | 'fix';
    moduleKey?: string;       // ties to ALL_MODULES key — if set, requires permission
    superadminOnly?: boolean;
    icon?: string;            // lucide icon name
}

/**
 * Add new entries at the TOP of the array (newest first).
 * The component will filter based on user permissions automatically.
 */
export const CHANGELOG: ChangelogEntry[] = [
    {
        id: 'v1.9-payments',
        date: '2026-03-13',
        title: 'Módulo de Pagos',
        description: 'Nuevo módulo para registrar pagos a proveedores y socios, con soporte multidivisa y conciliación automática.',
        type: 'new_module',
        moduleKey: 'pagos',
        icon: 'CreditCard',
    },
    {
        id: 'v1.8-activity-log',
        date: '2026-03-13',
        title: 'Monitor de Actividad',
        description: 'Registro auditable de todas las operaciones de la plataforma en tiempo real. Ahora puedes ver quién hizo qué y cuándo.',
        type: 'new_module',
        superadminOnly: true,
        icon: 'Activity',
    },
    {
        id: 'v1.7-ai-copilot',
        date: '2026-03-13',
        title: 'Copiloto Financiero IA (DANIA)',
        description: 'Hemos integrado a DANIA, tu asistente financiero. Puedes preguntarle sobre facturación, nóminas, gastos por departamento y hacer consultas avanzadas del P&L directamente desde el chat flotante.',
        type: 'new_module',
        icon: 'Bot',
    },
    {
        id: 'v1.6-mobile-view',
        date: '2026-03-13',
        title: 'Interfaz Móvil Optimizada',
        description: 'La aplicación ahora es 100% responsiva. El menú lateral se oculta inteligentemente en teléfonos móviles y se puede abrir con el nuevo botón en la esquina superior izquierda.',
        type: 'improvement',
        icon: 'Smartphone',
    },
    {
        id: 'v1.5-partner-restrictions',
        date: '2026-03-10',
        title: 'Espacios de Partner Restringidos',
        description: 'Los usuarios de tipo Partner ahora solo ven su propio espacio de comisiones. Los jefes de departamento ya no ven opciones de configuración.',
        type: 'improvement',
        superadminOnly: true,
        icon: 'Shield',
    },
    {
        id: 'v1.4-user-management',
        date: '2026-03-10',
        title: 'Gestión Avanzada de Usuarios',
        description: 'Nuevo rol "Partner" con asociación automática. Ahora puedes ver y modificar contraseñas, emails y eliminar usuarios completamente.',
        type: 'improvement',
        moduleKey: 'user_management',
        superadminOnly: true,
        icon: 'UserCog',
    },
    {
        id: 'v1.3-commissions',
        date: '2026-03-09',
        title: 'Módulo de Comisiones',
        description: 'Nuevo módulo completo para gestionar partners, clientes y comisiones. Incluye dashboard con KPIs, vista anual, trimestral y mensual, y detalle por partner.',
        type: 'new_module',
        moduleKey: 'commissions',
        icon: 'Handshake',
    },
    {
        id: 'v1.2-dashboard-verticals',
        date: '2026-03-08',
        title: 'Dashboard: Verticales Personalizables',
        description: 'Las tarjetas de Imfilms e Imfashion ahora son las únicas visibles por defecto. Las demás se pueden habilitar desde la opción de personalización.',
        type: 'improvement',
        moduleKey: 'dashboard',
        icon: 'LayoutDashboard',
    },
    {
        id: 'v1.1-dept-pl-filters',
        date: '2026-03-04',
        title: 'Filtros Mejorados en Departamentos',
        description: 'Los indicadores del P&L por departamento ahora se actualizan dinámicamente al seleccionar un mes o periodo específico.',
        type: 'improvement',
        moduleKey: 'departamentos',
        icon: 'Building2',
    },
    {
        id: 'v1.0-dark-mode',
        date: '2026-02-19',
        title: 'Modo Oscuro Premium',
        description: 'Nuevo diseño dark mode con acentos neon cyan. Todas las tablas, modales y formularios adaptados para una experiencia visual nocturna premium.',
        type: 'improvement',
        icon: 'Moon',
    },
    {
        id: 'v0.9-login-redesign',
        date: '2026-02-19',
        title: 'Login Rediseñado',
        description: 'Nueva página de login con fondo de video, animaciones fluidas y diseño glassmorphism de última generación.',
        type: 'improvement',
        icon: 'LogIn',
    },
];

// ── Helpers ──────────────────────────────────────────────

const STORAGE_KEY = 'fi_changelog_seen';

export function getSeenIds(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

export function markAllSeen(ids: string[]) {
    try {
        const current = getSeenIds();
        ids.forEach(id => current.add(id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
    } catch { /* noop */ }
}

// ── Module Highlight (Guided Dots on Sidebar) ────────────

const HIGHLIGHT_STORAGE_KEY = 'fi_module_highlights_dismissed';

export function getDismissedHighlights(): Set<string> {
    try {
        const raw = localStorage.getItem(HIGHLIGHT_STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

export function dismissModuleHighlight(entryId: string) {
    try {
        const current = getDismissedHighlights();
        current.add(entryId);
        localStorage.setItem(HIGHLIGHT_STORAGE_KEY, JSON.stringify([...current]));
    } catch { /* noop */ }
}

/**
 * Returns a map of moduleKey → newest non-dismissed changelog entry.
 * Used by the Sidebar to show pulsing dots and tooltip popovers.
 */
export function getModuleHighlights(): Map<string, ChangelogEntry> {
    const dismissed = getDismissedHighlights();
    const map = new Map<string, ChangelogEntry>();

    // CHANGELOG is newest-first, so first match per module wins
    for (const entry of CHANGELOG) {
        if (!entry.moduleKey) continue;
        if (dismissed.has(entry.id)) continue;
        if (map.has(entry.moduleKey)) continue;
        map.set(entry.moduleKey, entry);
    }

    return map;
}
