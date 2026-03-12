import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// ============================================================
// BENEFICIARIES
// ============================================================

// GET all beneficiaries
router.get('/beneficiaries', async (req, res) => {
    const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ beneficiaries: data });
});

// POST create beneficiary
router.post('/beneficiaries', async (req, res) => {
    const { name, type, bank_details, preferred_payment_method, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data, error } = await supabase
        .from('beneficiaries')
        .insert({ name, type: type || 'persona', bank_details, preferred_payment_method, notes })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, beneficiary: data });
});

// PATCH update beneficiary
router.patch('/beneficiaries/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, bank_details, preferred_payment_method, notes, is_active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (bank_details !== undefined) updateData.bank_details = bank_details;
    if (preferred_payment_method !== undefined) updateData.preferred_payment_method = preferred_payment_method;
    if (notes !== undefined) updateData.notes = notes;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('beneficiaries')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, beneficiary: data });
});

// DELETE beneficiary
router.delete('/beneficiaries/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('beneficiaries').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ============================================================
// PAYMENTS
// ============================================================

// GET payments for a specific month (from NEW payments table)
router.get('/list/:year/:month', async (req, res) => {
    const { year, month } = req.params;

    const { data, error } = await supabase
        .from('payments')
        .select('*, beneficiary:beneficiaries(id, name, type)')
        .eq('fiscal_year', year)
        .eq('fiscal_month', month)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ payments: data });
});

// GET payment stats/summary for a month
router.get('/summary/:year/:month', async (req, res) => {
    const { year, month } = req.params;

    const { data, error } = await supabase
        .from('payments')
        .select('total_amount, payment_status, payment_type, currency, beneficiary_name')
        .eq('fiscal_year', year)
        .eq('fiscal_month', month);

    if (error) return res.status(500).json({ error: error.message });

    const payments = data || [];
    const totalPayments = payments.reduce((sum, p) => sum + Number(p.total_amount), 0);
    const totalPaid = payments.filter(p => p.payment_status === 'pagado').reduce((sum, p) => sum + Number(p.total_amount), 0);
    const totalPending = payments.filter(p => p.payment_status === 'pendiente').reduce((sum, p) => sum + Number(p.total_amount), 0);
    const count = payments.length;

    // Distribution by payment type
    const byType = {};
    payments.forEach(p => {
        if (!byType[p.payment_type]) byType[p.payment_type] = { count: 0, total: 0 };
        byType[p.payment_type].count++;
        byType[p.payment_type].total += Number(p.total_amount);
    });

    // Top beneficiaries
    const byBeneficiary = {};
    payments.forEach(p => {
        const name = p.beneficiary_name || 'Sin beneficiario';
        if (!byBeneficiary[name]) byBeneficiary[name] = { count: 0, total: 0 };
        byBeneficiary[name].count++;
        byBeneficiary[name].total += Number(p.total_amount);
    });

    const topBeneficiaries = Object.entries(byBeneficiary)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    res.json({
        summary: {
            totalPayments,
            totalPaid,
            totalPending,
            count,
            byType,
            topBeneficiaries,
        }
    });
});

// POST create payment
router.post('/', async (req, res) => {
    const {
        payment_type,
        beneficiary_id,
        beneficiary_name,
        issuing_bank,
        invoice_reference,
        invoice_received_date,
        amount_admk,
        amount_infinite,
        base_amount,
        commission_amount,
        incentives_amount,
        total_amount,
        currency,
        payment_status,
        payment_date,
        due_date,
        fiscal_year,
        fiscal_month,
        notes,
    } = req.body;

    if (!total_amount && total_amount !== 0) return res.status(400).json({ error: 'total_amount is required' });
    if (!fiscal_year || !fiscal_month) return res.status(400).json({ error: 'fiscal_year and fiscal_month are required' });

    const { data, error } = await supabase
        .from('payments')
        .insert({
            payment_type: payment_type || 'transfer',
            beneficiary_id: beneficiary_id || null,
            beneficiary_name: beneficiary_name || null,
            issuing_bank: issuing_bank || null,
            invoice_reference: invoice_reference || null,
            invoice_received_date: invoice_received_date || null,
            amount_admk: amount_admk || null,
            amount_infinite: amount_infinite || null,
            base_amount: base_amount || 0,
            commission_amount: commission_amount || 0,
            incentives_amount: incentives_amount || 0,
            total_amount,
            currency: currency || 'EUR',
            payment_status: payment_status || 'pendiente',
            payment_date: payment_date || null,
            due_date: due_date || null,
            fiscal_year,
            fiscal_month,
            notes: notes || null,
        })
        .select('*, beneficiary:beneficiaries(id, name, type)')
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, payment: data });
});

// PATCH update payment
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const allowed = [
        'payment_type', 'beneficiary_id', 'beneficiary_name', 'issuing_bank',
        'invoice_reference', 'invoice_received_date', 'amount_admk', 'amount_infinite',
        'base_amount', 'commission_amount', 'incentives_amount', 'total_amount', 'currency',
        'payment_status', 'payment_date', 'due_date', 'notes'
    ];

    const updateData = {};
    allowed.forEach(key => {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
    });
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id)
        .select('*, beneficiary:beneficiaries(id, name, type)')
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, payment: data });
});

// PATCH update status only (quick action)
router.patch('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, payment_date } = req.body;

    const updateData = { payment_status: status, updated_at: new Date().toISOString() };
    if (status === 'pagado' && payment_date) {
        updateData.payment_date = payment_date;
    }

    const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id)
        .select('*, beneficiary:beneficiaries(id, name, type)')
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, payment: data });
});

// DELETE payment
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ============================================================
// LEGACY: Keep the old schedule endpoint for backward compat
// ============================================================
router.get('/schedule/:year/:month', async (req, res) => {
    const { year, month } = req.params;
    const { data, error } = await supabase
        .from('payment_schedule')
        .select('*')
        .eq('fiscal_year', year)
        .eq('fiscal_month', month)
        .order('due_date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ payments: data });
});

export default router;
