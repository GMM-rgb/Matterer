const { exec } = require('child_process');
const colors = require("picocolors");
const fs = require('fs');
const path = require('path');
const process = require("process");

async function ExecuteTypeScriptCompiler() {
    if (exec && process) {
        console.log(colors.yellowBright("Compiling TypeScript Files to build..."));

        // TypeScriptCompiler Execution Thread
        const TypeScriptCompilerPackagePath = String(path.join(process.execPath.replaceAll("\\", " ").replace("node.exe", "").replaceAll(" ", "\\").trim(), 'node_modules', 'typescript', '.', 'tsc'));
        const TypeScriptCompilerProcess = (fs ?? null)?.existsSync(TypeScriptCompilerPackagePath) ? exec("tsc", (ExecutionError) => {
            if (ExecutionError?.killed.valueOf() ?? true === true) {
                console.error(`While executing the TypeScript Compiler, an fatal error occured!\n${ExecutionError?.message ?? "[Unknown Message Case]"}`);
            } else {
                return;
            }
        }) : null;

        // Debugging
        console.debug(TypeScriptCompilerPackagePath);

        // TypeScriptCompiler; whilist execution variables
        const TypeScriptCompilerOutput = TypeScriptCompilerProcess?.connected ?? null;

        // Fullfilled Promise Resolver
        await Promise.resolve().then(() => {
            console.log(colors.greenBright("Finished Compiling TypeScript!"));
        });
    } else {
        await Promise.reject();
        if (!process && console !== undefined) console.error(colors.redBright("NodeJS Process not available!") ?? "UnkownError"); else return;
        if (!exec && console !== undefined) console.error(); else return;
    }
}

const filePath = path.join(__dirname, 'build/main.js'); 
const header = `// @turbo-unsandboxed\n`;

(async () => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        await ExecuteTypeScriptCompiler().finally(() => {
            if (!content.includes('@turbo-unsandboxed')) {
                fs.writeFileSync(filePath, header + content);
                console.log('\n[OK] Unsandboxed header added to build/main.js');
            }
        });
    } catch (err) {
        console.error('\n[FAILURE] Could not find the build file. Check your path!', err);
    }
})();
