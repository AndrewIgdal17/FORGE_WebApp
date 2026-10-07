import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, Navigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';

const USER_TYPES = [
  { value: 'utility', label: 'Utility' },
  { value: 'iso_rto', label: 'ISO / RTO' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'academic', label: 'Academic' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
] as const;

const CONFIRMATION_MESSAGE =
  'Check your email for a confirmation link. Once confirmed, log in at the main page.';

interface ProfileDraft {
  username: string;
  first_name: string | null;
  last_name: string | null;
  org: string | null;
  org_type: string;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export default function SignupPage(): ReactElement {
  const { session, loading, signUp, updateProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [org, setOrg] = useState('');
  const [orgType, setOrgType] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formLocked, setFormLocked] = useState(false);
  const [holdRedirect, setHoldRedirect] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<ProfileDraft | null>(null);

  useEffect(() => {
    document.title = 'Create Account — FORGE';
  }, []);

  useEffect(() => {
    if (!session || !pendingProfile) return;
    let cancelled = false;
    const updates = pendingProfile;

    void updateProfile(updates).then(({ error }) => {
      if (cancelled) return;
      if (error) {
        setErrorMessage(
          error.message.includes('unique')
            ? 'That username is already taken.'
            : error.message,
        );
        setIsSubmitting(false);
        return;
      }
      setPendingProfile(null);
      setHoldRedirect(false);
      setIsSubmitting(false);
    });

    return () => {
      cancelled = true;
    };
  }, [session, pendingProfile, updateProfile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (formLocked || isSubmitting) return;

    setErrorMessage('');
    setSuccessMessage('');

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();

    if (trimmedEmail === '') {
      setErrorMessage('Email is required.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (trimmedUsername === '') {
      setErrorMessage('Username is required.');
      return;
    }
    if (orgType === '') {
      setErrorMessage('User type is required.');
      return;
    }

    setHoldRedirect(true);
    setIsSubmitting(true);

    const { error, needsConfirmation } = await signUp(trimmedEmail, password);
    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      if (!session) setHoldRedirect(false);
      return;
    }
    if (needsConfirmation) {
      setSuccessMessage(CONFIRMATION_MESSAGE);
      setFormLocked(true);
      setIsSubmitting(false);
      setHoldRedirect(false);
      return;
    }

    setPendingProfile({
      username: trimmedUsername,
      first_name: optionalText(firstName),
      last_name: optionalText(lastName),
      org: optionalText(org),
      org_type: orgType,
    });
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (session && !holdRedirect && !pendingProfile) {
    return <Navigate to="/app" replace />;
  }

  const fieldsDisabled = formLocked || isSubmitting;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <header className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="text-xl font-extrabold tracking-tight text-slate-900 no-underline"
          >
            FORGE
          </Link>
          <Link
            to="/login"
            className="text-sm font-semibold text-forge-primary no-underline"
          >
            Log in
          </Link>
        </header>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-slate-900">
              Create Your Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errorMessage !== '' && (
              <Alert className="mb-4 border-transparent bg-[#fee] text-[#c00]">
                <AlertDescription className="text-[#c00]">{errorMessage}</AlertDescription>
              </Alert>
            )}
            {successMessage !== '' && (
              <Alert className="mb-4 border-transparent bg-[#efe] text-[#060]">
                <AlertDescription className="text-[#060]">{successMessage}</AlertDescription>
              </Alert>
            )}

            <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Account
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-email">
                  Email <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email *"
                  required
                  disabled={fieldsDisabled}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-password">
                  Password <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Password *"
                  required
                  minLength={6}
                  disabled={fieldsDisabled}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-password-confirm">
                  Confirm password <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="signup-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm password *"
                  required
                  minLength={6}
                  disabled={fieldsDisabled}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-10"
                />
              </div>

              <hr className="my-1 border-0 border-t border-slate-200" />

              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Profile
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-username">
                  Username <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="signup-username"
                  type="text"
                  autoComplete="username"
                  placeholder="Username *"
                  required
                  maxLength={40}
                  disabled={fieldsDisabled}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signup-first-name">First name</Label>
                  <Input
                    id="signup-first-name"
                    type="text"
                    autoComplete="given-name"
                    placeholder="First name (optional)"
                    maxLength={60}
                    disabled={fieldsDisabled}
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signup-last-name">Last name</Label>
                  <Input
                    id="signup-last-name"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Last name (optional)"
                    maxLength={60}
                    disabled={fieldsDisabled}
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-org">Organization</Label>
                <Input
                  id="signup-org"
                  type="text"
                  autoComplete="organization"
                  placeholder="Organization (optional)"
                  maxLength={120}
                  disabled={fieldsDisabled}
                  value={org}
                  onChange={(event) => setOrg(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-org-type">
                  User type <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={orgType === '' ? null : orgType}
                  onValueChange={(value) => {
                    setOrgType(value ?? '');
                  }}
                  disabled={fieldsDisabled}
                >
                  <SelectTrigger id="signup-org-type" className="h-10 w-full">
                    <SelectValue placeholder="User type *" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={fieldsDisabled}
                className="mt-1 h-11 bg-forge-primary text-base font-semibold text-white hover:bg-forge-primary-hover"
              >
                Create Account
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-600">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-[#2563eb] no-underline"
              >
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
