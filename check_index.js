const fs = require('fs');
const filepath = 'src/pages/index.tsx';
let content = fs.readFileSync(filepath, 'utf8');

if (content.includes("const [selectedAiProvider, setSelectedAiProvider] = useState<'groq' | 'mistral'>('groq');")) {
    console.log("State selectedAiProvider added successfully");
} else {
    console.log("Failed to add selectedAiProvider");
}

if (content.includes("{ id: 'groq', nombre: 'Groq'")) {
    console.log("Groq added to SUB_TOOLS");
} else {
    console.log("Failed to add Groq to SUB_TOOLS");
}

if (content.includes("provider: selectedAiProvider")) {
    console.log("sendNaylaMessage payload updated");
} else {
    console.log("sendNaylaMessage payload NOT updated");
}

if (content.includes("if (['groq', 'mistral'].includes(tool.id)) {")) {
    console.log("Sub-tools click logic updated for groq/mistral");
} else {
    console.log("Sub-tools click logic NOT updated");
}
