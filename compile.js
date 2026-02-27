const fs = require('fs');
const path = require('path');

// Adjust this to where your compiled JS actually lands
const filePath = path.join(__dirname, 'build/main.js'); 
const header = `// @turbo-unsandboxed\n`;

try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('@turbo-unsandboxed')) {
        fs.writeFileSync(filePath, header + content);
        console.log('✅ Unsandboxed header added to build/main.js');
    }
} catch (err) {
    console.error('❌ Could not find the build file. Check your path!', err);
}
