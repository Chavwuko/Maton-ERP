import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { CognitoOAuthService } from './cognito-oauth.service';

function fakeResponse(): jest.Mocked<Response> {
  return {
    redirect: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as jest.Mocked<Response>;
}

describe('AuthController', () => {
  let oauth: jest.Mocked<CognitoOAuthService>;
  let controller: AuthController;

  beforeEach(() => {
    oauth = {
      getAuthorizeUrl: jest.fn().mockReturnValue('https://cognito.example.com/oauth2/authorize?...'),
      getLogoutUrl: jest.fn().mockReturnValue('https://cognito.example.com/logout?...'),
      exchangeCodeForTokens: jest.fn(),
      frontendUrl: 'https://app.example.com',
    } as unknown as jest.Mocked<CognitoOAuthService>;
    controller = new AuthController(oauth);
  });

  it('login redirects straight to the Hosted UI authorize URL', () => {
    const res = fakeResponse();

    controller.login(res);

    expect(res.redirect).toHaveBeenCalledWith('https://cognito.example.com/oauth2/authorize?...');
  });

  it('callback exchanges the code, sets an httpOnly cookie, and redirects to the frontend', async () => {
    const res = fakeResponse();
    oauth.exchangeCodeForTokens.mockResolvedValue({
      access_token: 'at-1',
      id_token: 'it-1',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await controller.callback('good-code', res);

    expect(oauth.exchangeCodeForTokens).toHaveBeenCalledWith('good-code');
    expect(res.cookie).toHaveBeenCalledWith(
      'erp_session',
      'at-1',
      expect.objectContaining({ httpOnly: true, maxAge: 3600 * 1000 }),
    );
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com');
  });

  it('callback redirects to the frontend with an error when there is no code', async () => {
    const res = fakeResponse();

    await controller.callback(undefined, res);

    expect(oauth.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/?login_error=missing_code');
  });

  it('callback redirects to the frontend with an error when the exchange fails', async () => {
    const res = fakeResponse();
    oauth.exchangeCodeForTokens.mockRejectedValue(new Error('boom'));

    await controller.callback('bad-code', res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/?login_error=token_exchange_failed');
  });

  it('logout clears the session cookie and redirects to the Hosted UI logout URL', () => {
    const res = fakeResponse();

    controller.logout(res);

    expect(res.clearCookie).toHaveBeenCalledWith('erp_session');
    expect(res.redirect).toHaveBeenCalledWith('https://cognito.example.com/logout?...');
  });

  it('me returns req.user as populated by the auth guard', () => {
    const req = { user: { id: 'user-1', email: 'a@b.com', roleName: 'admin', departmentId: null, cognitoSub: 'sub-1' } };

    expect(controller.me(req as never)).toBe(req.user);
  });
});
