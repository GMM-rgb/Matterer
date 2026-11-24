// ============================================================

//  Matterer Project — Complete Source with Deep Diagnostics

// ============================================================


type AnimationStyles = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";


const ValidScratchTypeDefinitions: Readonly<string[]> = [

    "string", "number", "boolean", "object",

];


type MenuItem = { text: string; value: string };


type ProcedureMeta = {

    proccode: string;

    argumentNames: string[];

    argumentIds: string[];

    argumentDefaults: string[];

    definitionBlockId: string;

    target: any;

};

type MattererSwitchContext = {
    /** The value evaluated from the enclosing switch block's first input. */
    value: unknown;
    /** Whether a case/default branch has already been selected. */
    matched: boolean;
    /** The exact switch block which owns this context. */
    switchBlockId: string;
    /** The exact VM thread executing this switch. */
    thread: MattererThreadLike;
};

type MattererStackFrame = {
    params: Record<string, unknown> | null;
    /** Per-block state used by BlockUtility.stackFrame. */
    executionContext?: Record<string, unknown> | null;
    /** Internal VM operation currently associated with this frame. */
    op?: { id?: string } | null;
    [key: string]: unknown;
};

type MattererThreadLike = {
    stack: Array<string | null>;
    stackFrames: MattererStackFrame[];
    target?: any;
    blockContainer?: any;
    topBlock?: string | null;
    peekStack: () => string | null;
    peekStackFrame: () => MattererStackFrame | null;
    peekParentStackFrame: () => MattererStackFrame | null;
    initParams: () => void;
    pushParam: (name: string, value: unknown) => void;
    pushStack: (blockId: string | null) => void;
    isRecursiveCall?: (procedureCode: string) => boolean;
};

const MATTERER_SWITCH_CONTEXT_KEY = "__mattererSwitchContext";

/*
 * Switch has one public syntax: switch / case / default.
 *
 * Interpreter backend:
 *   The original custom CONDITIONAL blocks execute through util.startBranch().
 *
 * Compiler backend:
 *   Before TurboWarp compiles a thread, SwitchCompilerLowerer duplicates that
 *   thread's BlockContainer and rewrites only the duplicate into native
 *   control_if_else blocks plus hidden ordinary extension COMMAND/BOOLEAN
 *   helpers. The editor's real block graph is never modified, so users keep the
 *   exact same switch/case/default blocks in the workspace.
 *
 * The compiler hook is isolated in installSwitchCompilerLowering(). It wraps
 *   Runtime._pushThread/_restartThread because TurboWarp's current extension API
 *   does not expose a stable custom control-flow lowering hook.
 */

function mattererValuesEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;

    const leftText = String(left ?? "");
    const rightText = String(right ?? "");
    const leftNumber = Number(leftText);
    const rightNumber = Number(rightText);

    // Numeric strings compare numerically; ordinary text is case-insensitive.
    if (
        leftText.trim() !== "" &&
        rightText.trim() !== "" &&
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber)
    ) {
        return leftNumber === rightNumber;
    }

    return leftText.toLowerCase() === rightText.toLowerCase();
}


/**
 * Compiler-compatible switch backend.
 *
 * Unlike the interpreter backend below (Scratch.BlockType.CONDITIONAL plus
 * util.startBranch), this backend only uses ordinary extension COMMAND and
 * BOOLEAN blocks. The actual branching is performed by Scratch's native
 * `if / else` blocks, which the TurboWarp compiler already understands.
 *
 * This is an implementation detail: the public switch/case/default graph is
 * rewritten to call these hidden helpers only in the compiler-only copy.
 * A WeakMap isolates contexts by actual VM Thread. The array supports nested
 * switches in the same thread without one invocation overwriting another.
 */
type MattererCompilerSwitchContext = {
    value: unknown;
};

class MattererCompilerCompatibleSwitchBackend {
    private readonly contexts = new WeakMap<object, MattererCompilerSwitchContext[]>();

    private getThread(util: unknown): object | null {
        const thread = (util as { thread?: unknown } | null)?.thread;
        if ((typeof thread !== "object" && typeof thread !== "function") || thread === null) {
            return null;
        }
        return thread as object;
    }

    public begin(value: unknown, util: BlockUtility): void {
        const thread = this.getThread(util);
        if (!thread) {
            console.warn("[Matterer Compiler Switch] Cannot begin: the VM did not provide an execution thread.");
            return;
        }

        const stack = this.contexts.get(thread) ?? [];
        stack.push({ value });
        this.contexts.set(thread, stack);

        console.debug("[Matterer Compiler Switch] Began switch context.", {
            value,
            nestingDepth: stack.length,
        });
    }

    public matches(caseValue: unknown, util: BlockUtility): boolean {
        const thread = this.getThread(util);
        if (!thread) return false;

        const stack = this.contexts.get(thread);
        const context = stack?.[stack.length - 1];
        if (!context) {
            console.warn("[Matterer Compiler Switch] No active context. Add 'begin compiler switch' before the native IF/ELSE chain.");
            return false;
        }

        return mattererValuesEqual(context.value, caseValue);
    }

    public end(util: BlockUtility): void {
        const thread = this.getThread(util);
        if (!thread) {
            console.warn("[Matterer Compiler Switch] Cannot end: the VM did not provide an execution thread.");
            return;
        }

        const stack = this.contexts.get(thread);
        if (!stack?.length) {
            console.warn("[Matterer Compiler Switch] end called without a matching begin.");
            return;
        }

        stack.pop();
        if (stack.length === 0) this.contexts.delete(thread);

        console.debug("[Matterer Compiler Switch] Ended switch context.", {
            remainingDepth: stack.length,
        });
    }
}


type MattererSwitchLoweringResult = {
    blocks: any;
    changed: boolean;
    invalidSwitches: string[];
};

/**
 * Lowers the visible switch/case/default graph into native VM control blocks
 * on a duplicate Blocks container. The live workspace/runtime graph is never
 * mutated, so the user's visual blocks remain unchanged.
 */
class MattererSwitchCompilerLowerer {
    private readonly cache = new WeakMap<object, {
        version: unknown;
        blocks: any;
        invalidSwitches: string[];
    }>();
    private generatedId = 0;

    public lower(sourceBlocks: any): MattererSwitchLoweringResult {
        if (!sourceBlocks?._blocks || typeof sourceBlocks.duplicate !== "function") {
            return { blocks: sourceBlocks, changed: false, invalidSwitches: [] };
        }

        const sourceMap = sourceBlocks._blocks as Record<string, any>;
        const switchIds = Object.keys(sourceMap).filter((id) =>
            String(sourceMap[id]?.opcode ?? "").toLowerCase() === "matterer_switch"
        );
        if (switchIds.length === 0) {
            return { blocks: sourceBlocks, changed: false, invalidSwitches: [] };
        }

        // Blocks.resetCache() replaces compiledScripts whenever the workspace
        // graph changes. Use that identity as a cheap graph-version token.
        const version = sourceBlocks._cache?.compiledScripts ?? sourceBlocks._blocks;
        const cached = this.cache.get(sourceBlocks);
        if (cached && cached.version === version) {
            return {
                blocks: cached.blocks,
                changed: true,
                invalidSwitches: cached.invalidSwitches.slice(),
            };
        }

        const loweredBlocks = sourceBlocks.duplicate();
        const invalidSwitches: string[] = [];
        let changed = false;

        for (const switchId of switchIds) {
            const result = this.lowerOne(loweredBlocks, switchId);
            if (result === "lowered") changed = true;
            else if (result === "invalid") invalidSwitches.push(switchId);
        }

        if (changed) {
            this.cache.set(sourceBlocks, {
                version,
                blocks: loweredBlocks,
                invalidSwitches: invalidSwitches.slice(),
            });
        }
        return {
            blocks: changed ? loweredBlocks : sourceBlocks,
            changed,
            invalidSwitches,
        };
    }

    private nextId(blocks: any): string {
        let id = "";
        do {
            id = `__matterer_switch_generated_${++this.generatedId}`;
        } while (Object.prototype.hasOwnProperty.call(blocks._blocks, id));
        return id;
    }

    private inputRef(name: string, block: string | null, shadow: string | null = null): any {
        return { name, block, shadow };
    }

    private setParent(blocks: any, childId: string | null, parentId: string): void {
        if (!childId) return;
        const child = blocks.getBlock(childId);
        if (child) child.parent = parentId;
    }

    private getBranchRef(block: any, name: string): any {
        const input = block?.inputs?.[name];
        return input ? { name, block: input.block ?? null, shadow: input.shadow ?? null } :
            { name, block: null, shadow: null };
    }

    private lowerOne(blocks: any, switchId: string): "lowered" | "invalid" | "missing" {
        const switchBlock = blocks.getBlock(switchId);
        if (!switchBlock || String(switchBlock.opcode ?? "").toLowerCase() !== "matterer_switch") {
            return "missing";
        }

        const originalNextId: string | null = switchBlock.next ?? null;
        const switchValueInput = switchBlock.inputs?.VALUE;
        if (!switchValueInput) return "invalid";

        const entries: Array<{ id: string; type: "case" | "default" }> = [];
        let childId: string | null = blocks.getBranch(switchId, 1) ?? null;
        const visited = new Set<string>();
        let sawDefault = false;

        while (childId) {
            if (visited.has(childId)) return "invalid";
            visited.add(childId);

            const child = blocks.getBlock(childId);
            const opcode = String(child?.opcode ?? "").toLowerCase();
            if (opcode === "matterer_case") {
                if (sawDefault || !child.inputs?.CASE_VALUE) return "invalid";
                entries.push({ id: childId, type: "case" });
            } else if (opcode === "matterer_defaultcase") {
                if (sawDefault) return "invalid";
                sawDefault = true;
                entries.push({ id: childId, type: "default" });
            } else {
                return "invalid";
            }

            childId = child.next ?? null;
        }

        if (entries.length === 0) return "invalid";
        if (entries.some((entry, index) => entry.type === "default" && index !== entries.length - 1)) {
            return "invalid";
        }

        const endId = this.nextId(blocks);
        const endBlock = {
            id: endId,
            opcode: "matterer_EndSwitchExecution",
            inputs: {},
            fields: {},
            next: originalNextId,
            topLevel: false,
            parent: switchId,
            shadow: false,
        };
        blocks._blocks[endId] = endBlock;

        // The public switch keeps its original ID and selector, but becomes a
        // normal command in the compiler-only copy.
        switchBlock.opcode = "matterer_BeginSwitchExecution";
        switchBlock.inputs = {
            VALUE: this.inputRef("VALUE", switchValueInput.block ?? null, switchValueInput.shadow ?? null),
        };

        const caseEntries = entries.filter(entry => entry.type === "case");
        const defaultEntry = entries.find(entry => entry.type === "default") ?? null;

        if (caseEntries.length === 0) {
            // A switch containing only default is just a command sequence.
            const defaultBlock = defaultEntry ? blocks.getBlock(defaultEntry.id) : null;
            const defaultRef = defaultBlock ? this.getBranchRef(defaultBlock, "SUBSTACK") : null;
            const defaultBodyId: string | null = defaultRef?.block ?? null;
            switchBlock.next = defaultBodyId ?? endId;
            if (defaultBodyId) {
                this.setParent(blocks, defaultBodyId, switchId);
                const endParent = this.findSequenceTail(blocks, defaultBodyId);
                endBlock.parent = endParent ?? switchId;
                this.appendAfterSequence(blocks, defaultBodyId, endId);
            }
            if (defaultEntry) delete blocks._blocks[defaultEntry.id];
            if (!defaultBodyId) endBlock.parent = switchId;
            return "lowered";
        }

        const firstCaseId = caseEntries[0].id;
        switchBlock.next = firstCaseId;
        blocks._blocks[firstCaseId].parent = switchId;

        for (let index = 0; index < caseEntries.length; index++) {
            const entry = caseEntries[index];
            const caseBlock = blocks.getBlock(entry.id);
            const originalCaseValue = caseBlock.inputs.CASE_VALUE;
            const originalBody = this.getBranchRef(caseBlock, "SUBSTACK");
            const reporterId = this.nextId(blocks);
            const nextCase = caseEntries[index + 1] ?? null;
            let elseRef = this.inputRef("SUBSTACK2", null);
            let nestedCaseId: string | null = null;

            if (nextCase) {
                nestedCaseId = nextCase.id;
                elseRef = this.inputRef("SUBSTACK2", nestedCaseId);
                blocks._blocks[nestedCaseId].parent = entry.id;
            } else if (defaultEntry) {
                const defaultBlock = blocks.getBlock(defaultEntry.id);
                const defaultBody = this.getBranchRef(defaultBlock, "SUBSTACK");
                elseRef = this.inputRef("SUBSTACK2", defaultBody.block, defaultBody.shadow);
                this.setParent(blocks, defaultBody.block, entry.id);
            }

            const reporterBlock = {
                id: reporterId,
                opcode: "matterer_SwitchCaseMatches",
                inputs: {
                    CASE_VALUE: this.inputRef("CASE_VALUE", originalCaseValue.block ?? null, originalCaseValue.shadow ?? null),
                },
                fields: {},
                next: null,
                topLevel: false,
                parent: entry.id,
                shadow: false,
            };
            blocks._blocks[reporterId] = reporterBlock;

            // Reuse the original case ID as a native IF/ELSE block. This keeps
            // all body block IDs intact while changing only the compiler copy.
            caseBlock.opcode = "control_if_else";
            caseBlock.inputs = {
                CONDITION: this.inputRef("CONDITION", reporterId),
                SUBSTACK: originalBody,
                SUBSTACK2: elseRef,
            };
            caseBlock.next = index === 0 ? endId : null;
            caseBlock.parent = index === 0 ? switchId : caseEntries[index - 1].id;
            this.setParent(blocks, originalBody.block, entry.id);
        }

        if (defaultEntry) delete blocks._blocks[defaultEntry.id];
        endBlock.parent = firstCaseId;
        if (originalNextId) this.setParent(blocks, originalNextId, endId);
        return "lowered";
    }

    private findSequenceTail(blocks: any, startId: string): string | null {
        let currentId: string | null = startId;
        const visited = new Set<string>();
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const currentBlock: any = blocks.getBlock(currentId);
            if (!currentBlock) return null;
            if (!currentBlock.next) return currentId;
            currentId = currentBlock.next as string | null;
        }
        return null;
    }

    private appendAfterSequence(blocks: any, startId: string, nextId: string): void {
        const tailId = this.findSequenceTail(blocks, startId);
        if (!tailId) return;
        const tail = blocks.getBlock(tailId);
        tail.next = nextId;
        this.setParent(blocks, nextId, tailId);
    }
}


// ── 2. Global Static Helpers ─────────────────────────────────

const MAX_LABEL_LEN = 36;

function truncateLabel(text: string, max = MAX_LABEL_LEN): string {

    return text.length <= max ? text : text.slice(0, max - 1) + "…";

}


function normalizeBlockName(value: unknown): string {

    if (typeof value === "string") return value;

    if (value && typeof value === "object") {

        const o = value as Record<string, unknown>;

        return String(o.value ?? o.text ?? o.proccode ?? o.blockName ?? "");

    }

    return String(value ?? "");

}


// ── 3. MattererBundleExecutor ────────────────────────────────

class MattererBundleExecutor {

    private explicitResetCounter = 0;


    constructor(private readonly getRuntime: () => any) { }


    public installAutoRefresh(): void {

        console.log("[Matterer Debug] Auto-refresh subsystem registered.");

    }


    public forceRebuild(): void {

        this.explicitResetCounter++;

        console.warn(`[Matterer Diagnostics] 🔄 Hard rebuild forced manually! (Trigger count: ${this.explicitResetCounter})`);

    }


    public getMenuItems(): MenuItem[] {

        console.debug("[Matterer Diagnostics] Dropdown menu opened. Querying live VM targets...");

        const runtime = this.getRuntime();

        if (!runtime?.targets) {

            console.warn("[Matterer Diagnostics] No VM targets discovered during menu query.");

            return [{ text: "(no custom blocks yet)", value: "" }];

        }


        const index = this.buildProcedureIndex(runtime);

        console.debug(`[Matterer Diagnostics] Found ${index.size} custom definitions in the project.`);


        const items = Array.from(index.values())

            .sort((a, b) => a.proccode.localeCompare(b.proccode))

            .map((meta): MenuItem => {

                let i = 0;

                const full = meta.proccode.replace(/%[sbn]/g, m => {

                    const name = meta.argumentNames[i++] ?? "?";

                    return m === "%b" ? `<${name}>` : m === "%n" ? `(${name})` : `[${name}]`;

                });

                return { text: truncateLabel(full), value: meta.proccode };

            });


        return items.length ? items : [{ text: "(no custom blocks yet)", value: "" }];

    }


    public manageLiveParameter(paramName: string, newValue: unknown = null, util: any): unknown {
        const thread = (util?.thread ?? util?.sequencer?.activeThread) as MattererThreadLike | undefined;
        if (!thread) return "NO_THREAD";

        const frames = thread.stackFrames;
        if (!Array.isArray(frames)) return "NO_PARAMS";

        // Scratch stores procedure arguments on the caller's stack frame.
        // The first non-null params object is the active procedure scope.
        for (let i = frames.length - 1; i >= 0; i--) {
            const params = frames[i]?.params;
            if (params === null || typeof params !== "object") continue;

            if (!Object.prototype.hasOwnProperty.call(params, paramName)) return 0;

            if (newValue !== null) {
                params[paramName] = newValue;
                return newValue;
            }

            return params[paramName];
        }

        return "NO_PARAMS";
    }

    public getTemplate(blockName: string): string {

        blockName = normalizeBlockName(blockName);

        console.log(`[Matterer Debug] Requesting template structure for block: "${blockName}"`);


        const runtime = this.getRuntime();

        if (!runtime?.targets) return "NO PARAMETERS";


        const meta = this.buildProcedureIndex(runtime).get(blockName);

        if (!meta || meta.argumentNames.length === 0) {

            console.info(`[Matterer Debug] Block "${blockName}" contains zero custom arguments.`);

            return "NO PARAMETERS";

        }


        const tpl: Record<string, unknown> = {};

        meta.argumentNames.forEach((name, i) => { tpl[name] = meta.argumentDefaults[i] ?? ""; });

        return JSON.stringify(tpl);

    }


    public execute(blockNameRaw: string, paramsJson: string, util: BlockUtility): void {
        const blockName = normalizeBlockName(blockNameRaw);
        console.groupCollapsed(`[Matterer Execution] Invoking Block: "${blockName}"`);

        try {
            console.log("[Raw Payload]:", paramsJson);
            if (!blockName.trim()) {
                console.error("[Matterer Error] Aborting execution: Target block name is blank.");
                return;
            }

            let parsedArgs: unknown = {};
            const trimmed = paramsJson?.trim();
            if (trimmed) {
                try {
                    parsedArgs = JSON.parse(trimmed);
                    console.log("[Parsed Data Match]: Successfully resolved JSON payload structure.", parsedArgs);
                    if (parsedArgs === null || typeof parsedArgs !== "object") parsedArgs = [parsedArgs];
                } catch (jsonErr) {
                    console.warn("[Matterer JSON Warning] Payload parsing failed. Treating as literal input string.", jsonErr);
                    parsedArgs = [trimmed];
                }
            }

            const runtime = util.runtime ?? this.getRuntime();
            const preferredTarget = util.target ?? (util as any)?.thread?.target;

            // Procedure names are sprite-local. Prefer the invoking sprite first.
            let meta = preferredTarget
                ? this.buildProcedureIndex(runtime, preferredTarget).get(blockName)
                : undefined;
            if (!meta) meta = this.buildProcedureIndex(runtime).get(blockName);

            if (!meta) {
                console.error(`[Matterer Fatal Error] No custom block definition found for: "${blockName}".`);
                return;
            }

            this.spawnThread(meta, parsedArgs, runtime);
        } finally {
            console.groupEnd();
        }
    }

    private buildProcedureIndex(runtime: any, preferredTarget?: any): Map<string, ProcedureMeta> {
        const index = new Map<string, ProcedureMeta>();
        if (!runtime?.targets) return index;

        const targets = preferredTarget ? [preferredTarget] : runtime.targets;
        for (const target of targets) {
            const blocks = target.blocks?._blocks;
            if (!blocks) continue;

            for (const [blockId, block] of Object.entries(blocks) as [string, any][]) {
                if (block?.opcode !== "procedures_definition") continue;

                const protoId = this.resolveProtoId(block.inputs?.custom_block, blocks);
                if (!protoId) continue;

                const proto = blocks[protoId];
                if (!proto || proto.opcode !== "procedures_prototype") continue;

                const proccode = proto.mutation?.proccode;
                if (!proccode) continue;

                const parseStringArray = (value: unknown): string[] => {
                    try {
                        const parsed = JSON.parse(String(value ?? "[]"));
                        return Array.isArray(parsed) ? parsed.map(item => String(item ?? "")) : [];
                    } catch {
                        return [];
                    }
                };

                index.set(proccode, {
                    proccode,
                    argumentNames: parseStringArray(proto.mutation.argumentnames),
                    argumentIds: parseStringArray(proto.mutation.argumentids),
                    argumentDefaults: parseStringArray(proto.mutation.argumentdefaults),
                    definitionBlockId: blockId,
                    target,
                });
            }
        }

        return index;
    }

    private spawnThread(meta: ProcedureMeta, parsedArgs: unknown, runtime: any): void {
        const arrayArgs = Array.isArray(parsedArgs) ? parsedArgs : null;
        const objectArgs = !arrayArgs && parsedArgs !== null && typeof parsedArgs === "object"
            ? parsedArgs as Record<string, unknown>
            : null;

        const values = meta.argumentNames.map((name, i) => {
            const argumentId = meta.argumentIds[i];
            let value: unknown;

            if (arrayArgs) {
                value = i < arrayArgs.length ? arrayArgs[i] : meta.argumentDefaults[i] ?? "";
            } else if (objectArgs && Object.prototype.hasOwnProperty.call(objectArgs, name)) {
                value = objectArgs[name];
            } else if (objectArgs && argumentId && Object.prototype.hasOwnProperty.call(objectArgs, argumentId)) {
                value = objectArgs[argumentId];
            } else {
                value = meta.argumentDefaults[i] ?? "";
            }

            console.log(`  -> Bound parameter [${name}] (argument ID: ${argumentId ?? "N/A"}):`, value);
            return { name, value };
        });

        if (typeof runtime?._pushThread !== "function") {
            console.error("[Matterer Runtime Error] This VM does not expose the required thread creation hook.");
            return;
        }

        // A null parent frame is intentional: Scratch's normal procedure-call
        // path stores params on the caller frame, then pushes the definition.
        // This gives the injected procedure the same parameter-scope lifetime.
        const thread = runtime._pushThread(
            null,
            meta.target,
            { stackClick: false, updateMonitor: false }
        ) as MattererThreadLike | null;

        if (!thread || typeof thread.initParams !== "function" ||
            typeof thread.pushParam !== "function" || typeof thread.pushStack !== "function") {
            console.error("[Matterer Runtime Error] Scratch returned an incompatible procedure thread.");
            if (thread && typeof runtime._stopThread === "function") runtime._stopThread(thread);
            return;
        }

        // Argument reporters retrieve parameters by display name. Argument IDs
        // belong to the procedure-call inputs and are not stack-frame keys.
        thread.initParams();
        for (const { name, value } of values) thread.pushParam(name, value);

        // The definition advances into the custom procedure body. The parent
        // sentinel keeps the injected params alive for the entire body.
        thread.pushStack(meta.definitionBlockId);
        thread.topBlock = meta.definitionBlockId;

        // Scratch's native isRecursiveCall() assumes every stack entry has a
        // real block ID. Our parameter-scope sentinel is null, so skip null
        // entries while preserving the VM's five-call recursion scan.
        if (typeof thread.isRecursiveCall === "function") {
            thread.isRecursiveCall = (procedureCode: string): boolean => {
                let callCount = 5;
                for (let i = thread.stack.length - 2; i >= 0; i--) {
                    const blockId = thread.stack[i];
                    if (!blockId) continue;

                    const block = thread.target?.blocks?.getBlock?.(blockId);
                    if (block?.opcode === "procedures_call" &&
                        block.mutation?.proccode === procedureCode) {
                        return true;
                    }
                    if (--callCount < 0) return false;
                }
                return false;
            };
        }

        console.info(`[Thread Dispatch] Procedure thread dispatched with ${values.length} bound parameter(s). Definition: ${meta.definitionBlockId}.`);
    }

    private resolveProtoId(input: any, blocks: Record<string, any>): string | null {

        if (!input) return null;

        if (Array.isArray(input)) {

            const a = input[1]; if (typeof a === "string" && blocks[a]) return a;

            const b = input[2]; if (typeof b === "string" && blocks[b]) return b;

            return null;

        }

        if (input.block && blocks[input.block]) return input.block;

        if (input.shadow && blocks[input.shadow]) return input.shadow;

        return null;

    }

}


// ── 4. Matterer Base Class ───────────────────────────────────

class Matterer {

    public executor = new MattererBundleExecutor(() => Scratch?.vm?.runtime);

    public scratch: typeof Scratch;

    /** Per-thread switch selector stack used by generated native IF/ELSE graphs. */
    private readonly compilerCompatibleSwitch = new MattererCompilerCompatibleSwitchBackend();
    private readonly switchCompilerLowerer = new MattererSwitchCompilerLowerer();


    static waitOneFrame = (): Promise<void> => new Promise(r => requestAnimationFrame(() => r()));

    static MaxTransparency: Readonly<number> = 100;


    constructor() {

        this.scratch = Scratch ?? undefined;

    }


    /**
     * Install the one-interface compiler bridge. When TurboWarp is compiling,
     * Runtime normally calls Thread.tryCompile() from inside _pushThread(). We
     * briefly defer that compile, give the thread a lowered duplicate of its
     * block container, then compile the duplicate. The editor/runtime's real
     * Blocks container is never changed.
     *
     * These are private TurboWarp runtime hooks, not a stable extension API.
     * They are deliberately isolated here and guarded so a VM update fails
     * safely (the switch remains available to the interpreter).
     */
    protected installSwitchCompilerLowering(): void {
        const runtime: any = this.scratch?.vm?.runtime;
        if (!runtime || runtime.__mattererSwitchCompilerLoweringInstalled) return;
        if (typeof runtime._pushThread !== "function" || typeof runtime._restartThread !== "function") {
            console.warn("[Matterer Switch] Compiler lowering hooks are unavailable; switch will use interpreter execution.");
            return;
        }

        const extension = this;
        const originalPushThread = runtime._pushThread;
        const originalRestartThread = runtime._restartThread;

        const compileOnLoweredGraph = (thread: any): void => {
            if (!thread || typeof thread.tryCompile !== "function") return;
            const sourceBlocks = thread.target?.blocks ?? thread.blockContainer;
            if (!sourceBlocks) return;

            const result = extension.switchCompilerLowerer.lower(sourceBlocks);
            const sourceHasSwitch = Object.values(sourceBlocks._blocks ?? {}).some((block: any) =>
                String(block?.opcode ?? "").toLowerCase() === "matterer_switch"
            );

            if (result.invalidSwitches.length > 0) {
                console.warn("[Matterer Switch] Invalid switch structures were left for interpreter validation.", {
                    switchBlockIds: result.invalidSwitches,
                });
            }

            // If the source contains a switch but could not be lowered, avoid
            // asking the compiler to compile the original custom CONDITIONAL
            // blocks. Mark this thread as attempted so the VM interprets it.
            if (sourceHasSwitch && (!result.changed || result.invalidSwitches.length > 0)) {
                thread.blockContainer = sourceBlocks;
                thread.triedToCompile = true;
                console.info("[Matterer Switch] This script will use the interpreter because its switch graph could not be lowered safely.");
                return;
            }

            if (result.changed) {
                // TurboWarp extension opcodes preserve the spelling supplied in
                // getInfo(): matterer_BeginSwitchExecution, etc. Validate those
                // exact primitive names before compiling the generated graph.
                const requiredHelpers = [
                    "matterer_BeginSwitchExecution",
                    "matterer_SwitchCaseMatches",
                    "matterer_EndSwitchExecution",
                ];
                const missingHelpers = requiredHelpers.filter((opcode) =>
                    typeof runtime.getOpcodeFunction?.(opcode) !== "function"
                );
                if (missingHelpers.length > 0) {
                    thread.blockContainer = sourceBlocks;
                    thread.triedToCompile = true;
                    console.warn("[Matterer Switch] Compiler helpers are not registered under the expected opcodes; using the interpreter.", {
                        missingHelpers,
                    });
                    return;
                }
            }

            thread.blockContainer = result.blocks;
            thread.tryCompile();

            if (!thread.isCompiled && result.changed) {
                // Thread.tryCompile() reports failures internally. If another
                // generated helper or unsupported block prevents compilation,
                // restore the original workspace graph and interpret that script.
                thread.blockContainer = sourceBlocks;
                thread.triedToCompile = true;
                console.warn("[Matterer Switch] Compiler lowering was rejected; restored the original switch graph for interpreter execution.");
            }
        };

        runtime._pushThread = function (id: string, target: any, opts?: any): any {
            const shouldCompile = Boolean(this.compilerOptions?.enabled && !(opts && opts.updateMonitor));
            if (!shouldCompile) return originalPushThread.call(this, id, target, opts);

            const wasEnabled = this.compilerOptions.enabled;
            this.compilerOptions.enabled = false;
            let thread: any;
            try {
                thread = originalPushThread.call(this, id, target, opts);
            } finally {
                this.compilerOptions.enabled = wasEnabled;
            }

            compileOnLoweredGraph(thread);
            return thread;
        };

        runtime._restartThread = function (thread: any): any {
            const shouldCompile = Boolean(
                this.compilerOptions?.enabled && thread?.triedToCompile && !thread?.updateMonitor
            );
            if (!shouldCompile) return originalRestartThread.call(this, thread);

            const wasEnabled = this.compilerOptions.enabled;
            this.compilerOptions.enabled = false;
            let restarted: any;
            try {
                restarted = originalRestartThread.call(this, thread);
            } finally {
                this.compilerOptions.enabled = wasEnabled;
            }

            compileOnLoweredGraph(restarted);
            return restarted;
        };

        runtime.__mattererSwitchCompilerLoweringInstalled = true;
        console.info("[Matterer Switch] Installed unified interpreter/compiler lowering bridge.");
    }

    protected getActiveSprite(util?: BlockUtility): any {

        return (

            util?.target ??

            Scratch.vm.runtime.sequencer?.activeThread?.target ??

            Scratch.vm.runtime._editingTarget ??

            null

        );

    }


    public refreshCustomBlockMenu(): void {

        console.log("[Manual Reset] User requested an emergency pipeline synchronization...");

        this.executor.forceRebuild();

        try {

            const vm: any = Scratch.vm;

            if (vm) {

                if (typeof vm.refreshWorkspace === "function") vm.refreshWorkspace();

                if (typeof vm.emitWorkspaceUpdate === "function") vm.emitWorkspaceUpdate();

                console.log("[Manual Reset] GUI engine components successfully signaled.");

            } else {

                console.warn("[Manual Reset Warning] Scratch VM instance inaccessible for visual updates.");

            }

        } catch (e) {

            console.error("[Manual Reset Error] Emergency workspace synchronization pipeline failed:", e);

        }

    }


    public ExecuteMyBlock(

        { BLOCK_NAME, PARAMS_JSON }: { BLOCK_NAME: string; PARAMS_JSON: string },

        util: BlockUtility

    ): void {

        this.executor.execute(BLOCK_NAME, PARAMS_JSON, util);

    }


    public GetBlockParamTemplate({ BLOCK_NAME }: { BLOCK_NAME: string }): string {

        return this.executor.getTemplate(BLOCK_NAME);

    }


    public getCustomBlockMenuItems(): MenuItem[] {

        return this.executor.getMenuItems();

    }


    public getParamValueBlock(args: { NAME: string }, util: any): any {

        return this.executor.manageLiveParameter(args.NAME, null, util);

    }


    public setParamValueBlock(args: { NAME: string; VALUE: any }, util: any): any {

        return this.executor.manageLiveParameter(args.NAME, args.VALUE, util);

    }


    public ValidateInputType(

        { VALUE, TYPE_DEFINITION }: { VALUE: string; TYPE_DEFINITION: string }

    ): boolean {

        const type = TYPE_DEFINITION.toLowerCase();

        const forced = String(VALUE);


        if (!ValidScratchTypeDefinitions.includes(type)) return false;


        switch (type) {

            case "boolean": { const v = forced.toLowerCase().trim(); return v === "true" || v === "false"; }

            case "number": return !isNaN(parseFloat(forced)) && isFinite(Number(forced));

            case "string": return true;

            case "object": try { const p = JSON.parse(forced); return typeof p === "object" && p !== null; } catch { return false; }

            default: return false;

        }

    }


    public NewBoolean({ BOOL_VALUE }: { BOOL_VALUE: string }): boolean {
        return String(BOOL_VALUE ?? "").toLowerCase().trim() === "true";
    }

    public Switch({ VALUE }: { VALUE: string | number }, util: BlockUtility): void {
        const thread = (util as any).thread as MattererThreadLike | undefined;
        const switchBlockId = thread?.peekStack?.() ?? null;
        const switchFrame = thread?.peekStackFrame?.() ?? null;

        // The VM's BlockUtility.stackFrame getter returns this exact frame's
        // executionContext, but accessing it first and comparing object identity
        // is unnecessary (and can fail with alternate execution paths).
        if (!thread || !switchBlockId || !switchFrame) {
            console.warn("[Matterer Switch] Unable to identify the executing switch block.", {
                hasThread: Boolean(thread),
                stack: thread?.stack?.slice?.() ?? null,
                frameCount: thread?.stackFrames?.length ?? 0,
            });
            return;
        }

        if (!this.hasValidSwitchCaseChain(thread)) return;

        const executionContext = switchFrame.executionContext ?? (switchFrame.executionContext = {});
        executionContext[MATTERER_SWITCH_CONTEXT_KEY] = {
            value: VALUE,
            matched: false,
            switchBlockId,
            thread,
        } satisfies MattererSwitchContext;

        console.debug(
            `[Matterer Switch] Started switch ${switchBlockId} on its own VM thread.`,
            { value: VALUE, threadStack: thread.stack.slice() }
        );

        util.startBranch(1, false);
    }

    public Case({ CASE_VALUE }: { CASE_VALUE: string | number }, util: BlockUtility): void {
        const active = this.getEnclosingSwitchContext(util, "matterer_case");
        if (!active) {
            console.warn("[Matterer Switch] Could not resolve the owning switch for this case.", {
                stack: (util as any).thread?.stack?.slice?.() ?? null,
                currentBlockId: (util as any).thread?.peekStack?.() ?? null,
            });
            return;
        }

        const { context, thread, switchBlockId } = active;
        const matches = mattererValuesEqual(context.value, CASE_VALUE);

        console.debug("[Matterer Switch] Evaluating case", {
            threadStack: thread.stack.slice(),
            switchBlockId,
            switchValue: context.value,
            caseValue: CASE_VALUE,
            matches,
            alreadyMatched: context.matched,
        });

        // The switch's first input is compared to this case's first input.
        // Only the first matching case is allowed to enter its substack.
        if (context.matched || !matches) return;

        context.matched = true;
        util.startBranch(1, false);
    }

    public DefaultCase(_: {}, util: BlockUtility): void {
        const active = this.getEnclosingSwitchContext(util, "matterer_defaultcase");
        if (!active) {
            console.warn("[Matterer Switch] Could not resolve the owning switch for the default block.", {
                stack: (util as any).thread?.stack?.slice?.() ?? null,
                currentBlockId: (util as any).thread?.peekStack?.() ?? null,
            });
            return;
        }

        const { context, thread, switchBlockId } = active;
        console.debug("[Matterer Switch] Evaluating default", {
            threadStack: thread.stack.slice(),
            switchBlockId,
            switchValue: context.value,
            alreadyMatched: context.matched,
        });

        if (context.matched) return;

        context.matched = true;
        util.startBranch(1, false);
    }

    // Hidden compiler helpers. These are inserted only into the compiler's
    // duplicate block graph; users never need to place them manually.
    public BeginSwitchExecution({ VALUE }: { VALUE: string | number }, util: BlockUtility): void {
        this.compilerCompatibleSwitch.begin(VALUE, util);
    }

    public SwitchCaseMatches({ CASE_VALUE }: { CASE_VALUE: string | number }, util: BlockUtility): boolean {
        return this.compilerCompatibleSwitch.matches(CASE_VALUE, util);
    }

    public EndSwitchExecution(_: {}, util: BlockUtility): void {
        this.compilerCompatibleSwitch.end(util);
    }

    /**
     * Validate the switch's direct substack before entering it. This prevents
     * ordinary command blocks accidentally placed directly inside `switch`
     * from executing unconditionally. Arbitrary commands are allowed inside
     * each case/default substack.
     */
    private hasValidSwitchCaseChain(thread: MattererThreadLike): boolean {
        const switchBlockId = thread.peekStack();
        const blocks = thread.blockContainer ?? thread.target?.blocks;
        if (!switchBlockId || typeof blocks?.getBranch !== "function" ||
            typeof blocks?.getNextBlock !== "function" || typeof blocks?.getBlock !== "function") {
            console.warn("[Matterer Switch] Unable to inspect the switch's case stack.");
            return false;
        }

        let childId: string | null = blocks.getBranch(switchBlockId, 1) ?? null;
        if (!childId) {
            console.warn("[Matterer Switch] Add at least one case or default block inside the switch.");
            return false;
        }

        const visited = new Set<string>();
        let foundEntry = false;
        let sawDefault = false;

        while (childId) {
            if (visited.has(childId)) {
                console.warn("[Matterer Switch] Invalid circular block chain detected.");
                return false;
            }
            visited.add(childId);

            const block = blocks.getBlock(childId);
            const opcode = String(block?.opcode ?? "").toLowerCase();
            const isCase = opcode === "matterer_case";
            const isDefault = opcode === "matterer_defaultcase";

            if (!isCase && !isDefault) {
                console.warn(
                    "[Matterer Switch] Only case/default blocks can be placed directly inside switch. " +
                    "Move executable blocks into a case's substack."
                );
                return false;
            }

            if (sawDefault) {
                console.warn("[Matterer Switch] The default block must be the final block in the switch.");
                return false;
            }

            foundEntry = true;
            if (isDefault) sawDefault = true;
            childId = blocks.getNextBlock(childId) ?? null;
        }

        return foundEntry;
    }

    /**
     * Find the switch which structurally owns a case/default block.
     *
     * The block graph is authoritative for parent/child ownership: a switch's
     * SUBSTACK is a linked chain of case/default blocks. We deliberately do not
     * assume that the switch is the immediately preceding entry in Thread.stack.
     */
    private findOwningSwitchBlockId(blocks: any, childBlockId: string): string | null {
        const allBlocks = blocks?._blocks;
        if (!allBlocks || typeof allBlocks !== "object") return null;

        let owner: string | null = null;

        for (const candidateId of Object.keys(allBlocks)) {
            const candidate = blocks.getBlock?.(candidateId);
            if (String(candidate?.opcode ?? "").toLowerCase() !== "matterer_switch") continue;

            let directChildId: string | null = blocks.getBranch?.(candidateId, 1) ?? null;
            const visited = new Set<string>();

            while (directChildId && !visited.has(directChildId)) {
                visited.add(directChildId);
                if (directChildId === childBlockId) {
                    // Corrupt/ambiguous block graphs should fail closed.
                    if (owner && owner !== candidateId) return null;
                    owner = candidateId;
                    break;
                }

                const directChild = blocks.getBlock?.(directChildId);
                const opcode = String(directChild?.opcode ?? "").toLowerCase();
                if (opcode !== "matterer_case" && opcode !== "matterer_defaultcase") break;

                directChildId = blocks.getNextBlock?.(directChildId) ?? null;
            }
        }

        return owner;
    }

    /**
     * Resolve the active switch for the currently executing case/default.
     *
     * First resolve static ownership from the block graph. Then find that exact
     * switch block's live stack frame on this same Thread. This supports extra
     * VM stack levels and avoids relying on [..., switch, case] adjacency.
     */
    private getEnclosingSwitchContext(
        util: BlockUtility,
        expectedCurrentOpcode: "matterer_case" | "matterer_defaultcase"
    ): { context: MattererSwitchContext; thread: MattererThreadLike; switchBlockId: string } | null {
        const thread = (util as any).thread as MattererThreadLike | undefined;
        if (!thread || !Array.isArray(thread.stack) || !Array.isArray(thread.stackFrames)) {
            return null;
        }

        const blocks = thread.blockContainer ?? thread.target?.blocks;
        const currentFrame = thread.peekStackFrame?.() ?? null;
        const currentBlockId = thread.peekStack?.() ?? currentFrame?.op?.id ?? null;
        if (!currentBlockId) return null;

        const currentBlock = blocks?.getBlock?.(currentBlockId);
        const currentOpcode = String(currentBlock?.opcode ?? "").toLowerCase();
        if (currentOpcode !== expectedCurrentOpcode) return null;

        // Static graph lookup tells us which switch's SUBSTACK owns this case.
        const switchBlockId = this.findOwningSwitchBlockId(blocks, currentBlockId);
        if (!switchBlockId) return null;

        // Locate the active invocation of that switch on this thread. Search
        // backward from the current case rather than assuming adjacent frames.
        let currentIndex = thread.stack.lastIndexOf(currentBlockId);
        if (currentIndex < 0 && currentFrame?.op?.id === currentBlockId) {
            currentIndex = thread.stackFrames.lastIndexOf(currentFrame);
        }
        if (currentIndex < 0) currentIndex = thread.stack.length;

        const maxIndex = Math.min(currentIndex - 1, thread.stackFrames.length - 1);
        for (let i = maxIndex; i >= 0; i--) {
            const stackBlockId = thread.stack[i];
            const frameBlockId = thread.stackFrames[i]?.op?.id;
            if (stackBlockId !== switchBlockId && frameBlockId !== switchBlockId) continue;

            const switchFrame = thread.stackFrames[i];
            const executionContext = switchFrame?.executionContext;
            const context = executionContext?.[MATTERER_SWITCH_CONTEXT_KEY] as MattererSwitchContext | undefined;

            if (!context || context.thread !== thread || context.switchBlockId !== switchBlockId ||
                typeof context.matched !== "boolean" ||
                !Object.prototype.hasOwnProperty.call(context, "value")) {
                continue;
            }

            return { context, thread, switchBlockId };
        }

        return null;
    }

    public FetchVisibilityState(_: {}, util: BlockUtility): boolean {

        return this.getActiveSprite(util)?.visible ?? false;

    }


    // Tracker map storing animation execution timestamps

    private __animatingTimers: Map<string, { start: number; duration: number; startGhost: number; endGhost: number; style: AnimationStyles }> = new Map();


    public FadeTransparency(

        {

            TARGET_TRANSPARENCY,

            ANIMATION_DIRECTION,

            ANIMATION_STYLE,

        }: {

            TARGET_TRANSPARENCY: number;

            ANIMATION_DIRECTION: "IN" | "OUT";

            ANIMATION_STYLE: AnimationStyles;

        },

        util: BlockUtility

    ): void {

        if (TARGET_TRANSPARENCY == null || TARGET_TRANSPARENCY < 0 || TARGET_TRANSPARENCY > Matterer.MaxTransparency) return;


        const sprite = this.getActiveSprite(util);

        if (!sprite) return;

        const spriteId = sprite.id;


        const runtime = Scratch.vm.runtime;

        // JIT Framerate Fallback Fix: Read cleanly or enforce the standard 30 FPS timeline rule

        const currentFPS = runtime.currentStepTime ? (1000 / runtime.currentStepTime) : 30;

        const animationDurationMs = (TARGET_TRANSPARENCY / currentFPS) * 1000;


        const startGhost = sprite.effects?.ghost ?? 0;

        const endGhost = ANIMATION_DIRECTION === "IN" ? 0 : TARGET_TRANSPARENCY;


        // Set live non-blocking animation ticker tracking payload

        this.__animatingTimers.set(spriteId, {

            start: Date.now(),

            duration: Math.max(animationDurationMs, 50),

            startGhost,

            endGhost,

            style: ANIMATION_STYLE

        });


        // Safe operational trigger fire

        runtime.startHats("matterer_TrackAnimationStartTrigger");

    }


    public TrackAnimationStartTrigger(_: {}, _u: BlockUtility): boolean {

        return true; 

    }


    public TrackAnimationEndTrigger(_: {}, _u: BlockUtility): boolean {

        return true; 

    }


    public checkIsAnimatingProperty(

        { REQUESTED_ANIMATING_STATE_TYPE }: { REQUESTED_ANIMATING_STATE_TYPE: "animating" | "not animating" },

        util: BlockUtility

    ): boolean {

        const sprite = this.getActiveSprite(util);

        if (!sprite) return false;


        this._updateAnimationTickerForSprite(sprite);

        const is = this.__animatingTimers.has(sprite.id);

        return REQUESTED_ANIMATING_STATE_TYPE === "animating" ? is : !is;

    }


    public LoopUntilAnimationFinished(

        { INCLUDES_SCREEN_REFRESH }: { INCLUDES_SCREEN_REFRESH: boolean },

        util: any

    ): void {

        const sprite = this.getActiveSprite(util);

        if (!sprite) return;


        const animating = this._updateAnimationTickerForSprite(sprite);


        if (animating) {

            // Re-execute this loop node during the subsequent sequence frame pass cleanly

            util.startBranch(1, INCLUDES_SCREEN_REFRESH);

        }

    }


    public async ToggleCurrentRunningAnimation(

        args: { ANIMATION_TOGGLE_STATE: "STOP" | "PAUSE" | "RESUME" },

        util: BlockUtility

    ): Promise<void> {

        const sprite = this.getActiveSprite(util);

        if (!sprite) return;


        if (args.ANIMATION_TOGGLE_STATE === "STOP") {

            this.__animatingTimers.delete(sprite.id);

            Scratch.vm.runtime.startHats("matterer_TrackAnimationEndTrigger");

        }

    }


    private _updateAnimationTickerForSprite(sprite: any): boolean {

        if (!sprite || !this.__animatingTimers.has(sprite.id)) return false;


        const anim = this.__animatingTimers.get(sprite.id)!;

        const elapsed = Date.now() - anim.start;

        const progress = Math.min(elapsed / anim.duration, 1);


        const easings: Record<AnimationStyles, (t: number) => number> = {

            linear: t => t,

            easeIn: t => t * t,

            easeOut: t => t * (2 - t),

            easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

            bounce: t => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),

        };


        const easedProgress = easings[anim.style](progress);

        const nextGhostValue = anim.startGhost + (anim.endGhost - anim.startGhost) * easedProgress;


        // Apply changes cleanly to the WebGL skin instance renderer

        if (typeof sprite.setEffect === "function") {

            sprite.setEffect("ghost", nextGhostValue);

        } else if (sprite.effects) {

            sprite.effects.ghost = nextGhostValue;

        }


        if (progress >= 1) {

            this.__animatingTimers.delete(sprite.id);

            Scratch.vm.runtime.startHats("matterer_TrackAnimationEndTrigger");

            return false;

        }


        return true;

    }

}


// ── 5. MattererDefinitions Extension Block Registration ──────

class MattererDefinitions extends Matterer implements Scratch.Extension {

    constructor() {

        super();


        if (this.scratch.extensions.unsandboxed) {

            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);

            this.executor.installAutoRefresh();
            this.installSwitchCompilerLowering();

        } else {

            console.warn("[Matterer] Warning: Extension running in sandboxed environment.");

        }

    }


    public getInfo(): Scratch.Info {

        return {

            id: "matterer",

            name: "Matterer Defines",

            color1: "#f542b0",

            color2: "#c41681",

            color3: "#a500a2",

            blocks: [

                {

                    blockType: Scratch.BlockType.BUTTON,

                    func: "refreshCustomBlockMenu",

                    text: "🔄️ Force Sync Workspace Data",

                },

                "---",

                { blockType: Scratch.BlockType.LABEL, text: "General Utilities" },

                {

                    blockType: Scratch.BlockType.BOOLEAN,

                    opcode: "ValidateInputType",

                    text: "is [VALUE] an [TYPE_DEFINITION] ?",

                    arguments: {

                        VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "Hello Scratch! :D" },

                        TYPE_DEFINITION: { type: Scratch.ArgumentType.STRING, menu: "typeDefinitionMenu", defaultValue: "string" },

                    },

                },

                {

                    blockType: Scratch.BlockType.BOOLEAN,

                    opcode: "NewBoolean",

                    text: "new bool from [BOOL_VALUE]",

                    arguments: {

                        BOOL_VALUE: { type: Scratch.ArgumentType.STRING, menu: "BooleanPickerMenu", defaultValue: "TRUE" },

                    },

                },

                "---",

                { blockType: Scratch.BlockType.LABEL, text: "Flow Control" },
                {
                    blockType: Scratch.BlockType.CONDITIONAL,
                    branchCount: 1,
                    opcode: "Switch",
                    text: "switch [VALUE]",
                    arguments: {
                        VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "0" },
                    },
                },
                {
                    blockType: Scratch.BlockType.CONDITIONAL,
                    branchCount: 1,
                    opcode: "Case",
                    text: "case [CASE_VALUE]",
                    arguments: {
                        CASE_VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "0" },
                    },
                },
                {
                    blockType: Scratch.BlockType.CONDITIONAL,
                    branchCount: 1,
                    opcode: "DefaultCase",
                    text: "default",
                    arguments: {},
                },
                // Compiler-only implementation details. These blocks are
                // injected into a duplicate VM graph and are never shown.
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode: "BeginSwitchExecution",
                    text: "_begin switch [VALUE]",
                    hideFromPalette: true,
                    arguments: {
                        VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "0" },
                    },
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: "SwitchCaseMatches",
                    text: "_switch case matches [CASE_VALUE]?",
                    hideFromPalette: true,
                    arguments: {
                        CASE_VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "0" },
                    },
                },
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode: "EndSwitchExecution",
                    text: "_end switch",
                    hideFromPalette: true,
                    arguments: {},
                },
                "---",
                { blockType: Scratch.BlockType.LABEL, text: "Animation Utilities" },

                {

                    blockType: Scratch.BlockType.COMMAND,

                    opcode: "FadeTransparency",

                    text: "animate transparency to [TARGET_TRANSPARENCY] [ANIMATION_DIRECTION] with [ANIMATION_STYLE]",

                    arguments: {

                        TARGET_TRANSPARENCY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },

                        ANIMATION_DIRECTION: { type: Scratch.ArgumentType.STRING, menu: "AnimationDirectionChoice", defaultValue: "OUT" },

                        ANIMATION_STYLE: { type: Scratch.ArgumentType.STRING, menu: "AnimationStyleChoice", defaultValue: "linear" },

                    },

                },

                {

                    blockType: Scratch.BlockType.LOOP,

                    branchCount: 1,

                    opcode: "LoopUntilAnimationFinished",

                    text: "while animating (refresh [INCLUDES_SCREEN_REFRESH]) do",

                    arguments: {

                        INCLUDES_SCREEN_REFRESH: { type: Scratch.ArgumentType.BOOLEAN },

                    },

                },

                {

                    blockType: Scratch.BlockType.BOOLEAN,

                    opcode: "checkIsAnimatingProperty",

                    text: "is [REQUESTED_ANIMATING_STATE_TYPE]?",

                    arguments: {

                        REQUESTED_ANIMATING_STATE_TYPE: { type: Scratch.ArgumentType.STRING, menu: "AnimatingStateTypeRequestMenu", defaultValue: "animating" },

                    },

                },

                "---",

                { blockType: Scratch.BlockType.LABEL, text: "Animation Events" },

                {

                    blockType: Scratch.BlockType.HAT,

                    opcode: "TrackAnimationStartTrigger",

                    text: "when animating STARTS",

                    arguments: {},

                },

                {

                    blockType: Scratch.BlockType.HAT,

                    opcode: "TrackAnimationEndTrigger",

                    text: "when animating ENDS",

                    arguments: {},

                },

                {

                    blockType: Scratch.BlockType.COMMAND,

                    opcode: "ToggleCurrentRunningAnimation",

                    text: "[ANIMATION_TOGGLE_STATE] current animation",

                    arguments: {

                        ANIMATION_TOGGLE_STATE: { type: Scratch.ArgumentType.STRING, menu: "AnimationControlStateMenu", defaultValue: "STOP" },

                    },

                },

                "---",

                { blockType: Scratch.BlockType.LABEL, text: "Visual Sensing" },

                {

                    blockType: Scratch.BlockType.BOOLEAN,

                    opcode: "FetchVisibilityState",

                    text: "sprite currently visible",

                    arguments: {},

                },

                "---",

                { blockType: Scratch.BlockType.LABEL, text: "Custom Block Executor" },

                {

                    blockType: Scratch.BlockType.COMMAND,

                    opcode: "ExecuteMyBlock",

                    text: "execute [BLOCK_NAME] with [PARAMS_JSON]",

                    arguments: {

                        BLOCK_NAME: { type: Scratch.ArgumentType.STRING, menu: "customBlockMenu", defaultValue: "" },

                        PARAMS_JSON: { type: Scratch.ArgumentType.STRING, defaultValue: "{}" },

                    },

                },

                {

                    blockType: Scratch.BlockType.REPORTER,

                    opcode: "GetBlockParamTemplate",

                    text: "param template for [BLOCK_NAME]",

                    arguments: {

                        BLOCK_NAME: { type: Scratch.ArgumentType.STRING, menu: "customBlockMenu", defaultValue: "" }

                    },

                },

                {

                    opcode: 'getParamValueBlock',

                    blockType: Scratch.BlockType.REPORTER,

                    text: 'get live value of parameter [NAME]',

                    arguments: {

                        NAME: {

                            type: Scratch.ArgumentType.STRING,

                            defaultValue: 'valueT'

                        }

                    }

                },

                {

                    opcode: 'setParamValueBlock',

                    blockType: Scratch.BlockType.COMMAND,

                    text: 'set live parameter [NAME] to [VALUE]',

                    arguments: {

                        NAME: {

                            type: Scratch.ArgumentType.STRING,

                            defaultValue: 'valueT'

                        },

                        VALUE: {

                            type: Scratch.ArgumentType.STRING,

                            defaultValue: 'hello'

                        }

                    }

                }

            ],

            menus: {

                typeDefinitionMenu: { acceptReporters: false, items: ["string", "number", "boolean", "object"] },

                BooleanPickerMenu: { acceptReporters: false, items: ["TRUE", "FALSE"] },

                AnimationDirectionChoice: { acceptReporters: false, items: ["IN", "OUT"] },

                AnimationStyleChoice: { acceptReporters: false, items: ["linear", "easeIn", "easeOut", "easeInOut", "bounce"] },

                AnimatingStateTypeRequestMenu: { acceptReporters: false, items: ["animating", "not animating"] },

                AnimationControlStateMenu: { acceptReporters: false, items: ["STOP", "PAUSE", "RESUME"] },

                customBlockMenu: { acceptReporters: true, items: "getCustomBlockMenuItems" }

            }

        };

    }

}


Scratch.extensions.register(new MattererDefinitions());
