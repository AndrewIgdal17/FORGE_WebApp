import type { ReactElement } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/app', label: 'Home' },
  { href: '/app/workspace', label: 'Workspace' },
  { href: '/app/scenarios-manager', label: 'Scenarios' },
] as const;

export function AppNav(): ReactElement {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const username = profile?.username || '';

  async function handleLogOut(): Promise<void> {
    await signOut();
    navigate('/');
  }

  return (
    <nav className="flex h-12 items-center gap-6 border-b border-black/[0.08] bg-white px-6 text-[0.85rem]">
      <Link
        to="/app"
        className="mr-4 text-base font-bold text-forge-primary no-underline"
      >
        FORGE
      </Link>
      <div className="flex gap-1">
        {NAV_LINKS.map((link) => {
          const active = location.pathname === link.href;
          return (
            <Link
              key={link.href}
              to={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'border-b-2 border-transparent px-3 py-2 font-medium text-black/55 no-underline transition-[color,border-color] duration-150 hover:text-black/85',
                active && 'border-blue-600 font-bold text-blue-600',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span>{username}</span>
        <button
          type="button"
          onClick={() => {
            void handleLogOut();
          }}
          className="cursor-pointer rounded border border-[#ccc] bg-transparent px-[0.6rem] py-1 text-[0.8rem] text-[#888]"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
