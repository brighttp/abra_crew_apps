import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { login } from '../stores/auth';
import { post } from '../services/api';
import { ArrowUpRight, Eye, EyeOff } from 'lucide-solid';
import heroSmall from '../assets/sidebar-logo-320.webp';
import heroLarge from '../assets/sidebar-logo-554.webp';
import heroFallback from '../assets/sidebar-logo.png';
export default function Auth(p) {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal(''),
    [success, setSuccess] = createSignal(false);
  const [showPassword, setShowPassword] = createSignal(false);
  async function submit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      if (p.register) {
        if (params.event) data.registration_token = params.event;
        await post('/auth/register', data);
        setSuccess(true);
      } else {
        const u = await login(data);
        navigate(
          params.event
            ? `/event/${encodeURIComponent(params.event)}`
            : u.account_role === 'ADMIN'
              ? '/admin/dashboard'
              : '/crew/dashboard',
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="auth-page auth-refined">
      <div class="auth-story">
        <A href="/login" class="auth-hero" aria-label="Abracodebra — Crew OS">
          <picture>
            <source
              type="image/webp"
              srcset={`${heroSmall} 320w, ${heroLarge} 554w`}
              sizes="(max-width: 800px) min(88vw, 380px), min(42vw, 460px)"
            />
            <img
              src={heroFallback}
              width="554"
              height="162"
              alt="Abracodebra"
              fetchpriority="high"
              loading="eager"
              decoding="async"
            />
          </picture>
          <span class="auth-hero-caption">CREW OS / ABRACODEBRA</span>
        </A>
        <div class="auth-editorial">
          <p class="eyebrow">
            <span class="auth-status-dot" /> THE PEOPLE BEHIND THE EXPERIENCE
          </p>
          <h1>
            Great work.
            <br />
            <em>Stronger crew.</em>
          </h1>
          <p class="muted">
            One workspace for the people, events, and skills that bring every experience to life.
          </p>
          <div class="auth-story-footer">
            <span>People. Events. Possibilities.</span>
            <ArrowUpRight size={24} />
          </div>
        </div>
        <small class="muted">MADE FOR THE PEOPLE WHO MAKE IT HAPPEN.</small>
      </div>
      <div class="auth-panel">
        <div class="auth-card">
          <Show when={p.register}>
            <header class="auth-intro">
              <h2>{success() ? 'You’re on the list.' : 'Join the crew'}</h2>
              <p>
                {success()
                  ? 'Registration received. Here’s what happens next.'
                  : 'Create your account to get started.'}
              </p>
            </header>
          </Show>
          <Show
            when={!success()}
            fallback={
              <div class="stack">
                <div class="auth-confirmation" role="status">
                  <strong>
                    <span class="auth-status-dot" aria-hidden="true" />
                    Awaiting approval
                  </strong>
                  <p>Your administrator will review your account before you can sign in.</p>
                  <small>Event applications are reviewed separately.</small>
                </div>
                <A
                  class="button primary"
                  href={
                    '/login' + (params.event ? '?event=' + encodeURIComponent(params.event) : '')
                  }
                >
                  Back to sign in
                </A>
              </div>
            }
          >
            <form
              class="stack"
              aria-label={p.register ? 'Create account' : 'Sign in'}
              onSubmit={submit}
            >
              <Show when={p.register}>
                <label class="field">
                  <span>Full name *</span>
                  <input name="full_name" required maxlength="200" autocomplete="name" />
                </label>
              </Show>
              <label class="field">
                <span>Username *</span>
                <input
                  name="username"
                  required
                  minlength="3"
                  maxlength="60"
                  autocomplete="username"
                  pattern="[a-zA-Z0-9_.\-]+"
                />
              </label>
              <Show when={p.register}>
                <label class="field">
                  <span>Email *</span>
                  <input name="email" type="email" required autocomplete="email" />
                </label>
                <label class="field">
                  <span>Phone number *</span>
                  <input name="phone" type="tel" required maxlength="40" autocomplete="tel" />
                </label>
              </Show>
              <div class="field">
                <label for="auth-password">Password *</label>
                <div class="auth-password">
                  <input
                    id="auth-password"
                    name="password"
                    type={showPassword() ? 'text' : 'password'}
                    required
                    minlength={p.register ? 8 : 1}
                    maxlength="128"
                    autocomplete={p.register ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    aria-label={showPassword() ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword()}
                    onClick={() => setShowPassword(!showPassword())}
                  >
                    <Show when={showPassword()} fallback={<Eye size={18} />}>
                      <EyeOff size={18} />
                    </Show>
                  </button>
                </div>
                <Show when={p.register}>
                  <small>At least 8 characters.</small>
                </Show>
              </div>
              <Show when={p.register}>
                <label class="field">
                  <span>Confirm password *</span>
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    autocomplete="new-password"
                  />
                </label>
              </Show>
              <Show when={error()}>
                <p class="error" role="alert">
                  {error()}
                </p>
              </Show>
              <button class="primary auth-submit" disabled={busy()}>
                {busy() ? 'Please wait…' : p.register ? 'Create account' : 'Sign in'}{' '}
                <ArrowUpRight size={19} />
              </button>
            </form>
          </Show>
          <Show when={!success()}>
            <p class="auth-switch">
              {p.register ? 'Already part of the crew?' : 'New to Abracodebra?'}{' '}
              <A
                href={`${p.register ? '/login' : '/register'}${params.event ? '?event=' + encodeURIComponent(params.event) : ''}`}
              >
                {p.register ? 'Sign in' : 'Create an account'}
              </A>
            </p>
          </Show>
          <div class="auth-form-footer">
            ABRACODEBRA <span>CREW OPERATIONS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
