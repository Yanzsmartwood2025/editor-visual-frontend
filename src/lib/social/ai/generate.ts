import { GroqProvider, MistralProvider } from '../../../utils/llmProvider';

export const generateSocialText = async ({
  prompt,
  systemPrompt,
}: {
  prompt: string;
  systemPrompt: string;
}) => {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();

  if (!groqKey && !mistralKey) {
    throw new Error('Nayla no tiene un LLM de servidor configurado.');
  }

  const generateGroq = async () => {
    if (!groqKey) throw new Error('Groq no configurado.');
    return new GroqProvider(groqKey, 'dialog').generateText(prompt, [], systemPrompt);
  };

  const generateMistral = async () => {
    if (!mistralKey) throw new Error('Mistral no configurado.');
    return new MistralProvider(mistralKey, 'dialog').generateText(prompt, [], systemPrompt);
  };

  const output = groqKey
    ? await generateGroq().catch(() => generateMistral())
    : await generateMistral();

  return String(output || '').trim();
};

export const parseJsonObject = <T = any>(raw: string): T | null => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`/, '')
    .replace(/\`\`\`$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
};
