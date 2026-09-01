import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { CognitoOAuthService } from './cognito-oauth.service';

const SESSION_COOKIE = 'erp_session';

// Backend-mediated OAuth2 Authorization Code flow: the browser never sees
// the Cognito client secret or the tokens themselves (kept in an httpOnly
// cookie) — only this controller talks to Cognito directly. Mirrors
// infra/cognito.tf's single confidential app client, whose callback URL
// already points here rather than at the frontend.
@Controller('auth')
export class AuthController {
  constructor(private readonly oauth: CognitoOAuthService) {}

  @Public()
  @Get('login')
  login(@Res() res: Response) {
    res.redirect(this.oauth.getAuthorizeUrl());
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string | undefined, @Res() res: Response) {
    if (!code) {
      res.redirect(`${this.oauth.frontendUrl}/?login_error=missing_code`);
      return;
    }

    try {
      const tokens = await this.oauth.exchangeCodeForTokens(code);
      res.cookie(SESSION_COOKIE, tokens.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: tokens.expires_in * 1000,
      });
      res.redirect(this.oauth.frontendUrl);
    } catch {
      res.redirect(`${this.oauth.frontendUrl}/?login_error=token_exchange_failed`);
    }
  }

  @Public()
  @Get('logout')
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE);
    res.redirect(this.oauth.getLogoutUrl());
  }

  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }
}
