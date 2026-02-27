const { exec } = require('child_process');
const colors = require("picocolors");
const fs = require('fs');
const path = require('path');
const process = require("process");

async function ExecuteTypeScriptCompiler() {
    if (exec && process) {
        const TypeScriptCompilerPackagePath = String(path.join(process.execPath.trim(), 'node_modules', 'typescript', '.', 'tsc').valueOf());
        const TypeScriptCompilerProcess = fs.existsSync(TypeScriptCompilerPackagePath) ? exec("tsc", (ExecutionError) => {
            if (ExecutionError?.killed.valueOf() ?? true === true) {
                
            }
        }) : null;
    } else {
        if (!process && console !== undefined) console.error(colors.redBright("NodeJS Process not available!") ?? "UnkownError"); else return;
        if (!exec && console !== undefined) console.error(); else return;
    }
}

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
