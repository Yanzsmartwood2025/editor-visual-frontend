import { afterEach, describe, expect, it, vi } from 'vitest';
import { socialProviderStatuses } from '../lib/social/serverStatus';

describe('social provider status routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('models the current free tiers without confusing profiles with accounts', () => {
    vi.stubEnv('UPLOAD_POST_API_KEY', 'route-a');
    vi.stubEnv('ZERNIO_API_KEY', 'route-b');
    vi.stubEnv('UPLOAD_POST_PROFILE_LIMIT', '');
    vi.stubEnv('ZERNIO_ACCOUNT_LIMIT', '');

    const providers = socialProviderStatuses();
    expect(providers.find((provider) => provider.id === 'upload_post')).toMatchObject({
      configured: true,
      accountLimit: null,
      profileLimit: 2,
      perPlatformAccountLimit: 1,
    });
    expect(providers.find((provider) => provider.id === 'zernio')).toMatchObject({
      configured: true,
      accountLimit: 2,
    });
  });

  it('allows explicit provider capacity overrides', () => {
    vi.stubEnv('UPLOAD_POST_API_KEY', 'route-a');
    vi.stubEnv('ZERNIO_API_KEY', 'route-b');
    vi.stubEnv('UPLOAD_POST_PROFILE_LIMIT', '4');
    vi.stubEnv('ZERNIO_ACCOUNT_LIMIT', '0');

    const providers = socialProviderStatuses();
    expect(providers.find((provider) => provider.id === 'upload_post')?.profileLimit).toBe(4);
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
