import { ConfigService } from '@nestjs/config';
import { CognitoOAuthService } from './cognito-oauth.service';

function fakeConfig(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`missing config: ${key}`);
      }
      return values[key];
    }),
  } as unknown as ConfigService;
}

const CONFIG = {
  COGNITO_DOMAIN: 'erp-dev-auth.auth.us-east-1.amazoncognito.com',
  COGNITO_CLIENT_ID: 'client-123',
  COGNITO_CLIENT_SECRET: 'secret-456',
  COGNITO_CALLBACK_URL: 'https://api.example.com/auth/callback',
  FRONTEND_URL: 'https://app.example.com',
};

describe('CognitoOAuthService', () => {
  let service: CognitoOAuthService;

  beforeEach(() => {
    service = new CognitoOAuthService(fakeConfig(CONFIG));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the Hosted UI authorize URL from config', () => {
    const url = new URL(service.getAuthorizeUrl());

    expect(url.origin + url.pathname).toBe(`https://${CONFIG.COGNITO_DOMAIN}/oauth2/authorize`);
    expect(url.searchParams.get('client_id')).toBe(CONFIG.COGNITO_CLIENT_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.COGNITO_CALLBACK_URL);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });

  it('builds the Hosted UI logout URL from config', () => {
    const url = new URL(service.getLogoutUrl());

    expect(url.origin + url.pathname).toBe(`https://${CONFIG.COGNITO_DOMAIN}/logout`);
    expect(url.searchParams.get('client_id')).toBe(CONFIG.COGNITO_CLIENT_ID);
    expect(url.searchParams.get('logout_uri')).toBe(CONFIG.FRONTEND_URL);
  });

  it('exposes the configured frontend URL', () => {
    expect(service.frontendUrl).toBe(CONFIG.FRONTEND_URL);
  });

  it('exchanges a code for tokens, authenticating with client_id:client_secret', async () => {
    const tokens = { access_token: 'at', id_token: 'it', expires_in: 3600, token_type: 'Bearer' };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(tokens),
    } as Response);

    const result = await service.exchangeCodeForTokens('auth-code');

    expect(result).toEqual(tokens);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://${CONFIG.COGNITO_DOMAIN}/oauth2/token`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from(`${CONFIG.COGNITO_CLIENT_ID}:${CONFIG.COGNITO_CLIENT_SECRET}`).toString('base64')}`,
        }),
      }),
    );
    const call = fetchSpy.mock.calls[0][1] as RequestInit;
    const sentBody = new URLSearchParams(call.body as string);
    expect(sentBody.get('grant_type')).toBe('authorization_code');
    expect(sentBody.get('code')).toBe('auth-code');
    expect(sentBody.get('redirect_uri')).toBe(CONFIG.COGNITO_CALLBACK_URL);
  });

  it('throws when Cognito rejects the code exchange', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response);

    await expect(service.exchangeCodeForTokens('bad-code')).rejects.toThrow('status 400');
  });
});
