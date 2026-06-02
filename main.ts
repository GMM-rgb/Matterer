// ============================================================
//  Matterer Defines — TurboWarp Extension
//  Uses the VM's own sequencer/thread system for execution.
//  Custom block args are injected via a parametersCache patch
//  that fires synchronously before the first step of the thread.
// ============================================================

type AnimationStyles = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";

const ValidScratchTypeDefinitions: Readonly<string[]> = [
    "string", "number", "boolean", "object",
];

// ── Compact menu label ────────────────────────────────────────
const MAX_LABEL_LEN = 36;
function truncateLabel(text: string, max = MAX_LABEL_LEN): string {
    return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

// ── normalizeBlockName ────────────────────────────────────────
function normalizeBlockName(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        const o = value as Record<string, unknown>;
        return String(o.value ?? o.text ?? o.proccode ?? o.blockName ?? "");
    }
    return String(value ?? "");
}

// ── Simple debounce ───────────────────────────────────────────
function debounce(fn: () => void, ms: number): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(); }, ms);
    };
}

// ── Types ─────────────────────────────────────────────────────

type MenuItem = { text: string; value: string };

type ProcedureMeta = {
    proccode: string;
    argumentNames: string[];
    argumentIds: string[];
    argumentDefaults: string[];
    definitionBlockId: string;
    target: any;
};

// ── MattererBundleExecutor ────────────────────────────────────
//
// Menu strategy:
//   cachedItems holds the last-known list. VM events trigger a
//   debounced silent rebuild of that cache — NO workspace refresh,
//   NO Blockly re-render. Blockly re-queries getMenuItems() on its
//   own when the user opens a dropdown, and at that point it gets
//   the already-up-to-date cache.
//
//   refreshWorkspace() / emitWorkspaceUpdate() are ONLY called from
//   the manual "Refresh" button — they are far too destructive to
//   call automatically (they reset drag state, context menus, etc.).
//
// Execution strategy:
//   _pushThread() lets the VM sequencer run the block natively.
//   We only inject params into the thread's parametersCache before
//   the first step so argument_reporter blocks resolve correctly.

class MattererBundleExecutor {
    // The stable list returned to Blockly on every getMenuItems() call.
    // Only ever replaced atomically by rebuildCache() — never mutated.
    private cachedItems: MenuItem[] = [{ text: "(loading…)", value: "" }];
    private rebuilding = false;

    constructor(private readonly getRuntime: () => any) {}

    // ── Auto-refresh wiring ───────────────────────────────────

    /**
     * Wires VM events to a debounced silent cache rebuild.
     * NO workspace refresh is triggered — Blockly queries getMenuItems()
     * on its own when the user opens the dropdown.
     */
    public installAutoRefresh(): void {
        const vm: any      = Scratch?.vm;
        const runtime: any = this.getRuntime();
        if (!vm || !runtime) return;

        // Debounced so rapid edits (typing a block name) collapse into one rebuild.
        const scheduleRebuild = debounce(() => this.rebuildCache(), 250);

        vm.on?.("workspaceUpdate",     scheduleRebuild);
        vm.on?.("targetsUpdate",       scheduleRebuild);
        runtime.on?.("PROJECT_LOADED", scheduleRebuild);
        runtime.on?.("TARGETS_UPDATE", scheduleRebuild);

        // Hook block containers for drag-end mutations
        const attachBlockListeners = () => {
            for (const target of (runtime.targets ?? [])) {
                const bc = target.blocks;
                if (!bc || bc.__mattererHooked) continue;
                bc.__mattererHooked = true;
                bc.on?.("BLOCK_DRAG_END", scheduleRebuild);
            }
        };
        runtime.on?.("TARGETS_UPDATE", attachBlockListeners);
        attachBlockListeners();

        // Populate immediately so first dropdown open isn't empty
        this.rebuildCache();

        console.debug("[Matterer] Auto-refresh installed (silent mode)");
    }

    // ── Cache rebuild ─────────────────────────────────────────

    /**
     * Scans the VM and atomically replaces cachedItems.
     * Silent — does NOT touch the Blockly workspace at all.
     */
    private rebuildCache(): void {
        if (this.rebuilding) return;
        this.rebuilding = true;
        try {
            const runtime: any = this.getRuntime();
            if (!runtime?.targets) return;

            const index = this.buildProcedureIndex(runtime);

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

            // Atomic replace — a reference swap, never an in-place mutation
            this.cachedItems = items.length
                ? items
                : [{ text: "(no custom blocks yet)", value: "" }];

            console.debug("[Matterer] Cache rebuilt:", this.cachedItems.length, "items");
        } finally {
            this.rebuilding = false;
        }
    }

    // ── getMenuItems ──────────────────────────────────────────

    /**
     * Returns the stable cached list. Blockly calls this multiple
     * times per dropdown interaction (open, hover, select, validate).
     * Returning the same reference every time is what keeps selections
     * from being invalidated mid-interaction.
     */
    public getMenuItems(): MenuItem[] {
        return this.cachedItems;
    }

    /** Force an immediate synchronous rebuild. Used by the manual refresh button. */
    public forceRebuild(): void {
        this.rebuildCache();
    }

    // ── Template reporter ─────────────────────────────────────

    public getTemplate(blockName: string): string {
        blockName = normalizeBlockName(blockName);
        const runtime: any = this.getRuntime();
        if (!runtime?.targets) return "NO PARAMETERS";

        const meta = this.buildProcedureIndex(runtime).get(blockName);
        if (!meta || meta.argumentNames.length === 0) return "NO PARAMETERS";

        const tpl: Record<string, unknown> = {};
        meta.argumentNames.forEach((name, i) => { tpl[name] = meta.argumentDefaults[i] ?? ""; });
        return JSON.stringify(tpl);
    }

    // ── Core execute ──────────────────────────────────────────

    public execute(blockNameRaw: string, paramsJson: string, util: BlockUtility): void {
        const blockName = normalizeBlockName(blockNameRaw);
        if (!blockName.trim()) {
            console.warn("[Matterer] No block name provided");
            return;
        }

        console.log("[Matterer] execute()", { blockName, paramsJson });

        let rawArgs: Record<string, unknown> = {};
        const trimmed = paramsJson?.trim();
        if (trimmed && trimmed !== "{}") {
            try {
                rawArgs = JSON.parse(trimmed) as Record<string, unknown>;
            } catch {
                console.error("[Matterer] Invalid JSON:", paramsJson);
                return;
            }
        }

        const runtime: any = (util as any).runtime ?? this.getRuntime();
        const index  = this.buildProcedureIndex(runtime);
        const meta   = index.get(blockName);

        if (!meta) {
            console.warn(`[Matterer] No definition found for: "${blockName}"`);
            console.log("[Matterer] known:", [...index.keys()]);
            return;
        }

        this.spawnThread(meta, rawArgs, util, runtime);
    }

    // ── Procedure index builder ───────────────────────────────

    private buildProcedureIndex(runtime: any): Map<string, ProcedureMeta> {
        const index = new Map<string, ProcedureMeta>();
        if (!runtime?.targets) return index;

        for (const target of runtime.targets) {
            const blocks: Record<string, any> = target.blocks?._blocks;
            if (!blocks) continue;

            for (const [blockId, block] of Object.entries(blocks) as [string, any][]) {
                if (block?.opcode !== "procedures_definition") continue;

                const protoId = this.resolveProtoId(block.inputs?.custom_block, blocks);
                if (!protoId) continue;

                const proto = blocks[protoId];
                if (!proto || proto.opcode !== "procedures_prototype") continue;

                const proccode: string | undefined = proto.mutation?.proccode;
                if (!proccode) continue;

                let argumentNames:    string[] = [];
                let argumentIds:      string[] = [];
                let argumentDefaults: string[] = [];

                try {
                    argumentNames    = JSON.parse(proto.mutation.argumentnames    ?? "[]");
                    argumentIds      = JSON.parse(proto.mutation.argumentids      ?? "[]");
                    argumentDefaults = JSON.parse(proto.mutation.argumentdefaults ?? "[]");
                } catch { /* malformed mutation */ }

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

    // ── Thread spawning ───────────────────────────────────────

    private spawnThread(
        meta: ProcedureMeta,
        rawArgs: Record<string, unknown>,
        util: BlockUtility,
        runtime: any
    ): void {
        const merged = this.buildParams(meta, rawArgs);

        console.log("[Matterer] spawning thread for:", meta.proccode);
        console.log("[Matterer] merged params:", merged);

        const thread: any = runtime._pushThread(
            meta.definitionBlockId,
            meta.target,
            { stackClick: false, updateMonitor: false }
        );

        if (!thread) {
            console.error("[Matterer] _pushThread returned null");
            return;
        }

        // Stay in interpreter mode — JIT bypasses our params injection.
        thread.isCompiled     = false;
        thread.triedToCompile = true;

        // Seed params on the thread (modern TW — keyed by proccode).
        thread.parametersCache = thread.parametersCache ?? {};
        thread.parametersCache[meta.proccode] = merged;

        // Legacy fields for older TW builds.
        thread.procedureParameterNames = meta.argumentNames.slice();
        thread.procedureParameterIds   = meta.argumentIds.slice();
        thread.procedureArguments      = meta.argumentNames.map(n => merged[n] ?? "");

        // Seed all existing stack frames.
        this.seedFrames(thread, meta, merged);

        // Hook pushStack so frames created during execution are seeded too.
        const origPushStack = thread.pushStack?.bind(thread);
        if (origPushStack) {
            thread.pushStack = (blockId: string) => {
                origPushStack(blockId);
                this.seedFrames(thread, meta, merged);
            };
        }
    }

    private seedFrames(
        thread: any,
        meta: ProcedureMeta,
        merged: Record<string, unknown>
    ): void {
        const seen   = new Set<any>();
        const frames: any[] = [];

        if (Array.isArray(thread.stackFrames)) {
            for (const f of thread.stackFrames) {
                if (f && !seen.has(f)) { seen.add(f); frames.push(f); }
            }
        }
        if (thread.stackFrame && !seen.has(thread.stackFrame)) {
            seen.add(thread.stackFrame); frames.push(thread.stackFrame);
        }
        if (thread.compatibilityStackFrame && !seen.has(thread.compatibilityStackFrame)) {
            seen.add(thread.compatibilityStackFrame); frames.push(thread.compatibilityStackFrame);
        }

        for (const frame of frames) {
            if (!frame) continue;
            frame.parametersCache = frame.parametersCache ?? {};
            frame.parametersCache[meta.proccode] = merged;
            frame.params                  = merged;
            frame.parameters              = merged;
            frame.procedureParameterNames = meta.argumentNames.slice();
            frame.procedureParameterIds   = meta.argumentIds.slice();
            frame.procedureArguments      = meta.argumentNames.map(n => merged[n] ?? "");
            frame.reported                = null;
            frame.reporting               = "";
        }
    }

    // ── Param builder ─────────────────────────────────────────

    private buildParams(
        meta: ProcedureMeta,
        args: Record<string, unknown>
    ): Record<string, unknown> {
        const positional = Object.values(args);
        const out: Record<string, unknown> = {};

        meta.argumentNames.forEach((name, i) => {
            const raw =
                Object.prototype.hasOwnProperty.call(args, name)
                    ? args[name]
                    : i < positional.length
                        ? positional[i]
                        : (meta.argumentDefaults[i] ?? "");

            const value = raw === undefined || raw === null ? "" : raw;
            out[name]      = value;
            out[String(i)] = value;
            if (meta.argumentIds[i]) out[meta.argumentIds[i]] = value;
        });

        return out;
    }

    // ── Helpers ───────────────────────────────────────────────

    private resolveProtoId(input: any, blocks: Record<string, any>): string | null {
        if (!input) return null;
        if (Array.isArray(input)) {
            const a = input[1]; if (typeof a === "string" && blocks[a]) return a;
            const b = input[2]; if (typeof b === "string" && blocks[b]) return b;
            return null;
        }
        if (input.block  && blocks[input.block])  return input.block;
        if (input.shadow && blocks[input.shadow]) return input.shadow;
        return null;
    }
}

// ── Matterer ──────────────────────────────────────────────────

class Matterer {
    public executor = new MattererBundleExecutor(() => Scratch?.vm?.runtime);
    public scratch: typeof Scratch;

    static waitOneFrame     = (): Promise<void> => new Promise(r => requestAnimationFrame(() => r()));
    static MaxTransparency: Readonly<number> = 100;

    constructor() {
        this.scratch = Scratch ?? undefined;
    }

    protected getActiveSprite(util?: BlockUtility): VM.RenderedTarget | null {
        return (
            util?.target ??
            Scratch.vm.runtime.sequencer?.activeThread?.target ??
            Scratch.vm.runtime._editingTarget ??
            null
        );
    }

    // ── Custom block executor ─────────────────────────────────

    /**
     * Manual refresh button handler.
     * Does a forced rebuild then a workspace refresh.
     * This is the ONLY place we call refreshWorkspace() — calling it
     * automatically on VM events breaks drag state and context menus.
     */
    public refreshCustomBlockMenu(): void {
        this.executor.forceRebuild();
        try {
            const vm: any = Scratch.vm;
            vm?.refreshWorkspace?.();
            if (vm?.emitWorkspaceUpdate) vm.emitWorkspaceUpdate();
        } catch (e) {
            console.error("[Matterer] Manual workspace refresh failed:", e);
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

    // ── Type utils ────────────────────────────────────────────

    public ValidateInputType(
        { VALUE, TYPE_DEFINITION }: { VALUE: string; TYPE_DEFINITION: string }
    ): boolean {
        const type   = TYPE_DEFINITION.toLowerCase();
        const forced = String(VALUE);

        if (!ValidScratchTypeDefinitions.includes(type)) return false;

        switch (type) {
            case "boolean": { const v = forced.toLowerCase().trim(); return v === "true" || v === "false"; }
            case "number":  return !isNaN(parseFloat(forced)) && isFinite(Number(forced));
            case "string":  return true;
            case "object":  try { const p = JSON.parse(forced); return typeof p === "object" && p !== null; } catch { return false; }
            default:        return false;
        }
    }

    public NewBoolean({ BOOL_VALUE }: { BOOL_VALUE: string }): boolean {
        return String(BOOL_VALUE ?? "").toLowerCase().trim() === "true";
    }

    // ── Visual sensing ────────────────────────────────────────

    public FetchVisibilityState(_: {}, util: BlockUtility): boolean {
        return this.getActiveSprite(util)?.visible ?? false;
    }

    // ── Animation ─────────────────────────────────────────────

    private __animating: Set<string> = new Set();

    public async FadeTransparency(
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
    ): Promise<void> {
        const easings: Record<AnimationStyles, (t: number) => number> = {
            linear:    t => t,
            easeIn:    t => t * t,
            easeOut:   t => t * (2 - t),
            easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            bounce:    t => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
        };

        if (
            TARGET_TRANSPARENCY == null ||
            TARGET_TRANSPARENCY < 0 ||
            TARGET_TRANSPARENCY > Matterer.MaxTransparency
        ) return;

        const sprite   = this.getActiveSprite(util);
        const spriteId = sprite?.id ?? null;
        if (!spriteId || !sprite) return;

        const runtime: any = (util as any).runtime ?? null;
        if (!runtime) throw new Error("[Matterer] Runtime unavailable");

        const start = sprite.effects.ghost ?? 0;
        const end   = ANIMATION_DIRECTION === "IN" ? 0 : TARGET_TRANSPARENCY;
        const steps = Math.ceil(TARGET_TRANSPARENCY * runtime.frameLoop.framerate);

        try {
            this.__animating.add(spriteId);
            runtime.startHats("matterer_TrackAnimationStartTrigger");

            for (let i = 0; i < steps; i++) {
                const eased = easings[ANIMATION_STYLE](i / steps);
                sprite.setEffect(VM.Effect.Ghost, start + (end - start) * eased);
                await Matterer.waitOneFrame();
            }
            sprite.setEffect(VM.Effect.Ghost, end);
        } catch (err) {
            if (err != null) console.error("[Matterer] FadeTransparency:", String(err));
        } finally {
            this.__animating.delete(spriteId);
            runtime.startHats("matterer_TrackAnimationEndTrigger");
        }
    }

    public async TrackAnimationStartTrigger(_: {}, _u: BlockUtility): Promise<boolean> {
        await Matterer.waitOneFrame(); return true;
    }

    public async TrackAnimationEndTrigger(_: {}, _u: BlockUtility): Promise<boolean> {
        await Matterer.waitOneFrame(); return true;
    }

    public CheckIsAnimatingProperty(
        { REQUESTED_ANIMATING_STATE_TYPE }: { REQUESTED_ANIMATING_STATE_TYPE: "animating" | "not animating" },
        util: BlockUtility
    ): boolean {
        const sprite = this.getActiveSprite(util);
        if (!sprite) return false;
        const is = this.__animating.has(sprite.id);
        return REQUESTED_ANIMATING_STATE_TYPE === "animating" ? is : !is;
    }

    public LoopUntilAnimationFinished(
        { INCLUDES_SCREEN_REFRESH }: { INCLUDES_SCREEN_REFRESH: boolean },
        util: BlockUtility
    ): void {
        const sprite = this.getActiveSprite(util);
        if (!sprite) return;
        if (this.__animating.has(sprite.id)) {
            (async () => {
                await Matterer.waitOneFrame();
                util.startBranch(1, INCLUDES_SCREEN_REFRESH);
            })();
        }
    }

    public async ToggleCurrentRunningAnimation(
        _: { ANIMATION_TOGGLE_STATE: "STOP" | "PAUSE" | "RESUME" },
        _u: BlockUtility
    ): Promise<void> {
        await Matterer.waitOneFrame(); // stub
    }
}

// ── MattererDefinitions ───────────────────────────────────────

class MattererDefinitions extends Matterer implements Scratch.Extension {
    constructor() {
        super();

        if (this.scratch.extensions.unsandboxed) {
            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);

            // Silent auto-refresh: VM events → debounced cache rebuild only.
            // No workspace refresh, no Blockly re-render — those destroy GUI state.
            // Blockly re-queries getMenuItems() on its own when the user opens
            // a dropdown, at which point the cache is already up to date.
            this.executor.installAutoRefresh();
        } else {
            console.warn("[Matterer] Not unsandboxed — VM interaction may be limited.");
        }
    }

    getInfo(): Scratch.Info {
        return {
            id:     "matterer",
            name:   "Matterer Defines",
            color1: "#f542b0",
            color2: "#c41681",
            color3: "#a500a2",
            blocks: [
                {
                    blockType: Scratch.BlockType.BUTTON,
                    func:      "e",
                    text:      "🔄️ Reset Default Values",
                },
                "---",
                { blockType: Scratch.BlockType.LABEL, text: "General Utilities" },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode:    "ValidateInputType",
                    text:      "is [VALUE] an [TYPE_DEFINITION] ?",
                    arguments: {
                        VALUE:           { type: Scratch.ArgumentType.STRING, defaultValue: "Hello Scratch! :D" },
                        TYPE_DEFINITION: { type: Scratch.ArgumentType.STRING, menu: "typeDefinitionMenu", defaultValue: "string" },
                    },
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode:    "NewBoolean",
                    text:      "new bool from [BOOL_VALUE]",
                    arguments: {
                        BOOL_VALUE: { type: Scratch.ArgumentType.STRING, menu: "BooleanPickerMenu", defaultValue: "TRUE" },
                    },
                },
                "---",
                { blockType: Scratch.BlockType.LABEL, text: "Animation Utilities" },
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode:    "FadeTransparency",
                    text:      "animate transparency to [TARGET_TRANSPARENCY] [ANIMATION_DIRECTION] with [ANIMATION_STYLE]",
                    arguments: {
                        TARGET_TRANSPARENCY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                        ANIMATION_DIRECTION: { type: Scratch.ArgumentType.STRING, menu: "AnimationDirectionChoice", defaultValue: "IN" },
                        ANIMATION_STYLE:     { type: Scratch.ArgumentType.STRING, menu: "AnimationStyleChoice",    defaultValue: "linear" },
                    },
                },
                {
                    blockType:   Scratch.BlockType.LOOP,
                    branchCount: 1,
                    opcode:      "LoopUntilAnimationFinished",
                    text:        "while animating (refresh [INCLUDES_SCREEN_REFRESH]) do",
                    arguments: {
                        INCLUDES_SCREEN_REFRESH: { type: Scratch.ArgumentType.BOOLEAN },
                    },
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode:    "CheckIsAnimatingProperty",
                    text:      "is [REQUESTED_ANIMATING_STATE_TYPE]?",
                    arguments: {
                        REQUESTED_ANIMATING_STATE_TYPE: { type: Scratch.ArgumentType.STRING, menu: "AnimatingStateTypeRequestMenu", defaultValue: "animating" },
                    },
                },
                "---",
                { blockType: Scratch.BlockType.LABEL, text: "Animation Events" },
                {
                    blockType: Scratch.BlockType.HAT,
                    opcode:    "TrackAnimationStartTrigger",
                    text:      "when animating STARTS",
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
                    arguments: {},
                },
                {
                    blockType: Scratch.BlockType.HAT,
                    opcode:    "TrackAnimationEndTrigger",
                    text:      "when animating ENDS",
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
                    arguments: {},
                },
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode:    "ToggleCurrentRunningAnimation",
                    text:      "[ANIMATION_TOGGLE_STATE] current animation",
                    arguments: {
                        ANIMATION_TOGGLE_STATE: { type: Scratch.ArgumentType.STRING, menu: "AnimationControlStateMenu", defaultValue: "STOP" },
                    },
                },
                "---",
                { blockType: Scratch.BlockType.LABEL, text: "Visual Sensing" },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode:    "FetchVisibilityState",
                    text:      "sprite currently visible",
                    arguments: {},
                },
                "---",
                { blockType: Scratch.BlockType.LABEL, text: "Custom Block Executor" },
                {
                    blockType: Scratch.BlockType.BUTTON,
                    text:      "🔄 Refresh My Blocks List",
                    func:      "refreshCustomBlockMenu",
                },
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode:    "ExecuteMyBlock",
                    text:      "execute [BLOCK_NAME] with [PARAMS_JSON]",
                    arguments: {
                        BLOCK_NAME:  { type: Scratch.ArgumentType.STRING, menu: "customBlockMenu", defaultValue: "" },
                        PARAMS_JSON: { type: Scratch.ArgumentType.STRING, defaultValue: "{}" },
                    },
                },
                {
                    blockType: Scratch.BlockType.REPORTER,
                    opcode:    "GetBlockParamTemplate",
                    text:      "param template for [BLOCK_NAME]",
                    arguments: {
                        BLOCK_NAME: { type: Scratch.ArgumentType.STRING, menu: "customBlockMenu", defaultValue: "" },
                    },
                },
            ],
            menus: {
                typeDefinitionMenu:            { items: ["string", "number", "boolean", "object"],                      acceptReporters: true  },
                BooleanPickerMenu:             { items: ["TRUE", "FALSE"],                                              acceptReporters: true  },
                AnimationDirectionChoice:      { items: ["IN", "OUT"],                                                  acceptReporters: true  },
                AnimationStyleChoice:          { items: ["linear", "easeIn", "easeOut", "easeInOut", "bounce"],         acceptReporters: false },
                AnimatingStateTypeRequestMenu: { items: ["animating", "not animating"],                                 acceptReporters: true  },
                AnimationControlStateMenu:     { items: ["STOP", "PAUSE", "RESUME"],                                    acceptReporters: false },
                customBlockMenu:               { acceptReporters: true, items: "getCustomBlockMenuItems" },
            },
        };
    }
}

Scratch.extensions.register(new MattererDefinitions());
