const fs = require('fs');
const filepath = 'src/pages/index.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// Add selectedAiProvider state
content = content.replace(
  "const [iaLoading, setIaLoading] = useState(false);",
  "const [iaLoading, setIaLoading] = useState(false);\n  const [selectedAiProvider, setSelectedAiProvider] = useState<'groq' | 'mistral'>('groq');"
);

// Update SUB_TOOLS to have groq and mistral
content = content.replace(
  "  ia: [\n    { id: 'supervisor', nombre: 'Supervisor', icon:",
  "  ia: [\n    { id: 'groq', nombre: 'Groq', icon: <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\"><path d=\"M12 2a10 10 0 1 0 10 10H12V2z\"/></svg> },\n    { id: 'mistral', nombre: 'Mistral', icon: <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\"><path d=\"M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"/></svg> },\n    { id: 'supervisor', nombre: 'Supervisor', icon:"
);

// Update sendNaylaMessage payload
content = content.replace(
  "body: JSON.stringify({\n           message: currentInput,\n           history: chatMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))\n        })",
  "body: JSON.stringify({\n           message: currentInput,\n           history: chatMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),\n           provider: selectedAiProvider\n        })"
);
// Fix the variable name currentInput to chatInput which is defined locally.
content = content.replace(
  "message: currentInput",
  "message: chatInput"
);

// Update MAIN_TOOLS ia click behavior
content = content.replace(
  "if (tool.id === 'ia') {\n                setIsChatOpen(!isChatOpen);\n              }\n              setMainNav(tool.id);",
  "setMainNav(tool.id);\n              if (tool.id !== 'ia') {\n                setIsChatOpen(false);\n              }"
);

fs.writeFileSync(filepath, content, 'utf8');
