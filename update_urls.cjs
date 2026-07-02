const fs = require('fs');
const path = require('path');

const applyReplacements = (file) => {
    const filePath = path.join(__dirname, 'src', file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Add the import statement if it doesn't exist
    if (!content.includes('import { API_URL } from "./config";') && !content.includes('import { API_URL } from \'./config\';')) {
        const importMatch = content.match(/^import .*?;\n/gm);
        if (importMatch) {
            const lastImport = importMatch[importMatch.length - 1];
            content = content.replace(lastImport, lastImport + 'import { API_URL } from "./config";\n');
        } else {
            content = 'import { API_URL } from "./config";\n' + content;
        }
    }

    // Fix the broken fetch statements from previous mistake
    // E.g., fetch(`${API_URL}/api/users', becomes fetch(`${API_URL}/api/users`,
    content = content.replace(/fetch\(\`\$\{API_URL\}\/api([^'"`]+)['"]/g, 'fetch(`${API_URL}/api$1`');

    // E.g., fetch(`${API_URL}/api/auth/me', { becomes fetch(`${API_URL}/api/auth/me`, {
    content = content.replace(/fetch\(\`\$\{API_URL\}\/api([^'"`]+)['"]\s*,/g, 'fetch(`${API_URL}/api$1`,');

    // Just blanket replace any remaining mismatched quotes on these lines
    content = content.split('\n').map(line => {
        if (line.includes('fetch(`${API_URL}/api')) {
            // Find the closing single or double quote that matches the opening backtick
            return line.replace(/\`\$\{API_URL\}\/api([^'"`]+)['"]/, '`${API_URL}/api$1`');
        }
        return line;
    }).join('\n');


    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
};

['App.tsx', 'App.head.tsx'].forEach(applyReplacements);
