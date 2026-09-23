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
});
