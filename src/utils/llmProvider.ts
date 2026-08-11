import { Groq } from 'groq-sdk';
import { Mistral } from '@mistralai/mistralai';

export interface LLMProvider {
  generateText(prompt: string, images?: string[], systemPrompt?: string): Promise<string>;
}

export class GroqProvider implements LLMProvider {
  private client: Groq;
  private model: string;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
    // Use the requested model
    this.model = 'llama-3.1-70b-versatile';
  }

  async generateText(prompt: string, images?: string[], systemPrompt?: string): Promise<string> {
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

    const completion = await this.client.chat.completions.create({
      messages,
      model: this.model,
    });

    return completion.choices[0]?.message?.content || '';
  }
}

export class MistralProvider implements LLMProvider {
  private client: Mistral;
  private model: string;

  constructor(apiKey: string) {
    this.client = new Mistral({ apiKey });
    // Use the requested model
    this.model = 'mistral-large-latest';
  }

  async generateText(prompt: string, images?: string[], systemPrompt?: string): Promise<string> {
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

    const chatResponse = await this.client.chat.complete({
      model: this.model,
      messages: messages,
    });

    return chatResponse.choices?.[0]?.message?.content as string || '';
  }
}
