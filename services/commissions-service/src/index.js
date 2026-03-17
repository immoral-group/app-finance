import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import partnersRoutes from './routes/partners.js';
import platformsRoutes from './routes/platforms.js';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 3012;

// ================================================
// MIDDLEWARE
// ================================================

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================================
// ROUTES
// ================================================

app.get('/health', (req, res) => {
    res.json({
        service: 'commissions-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.use('/partners', partnersRoutes);
app.use('/platforms', platformsRoutes);

app.get('/', (req, res) => {
    res.json({
        service: 'Immoral Commissions Service',
        version: '1.0.0',
        description: 'Manage partner commissions (paid) and platform commissions (earned)',
        endpoints: {
            partners: {
                list: 'GET /partners',
                create: 'POST /partners',
                assignClient: 'POST /partners/:id/clients',
                calculateCommissions: 'POST /partners/commissions/calculate',
                getCommissions: 'GET /partners/commissions/:year/:month',
                editCommission: 'PATCH /partners/commissions/:id',
                markPaid: 'POST /partners/commissions/:id/pay'
            },
            platforms: {
                list: 'GET /platforms',
                create: 'POST /platforms',
                registerCommission: 'POST /platforms/commissions',
                getCommissions: 'GET /platforms/commissions/:year/:month',
                editCommission: 'PATCH /platforms/commissions/:id',
                markReceived: 'POST /platforms/commissions/:id/receive'
            }
        },
        note: 'Tracks both commissions paid to partners and earned from platforms'
    });
});

// ================================================
// ERROR HANDLING
// ================================================

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ================================================
// START SERVER
// ================================================


if (process.env.NODE_ENV !== 'production' && process.argv[1].endsWith('index.js')) {
    app.listen(PORT, () => {
        console.log(`
    ╔══════════════════════════════════════════════════╗
    ║  Immoral Commissions Service                     ║
    ║  Port: ${PORT}                                      ║
    ║  Environment: ${process.env.NODE_ENV || 'development'}                     ║
    ║  Supabase: ${process.env.SUPABASE_URL ? '✓ Connected' : '✗ Not configured'}       ║
    ╚══════════════════════════════════════════════════╝
    
    💰 Modules:
      • Partner Commissions (PAID to referrers)
      • Platform Commissions (EARNED from WillMay, etc.)
      • Automatic calculation + manual override
    
    🚀 Ready at http://localhost:${PORT}
      `);
    });
}

export default app;
