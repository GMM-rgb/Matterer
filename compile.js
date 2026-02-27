const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'build/main.js'); 
const header = `// @turbo-unsandboxed\n`;

try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('@turbo-unsandboxed')) {
        fs.writeFileSync(filePath, header + content);
        console.log('\n[OK] Unsandboxed header added to build/main.js');
    }
} catch (err) {
    console.error('\n[FAILURE] Could not find the build file. Check your path!', err);
}
