import express from 'express';
import Joi from 'joi';
import supabase from '../config/supabase.js';
import { logChange, extractUser } from '../utils/changeLogger.js';

const router = express.Router();

// ================================================
// IMSALES BILLING MANAGEMENT ENDPOINTS
// ================================================

// Cache for Imsales service IDs (loaded once)
let _imsalesServices = null;
async function getImsalesServices() {
    if (_imsalesServices) return _imsalesServices;
    
    const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('code', 'IMSALES')
        .single();
    
    if (!dept) throw new Error('Imsales department not found');
    
    const { data: services } = await supabase
        .from('services')
        .select('id, name, code, display_order')
        .eq('department_id', dept.id)
        .eq('is_active', true)
        .order('display_order');
    
    _imsalesServices = { departmentId: dept.id, services: services || [] };
    return _imsalesServices;
}

/**
 * GET /imsales/services
 * Get Imsales services (Setup Inicial IMS, Captación)
 */
router.get('/services', async (req, res) => {
    try {
        const { services } = await getImsalesServices();
        res.json({ services });
    } catch (err) {
        console.error('Error fetching Imsales services:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /imsales/billing/:year/:month
 * Get Imsales billing matrix for a period
 * Returns clients with vertical=Imsales and their billing amounts per service
 */
router.get('/billing/:year/:month', async (req, res) => {
    try {
        const { year, month } = req.params;
        const fiscalYear = parseInt(year);
        const fiscalMonth = parseInt(month);

        // 1. Get Imsales services
        const { departmentId, services } = await getImsalesServices();

        // 2. Get Imsales vertical ID
        const { data: vertical } = await supabase
            .from('verticals')
            .select('id')
            .eq('code', 'IMSALES')
            .single();

        // 3. Get clients with Imsales vertical (active only, filtered by visibility)
        const yyyymm = fiscalYear * 100 + fiscalMonth;
        let clientQuery = supabase
            .from('clients')
            .select('id, name, hidden_from_yyyymm, visible_from_yyyymm')
            .eq('is_active', true)
            .order('name');

        if (vertical) {
            clientQuery = clientQuery.eq('vertical_id', vertical.id);
        }

        const { data: clients, error: clientsError } = await clientQuery;
        if (clientsError) return res.status(500).json({ error: clientsError.message });

        // Filter hidden clients
        const visibleClients = (clients || []).filter(c => {
            if (!c.hidden_from_yyyymm || c.hidden_from_yyyymm > yyyymm) return true;
            return c.visible_from_yyyymm != null && c.visible_from_yyyymm <= yyyymm;
        });

        // 4. Get monthly_billing records for these clients
        const clientIds = visibleClients.map(c => c.id);
        if (clientIds.length === 0) {
            return res.json({ 
                investments: [], 
                services: services.map(s => ({ id: s.id, name: s.name, code: s.code }))
            });
        }

        const { data: billingRecords } = await supabase
            .from('monthly_billing')
            .select('id, client_id')
            .eq('fiscal_year', fiscalYear)
            .eq('fiscal_month', fiscalMonth)
            .in('client_id', clientIds);

        // 5. Get billing_details for Imsales services
        const billingIds = (billingRecords || []).map(b => b.id);
        const serviceIds = services.map(s => s.id);

        let details = [];
        if (billingIds.length > 0 && serviceIds.length > 0) {
            const { data: detailsData } = await supabase
                .from('billing_details')
                .select('monthly_billing_id, service_id, amount')
                .in('monthly_billing_id', billingIds)
                .in('service_id', serviceIds);
            details = detailsData || [];
        }

        // 6. Build matrix
        const matrix = visibleClients.map(client => {
            const billing = (billingRecords || []).find(b => b.client_id === client.id);
            const serviceAmounts = {};
            let total = 0;

            services.forEach(svc => {
                const detail = details.find(d => 
                    d.monthly_billing_id === billing?.id && d.service_id === svc.id
                );
                const amount = parseFloat(detail?.amount || 0);
                serviceAmounts[svc.id] = amount;
                total += amount;
            });

            return {
                client_id: client.id,
                client_name: client.name,
                billing_id: billing?.id || null,
                services: serviceAmounts,
                total
            };
        });

        res.json({ 
            investments: matrix,
            services: services.map(s => ({ id: s.id, name: s.name, code: s.code }))
        });

    } catch (err) {
        console.error('Error fetching Imsales billing:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /imsales/billing/save
 * Save an Imsales service amount for a client
 */
router.post('/billing/save', async (req, res) => {
    try {
        const schema = Joi.object({
            client_id: Joi.string().uuid().required(),
            fiscal_year: Joi.number().integer().required(),
            fiscal_month: Joi.number().integer().min(1).max(12).required(),
            service_id: Joi.string().uuid().required(),
            amount: Joi.number().min(0).required()
        });

        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { departmentId } = await getImsalesServices();

        // Ensure monthly_billing record exists
        let { data: billing } = await supabase
            .from('monthly_billing')
            .select('id')
            .eq('client_id', value.client_id)
            .eq('fiscal_year', value.fiscal_year)
            .eq('fiscal_month', value.fiscal_month)
            .maybeSingle();

        if (!billing) {
            const { data: newBilling, error: insertError } = await supabase
                .from('monthly_billing')
                .insert({
                    client_id: value.client_id,
                    fiscal_year: value.fiscal_year,
                    fiscal_month: value.fiscal_month
                })
                .select('id')
                .single();

            if (insertError) throw insertError;
            billing = newBilling;
        }

        // Get service name for logging
        const { data: svc } = await supabase
            .from('services')
            .select('name')
            .eq('id', value.service_id)
            .single();

        // Check if billing_detail already exists
        const { data: existingDetail } = await supabase
            .from('billing_details')
            .select('id, amount')
            .eq('monthly_billing_id', billing.id)
            .eq('service_id', value.service_id)
            .maybeSingle();

        let detail;
        if (existingDetail) {
            // Update existing
            const { data: updated, error: updateError } = await supabase
                .from('billing_details')
                .update({ amount: value.amount })
                .eq('id', existingDetail.id)
                .select()
                .single();
            if (updateError) throw updateError;
            detail = updated;
        } else {
            // Insert new
            const { data: inserted, error: insertError2 } = await supabase
                .from('billing_details')
                .insert({
                    monthly_billing_id: billing.id,
                    service_id: value.service_id,
                    department_id: departmentId,
                    service_name: svc?.name || 'Imsales Service',
                    amount: value.amount
                })
                .select()
                .single();
            if (insertError2) throw insertError2;
            detail = inserted;
        }

        // Log change (fire-and-forget)
        const { userId, userEmail } = extractUser(req);
        logChange(supabase, {
            module: 'imsales',
            table: 'billing_details',
            recordId: detail?.id,
            recordLabel: `${svc?.name || 'Imsales'} ${value.fiscal_year}/${String(value.fiscal_month).padStart(2, '0')}`,
            operation: existingDetail ? 'update' : 'create',
            fieldName: 'amount',
            newValue: value.amount,
            userId, userEmail,
        }).catch(() => {});

        res.json({ success: true, detail });

    } catch (err) {
        console.error('Error saving Imsales billing:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /imsales/hide-client
 * Hide a client from Imsales billing view
 */
router.post('/hide-client', async (req, res) => {
    try {
        const schema = Joi.object({
            client_id: Joi.string().uuid().required(),
            fiscal_year: Joi.number().integer().required(),
            fiscal_month: Joi.number().integer().min(1).max(12).required(),
        });

        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const yyyymm = value.fiscal_year * 100 + value.fiscal_month;
        const { error: updateError } = await supabase
            .from('clients')
            .update({ hidden_from_yyyymm: yyyymm, visible_from_yyyymm: null })
            .eq('id', value.client_id);

        if (updateError) return res.status(500).json({ error: updateError.message });

        const { userId, userEmail } = extractUser(req);
        logChange(supabase, {
            module: 'imsales',
            table: 'clients',
            recordId: value.client_id,
            recordLabel: `Cliente oculto desde ${value.fiscal_year}/${String(value.fiscal_month).padStart(2, '0')}`,
            operation: 'update',
            fieldName: 'hidden_from_yyyymm',
            newValue: String(yyyymm),
            userId, userEmail,
        }).catch(() => {});

        res.json({ success: true });
    } catch (err) {
        console.error('Error hiding client:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /imsales/unhide-client
 * Unhide a client
 */
router.post('/unhide-client', async (req, res) => {
    try {
        const schema = Joi.object({
            client_id: Joi.string().uuid().required(),
            fiscal_year: Joi.number().integer().required(),
            fiscal_month: Joi.number().integer().min(1).max(12).required(),
        });

        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const visibleFrom = value.fiscal_year * 100 + value.fiscal_month;
        const { error: updateError } = await supabase
            .from('clients')
            .update({ visible_from_yyyymm: visibleFrom })
            .eq('id', value.client_id);

        if (updateError) return res.status(500).json({ error: updateError.message });

        const { userId, userEmail } = extractUser(req);
        logChange(supabase, {
            module: 'imsales',
            table: 'clients',
            recordId: value.client_id,
            recordLabel: `Cliente reactivado desde ${value.fiscal_year}/${String(value.fiscal_month).padStart(2, '0')}`,
            operation: 'update',
            fieldName: 'visible_from_yyyymm',
            newValue: String(visibleFrom),
            userId, userEmail,
        }).catch(() => {});

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /imsales/hidden-clients/:year/:month
 * Get hidden clients for a period
 */
router.get('/hidden-clients/:year/:month', async (req, res) => {
    try {
        const { year, month } = req.params;
        const yyyymm = parseInt(year) * 100 + parseInt(month);

        // Get Imsales vertical
        const { data: vertical } = await supabase
            .from('verticals')
            .select('id')
            .eq('code', 'IMSALES')
            .single();

        let query = supabase
            .from('clients')
            .select('id, name, hidden_from_yyyymm, visible_from_yyyymm')
            .eq('is_active', true)
            .not('hidden_from_yyyymm', 'is', null)
            .lte('hidden_from_yyyymm', yyyymm)
            .order('name');

        if (vertical) {
            query = query.eq('vertical_id', vertical.id);
        }

        const { data: allHidden, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        const hidden = (allHidden || []).filter(c =>
            c.visible_from_yyyymm == null || c.visible_from_yyyymm > yyyymm
        );

        res.json({ hidden });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
