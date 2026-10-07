import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement, ReactNode } from 'react';
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

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function AuthCard({
  title,
  errorMessage,
  children,
}: {
  title: string;
  errorMessage: string;
  children: ReactNode;
}): ReactElement {
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
            to="/signup"
            className="text-sm font-semibold text-forge-primary no-underline"
          >
            Sign Up
          </Link>
        </header>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-slate-900">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            {errorMessage !== '' && (
              <Alert className="mb-4 border-transparent bg-[#fee] text-[#c00]">
                <AlertDescription className="text-[#c00]">{errorMessage}</AlertDescription>
              </Alert>
            )}
            {children}
            <p className="mt-4 text-center text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="font-semibold text-[#2563eb] no-underline">
                Sign Up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginForm(): ReactElement {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage('');

    if (email.trim() === '') {
      setErrorMessage('Email is required.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Log In" errorMessage={errorMessage}>
      <form className="flex flex-col gap-3" noValidate onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            required
            disabled={isSubmitting}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            required
            minLength={6}
            disabled={isSubmitting}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10"
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 h-11 bg-forge-primary text-base font-semibold text-white hover:bg-forge-primary-hover"
        >
          Log In
        </Button>
      </form>
    </AuthCard>
  );
}

function ProfileCompletion(): ReactElement {
  const { session, updateProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [org, setOrg] = useState('');
  const [orgType, setOrgType] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage('');

    const trimmedUsername = username.trim();
    if (trimmedUsername === '') {
      setErrorMessage('Username is required.');
      return;
    }
    if (orgType === '') {
      setErrorMessage('User type is required.');
      return;
    }
    if (!session) {
      setErrorMessage('Session expired. Please log in again.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await updateProfile({
      username: trimmedUsername,
      first_name: optionalText(firstName),
      last_name: optionalText(lastName),
      org: optionalText(org),
      org_type: orgType,
    });

    if (error) {
      setErrorMessage(
        error.message.includes('unique')
          ? 'That username is already taken.'
          : error.message,
      );
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Complete Your Profile" errorMessage={errorMessage}>
      <form className="flex flex-col gap-3" noValidate onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-username">Username</Label>
          <Input
            id="profile-username"
            type="text"
            autoComplete="username"
            placeholder="Username *"
            required
            maxLength={40}
            disabled={isSubmitting}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-10"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-first-name">First name</Label>
            <Input
              id="profile-first-name"
              type="text"
              autoComplete="given-name"
              placeholder="First name (optional)"
              maxLength={60}
              disabled={isSubmitting}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-last-name">Last name</Label>
            <Input
              id="profile-last-name"
              type="text"
              autoComplete="family-name"
              placeholder="Last name (optional)"
              maxLength={60}
              disabled={isSubmitting}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="h-10"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-org">Organization</Label>
          <Input
            id="profile-org"
            type="text"
            autoComplete="organization"
            placeholder="Organization (optional)"
            maxLength={120}
            disabled={isSubmitting}
            value={org}
            onChange={(event) => setOrg(event.target.value)}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-org-type">User type</Label>
          <Select
            value={orgType === '' ? null : orgType}
            onValueChange={(value) => {
              setOrgType(value ?? '');
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger id="profile-org-type" className="h-10 w-full">
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
          disabled={isSubmitting}
          className="mt-1 h-11 bg-forge-primary text-base font-semibold text-white hover:bg-forge-primary-hover"
        >
          Complete Profile
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage(): ReactElement {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    document.title = 'Log In — FORGE';
  }, []);

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600"
        role="status"
        aria-live="polite"
      >
        Loading…
      </div>
    );
  }

  if (session && profile?.username) {
    return <Navigate to="/app" replace />;
  }

  if (session && !profile?.username) {
    return <ProfileCompletion />;
  }

  return <LoginForm />;
}
