import express from 'express'; // Server restart trigger
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dotenvDir = dirname(fileURLToPath(import.meta.url));
// Carga el .env raíz del monorepo (src/ → admin-service/ → services/ → app-finance/)
dotenv.config({ path: resolve(__dotenvDir, '../../../.env') });
// Fallback: load local admin-service .env (for API keys added locally)
dotenv.config({ path: resolve(__dotenvDir, '../.env') });
import billingRoutes from './routes/billing.js';
import expenseRoutes from './routes/expenses.js';
import periodsRoutes from './routes/periods.js';
import mediaRoutes from './routes/media.js';
import plRoutes from './routes/pl.js';
import feeRoutes from './routes/fees.js';
import clientRoutes from './routes/clients.js';
import paymentRoutes from './routes/payments.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import usersRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import messagesRoutes from './routes/messages.js';
import notificationsRoutes from './routes/notifications.js';
import yearManagementRoutes from './routes/year-management.js';
import developersRoutes from './routes/developers.js';
import apiGateway from './routes/api-gateway.js';
import integrationsRoutes from './routes/integrations.js';
import changelogRoutes from './routes/changelog.js';
import imsalesRoutes from './routes/imsales.js';
import budgetRequestsRoutes from './routes/budget-requests.js';
import nutfruitRoutes from './routes/nutfruit.js';
import icexRoutes from './routes/icex.js';
import profitabilityRoutes from './routes/profitability.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3010;

app.use(cors());
app.use(express.json());

// Routes
app.use('/billing', billingRoutes);
app.use('/expenses', expenseRoutes);
app.use('/periods', periodsRoutes);
app.use('/media', mediaRoutes);
app.use('/pl', plRoutes);
app.use('/fees', feeRoutes);
app.use('/clients', clientRoutes);
app.use('/payments', paymentRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/settings', settingsRoutes);
app.use('/users', usersRoutes);
app.use('/chat', chatRoutes);
app.use('/messages', messagesRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/year-management', yearManagementRoutes);
app.use('/developers', developersRoutes);

// Public API Gateway (requires API key auth via x-api-key header)
app.use('/api', apiGateway);

// External integrations (Holded, etc.)
app.use('/integrations', integrationsRoutes);

// Change log (historial de cambios por módulo)
app.use('/changelog', changelogRoutes);

// Imsales billing
app.use('/imsales', imsalesRoutes);
app.use('/budget-requests', budgetRequestsRoutes);
app.use('/nutfruit', nutfruitRoutes);
app.use('/icex', icexRoutes);
app.use('/profitability', profitabilityRoutes);


// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'admin-service' });
});

// Export app for Vercel Serverless Functions
export default app;

// Only start the server if running directly
if (process.env.NODE_ENV !== 'production' && process.argv[1].endsWith('index.js')) {
    app.listen(port, () => {
        console.log(`Admin Service running on port ${port} - Restarted at ${new Date().toISOString()} [RESTARTED]`);
    });
}
