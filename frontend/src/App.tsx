import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { NavigationProvider } from '@/hooks/use-navigation';
import LandingPage from '@/pages/landing';
import SignupPage from '@/pages/signup';
import LoginPage from '@/pages/login';

export default function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="bottom-center" visibleToasts={3} duration={4000} />
        </TooltipProvider>
      </NavigationProvider>
    </AuthProvider>
  );
}
