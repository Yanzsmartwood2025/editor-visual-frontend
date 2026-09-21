import { describe, expect, it } from 'vitest';
import { MAIN_TOOLS, SUB_TOOLS } from '../config/editorTools';

describe('modular editor launchers', () => {
  it('keeps main tool ids unique', () => {
    const ids = MAIN_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers Social and Nayla Play as isolated modules', () => {
    expect(MAIN_TOOLS.some((tool) => tool.id === 'redes')).toBe(true);
    expect(MAIN_TOOLS.some((tool) => tool.id === 'play')).toBe(true);
    expect(SUB_TOOLS.redes?.[0]?.id).toBe('social-hub');
    expect(SUB_TOOLS.play?.[0]?.id).toBe('play-home');
  });
});
