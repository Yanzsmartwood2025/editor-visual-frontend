import { afterEach, describe, expect, it } from 'vitest';
import {
  getNaylaPublicSystemCatalog,
  sanitizeNaylaPublicText,
  toNaylaComputeEstimatedPrice,
  toNaylaComputeHourlyPrice,
} from '../lib/naylaSystemCatalog';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Nayla public system catalog', () => {
  it('exposes branded engines without upstream provider identities', () => {
    process.env.FAL_KEY = 'fal-secret';
    process.env.REPLICATE_API_TOKEN = 'replicate-secret';
    process.env.ELEVENLABS_API_KEY = 'eleven-secret';
    process.env.TRIPO_API_KEY = 'tripo-secret';
    delete process.env.MESHY_API_KEY;

    const catalog = getNaylaPublicSystemCatalog();
    const serialized = JSON.stringify(catalog);

    expect(catalog.brand).toEqual({
      cloud: 'Nayla Cloud',
      compute: 'Nayla Compute',
      energy: 'Nayla Energy',
    });
    expect(serialized).not.toContain('fal.ai');
    expect(serialized).not.toContain('Replicate');
    expect(serialized).not.toContain('ElevenLabs');
    expect(serialized).not.toContain('Tripo');
    expect(serialized).not.toContain('Meshy');
    expect(serialized).not.toContain('secret');
  });

  it('keeps Cloud prices pending until business prices are configured', () => {
    delete process.env.NAYLA_CLOUD_IMAGE_PRICE_USD;
    const pending = getNaylaPublicSystemCatalog().cloud.find((item) => item.id === 'image');
    expect(pending?.price).toMatchObject({
      status: 'pending',
      amountUsd: null,
      label: 'Precio por definir',
    });

    process.env.NAYLA_CLOUD_IMAGE_PRICE_USD = '0.35';
    const configured = getNaylaPublicSystemCatalog().cloud.find((item) => item.id === 'image');
    expect(configured?.price).toMatchObject({
      status: 'configured',
      amountUsd: 0.35,
    });
  });

  it('creates public Compute prices without exposing the upstream cost field', () => {
    process.env.NAYLA_COMPUTE_PRICE_MULTIPLIER = '1.5';
    process.env.NAYLA_COMPUTE_FIXED_HOURLY_USD = '0.05';

    expect(toNaylaComputeHourlyPrice(0.2)).toBe(0.35);
    expect(toNaylaComputeEstimatedPrice(0.1)).toBe(0.15);
  });

  it('sanitizes upstream names before text reaches the user', () => {
    const text = sanitizeNaylaPublicText(
      'Vast.ai, RunPod, fal.ai, ElevenLabs, TripoSR y ACE-Step.'
    );

    expect(text).not.toMatch(/Vast|RunPod|fal\.ai|ElevenLabs|TripoSR|ACE-Step/i);
    expect(text).toContain('Nayla Compute');
    expect(text).toContain('Nayla Cloud');
  });
});
