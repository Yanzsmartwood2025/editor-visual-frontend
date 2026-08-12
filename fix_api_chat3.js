const fs = require('fs');
const filepath = 'src/pages/api/chat.ts';
let content = fs.readFileSync(filepath, 'utf8');

content = content.replace(
  `    // Definimos cómo ejecutar con Mistral (como fallback)
    const executeMistralFallback = async () => {
      return await executeWithApiKey(
        supabaseAdmin,
        'mistral',
        async (apiKey: string) => {
          const provider = new MistralProvider(apiKey);
          return await provider.generateText(fullPrompt, images, systemPrompt);
        }
      );
    };`,
  `    // Definimos cómo ejecutar con Mistral (como fallback o primario si se elige)
    const executeMistral = async (apiKey: string) => {
      const provider = new MistralProvider(apiKey);
      return await provider.generateText(fullPrompt, images, systemPrompt);
    };
    const executeMistralFallback = async () => {
      return await executeWithApiKey(
        supabaseAdmin,
        'mistral',
        executeMistral
      );
    };
    const executeGroqFallback = async () => {
      return await executeWithApiKey(
        supabaseAdmin,
        'groq',
        executeGroq
      );
    };`
);

content = content.replace(
  `    try {
      if (provider === 'mistral') {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'mistral',
          async (apiKey: string) => {
            const provider = new MistralProvider(apiKey);
            return await provider.generateText(fullPrompt, images, systemPrompt);
          },
          async () => {
             return await executeWithApiKey(supabaseAdmin, 'groq', executeGroq);
          }
        );
      } else {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'groq',
          executeGroq,
          executeMistralFallback
        );
      }
    } catch (error: any) {`,
  `    try {
      if (provider === 'mistral') {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'mistral',
          executeMistral,
          executeGroqFallback
        );
      } else {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'groq',
          executeGroq,
          executeMistralFallback
        );
      }
    } catch (error: any) {`
);

fs.writeFileSync(filepath, content, 'utf8');
