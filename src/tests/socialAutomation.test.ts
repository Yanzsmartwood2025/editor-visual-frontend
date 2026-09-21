import { describe, expect, it } from 'vitest';
import { classifySocialInteraction } from '../lib/social/automation/service';

describe('Nayla Social automation classification', () => {
  it('allows greetings and simple compliments as low-risk categories', () => {
    expect(classifySocialInteraction('Hola')).toEqual({
      category: 'greeting',
      riskLevel: 'normal',
    });
    expect(classifySocialInteraction('Qué linda')).toEqual({
      category: 'compliment',
      riskLevel: 'normal',
    });
    expect(classifySocialInteraction('Gracias por responder')).toEqual({
      category: 'thanks',
      riskLevel: 'normal',
    });
  });

  it('routes prices, complaints, refunds and legal requests to review', () => {
    expect(classifySocialInteraction('¿Cuánto cuesta?').riskLevel).toBe('review');
    expect(classifySocialInteraction('Quiero un reembolso').category).toBe('refund');
    expect(classifySocialInteraction('Esto es una estafa').category).toBe('complaint');
    expect(classifySocialInteraction('Voy a hablar con mi abogado').category).toBe('legal');
  });

  it('blocks clearly sensitive safety language from automatic replies', () => {
    expect(classifySocialInteraction('Me quiero suicidar')).toEqual({
      category: 'sensitive',
      riskLevel: 'blocked',
    });
  });

  it('keeps longer or ambiguous questions for review', () => {
    expect(classifySocialInteraction('Tengo una situación bastante específica y quisiera saber qué opinas de todo esto?')).toEqual({
      category: 'unknown',
      riskLevel: 'review',
    });
  });
});
