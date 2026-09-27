import { describe, expect, it } from 'vitest';
import { isSocialExecutionStatusQuestion } from '../lib/social/chat/actions';

describe('Nayla Social execution verification', () => {
  it('intercepts questions that ask whether an action was really executed', () => {
    expect(isSocialExecutionStatusQuestion('¿Enviaste?')).toBe(true);
    expect(isSocialExecutionStatusQuestion('¿Ya se envió?')).toBe(true);
    expect(isSocialExecutionStatusQuestion('¿Ya publicaste?')).toBe(true);
  });

  it('does not treat editing requests as execution-status questions', () => {
    expect(isSocialExecutionStatusQuestion('Hazla un poco más elaborada')).toBe(false);
    expect(isSocialExecutionStatusQuestion('Ponle dos emojis al final')).toBe(false);
  });
});
