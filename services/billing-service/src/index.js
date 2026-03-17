import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import eventsRouter from './routes/events.js';
import { testConnection } from './config/supabase.js';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/events', eventsRouter);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'billing-service',
        version: '1.0.0',
        description: 'Immoral Finance - Billing microservice',
        endpoints: {
            health: '/events/health',
            invoiceIssued: 'POST /events/invoice-issued'
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
async function startServer() {
    try {
        // Test database connection
        // In serverless environment, we might want to skip this or handle it differently
        // regarding connection pooling
        if (process.env.NODE_ENV !== 'production') {
            const dbConnected = await testConnection();
            if (!dbConnected) {
                console.error('Failed to connect to database. Exiting...');
                process.exit(1);
            }
        }

        if (process.env.NODE_ENV !== 'production' && process.argv[1].endsWith('index.js')) {
            app.listen(PORT, () => {
                console.log(`🚀 Billing Service running on port ${PORT}`);
                console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`🔗 Endpoints:`);
                console.log(`   - POST http://localhost:${PORT}/events/invoice-issued`);
                console.log(`   - GET  http://localhost:${PORT}/events/health`);
            });
        }
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;
