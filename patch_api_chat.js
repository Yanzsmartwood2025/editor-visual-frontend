const fs = require('fs');
const filepath = 'src/pages/api/chat.ts';
let content = fs.readFileSync(filepath, 'utf8');

// Update requestSchema
content = content.replace(
  "history: z.array(z.any()).optional()\n});",
  "history: z.array(z.any()).optional(),\n  provider: z.enum(['groq', 'mistral']).optional().default('groq')\n});"
);

// Destructure provider
content = content.replace(
  "const { message, images, history } = parsedBody.data;",
  "const { message, images, history, provider } = parsedBody.data;"
);

// Modify fallback and logic
content = content.replace(
  "    try {\n      // Intentamos Groq como principal\n      responseText = await executeWithApiKey(\n        supabaseAdmin,\n        'groq',\n        executeGroq,\n        executeMistralFallback\n      );\n    } catch (error: any) {\n      console.error('[chat.ts] Todos los proveedores fallaron:', error);\n      return res.status(500).json({ error: 'Error al generar la respuesta. Ambos proveedores (Groq y Mistral) fallaron o están al límite.' });\n    }",
  `    try {
      if (provider === 'mistral') {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'mistral',
          async (apiKey: string) => {
            const mProvider = new MistralProvider(apiKey);
            return await mProvider.generateText(fullPrompt, images, systemPrompt);
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
    } catch (error: any) {
      console.error('[chat.ts] Todos los proveedores fallaron:', error);
      return res.status(500).json({ error: 'Error al generar la respuesta. Ambos proveedores fallaron o están al límite.' });
    }`
);

fs.writeFileSync(filepath, content, 'utf8');
