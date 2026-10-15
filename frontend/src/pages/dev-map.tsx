import type { ReactElement } from 'react';
import { Navigate } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { AppNav } from '@/components/layout/app-nav';
import { MapPanel } from '@/components/map/MapPanel';
import { useAuth } from '@/hooks/use-auth';

const DEV_MAP_EMAIL = 'andrewigdal17@gmail.com';

function DevMapContent(): ReactElement {
  const { session } = useAuth();

  if (session?.user?.email !== DEV_MAP_EMAIL) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="flex h-screen flex-col">
      <AppNav />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <MapPanel createMode={true} />
      </div>
    </div>
  );
}

export default function DevMapPage(): ReactElement {
  return (
    <AuthGuard>
      <DevMapContent />
    </AuthGuard>
  );
}
