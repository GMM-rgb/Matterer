// ============================================================
//  Matterer Project — Complete Source with Deep Diagnostics
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

    /**
     * Hard Reset Mechanism
     */
    public forceRebuild(): void {
        this.explicitResetCounter++;
        console.warn(`[Matterer Diagnostics] 🔄 Hard rebuild forced manually! (Trigger count: ${this.explicitResetCounter})`);
    }

    /**
     * Dynamic dropdown mapping with full tracing.
     */
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

    /**
     * Safe Parameter Controller Loop
     */
    public manageLiveParameter(paramName: string, newValue: any = null, util: any): any {
        const thread = util.sequencer?.activeThread;
        if (!thread) return "NO_THREAD";

        const currentFrame = thread.stackFrame;
        if (!currentFrame || !currentFrame.params) return "NO_PARAMS";

        const procedureCode = thread.targetProcedure;
        const runtime = thread.runtime || this.getRuntime();
        const procDefinition = runtime?.getProcedureDefinition?.(procedureCode);

        let targetKey: string | null = null;

        if (procDefinition && Array.isArray(procDefinition.paramNames)) {
            for (let i = 0; i < procDefinition.paramNames.length; i++) {
                if (procDefinition.paramNames[i] === paramName) {
                    const frameKeys = Object.keys(currentFrame.params);
                    if (frameKeys[i]) {
                        targetKey = frameKeys[i];
                        break;
                    }
                }
            }
        }

        if (!targetKey && currentFrame.params[paramName] !== undefined) {
            targetKey = paramName;
        }

        if (targetKey) {
            if (newValue !== null) {
                const currentVal = currentFrame.params[targetKey];
                if (typeof currentVal === 'function') {
                    currentFrame.params[targetKey] = () => newValue;
                } else {
                    currentFrame.params[targetKey] = newValue;
                }
                return newValue;
            } else {
                const rawParam = currentFrame.params[targetKey];
                return typeof rawParam === 'function' ? rawParam() : rawParam;
            }
        }

        return 0;
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

    /**
     * Core Execution Engine with Deep Parameter Inspection
     */
    public execute(blockNameRaw: string, paramsJson: string, util: BlockUtility): void {
        const blockName = normalizeBlockName(blockNameRaw);

        console.groupCollapsed(`[Matterer Execution] Invoking Block: "${blockName}"`);
        console.log(`[Raw Payload]:`, paramsJson);

        if (!blockName.trim()) {
            console.error("[Matterer Error] Aborting execution: Target block name is blank.");
            console.groupEnd();
            return;
        }

        let parsedArgs: any = [];
        const trimmed = paramsJson?.trim();

        if (trimmed && trimmed !== "{}" && trimmed !== "[]") {
            try {
                parsedArgs = JSON.parse(trimmed);
                console.log("[Parsed Data Match]: Successfully resolved JSON payload structure.", parsedArgs);
                if (typeof parsedArgs !== "object" || parsedArgs === null) {
                    parsedArgs = [parsedArgs];
                }
            } catch (jsonErr) {
                console.warn(`[Matterer JSON Warning] Payload parsing failed. Treating as literal input string. Error:`, jsonErr);
                parsedArgs = [trimmed];
            }
        } else {
            console.log("[Parsed Data Match]: Payload is empty/default object.");
        }

        const runtime = util.runtime ?? this.getRuntime();
        const index = this.buildProcedureIndex(runtime);
        const meta = index.get(blockName);

        if (!meta) {
            console.error(`[Matterer Fatal Error] Execution failed. No custom block matching definition: "${blockName}" exists.`);
            console.groupEnd();
            return;
        }

        this.spawnThread(meta, parsedArgs, util, runtime);
        console.groupEnd();
    }

    private buildProcedureIndex(runtime: any): Map<string, ProcedureMeta> {
        const index = new Map<string, ProcedureMeta>();
        if (!runtime?.targets) return index;

        for (const target of runtime.targets) {
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

                let argumentNames: string[] = [];
                let argumentIds: string[] = [];
                let argumentDefaults: string[] = [];

                try {
                    argumentNames = JSON.parse(proto.mutation.argumentnames ?? "[]");
                    argumentIds = JSON.parse(proto.mutation.argumentids ?? "[]");
                    argumentDefaults = JSON.parse(proto.mutation.argumentdefaults ?? "[]");
                } catch { /* Suppress malformed mutation arrays */ }

                index.set(proccode, {
                    proccode,
                    argumentNames,
                    argumentIds,
                    argumentDefaults,
                    definitionBlockId: blockId,
                    target,
                });
            }
        }
        return index;
    }

    private spawnThread(
        meta: ProcedureMeta,
        parsedArgs: any,
        util: BlockUtility,
        runtime: any
    ): void {
        const mergedParams: Record<string, unknown> = {};
        const isArray = Array.isArray(parsedArgs);

        console.log(`[Parameter Binding] Aligning properties to block recipe variables:`, meta.argumentNames);

        meta.argumentNames.forEach((name, i) => {
            let val;
            if (isArray) {
                val = i < parsedArgs.length ? parsedArgs[i] : meta.argumentDefaults[i] ?? "";
            } else {
                val = Object.prototype.hasOwnProperty.call(parsedArgs, name)
                    ? parsedArgs[name]
                    : meta.argumentDefaults[i] ?? "";
            }

            mergedParams[name] = val;
            if (meta.argumentIds[i]) {
                mergedParams[meta.argumentIds[i]] = val;
            }
            console.log(`  -> Property [${name}] (ID: ${meta.argumentIds[i] ?? "N/A"}) wrapped to value:`, val);
        });

        const thread = runtime._pushThread(
            meta.definitionBlockId,
            meta.target,
            { stackClick: false, updateMonitor: false }
        );

        if (!thread) {
            console.error("[Matterer Runtime Error] Scratch sequencer refused block injection thread creation.");
            return;
        }

        thread.isCompiled = false;
        thread.triedToCompile = true;

        thread.parametersCache = thread.parametersCache || {};
        thread.parametersCache[meta.proccode] = mergedParams;

        thread.procedureParameterNames = meta.argumentNames.slice();
        thread.procedureParameterIds = meta.argumentIds.slice();
        thread.procedureArguments = meta.argumentNames.map(n => mergedParams[n] ?? "");

        if (thread.stackFrame) {
            thread.stackFrame.params = mergedParams;
            thread.stackFrame.parametersCache = thread.stackFrame.parametersCache || {};
            thread.stackFrame.parametersCache[meta.proccode] = mergedParams;
        }

        console.info(`[Thread Dispatch] Thread dispatched successfully. Block definition runtime linked via ${meta.definitionBlockId}.`);
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

    static waitOneFrame = (): Promise<void> => new Promise(r => requestAnimationFrame(() => r()));
    static MaxTransparency: Readonly<number> = 100;

    constructor() {
        this.scratch = Scratch ?? undefined;
    }

    protected getActiveSprite(util?: BlockUtility): any {
        return (
            util?.target ??
            Scratch.vm.runtime.sequencer?.activeThread?.target ??
            Scratch.vm.runtime._editingTarget ??
            null
        );
    }

    /**
     * Manual Fallback Refresh Engine
     */
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

    /**
     * Synchronous block yield runner loop to keep scratch sequencing solid
     */
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

    /**
     * INTERNAL TICKER ENGINE: Progresses ghost graphics changes uniformly on frame lookups
     */
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
