const fs = require('fs');
const filepath = 'src/pages/index.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// Also in SUB_TOOLS logic, we need to handle clicking groq or mistral to open the chat sidebar
content = content.replace(
  "if (['marco', 'delogo', 'script', 'supervisor', 'youtube', 'pixabay', 'musicastock', 'noticias', 'artistas', 'stockvideo', 'sonidos', 'iafoto', 'enlace', 'render'].includes(tool.id)) {",
  "if (['groq', 'mistral'].includes(tool.id)) {\n                    setSelectedAiProvider(tool.id);\n                    setIsChatOpen(true);\n                  } else if (['marco', 'delogo', 'script', 'supervisor', 'youtube', 'pixabay', 'musicastock', 'noticias', 'artistas', 'stockvideo', 'sonidos', 'iafoto', 'enlace', 'render'].includes(tool.id)) {"
);

fs.writeFileSync(filepath, content, 'utf8');
