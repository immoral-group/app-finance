import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/clients - List all active clients
router.get('/', async (req, res) => {
    try {
        const { data: clients, error } = await supabase
            .from('clients')
            .select(`
                id,
                name,
                legal_name,
                tax_id,
                email,
                phone,
                vertical_id,
                vertical:verticals(id, name, code),
                fee_config,
                is_active,
                created_at,
                updated_at
            `)
            .eq('is_active', true)
            .order('name');

        if (error) throw error;

        res.json({ clients });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/clients/verticals - List all verticals
router.get('/verticals', async (req, res) => {
    try {
        const { data: verticals, error } = await supabase
            .from('verticals')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json({ verticals });
    } catch (error) {
        console.error('Error fetching verticals:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/clients/:id - Get single client
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: client, error } = await supabase
            .from('clients')
            .select(`
                *,
                vertical:verticals(id, name, code)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        res.json({ client });
    } catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/clients - Create new client
router.post('/', async (req, res) => {
    try {
        const {
            name,
            legal_name,
            tax_id,
            email,
            phone,
            address,
            vertical_id,
            fee_config,
            notes,
            fiscal_year
        } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({ error: 'Client name is required' });
        }

        // Set default fee_config if not provided
        const defaultFeeConfig = {
            fee_type: 'fixed',
            fixed_pct: 10,
            variable_ranges: [],
            platform_cost_first: 700,
            platform_cost_additional: 300,
            calculation_type: 'auto'
        };

        const { data: client, error } = await supabase
            .from('clients')
            .insert({
                name,
                legal_name,
                tax_id,
                email,
                phone,
                address,
                address,
                vertical_id: vertical_id || null,
                fee_config: fee_config || defaultFeeConfig,
                notes,
                is_active: true
            })
            .select('*, vertical:verticals(id, name, code)')
            .single();

        if (error) throw error;

        // Assign to the specified fiscal year (or current year)
        const targetYear = fiscal_year || new Date().getFullYear();
        await supabase.from('client_year_assignments')
            .upsert({ client_id: client.id, fiscal_year: targetYear, is_active: true }, { onConflict: 'client_id, fiscal_year' });

        res.status(201).json({ client });
    } catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/clients/:id - Update client
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            legal_name,
            tax_id,
            email,
            phone,
            address,
            vertical_id,
            fee_config,
            notes
        } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (legal_name !== undefined) updateData.legal_name = legal_name;
        if (tax_id !== undefined) updateData.tax_id = tax_id;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;
        if (vertical_id !== undefined) updateData.vertical_id = vertical_id || null;
        if (fee_config !== undefined) updateData.fee_config = fee_config;
        if (notes !== undefined) updateData.notes = notes;

        updateData.updated_at = new Date().toISOString();

        const { data: client, error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', id)
            .select('*, vertical:verticals(id, name, code)')
            .single();

        if (error) throw error;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        res.json({ client });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/clients/:id - Soft delete client
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: client, error } = await supabase
            .from('clients')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        res.json({ message: 'Client deleted successfully', client });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/clients/:id/duplicate - Duplicate client
router.post('/:id/duplicate', async (req, res) => {
    try {
        const { id } = req.params;
        const { new_name, fiscal_year } = req.body;

        if (!new_name) {
            return res.status(400).json({ error: 'New client name is required' });
        }

        // Fetch original client
        const { data: original, error: fetchError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        if (!original) return res.status(404).json({ error: 'Client not found' });

        // Create duplicate
        const { data: duplicate, error: createError } = await supabase
            .from('clients')
            .insert({
                name: new_name,
                legal_name: original.legal_name,
                tax_id: original.tax_id,
                email: original.email,
                phone: original.phone,
                address: original.address,
                vertical_id: original.vertical_id,
                fee_config: original.fee_config,
                notes: `Duplicated from: ${original.name}`,
                is_active: true
            })
            .select('*, vertical:verticals(id, name, code)')
            .single();

        if (createError) throw createError;

        // Assign to the specified fiscal year (or current year)
        const targetYear = fiscal_year || new Date().getFullYear();
        await supabase.from('client_year_assignments')
            .upsert({ client_id: duplicate.id, fiscal_year: targetYear, is_active: true }, { onConflict: 'client_id, fiscal_year' });

        res.status(201).json({ client: duplicate });
    } catch (error) {
        console.error('Error duplicating client:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
