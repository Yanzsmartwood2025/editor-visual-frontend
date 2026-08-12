const fs = require('fs');
const filepath = 'src/pages/api/chat.ts';
let content = fs.readFileSync(filepath, 'utf8');

if (content.includes("provider: z.enum(['groq', 'mistral']).optional().default('groq')")) {
    console.log("Schema updated");
} else {
    console.log("Schema NOT updated");
}

if (content.includes("const { message, images, history, provider } = parsedBody.data;")) {
    console.log("Variables destructured");
} else {
    console.log("Variables NOT destructured");
}

if (content.includes("if (provider === 'mistral') {")) {
    console.log("Provider logic added");
} else {
    console.log("Provider logic NOT added");
}
