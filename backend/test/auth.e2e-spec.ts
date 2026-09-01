import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// This suite runs under AUTH_MODE=local (see backend/.env), so it can only
// exercise the parts of the login flow that don't need a real Cognito Hosted
// UI: building the redirect URLs, and /auth/me under LocalDevAuthGuard.
// CognitoAuthGuard's real JWT verification and the callback's token
// exchange are covered by unit tests with a mocked verifier/fetch instead
// (cognito-auth.guard.spec.ts, cognito-oauth.service.spec.ts) — there's no
// live Cognito User Pool to test against yet (infra hasn't been applied).
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/login redirects to the Cognito Hosted UI authorize endpoint', async () => {
    const res = await asRole(app, 'admin').get('/auth/login').redirects(0);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe('/oauth2/authorize');
    expect(location.searchParams.get('response_type')).toBe('code');
  });

  it('GET /auth/logout clears the session cookie and redirects to the Cognito Hosted UI logout endpoint', async () => {
    const res = await asRole(app, 'admin').get('/auth/logout').redirects(0);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe('/logout');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^erp_session=;/);
  });

  it('GET /auth/callback with no code redirects to the frontend with an error', async () => {
    const res = await asRole(app, 'admin').get('/auth/callback').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/\?login_error=missing_code$/);
  });

  it('GET /auth/me returns the authenticated user (LocalDevAuthGuard under AUTH_MODE=local)', async () => {
    const res = await asRole(app, 'hse').get('/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'hse@local.dev', roleName: 'hse' });
  });
});
