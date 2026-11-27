import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ session: null, profile: null, signOut: vi.fn() }),
}));

import { AppNav } from '@/components/layout/app-nav';

function render(): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ['/app'] }, createElement(AppNav)),
  );
}

describe('AppNav', () => {
  it('orders the links Home, Projects, Workspace', () => {
    const html = render();
    const home = html.indexOf('>Home<');
    const projects = html.indexOf('>Projects<');
    const workspace = html.indexOf('>Workspace<');
    expect(home).toBeGreaterThan(-1);
    expect(projects).toBeGreaterThan(home);
    expect(workspace).toBeGreaterThan(projects);
  });

  it('shows Workspace disabled with a hint when nothing is remembered', () => {
    const html = render();
    expect(html).toContain('title="Open a project first"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('href="/app/workspace');
  });
});
