// Worker de impagos.
// Función pura que decide qué facturas tocan enviar AHORA MISMO y en qué nivel,
// cruzando facturas vencidas de Holded con lo que ya se ha enviado (dunning_cases
// + dunning_reminders). Devuelve un plan; la ejecución real (mailer + escritura
// en BD) vive en las rutas.

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';

async function holdedFetch(path) {
    const apiKey = process.env.HOLDED_API_KEY;
    if (!apiKey) throw new Error('HOLDED_API_KEY not configured');
    const res = await fetch(`${HOLDED_BASE}${path}`, {
        headers: { key: apiKey, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Holded API error ${res.status}: ${await res.text()}`);
    return res.json();
}

function normalizeTs(ts) {
    if (!ts && ts !== 0) return null;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? n : n * 1000;
}

function daysBetween(fromMs, toMs) {
    return Math.floor((toMs - fromMs) / 86_400_000);
}

function classifyLevel(daysOverdue, config) {
    if (daysOverdue < config.level_1_days_min) return 0;
    if (daysOverdue <= config.level_1_days_max) return 1;
    if (daysOverdue <= config.level_2_days_max) return 2;
    return 3;
}

// Decide si toca enviar en base al histórico + nivel actual.
function decideAction({ level, existingCase, remindersForCase, config, now }) {
    if (level === 0) return { action: 'skip', reason: 'not-overdue-enough' };
    if (existingCase?.status === 'paid') return { action: 'skip', reason: 'already-paid' };
    if (existingCase?.status === 'cancelled') return { action: 'skip', reason: 'cancelled' };

    // Buscar recordatorios enviados con éxito para este nivel concreto.
    const sentLevel = (remindersForCase || []).filter(r => r.level === level && r.status === 'sent');

    if (level === 1 || level === 2) {
        // Se envía UNA vez por nivel.
        if (sentLevel.length > 0) return { action: 'skip', reason: `level-${level}-already-sent` };
        return { action: 'send', reason: sentLevel.length === 0 ? 'first-time' : 'retry' };
    }

    // Nivel 3: se repite cada N días.
    if (sentLevel.length === 0) return { action: 'send', reason: 'first-time' };
    const lastMs = new Date(sentLevel[0].sent_at).getTime();
    const daysSince = daysBetween(lastMs, now);
    if (daysSince >= (config.level_3_repeat_every_days || 7)) {
        return { action: 'send', reason: `repeat-after-${daysSince}d` };
    }
    return { action: 'skip', reason: `waiting-repeat-${daysSince}/${config.level_3_repeat_every_days}` };
}

// Construye el plan de envíos. No escribe nada en BD ni envía correos.
export async function buildDunningPlan({ supabase, now = Date.now() }) {
    // 1. Config
    const { data: config, error: cfgErr } = await supabase
        .from('dunning_config').select('*').eq('id', 1).single();
    if (cfgErr) throw new Error(`config error: ${cfgErr.message}`);

    // 2. Plantillas activas por nivel (una por nivel).
    const { data: templates, error: tplErr } = await supabase
        .from('dunning_templates').select('*').eq('active', true);
    if (tplErr) throw new Error(`templates error: ${tplErr.message}`);
    const tplByLevel = new Map();
    for (const t of templates || []) {
        if (!tplByLevel.has(t.level)) tplByLevel.set(t.level, t);
    }

    // 3. Facturas pendientes en Holded.
    const holded = await holdedFetch('/documents/invoice?paid=0');
    const invoices = Array.isArray(holded) ? holded : [];

    // 3b. Enrichment: /documents/invoice de Holded NO devuelve el email del contacto.
    //     Traemos todos los contactos una sola vez y creamos un mapa contact_id → email.
    const emailByContact = new Map();
    try {
        const contactsData = await holdedFetch('/contacts');
        const contacts = Array.isArray(contactsData) ? contactsData : [];
        for (const c of contacts) {
            if (c.id && c.email) emailByContact.set(c.id, c.email);
        }
    } catch (err) {
        console.warn('[dunning] no se pudo cargar /contacts, seguimos sin enrichment:', err.message);
    }

    // 4. Casos existentes y recordatorios para cruzar.
    const invoiceIds = invoices.map(i => i.id).filter(Boolean);
    const { data: cases } = invoiceIds.length
        ? await supabase.from('dunning_cases').select('*').in('invoice_id', invoiceIds)
        : { data: [] };
    const caseByInvoice = new Map((cases || []).map(c => [c.invoice_id, c]));

    const caseIds = (cases || []).map(c => c.id);
    // IMPORTANTE: solo los recordatorios REALES (no test) cuentan para decidir
    // si una factura ya fue avisada. Si el usuario hizo pruebas en modo prueba,
    // esos reminders quedan con is_test=true en BD y NO deben bloquear el envío
    // real del cron. Antes se cargaban todos y el motor las skipeaba con
    // waiting-repeat / level-X-already-sent.
    const { data: reminders } = caseIds.length
        ? await supabase.from('dunning_reminders')
            .select('*').in('case_id', caseIds)
            .eq('is_test', false)
            .order('sent_at', { ascending: false })
        : { data: [] };
    const remindersByCase = new Map();
    for (const r of reminders || []) {
        if (!remindersByCase.has(r.case_id)) remindersByCase.set(r.case_id, []);
        remindersByCase.get(r.case_id).push(r);
    }

    // 5. Construir plan.
    const plan = [];
    for (const inv of invoices) {
        const dueMs = normalizeTs(inv.dueDate);
        if (!dueMs) continue;
        const daysOverdue = daysBetween(dueMs, now);
        if (daysOverdue < config.level_1_days_min) continue;

        const total = Number(inv.total || 0);
        if (total < Number(config.min_amount || 0)) continue;
        if ((config.excluded_contact_ids || []).includes(inv.contact)) continue;

        const level = classifyLevel(daysOverdue, config);
        const template = tplByLevel.get(level);

        const existingCase = caseByInvoice.get(inv.id);
        const remindersForCase = existingCase ? remindersByCase.get(existingCase.id) : [];

        const decision = decideAction({ level, existingCase, remindersForCase, config, now });

        const contactEmail = inv.contactEmail || inv.email || emailByContact.get(inv.contact) || '';

        plan.push({
            invoice: {
                id: inv.id,
                invoice_number: inv.docNumber || inv.num || '',
                contact_id: inv.contact || '',
                contact_name: inv.contactName || '',
                contact_email: contactEmail,
                amount: total,
                currency: inv.currency || 'EUR',
                invoice_date: normalizeTs(inv.date),
                due_date: dueMs,
            },
            days_overdue: daysOverdue,
            level,
            template_id: template?.id || null,
            template_name: template?.name || null,
            action: decision.action,
            reason: decision.reason,
            has_email: !!contactEmail,
        });
    }

    return { plan, config, templates: templates || [] };
}

// Helpers reutilizables para las rutas.
export function summarizePlan(plan) {
    const sends = plan.filter(p => p.action === 'send');
    const missing = sends.filter(p => !p.has_email || !p.template_id);
    return {
        total: plan.length,
        will_send: sends.length,
        will_skip: plan.length - sends.length,
        blocked: missing.length,
        by_level: {
            1: sends.filter(p => p.level === 1).length,
            2: sends.filter(p => p.level === 2).length,
            3: sends.filter(p => p.level === 3).length,
        },
    };
}

export { holdedFetch, normalizeTs, daysBetween, classifyLevel };
