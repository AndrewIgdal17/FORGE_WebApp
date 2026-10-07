import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { MarketingHeader } from '@/components/layout/marketing-header';
import { useAuth } from '@/hooks/use-auth';

export default function LandingPage(): ReactElement {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'FORGE — Framework for Open Reproducible Grid Economics';
  }, []);

  if (session && !loading) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl sm:leading-tight">
            Full-cost benefit-cost analysis for transmission projects
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            The Framework for Open Reproducible Grid Economics covers 24 cost and benefit
            categories across capital, operational, delay, emissions, and risk.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="h-11 bg-forge-primary px-8 text-base text-white hover:bg-forge-primary-hover"
              onClick={() => navigate('/signup')}
            >
              Get Started
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 border-forge-primary bg-white px-8 text-base text-forge-primary hover:bg-forge-primary-light hover:text-forge-primary"
              onClick={() => navigate('/login')}
            >
              Log in
            </Button>
          </div>
        </section>

        <div className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Who it's for</h3>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 leading-relaxed text-slate-600">
              <li>Utilities</li>
              <li>ISO/RTOs</li>
              <li>Consultants</li>
              <li>Academics</li>
              <li>Regulators</li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">What it does</h3>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 leading-relaxed text-slate-600">
              <li>24 cost and benefit categories</li>
              <li>4 BCR perspectives (societal, ratepayer, utility, custom)</li>
              <li>Taxonomy-driven input forms</li>
              <li>Auditable calculations and exports</li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">How it works</h3>
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 leading-relaxed text-slate-600">
              <li>Define your project</li>
              <li>See live results as you edit</li>
              <li>Compare scenarios side by side</li>
            </ol>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-10 text-center">
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-500">
          Built by Andrew Igdal, Webber Energy Group, The University of Texas at Austin
          &amp; Dane McFarlane, Horizon Climate Group
        </p>
      </footer>
    </div>
  );
}
