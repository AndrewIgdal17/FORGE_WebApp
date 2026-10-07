import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function MarketingHeader(): ReactElement {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link
          to="/"
          className="text-xl font-extrabold tracking-tight text-slate-900 no-underline"
        >
          FORGE
        </Link>
        <Button
          nativeButton={false}
          render={<Link to="/login" />}
          variant="outline"
          className="border-forge-primary text-forge-primary hover:bg-forge-primary-light hover:text-forge-primary"
        >
          Log in
        </Button>
      </div>
    </header>
  );
}
