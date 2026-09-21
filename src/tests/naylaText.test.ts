import { describe, expect, it } from 'vitest';
import { cleanNaylaChatText } from '../lib/naylaText';

describe('Nayla chat typography', () => {
  it('removes visible markdown control characters while keeping the wording', () => {
    const cleaned = cleanNaylaChatText(
      '## Plan\n\n**Movimiento 3D**\n- Usa \`profundidad\`\n- Transición suave'
    );

    expect(cleaned).toBe('Plan\n\nMovimiento 3D\nUsa profundidad\nTransición suave');
    expect(cleaned).not.toMatch(/[\`*#]/);
  });

  it('collapses excessive blank space without flattening paragraphs', () => {
    expect(cleanNaylaChatText('Uno\n\n\n\nDos')).toBe('Uno\n\nDos');
  });
  it('hides raw executable action payloads from the visible chat', () => {
    expect(cleanNaylaChatText(
      '{"action":"BUILD_TIMELINE","assets":[{"type":"foto","source":"url","url":"https://cdn.example/f1.jpg"}]}'
    )).toBe('');
  });

});
