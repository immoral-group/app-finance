import express from 'express';
import { authenticateApiKey } from './developers.js';

// Import existing route handlers to re-expose under /api with API key auth
import billingRoutes from './billing.js';
import clientRoutes from './clients.js';
import dashboardRoutes from './dashboard.js';
import expenseRoutes from './expenses.js';
import plRoutes from './pl.js';
import paymentRoutes from './payments.js';
import settingsRoutes from './settings.js';
import usersRoutes from './users.js';

const router = express.Router();

// ================================================
// PUBLIC API GATEWAY
// ================================================
// All routes under /api/* require a valid API key via x-api-key header.
// The middleware checks the key, validates permissions, and tracks usage.
// ================================================

// Apply API key auth to ALL routes in this gateway
router.use(authenticateApiKey);

/**
 * Permission check middleware factory
 * Validates that the API key has the required scope
 */
function requireScope(scope) {
    return (req, res, next) => {
        const permissions = req.apiKeyPermissions || [];
        // Allow if they have the exact scope, or a wildcard like '*'
        if (permissions.includes(scope) || permissions.includes('*')) {
            return next();
        }
        return res.status(403).json({
            error: `Insufficient permissions. Required scope: ${scope}`,
            your_scopes: permissions,
        });
    };
}

// ── Billing ──────────────────────────────────────
router.use('/billing', requireScope('billing:read'), billingRoutes);

// ── Clients ──────────────────────────────────────
router.use('/clients', requireScope('clients:read'), clientRoutes);

// ── Dashboard ────────────────────────────────────
router.use('/dashboard', requireScope('dashboard:read'), dashboardRoutes);

// ── Expenses ─────────────────────────────────────
router.use('/expenses', requireScope('expenses:read'), expenseRoutes);

// ── P&L ──────────────────────────────────────────
router.use('/pl', requireScope('pl:read'), plRoutes);

// ── Payments ─────────────────────────────────────
router.use('/payments', requireScope('payments:read'), paymentRoutes);

// ── Users ────────────────────────────────────────
router.use('/users', requireScope('users:read'), usersRoutes);

// ── API Info ─────────────────────────────────────
router.get('/', (req, res) => {
    res.json({
        message: 'Immoral Finance API',
        version: '1.0.0',
        authenticated: true,
        api_key_id: req.apiKeyId,
        scopes: req.apiKeyPermissions,
        documentation: '/developers/docs',
    });
});

export default router;
