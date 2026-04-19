import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Layout } from '@/components/layout/Layout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Login from '@/features/auth/Login';
import ResetPassword from '@/features/auth/ResetPassword';
import { useEffect } from 'react';

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
import Developers from '@/features/developers/Developers';

// Placeholder components
// Placeholder components removed

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutos antes de considerar los datos stale
    },
  },
});

function App() {
  // Configurar scroll restoration manual para preservar posición al cambiar de tab
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />

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
                  <Route path="developers" element={<Developers />} />
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
