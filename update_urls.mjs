// Safe URL replacement script using plain string replace
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const processFile = (filename) => {
    const filePath = path.join(__dirname, 'src', filename);

    let content = readFileSync(filePath, 'utf8');

    // Add import if not already there
    if (!content.includes("from './config'") && !content.includes('from "./config"')) {
        // Insert after the first import line
        content = content.replace(
            /(import\s+React[^\n]*\n)/,
            `$1import { API_URL } from './config';\n`
        );
    }

    // Replace all single-quote fetch calls: fetch('/api/... to fetch(`${API_URL}/api/...`
    // Pattern: fetch('/api/xxx', ...) or fetch('/api/xxx')
    content = content.replace(/fetch\('(\/api\/[^']+)'/g, "fetch(`\${API_URL}$1`");

    writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Processed ${filename}`);
};

processFile('App.tsx');
console.log('Done!');
