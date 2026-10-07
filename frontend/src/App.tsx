import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from '@/hooks/use-auth';
import LandingPage from '@/pages/landing';
import SignupPage from '@/pages/signup';
import LoginPage from '@/pages/login';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
