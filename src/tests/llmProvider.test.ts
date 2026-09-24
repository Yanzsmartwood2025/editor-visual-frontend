import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroqProvider, MistralProvider } from '../utils/llmProvider';

const mocks = vi.hoisted(() => ({ groq: vi.fn(), mistral: vi.fn() }));
vi.mock('groq-sdk', () => ({ Groq: class {
  chat = { completions: { create: mocks.groq } };
} }));
vi.mock('@mistralai/mistralai', () => ({ Mistral: class {
  chat = { complete: mocks.mistral };
} }));

beforeEach(() => vi.clearAllMocks());
describe('complete creative responses', () => {
  it('keeps the text editing budget and passes cancellation to Groq', async () => {
    mocks.groq.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'complete' } }] });
    const signal = new AbortController().signal;
    await expect(new GroqProvider('test').generateText('edit', [], 'system', { maxCompletionTokens: 12000, signal })).resolves.toBe('complete');
    expect(mocks.groq.mock.calls[0][0].max_completion_tokens).toBe(12000);
    expect(mocks.groq.mock.calls[0][1].signal).toBe(signal);
  });
  it('rejects a truncated Groq plan rather than treating it as complete', async () => {
    mocks.groq.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: '{"action":' } }] });
    await expect(new GroqProvider('test').generateText('edit')).rejects.toThrow('límite');
  });
  it('rejects a truncated Mistral plan', async () => {
    mocks.mistral.mockResolvedValue({ choices: [{ finishReason: 'length', message: { content: '{"action":' } }] });
    await expect(new MistralProvider('test').generateText('edit')).rejects.toThrow('límite');
  });
  it('keeps the small budget for auxiliary vision analysis', async () => {
    mocks.mistral.mockResolvedValue({ choices: [{ finishReason: 'stop', message: { content: 'photo description' } }] });
    await new MistralProvider('test').generateText('describe', ['https://example.com/f.jpg'], 'system', { maxCompletionTokens: 160 });
    expect(mocks.mistral.mock.calls[0][0].maxTokens).toBe(160);
  });
  it('continues a cut JSON response with the original instructions still present', async () => {
    mocks.groq.mockResolvedValueOnce({ choices: [{ finish_reason: 'length', message: { content: '{"action":' } }] })
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '"BUILD_TIMELINE"}' } }] });
    const result = await new GroqProvider('test').generateText('make the agreed video', [], 'keep every effect', { maxContinuations: 2 });
    expect(JSON.parse(result)).toEqual({ action: 'BUILD_TIMELINE' });
    const messages = mocks.groq.mock.calls[1][0].messages;
    expect(messages[0].content).toBe('keep every effect');
    expect(messages[2]).toEqual({ role: 'assistant', content: '{"action":' });
  });
  it('continues Mistral responses too', async () => {
    mocks.mistral.mockResolvedValueOnce({ choices: [{ finishReason: 'length', message: { content: '{"assets":[' } }] })
      .mockResolvedValueOnce({ choices: [{ finishReason: 'stop', message: { content: ']}' } }] });
    await expect(new MistralProvider('test').generateText('edit', [], 'system', { maxContinuations: 2 })).resolves.toBe('{"assets":[]}');
  });
});
