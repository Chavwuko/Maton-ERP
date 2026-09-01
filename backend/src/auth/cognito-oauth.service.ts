import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CognitoTokens {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// Wraps the two Cognito Hosted UI OAuth2 endpoints (authorize + token) plus
// the logout endpoint. Kept separate from AuthController so the controller
// stays thin and this HTTP-calling part can be unit tested (mocked fetch)
// without booting Nest's request/response plumbing.
@Injectable()
export class CognitoOAuthService {
  constructor(private readonly config: ConfigService) {}

  private get domain(): string {
    return this.config.getOrThrow<string>('COGNITO_DOMAIN');
  }

  private get clientId(): string {
    return this.config.getOrThrow<string>('COGNITO_CLIENT_ID');
  }

  private get callbackUrl(): string {
    return this.config.getOrThrow<string>('COGNITO_CALLBACK_URL');
  }

  get frontendUrl(): string {
    return this.config.getOrThrow<string>('FRONTEND_URL');
  }

  getAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: this.callbackUrl,
    });
    return `https://${this.domain}/oauth2/authorize?${params.toString()}`;
  }

  getLogoutUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      logout_uri: this.frontendUrl,
    });
    return `https://${this.domain}/logout?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<CognitoTokens> {
    const clientSecret = this.config.getOrThrow<string>('COGNITO_CLIENT_SECRET');
    const basicAuth = Buffer.from(`${this.clientId}:${clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      redirect_uri: this.callbackUrl,
    });

    const res = await fetch(`https://${this.domain}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Cognito token exchange failed with status ${res.status}`);
    }

    return res.json() as Promise<CognitoTokens>;
  }
}
