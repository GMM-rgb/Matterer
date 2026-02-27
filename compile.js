const { exec, ChildProcess } = require('child_process');
const colors = require("picocolors");
const fs = require('fs');
const path = require('path');
const process = require("process");

function ConsoleDivider() {
    console.log(colors.blueBright("=".repeat(50)));
    return void null;
}

async function ExecuteTypeScriptCompiler() {
    if (exec && process) {
        console.log(colors.yellowBright("Compiling TypeScript Files to build..."));

        // TypeScriptCompiler Execution Thread
        const TypeScriptCompilerPackagePath = String(path.join(process.execPath.replaceAll("\\", " ").replace("node.exe", "").replaceAll(" ", "\\").trim(), 'node_modules', 'typescript', 'bin', '.', 'tsc'));
        const TypeScriptCompilerProcess = fs.existsSync(TypeScriptCompilerPackagePath) ? exec("tsc -b -w", (ExecutionError) => {
            if (ExecutionError?.killed.valueOf() ?? true === true) {
                console.error(`While executing the TypeScript Compiler, an fatal error occured!\n${ExecutionError?.message ?? "[Unknown Message Case]"}`);
            } else {
                return;
            }
        }) : null;

        // Debugging
        // console.debug(TypeScriptCompilerPackagePath);
        // console.debug(TypeScriptCompilerProcess);

        // TypeScriptCompiler; whilist execution variables
        const TypeScriptCompilerOutput = TypeScriptCompilerProcess?.connected ?? null;
        console.debug(TypeScriptCompilerOutput.valueOf());

        // Fullfilled Promise Resolver
        await Promise.resolve().then(() => {
            ConsoleDivider();
            if (TypeScriptCompilerProcess !== null && TypeScriptCompilerProcess instanceof ChildProcess) {
                console.log(colors.greenBright(colors.createColors(true).bold("Finished Compiling TypeScript!")));
            }
        }).finally(() => {
            ConsoleDivider();
        });
    } else {
        await Promise.reject();
        if (!process && console !== undefined) console.error(colors.redBright("NodeJS Process not available!") ?? "UnkownError"); else return;
        if (!exec && console !== undefined) console.error(`${colors.bold("Execution NodeJS Package")}; not found, or available!`); else return;
    }
}

const filePath = path.join(__dirname, 'build/main.js'); 
const header = `// @turbo-unsandboxed\n`;

process.on("SIGINT", () => {
    process.kill(parseFloat(String(process.pid)));
});

(async () => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        await ExecuteTypeScriptCompiler().then(() => {
            if (!content.includes('@turbo-unsandboxed')) {
                fs.writeFileSync(filePath, header + content);
                console.log('\n[OK] Unsandboxed header added to build/main.js');
            }
        }).finally(() => {
            console.group(colors.magentaBright(">>> Process <<<"));
            console.log("Exiting Compiler Process...");
            console.groupEnd();
            process?.exit()
            ?? (console.error(colors.redBright(`FATAL: failed to exit Compiler process!\nForcing EXIT...`)) && process.emit("SIGINT"));
            return;
        });
    } catch (err) {
        console.error('\n[FAILURE] Could not find the build file. Check your path!', err);
    }
})();
