// Mapping canónico P&L hubs → datos de Billing Matrix.
// Refleja exactamente la lógica del backend en services/admin-service/src/routes/pl.js
// para que la pestaña "Facturación" del hub y el detalle al clicar celdas Real
// muestren los mismos clientes/montos que componen el ingreso del P&L.

export type HubKey = 'immedia' | 'imcontent' | 'immoralia' | 'imsales';

export interface HubServiceDef {
    // Nombre tal y como aparece en la pestaña Real del P&L del hub
    plName: string;
    // Calcula el monto facturado de este servicio para una fila de Billing Matrix
    // row = { client_id, client_name, vertical, services:{[serviceId]:amount}, metadata:{fee_paid,...} }
    // columnsByCode = map de service.code → service.id
    valueFor: (row: any, columnsByCode: Record<string, string>) => number;
}

// Servicios por hub. El orden importa: es el orden en que se mostrarán las columnas.
export const HUB_SERVICES: Record<HubKey, HubServiceDef[]> = {
    immedia: [
        {
            plName: 'Paid General',
            valueFor: (row) => {
                const fee = Number(row.metadata?.fee_paid || 0);
                const vert = (row.vertical || '').toLowerCase();
                return vert === 'imfilms' ? 0 : fee;
            },
        },
        {
            plName: 'Paid imfilms',
            valueFor: (row) => {
                const fee = Number(row.metadata?.fee_paid || 0);
                const vert = (row.vertical || '').toLowerCase();
                return vert === 'imfilms' ? fee : 0;
            },
        },
        {
            plName: 'Setup inicial',
            valueFor: (row, cols) => {
                const id = cols['PAID_MEDIA_SETUP'];
                return id ? Number(row.services?.[id] || 0) : 0;
            },
        },
    ],
    imcontent: [
        svcByCode('Branding', 'BRANDING'),
        svcByCode('Diseño', 'CONTENT_DESIGN'),
        svcByCode('Contenido con IA', 'AI_CONTENT'),
        svcByCode('RRSS', 'SOCIAL_MEDIA_MGMT'),
        svcByCode('Estrategia Digital', 'DIGITAL_STRATEGY'),
        svcByCode('Influencers', 'INFLUENCER_UGC'),
        svcByCode('Diseño de Landing', 'DISENO_LANDING'),
        svcByCode('Budget Nutfruit', 'BUDGET_INFLUENCER_PAID'),
    ],
    immoralia: [
        svcByCode('Setup inicial IA', 'IMMORALIA_SETUP'),
        svcByCode('Automation', 'AGENCY_AUTO'),
        svcByCode('Consultoría', 'CONSULTING_AUTO'),
    ],
    imsales: [
        svcByCode('Setup inicial (ims)', 'IMSALES_SETUP'),
        svcByCode('Captación', 'IMSALES_CAPTACI_N'),
    ],
};

function svcByCode(plName: string, code: string): HubServiceDef {
    return {
        plName,
        valueFor: (row, cols) => {
            const id = cols[code];
            return id ? Number(row.services?.[id] || 0) : 0;
        },
    };
}

export function buildColumnsByCode(columns: any[]): Record<string, string> {
    const map: Record<string, string> = {};
    (columns || []).forEach(c => {
        if (c?.code && c?.id) map[c.code] = c.id;
    });
    return map;
}

// Mapea (dept P&L + serviceName P&L) → HubServiceDef. Sirve al modal de detalle Real.
// dept se compara case-insensitive con la HubKey.
const DEPT_TO_HUB: Record<string, HubKey> = {
    immedia: 'immedia',
    imcontent: 'imcontent',
    immoralia: 'immoralia',
    imsales: 'imsales',
};

export function findHubService(dept: string, plName: string): { hub: HubKey; def: HubServiceDef } | null {
    const hub = DEPT_TO_HUB[(dept || '').toLowerCase()];
    if (!hub) return null;
    const def = HUB_SERVICES[hub].find(s => s.plName.toLowerCase() === (plName || '').toLowerCase());
    if (!def) return null;
    return { hub, def };
}
