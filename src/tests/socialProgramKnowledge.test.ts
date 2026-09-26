import { describe, expect, it } from 'vitest';
import { isProgramKnowledgeRequest } from '../lib/social/knowledge/chat';

describe('Nayla program knowledge intent', () => {
  it('detects natural requests to review the current program', () => {
    expect(isProgramKnowledgeRequest('Nayla, revisa qué programa hicimos hoy')).toBe(true);
    expect(isProgramKnowledgeRequest('Conéctate y mira el documento del programa')).toBe(true);
    expect(isProgramKnowledgeRequest('Actualiza lo que tenemos en Drive del programa')).toBe(true);
  });

  it('does not hijack normal social activity questions', () => {
    expect(isProgramKnowledgeRequest('Revisa los comentarios de YouTube')).toBe(false);
    expect(isProgramKnowledgeRequest('¿Cómo van las métricas?')).toBe(false);
  });
});
