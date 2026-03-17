import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

/**
 * POST /year-management/initialize
 * Copy structure (clients, services, categories) from a source year to a target year.
 * Body: { source_year: 2025, target_year: 2026 }
 */
router.post('/initialize', async (req, res) => {
    const { source_year, target_year } = req.body;

    if (!source_year || !target_year) {
        return res.status(400).json({ error: 'source_year and target_year are required' });
    }

    if (source_year === target_year) {
        return res.status(400).json({ error: 'source_year and target_year must be different' });
    }

    try {
        const results = { clients: 0, services: 0, categories: 0 };

        // 1. Copy Client assignments
        const { data: clientAssignments } = await supabase
            .from('client_year_assignments')
            .select('client_id')
            .eq('fiscal_year', source_year)
            .eq('is_active', true);

        if (clientAssignments?.length > 0) {
            const rows = clientAssignments.map(a => ({
                client_id: a.client_id,
                fiscal_year: target_year,
                is_active: true
            }));
            const { data } = await supabase
                .from('client_year_assignments')
                .upsert(rows, { onConflict: 'client_id, fiscal_year' })
                .select('id');
            results.clients = data?.length || rows.length;
        }

        // 2. Copy Service assignments
        const { data: serviceAssignments } = await supabase
            .from('service_year_assignments')
            .select('service_id')
            .eq('fiscal_year', source_year)
            .eq('is_active', true);

        if (serviceAssignments?.length > 0) {
            const rows = serviceAssignments.map(a => ({
                service_id: a.service_id,
                fiscal_year: target_year,
                is_active: true
            }));
            const { data } = await supabase
                .from('service_year_assignments')
                .upsert(rows, { onConflict: 'service_id, fiscal_year' })
                .select('id');
            results.services = data?.length || rows.length;
        }

        // 3. Copy Category assignments
        const { data: categoryAssignments } = await supabase
            .from('category_year_assignments')
            .select('category_id')
            .eq('fiscal_year', source_year)
            .eq('is_active', true);

        if (categoryAssignments?.length > 0) {
            const rows = categoryAssignments.map(a => ({
                category_id: a.category_id,
                fiscal_year: target_year,
                is_active: true
            }));
            const { data } = await supabase
                .from('category_year_assignments')
                .upsert(rows, { onConflict: 'category_id, fiscal_year' })
                .select('id');
            results.categories = data?.length || rows.length;
        }

        res.json({
            success: true,
            message: `Structure copied from ${source_year} to ${target_year}`,
            copied: results
        });

    } catch (error) {
        console.error('Error initializing year:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /year-management/status/:year
 * Check if a year has structure assigned (clients, services, categories).
 */
router.get('/status/:year', async (req, res) => {
    const { year } = req.params;

    try {
        const [clientsResult, servicesResult, categoriesResult] = await Promise.all([
            supabase.from('client_year_assignments').select('id', { count: 'exact', head: true }).eq('fiscal_year', year).eq('is_active', true),
            supabase.from('service_year_assignments').select('id', { count: 'exact', head: true }).eq('fiscal_year', year).eq('is_active', true),
            supabase.from('category_year_assignments').select('id', { count: 'exact', head: true }).eq('fiscal_year', year).eq('is_active', true),
        ]);

        res.json({
            year: parseInt(year),
            has_structure: (clientsResult.count || 0) > 0 || (servicesResult.count || 0) > 0,
            counts: {
                clients: clientsResult.count || 0,
                services: servicesResult.count || 0,
                categories: categoriesResult.count || 0
            }
        });
    } catch (error) {
        console.error('Error checking year status:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
