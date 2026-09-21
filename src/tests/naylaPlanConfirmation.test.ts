import { describe, expect, it } from 'vitest';
import { assistantRequestsPlanConfirmation } from '../lib/naylaPlanConfirmation';

describe('Nayla natural plan confirmation wording', () => {
  it('recognizes the wording shown to the user before a Dale reply', () => {
    expect(
      assistantRequestsPlanConfirmation(
        'Cuando estés listo, dime “Dale” y procederé a generar y guardar el video en la Bóveda.'
      )
    ).toBe(true);
  });

  it('recognizes other conversational approval invitations', () => {
    expect(assistantRequestsPlanConfirmation('Si te parece bien, responde Adelante y lo ejecuto.')).toBe(true);
    expect(assistantRequestsPlanConfirmation('Confirma con Dale para generar el video.')).toBe(true);
  });

  it('does not treat an ordinary descriptive reply as a confirmation request', () => {
    expect(
      assistantRequestsPlanConfirmation(
        'La secuencia tendrá cuatro fotos con transiciones suaves y corrección de color.'
      )
    ).toBe(false);
  });
});
