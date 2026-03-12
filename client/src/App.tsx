import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Layout } from '@/components/layout/Layout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Login from '@/features/auth/Login';

import BillingMatrix from '@/features/billing/BillingMatrix';
import MediaTracker from '@/features/media-investment/MediaTracker';
import ExpensesList from '@/features/expenses/Expenses';
import Payroll from '@/features/payroll/Payroll';
import CommissionsIndex from '@/features/commissions/CommissionsIndex';
import DepartmentPL from '@/features/dashboard/DepartmentPL';
import PLMatrix from '@/features/pl/PLMatrix';
import FeeConfiguration from '@/features/fees/FeeConfiguration';
import Payments from '@/features/payments/Payments';
import Dashboard from '@/features/dashboard/Dashboard';
import { ClientsPage } from '@/features/clients/ClientsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import UserManagement from '@/features/users/UserManagement';

// Placeholder components
// Placeholder components removed

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="billing" element={<BillingMatrix />} />
                  <Route path="media-investment" element={<MediaTracker />} />
                  <Route path="expenses" element={<ExpensesList />} />
                  <Route path="payroll" element={<Payroll />} />
                  <Route path="commissions" element={<CommissionsIndex />} />
                  <Route path="departamentos/:deptCode" element={<DepartmentPL />} />
                  <Route path="pl-matrix" element={<PLMatrix />} />
                  <Route path="fees" element={<FeeConfiguration />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="clients" element={<ClientsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="users" element={<UserManagement />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
