// ─────────────────────────────────────────────────────────────────────────────
// Product tours — onboarding spotlight shown once per user per tour.
// Add new tours at the TOP (they are shown in order, newest first).
// moduleKey ties to ALL_MODULES: only users with the permission see the tour.
// ─────────────────────────────────────────────────────────────────────────────

export interface TourStep {
    emoji: string;
    title: string;
    description: string;
}

export interface Tour {
    id: string;
    moduleKey?: string;
    superadminOnly?: boolean;
    steps: TourStep[];
}

export const TOURS: Tour[] = [
    {
        id: 'tour-payment-links-v1',
        moduleKey: 'payment_links',
        steps: [
            {
                emoji: '🔗',
                title: 'Links de pago con Stripe',
                description: 'Ahora puedes cobrar a tus clientes en segundos. Genera un checkout seguro de Stripe directamente desde la plataforma, sin salir de Immoral Finance.',
            },
            {
                emoji: '📄',
                title: 'Desde factura o desde cero',
                description: 'Elige una factura de Holded y los datos se autocompletan automáticamente — incluyendo el email del cliente. O crea un pago manual con solo concepto e importe.',
            },
            {
                emoji: '📊',
                title: 'Historial y estado en tiempo real',
                description: 'Consulta todos los links en el Historial: activos, pagados, expirados o cancelados. Cuando el cliente paga, Holded se reconcilia solo y recibes un aviso por email.',
            },
        ],
    },
    {
        id: 'tour-profitability-v1',
        moduleKey: 'profitability',
        steps: [
            {
                emoji: '📈',
                title: 'Rentabilidad por cuenta',
                description: 'Cruza la facturación mensual de cada cliente con las horas reales registradas en ClickUp. Descubre al instante si una cuenta es rentable o te está costando dinero.',
            },
            {
                emoji: '⏱️',
                title: 'Horas reales desde ClickUp',
                description: 'Las horas se sincronizan automáticamente con ClickUp. El coste/hora de cada empleado se calcula desde su salario real dividido entre 160 horas mensuales.',
            },
            {
                emoji: '🚦',
                title: 'Semáforo de salud financiera',
                description: 'Verde ≥ 60% de rentabilidad, ámbar entre 40–59%, rojo por debajo del 40%. De un vistazo sabes qué cuentas necesitan atención inmediata.',
            },
        ],
    },
];

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fi_tours_seen';

export function getSeenTourIds(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

export function markTourSeen(id: string) {
    try {
        const seen = getSeenTourIds();
        seen.add(id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
    } catch { /* noop */ }
}
