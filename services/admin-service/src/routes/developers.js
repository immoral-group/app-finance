import express from 'express';
import crypto from 'crypto';
import supabase from '../config/supabase.js';

const router = express.Router();

// ================================================
// API KEYS MANAGEMENT
// ================================================

/**
 * Available permission scopes for API keys
 */
const AVAILABLE_SCOPES = [
    // Billing
    { key: 'billing:read', label: 'Billing - Lectura', module: 'Billing' },
    { key: 'billing:write', label: 'Billing - Escritura', module: 'Billing' },
    // Clients
    { key: 'clients:read', label: 'Clientes - Lectura', module: 'Clients' },
    { key: 'clients:write', label: 'Clientes - Escritura', module: 'Clients' },
    // Dashboard & KPIs
    { key: 'dashboard:read', label: 'Dashboard - Lectura', module: 'Dashboard' },
    // Expenses
    { key: 'expenses:read', label: 'Gastos - Lectura', module: 'Expenses' },
    { key: 'expenses:write', label: 'Gastos - Escritura', module: 'Expenses' },
    // P&L
    { key: 'pl:read', label: 'P&L - Lectura', module: 'P&L' },
    { key: 'pl:write', label: 'P&L - Escritura', module: 'P&L' },
    // Payments
    { key: 'payments:read', label: 'Pagos - Lectura', module: 'Payments' },
    { key: 'payments:write', label: 'Pagos - Escritura', module: 'Payments' },
    // Payroll
    { key: 'payroll:read', label: 'Nóminas - Lectura', module: 'Payroll' },
    // Commissions
    { key: 'commissions:read', label: 'Comisiones - Lectura', module: 'Commissions' },
    { key: 'commissions:write', label: 'Comisiones - Escritura', module: 'Commissions' },
    // Users
    { key: 'users:read', label: 'Usuarios - Lectura', module: 'Users' },
];

/**
 * Generate a secure API key with prefix
 * Format: ig_live_<32 random hex chars>
 */
function generateApiKey() {
    const randomPart = crypto.randomBytes(24).toString('hex');
    return `ig_live_${randomPart}`;
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * GET /developers/api-keys
 * List all API keys (without full key, only prefix)
 */
router.get('/api-keys', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('api_keys')
            .select('id, name, key_prefix, permissions, created_at, last_used_at, is_active, expires_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ keys: data || [] });
    } catch (err) {
        console.error('Error fetching API keys:', err);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

/**
 * GET /developers/scopes
 * Returns all available permission scopes
 */
router.get('/scopes', async (req, res) => {
    res.json({ scopes: AVAILABLE_SCOPES });
});

/**
 * POST /developers/api-keys
 * Create a new API key
 * Body: { name: string, permissions: string[], expires_at?: string }
 * Returns the full API key ONLY ONCE (it's hashed after this)
 */
router.post('/api-keys', async (req, res) => {
    const { name, permissions = [], expires_at, created_by } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }

    try {
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        const keyPrefix = apiKey.substring(0, 15); // "ig_live_" + first 7 hex chars

        const { data, error } = await supabase
            .from('api_keys')
            .insert({
                name: name.trim(),
                key_prefix: keyPrefix,
                key_hash: keyHash,
                permissions,
                created_by: created_by || null,
                expires_at: expires_at || null,
            })
            .select('id, name, key_prefix, permissions, created_at, expires_at')
            .single();

        if (error) throw error;

        // Return the full key ONLY THIS ONCE
        res.json({
            success: true,
            key: {
                ...data,
                full_key: apiKey, // Only returned on creation!
            }
        });
    } catch (err) {
        console.error('Error creating API key:', err);
        res.status(500).json({ error: 'Failed to create API key' });
    }
});

/**
 * PATCH /developers/api-keys/:id
 * Update API key name, permissions, or active status
 */
router.patch('/api-keys/:id', async (req, res) => {
    const { name, permissions, is_active } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (permissions !== undefined) updates.permissions = permissions;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
    }

    try {
        const { error } = await supabase
            .from('api_keys')
            .update(updates)
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating API key:', err);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

/**
 * DELETE /developers/api-keys/:id
 * Permanently delete an API key
 */
router.delete('/api-keys/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('api_keys')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting API key:', err);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
});

// ================================================
// API KEY AUTHENTICATION MIDDLEWARE
// ================================================

/**
 * Middleware to authenticate requests using API key
 * Usage: Add to any route that should accept external API key auth
 * Header: x-api-key: ig_live_<key>
 */
export async function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ error: 'API key required. Include x-api-key header.' });
    }

    try {
        const keyHash = hashApiKey(apiKey);

        const { data, error } = await supabase
            .from('api_keys')
            .select('id, permissions, expires_at')
            .eq('key_hash', keyHash)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Invalid or inactive API key' });
        }

        // Check expiration
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            return res.status(401).json({ error: 'API key has expired' });
        }

        // Update last_used_at (fire and forget)
        supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', data.id)
            .then(() => {});

        // Attach permissions to request for downstream use
        req.apiKeyPermissions = data.permissions;
        req.apiKeyId = data.id;
        next();
    } catch (err) {
        console.error('API key auth error:', err);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

// ================================================
// API DOCUMENTATION ENDPOINT
// ================================================

/**
 * GET /developers/docs
 * Returns auto-generated API documentation
 */
router.get('/docs', async (req, res) => {
    const docs = {
        title: 'Immoral Finance API',
        version: '1.0.0',
        base_url: '/api',
        authentication: {
            type: 'API Key',
            header: 'x-api-key',
            format: 'ig_live_<key>',
            description: 'Include your API key in the x-api-key header of every request.',
        },
        modules: [
            {
                name: 'Billing',
                scope: 'billing:read',
                endpoints: [
                    { method: 'GET', path: '/billing/matrix?year={year}&month={month}', description: 'Get billing matrix for a specific month', params: ['year (int)', 'month (int, 1-12)'] },
                    { method: 'GET', path: '/billing?year={year}&month={month}', description: 'Get billing records', params: ['year (int)', 'month (int)'] },
                ],
            },
            {
                name: 'Clients',
                scope: 'clients:read',
                endpoints: [
                    { method: 'GET', path: '/clients', description: 'List all clients' },
                    { method: 'GET', path: '/clients/verticals', description: 'List all verticals' },
                    { method: 'GET', path: '/clients/{id}', description: 'Get client by ID', params: ['id (UUID)'] },
                ],
            },
            {
                name: 'Dashboard',
                scope: 'dashboard:read',
                endpoints: [
                    { method: 'GET', path: '/dashboard/kpis/{year}', description: 'Get KPIs for a year', params: ['year (int)'] },
                ],
            },
            {
                name: 'Expenses',
                scope: 'expenses:read',
                endpoints: [
                    { method: 'GET', path: '/expenses/{year}/{month}', description: 'Get expenses for month', params: ['year (int)', 'month (int)'] },
                ],
            },
            {
                name: 'P&L',
                scope: 'pl:read',
                endpoints: [
                    { method: 'GET', path: '/pl/summary/{year}', description: 'Get P&L summary', params: ['year (int)'] },
                    { method: 'GET', path: '/pl/matrix/{year}?type=real|budget', description: 'Get P&L spreadsheet data', params: ['year (int)', 'type (budget|real)'] },
                    { method: 'GET', path: '/pl/cost-per-hour/{year}/{dept}', description: 'Get cost-per-hour metrics', params: ['year (int)', 'dept (immedia|imcontent|immoralia)'] },
                ],
            },
            {
                name: 'Payments',
                scope: 'payments:read',
                endpoints: [
                    { method: 'GET', path: '/payments/schedule/{year}/{month}', description: 'Get payment schedule', params: ['year (int)', 'month (int)'] },
                    { method: 'GET', path: '/payments/beneficiaries', description: 'List all beneficiaries' },
                    { method: 'GET', path: '/payments/summary/{year}/{month}', description: 'Get payment summary', params: ['year (int)', 'month (int)'] },
                ],
            },
            {
                name: 'Payroll',
                scope: 'payroll:read',
                endpoints: [
                    { method: 'GET', path: '/payroll/{year}/{month}', description: 'Get payroll for month', params: ['year (int)', 'month (int)'] },
                    { method: 'GET', path: '/employees', description: 'List all employees' },
                    { method: 'GET', path: '/employees/{id}', description: 'Get employee by ID', params: ['id (UUID)'] },
                ],
            },
            {
                name: 'Commissions',
                scope: 'commissions:read',
                endpoints: [
                    { method: 'GET', path: '/partners', description: 'List all partners' },
                    { method: 'GET', path: '/partners/commissions/{year}/{month}', description: 'Get commissions for month', params: ['year (int)', 'month (int)'] },
                    { method: 'GET', path: '/partners/commissions/annual/{year}', description: 'Get annual commissions', params: ['year (int)'] },
                ],
            },
            {
                name: 'Users',
                scope: 'users:read',
                endpoints: [
                    { method: 'GET', path: '/users', description: 'List all users' },
                ],
            },
        ],
    };

    res.json(docs);
});

export default router;
