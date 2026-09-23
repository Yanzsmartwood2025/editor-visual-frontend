import { Groq } from 'groq-sdk';
import { Mistral } from '@mistralai/mistralai';

export type LlmGenerateOptions = {
  maxCompletionTokens?: number;
  signal?: AbortSignal;
};

export interface LLMProvider {
  generateText(
    prompt: string,
    images?: string[],
    systemPrompt?: string,
    options?: LlmGenerateOptions
  ): Promise<string>;
}

export class GroqProvider implements LLMProvider {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, role: 'dialog' | 'code' = 'dialog') {
    this.client = new Groq({ apiKey, timeout: 25_000, maxRetries: 0 });

    if (role === 'dialog') {
      this.model = process.env.GROQ_DIALOG_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    } else {
      this.model = process.env.GROQ_CODE_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    }
  }

  async generateText(
    prompt: string,
    images?: string[],
    systemPrompt?: string,
    options?: LlmGenerateOptions
  ): Promise<string> {
    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    const content: any[] = [{ type: 'text', text: prompt }];

    if (images && images.length > 0) {
      // For vision support if available, otherwise just warn
      // llama-3.1-70b-versatile does not natively support images like llava does in groq,
      // but we will send them in the format Groq expects if vision model is used.
      // For now, appending image urls/base64 to content.
      for (const img of images) {
          content.push({
             type: 'image_url',
             image_url: {
                 url: img
             }
          });
      }
    }

    messages.push({ role: 'user', content });

    const model = images && images.length > 0
      ? (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b')
      : this.model;

    const completion = await this.client.chat.completions.create({
      messages,
      model,
      ...(options?.maxCompletionTokens
        ? { max_completion_tokens: options.maxCompletionTokens }
        : {}),
    }, { signal: options?.signal });

    if (completion.choices[0]?.finish_reason === 'length') {
      throw new Error('La respuesta del modelo superó el límite de salida.');
    }
    return completion.choices[0]?.message?.content || '';
  }
}

export class MistralProvider implements LLMProvider {
  private client: Mistral;
  private model: string;

  constructor(apiKey: string, role: 'dialog' | 'code' = 'dialog') {
    this.client = new Mistral({ apiKey, timeoutMs: 25_000, retryConfig: { strategy: 'none' } });

    if (role === 'dialog') {
      this.model = process.env.MISTRAL_DIALOG_MODEL || process.env.MISTRAL_MODEL || 'mistral-small-latest';
    } else {
      this.model = process.env.MISTRAL_CODE_MODEL || process.env.MISTRAL_MODEL || 'codestral-latest';
    }
  }

  async generateText(
    prompt: string,
    images?: string[],
    systemPrompt?: string,
    options?: LlmGenerateOptions
  ): Promise<string> {
    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    const content: any[] = [{ type: 'text', text: prompt }];

    if (images && images.length > 0) {
      for (const img of images) {
         content.push({
             type: 'image_url',
             imageUrl: img
         });
      }
    }

    messages.push({ role: 'user', content });

    const complete = async (model: string) =>
      this.client.chat.complete({
        model,
        messages: messages,
        ...(options?.maxCompletionTokens
          ? { maxTokens: options.maxCompletionTokens }
          : {}),
      }, { fetchOptions: { signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) } });

    try {
      const chatResponse = await complete(this.model);
      if (chatResponse.choices?.[0]?.finishReason === 'length') {
        throw new Error('La respuesta del modelo superó el límite de salida.');
      }
      return chatResponse.choices?.[0]?.message?.content as string || '';
    } catch (error: any) {
      const raw = [
        error?.message,
        error?.body,
        error?.statusCode,
      ].filter(Boolean).join(' ');

      const tierBlocked =
        Number(error?.statusCode) === 403 &&
        /tier_not_allowed|not available in your subscription tier|code["']?\s*[:=]\s*["']?1910/i.test(raw);

      if (tierBlocked && this.model !== 'mistral-small-latest') {
        const fallback = await complete('mistral-small-latest');
        if (fallback.choices?.[0]?.finishReason === 'length') {
          throw new Error('La respuesta del modelo superó el límite de salida.');
        }
        return fallback.choices?.[0]?.message?.content as string || '';
      }

      throw error;
    }
  }
}
