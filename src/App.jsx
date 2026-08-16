import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ConfigProvider } from '@/lib/ConfigContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import { Navigate } from 'react-router-dom';
import ProtectedRoute, { RoleRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/layout/AppLayout';
import CommandCenter from '@/pages/CommandCenter';
import SignalExplorer from '@/pages/SignalExplorer';
import SdrConsole from '@/pages/SdrConsole';
import CallDetail from '@/pages/CallDetail';
import SellerOutreach from '@/pages/SellerOutreach';
import RepWorkspace from '@/pages/RepWorkspace';
import Pipeline from '@/pages/Pipeline';
import Seller360 from '@/pages/Seller360';
import ChurnConsole from '@/pages/ChurnConsole';
import Campaigns from '@/pages/Campaigns';
import Experiments from '@/pages/Experiments';
import ExperimentDetail from '@/pages/ExperimentDetail';
import MqlInbox from '@/pages/MqlInbox';
import Sellers from '@/pages/Sellers';
import Compliance from '@/pages/Compliance';

const AuthenticatedApp = () => {
  const { isLoadingAuth, authChecked, authError } = useAuth();

  // Wait for the session check before deciding what to render, otherwise a
  // signed-in user flashes the login screen on every reload.
  if (isLoadingAuth || !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError && authError.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          {/* Every in-app screen also passes the role gate. */}
          <Route element={<RoleRoute />}>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/signals" element={<SignalExplorer />} />
          <Route path="/mql" element={<MqlInbox />} />
          <Route path="/sdr" element={<SdrConsole />} />
          <Route path="/sdr/calls/:id" element={<CallDetail />} />
          <Route path="/sdr/sellers/:id" element={<SellerOutreach />} />
          <Route path="/sellers/:id" element={<Seller360 />} />
          <Route path="/workspace" element={<RepWorkspace />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/churn" element={<ChurnConsole />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/experiments/:id" element={<ExperimentDetail />} />
          <Route path="/sellers" element={<Sellers />} />
          <Route path="/compliance" element={<Compliance />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ConfigProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ConfigProvider>
  )
}

export default App