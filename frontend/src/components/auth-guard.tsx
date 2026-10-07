import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): ReactNode {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (!profile?.username) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
