const fs = require('fs');
const filepath = 'src/pages/index.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// Also in MAIN_TOOLS mapping, let's remove the first condition to just be the one we updated
content = content.replace(
  "if (tool.id === 'ia') {\n                setIsChatOpen(!isChatOpen);\n              }\n              setMainNav(tool.id);\n              if (tool.id !== 'ia') {\n                setIsChatOpen(false);\n              }",
  "setMainNav(tool.id);\n              if (tool.id !== 'ia') {\n                setIsChatOpen(false);\n              }"
);

// We need to double check how sendNaylaMessage payload was changed
if (content.includes("message: currentInput")) {
    content = content.replace("message: currentInput", "message: chatInput");
}

fs.writeFileSync(filepath, content, 'utf8');
