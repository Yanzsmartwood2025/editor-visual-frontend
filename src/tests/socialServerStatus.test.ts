import { afterEach, describe, expect, it, vi } from 'vitest';
import { socialProviderStatuses } from '../lib/social/serverStatus';

describe('social provider status routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults both social routes to two local account slots', () => {
    vi.stubEnv('UPLOAD_POST_API_KEY', 'route-a');
    vi.stubEnv('ZERNIO_API_KEY', 'route-b');
    vi.stubEnv('UPLOAD_POST_ACCOUNT_LIMIT', '');
    vi.stubEnv('ZERNIO_ACCOUNT_LIMIT', '');

    const providers = socialProviderStatuses();
    expect(providers.find((provider) => provider.id === 'upload_post')).toMatchObject({
      configured: true,
      accountLimit: 2,
    });
    expect(providers.find((provider) => provider.id === 'zernio')).toMatchObject({
      configured: true,
      accountLimit: 2,
    });
  });

  it('allows an explicit capacity and treats zero as unlimited', () => {
    vi.stubEnv('UPLOAD_POST_API_KEY', 'route-a');
    vi.stubEnv('ZERNIO_API_KEY', 'route-b');
    vi.stubEnv('UPLOAD_POST_ACCOUNT_LIMIT', '4');
    vi.stubEnv('ZERNIO_ACCOUNT_LIMIT', '0');

    const providers = socialProviderStatuses();
    expect(providers.find((provider) => provider.id === 'upload_post')?.accountLimit).toBe(4);
    expect(providers.find((provider) => provider.id === 'zernio')?.accountLimit).toBeNull();
  });

  it('reports an unconfigured route without exposing any secret', () => {
    vi.stubEnv('UPLOAD_POST_API_KEY', '');
    vi.stubEnv('ZERNIO_API_KEY', 'route-b');

    const providers = socialProviderStatuses();
    expect(providers.find((provider) => provider.id === 'upload_post')?.configured).toBe(false);
    expect(providers.find((provider) => provider.id === 'zernio')?.configured).toBe(true);
    expect(JSON.stringify(providers)).not.toContain('route-b');
  });
});
