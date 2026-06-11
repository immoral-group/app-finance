import express from 'express';

const router = express.Router();

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';

/**
 * Helper: Make authenticated request to Holded API
 */
async function holdedFetch(path, options = {}) {
    const apiKey = process.env.HOLDED_API_KEY;
    if (!apiKey) {
        throw new Error('HOLDED_API_KEY not configured');
    }

    const url = `${HOLDED_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'key': apiKey,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Holded API error ${res.status}: ${text}`);
    }

    return res.json();
}

// ================================================
// CONNECTION STATUS
// ================================================

/**
 * GET /integrations/holded/status
 * Check if Holded connection is configured and working
 */
router.get('/holded/status', async (req, res) => {
    try {
        if (!process.env.HOLDED_API_KEY) {
            return res.json({ connected: false, error: 'API key not configured' });
        }
        // Quick test: fetch contacts with limit
        const contacts = await holdedFetch('/contacts?limit=1');
        res.json({
            connected: true,
            test: `${Array.isArray(contacts) ? contacts.length : 0} contact(s) found`,
        });
    } catch (err) {
        res.json({ connected: false, error: err.message });
    }
});

// ================================================
// INVOICES / DOCUMENTS
// ================================================

/**
 * GET /integrations/holded/invoices
 * List invoices (sales invoices)
 * Query params: ?paid=0|1|2&starttmp=&endtmp=&sort=created-desc
 */
router.get('/holded/invoices', async (req, res) => {
    try {
        const params = new URLSearchParams();
        if (req.query.paid !== undefined) params.append('paid', req.query.paid);
        if (req.query.starttmp) params.append('starttmp', req.query.starttmp);
        if (req.query.endtmp) params.append('endtmp', req.query.endtmp);
        if (req.query.sort) params.append('sort', req.query.sort);
        if (req.query.contactid) params.append('contactid', req.query.contactid);

        const qs = params.toString() ? `?${params.toString()}` : '';
        const data = await holdedFetch(`/documents/invoice${qs}`);
        res.json({ invoices: data || [] });
    } catch (err) {
        console.error('Holded invoices error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /integrations/holded/invoices/search
 * Search unpaid invoices for payment link selector
 * Query params: ?q=search_term&status=pending|all
 */
router.get('/holded/invoices/search', async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        const status = req.query.status || 'pending';

        const params = new URLSearchParams();
        if (status === 'pending') params.append('paid', '0');

        const qs = params.toString() ? `?${params.toString()}` : '';
        const data = await holdedFetch(`/documents/invoice${qs}`);
        const invoices = Array.isArray(data) ? data : [];

        const filtered = q
            ? invoices.filter(inv => {
                const num = (inv.docNumber || inv.num || '').toLowerCase();
                const contact = (inv.contactName || '').toLowerCase();
                return num.includes(q) || contact.includes(q);
            })
            : invoices;

        const result = filtered.slice(0, 30).map(inv => ({
            id: inv.id,
            docNumber: inv.docNumber || inv.num || '',
            contactName: inv.contactName || '',
            contactEmail: inv.contactEmail || inv.email || '',
            total: inv.total || 0,
            subtotal: inv.subtotal || 0,
            date: inv.date || null,
            dueDate: inv.dueDate || null,
            status: inv.status,
            currency: inv.currency || 'EUR',
        }));

        res.json({ invoices: result });
    } catch (err) {
        console.error('Holded invoice search error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /integrations/holded/invoices/:id
 * Get a single invoice by ID
 */
router.get('/holded/invoices/:id', async (req, res) => {
    try {
        const data = await holdedFetch(`/documents/invoice/${req.params.id}`);
        res.json(data);
    } catch (err) {
        console.error('Holded invoice detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /integrations/holded/invoices
 * Create a new invoice in Holded
 * Body: Holded invoice format
 */
router.post('/holded/invoices', async (req, res) => {
    try {
        const data = await holdedFetch('/documents/invoice', {
            method: 'POST',
            body: JSON.stringify(req.body),
        });
        res.json({ success: true, invoice: data });
    } catch (err) {
        console.error('Holded create invoice error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /integrations/holded/invoices/:id/pay
 * Mark an invoice as paid
 * Body: { date: timestamp, amount: number, treasury_id: string }
 */
router.post('/holded/invoices/:id/pay', async (req, res) => {
    try {
        const data = await holdedFetch(`/documents/invoice/${req.params.id}/pay`, {
            method: 'POST',
            body: JSON.stringify(req.body),
        });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Holded pay invoice error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /integrations/holded/invoices/:id/send
 * Send invoice by email
 */
router.post('/holded/invoices/:id/send', async (req, res) => {
    try {
        const data = await holdedFetch(`/documents/invoice/${req.params.id}/send`, {
            method: 'POST',
            body: JSON.stringify(req.body || {}),
        });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Holded send invoice error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ================================================
// CREDIT NOTES / PROFORMAS / QUOTES
// ================================================

/**
 * GET /integrations/holded/documents/:docType
 * List documents of any type: creditnote, proform, waybill, estimate, purchaseorder, purchaseinvoice
 */
router.get('/holded/documents/:docType', async (req, res) => {
    try {
        const params = new URLSearchParams();
        if (req.query.paid !== undefined) params.append('paid', req.query.paid);
        if (req.query.starttmp) params.append('starttmp', req.query.starttmp);
        if (req.query.endtmp) params.append('endtmp', req.query.endtmp);
        const qs = params.toString() ? `?${params.toString()}` : '';
        const data = await holdedFetch(`/documents/${req.params.docType}${qs}`);
        res.json({ documents: data || [] });
    } catch (err) {
        console.error('Holded documents error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ================================================
// CONTACTS
// ================================================

/**
 * GET /integrations/holded/contacts
 * List all contacts from Holded
 */
router.get('/holded/contacts', async (req, res) => {
    try {
        const data = await holdedFetch('/contacts');
        res.json({ contacts: data || [] });
    } catch (err) {
        console.error('Holded contacts error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /integrations/holded/contacts/:id
 * Get a single contact
 */
router.get('/holded/contacts/:id', async (req, res) => {
    try {
        const data = await holdedFetch(`/contacts/${req.params.id}`);
        res.json(data);
    } catch (err) {
        console.error('Holded contact detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ================================================
// TREASURY
// ================================================

/**
 * GET /integrations/holded/treasury
 * List all treasury accounts
 */
router.get('/holded/treasury', async (req, res) => {
    try {
        const data = await holdedFetch('/treasury');
        res.json({ accounts: data || [] });
    } catch (err) {
        console.error('Holded treasury error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ================================================
// DASHBOARD SUMMARY
// ================================================

/**
 * GET /integrations/holded/summary
 * Returns aggregated data for Dashboard KPI cards
 */
router.get('/holded/summary', async (req, res) => {
    try {
        if (!process.env.HOLDED_API_KEY) {
            return res.json({ connected: false });
        }

        const [invoicesData, treasuryData] = await Promise.all([
            holdedFetch('/documents/invoice').catch(() => []),
            holdedFetch('/treasury').catch(() => []),
        ]);

        const invoices = Array.isArray(invoicesData) ? invoicesData : [];
        const treasury = Array.isArray(treasuryData) ? treasuryData : [];
        const now = Math.floor(Date.now() / 1000);

        // Exclude cancelled/anuladas (status 3) from all calculations
        const activeUnpaid = invoices.filter(inv => (inv.status === 0 || inv.status === 2) && inv.status !== 3);

        // Overdue: unpaid + dueDate in the past
        const overdue = activeUnpaid.filter(inv => inv.dueDate && inv.dueDate < now);
        const overdueTotal = overdue.reduce((sum, inv) => sum + (inv.paymentsPending || inv.total || 0), 0);

        // Pending (not yet overdue): unpaid + either no dueDate or dueDate in the future
        const pendingNotOverdue = activeUnpaid.filter(inv => !inv.dueDate || inv.dueDate >= now);
        const pendingTotal = pendingNotOverdue.reduce((sum, inv) => sum + (inv.paymentsPending || inv.total || 0), 0);

        // Estimado por recibir = pending + overdue
        const estimadoTotal = pendingTotal + overdueTotal;

        // Treasury balance
        const treasuryBalance = treasury.reduce((sum, acc) => sum + (acc.balance || 0), 0);

        res.json({
            connected: true,
            invoices_pending: { count: pendingNotOverdue.length, total: Math.round(pendingTotal * 100) / 100 },
            invoices_overdue: { count: overdue.length, total: Math.round(overdueTotal * 100) / 100 },
            invoices_estimado: { count: activeUnpaid.length, total: Math.round(estimadoTotal * 100) / 100 },
            treasury_balance: Math.round(treasuryBalance * 100) / 100,
        });
    } catch (err) {
        console.error('Holded summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
