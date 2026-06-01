type AnimationStyles = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";
const ValidScratchTypeDefinitions: Readonly<string[]> = ['string', 'number', 'boolean', 'object'];

type MenuItem = {
    text: string;
    value: string;
};

type ProcedureMeta = {
    proccode: string;
    argumentNames: string[];
    argumentIds: string[];
    argumentDefaults: string[];
    definitionBlockId: string;
    target: any;
};

type ExecutionContext = {
    runtime: any;
    target: any;
    blocks: Record<string, any>;
    params: Record<string, unknown>;
    cursor: string | null;
    trace: string[];
    callStack: string[];
};

type CompiledProcedure = {
    meta: ProcedureMeta;
    run: (args: Record<string, unknown>, util: BlockUtility) => void;
};

class MattererBundleExecutor {
    private procedureIndex = new Map<string, ProcedureMeta>();
    private compiled = new Map<string, CompiledProcedure>();
    private cachedMenuItems: MenuItem[] = [];
    private menuCacheDirty = true;
    private currentCursor: string | null = null;

    constructor(private readonly getRuntime: () => any) { }

    public refresh(): void {
        this.menuCacheDirty = true;
        this.cachedMenuItems = [];
        this.procedureIndex.clear();
        this.compiled.clear();
        this.scanCustomBlocks();
    }

    public getCursor(): string | null {
        return this.currentCursor;
    }

    public scanCustomBlocks(): void {
        const runtime: any = this.getRuntime();
        if (!runtime?.targets) return;

        this.procedureIndex.clear();

        for (const target of runtime.targets) {
            const blocks = target.blocks?._blocks;
            if (!blocks) continue;

            for (const [blockId, block] of Object.entries(blocks) as [string, any][]) {
                if (block?.opcode !== "procedures_definition") continue;

                const customBlockInput = block.inputs?.custom_block;
                let protoId: string | null = null;

                if (customBlockInput?.block) {
                    protoId = customBlockInput.block;
                } else if (Array.isArray(customBlockInput) && customBlockInput.length > 1) {
                    protoId = customBlockInput[1];
                }

                if (!protoId) continue;

                const proto = blocks[protoId];
                if (!proto || proto.opcode !== "procedures_prototype") continue;

                const proccode: string | undefined = proto.mutation?.proccode;
                if (!proccode) continue;

                let argumentNames: string[] = [];
                let argumentIds: string[] = [];
                let argumentDefaults: string[] = [];

                try {
                    argumentNames = JSON.parse(proto.mutation.argumentnames ?? "[]");
                    argumentIds = JSON.parse(proto.mutation.argumentids ?? "[]");
                    argumentDefaults = JSON.parse(proto.mutation.argumentdefaults ?? "[]");
                } catch { }

                this.procedureIndex.set(proccode, {
                    proccode,
                    argumentNames,
                    argumentIds,
                    argumentDefaults,
                    definitionBlockId: blockId,
                    target
                });
            }
        }
    }

    public getMenuItems(): MenuItem[] {
        const runtime: any = this.getRuntime();
        if (!runtime?.targets) return [{ text: "(runtime not ready)", value: "" }];

        if (!this.menuCacheDirty && this.cachedMenuItems.length) {
            return this.cachedMenuItems;
        }

        this.scanCustomBlocks();

        const items = Array.from(this.procedureIndex.values())
            .sort((a, b) => a.proccode.localeCompare(b.proccode))
            .map((meta) => {
                let argIndex = 0;

                const text = meta.proccode.replace(/%[sbn]/g, match => {
                    const name = meta.argumentNames[argIndex++] ?? "?";
                    if (match === "%b") return `<${name}>`;
                    if (match === "%n") return `(${name})`;
                    return `[${name}]`;
                });

                return { text, value: meta.proccode };
            });

        this.cachedMenuItems = items.length ? items : [{ text: "(no custom blocks yet)", value: "" }];
        this.menuCacheDirty = false;
        return this.cachedMenuItems;
    }

    public getTemplate(blockName: string): string {
        blockName = this.normalizeBlockName(blockName);
        this.scanCustomBlocks();

        const meta = this.procedureIndex.get(blockName);
        if (!meta || meta.argumentNames.length === 0) return "NO PARAMETERS";

        const template: Record<string, unknown> = {};
        meta.argumentNames.forEach((name, i) => {
            template[name] = meta.argumentDefaults[i] ?? "";
        });

        return JSON.stringify(template);
    }

    public execute(blockNameRaw: string, paramsJson: string, util: BlockUtility): void {
        const blockName = this.normalizeBlockName(blockNameRaw);
        if (!blockName.trim()) {
            console.warn("[Matterer] No block name provided");
            return;
        }

        console.log("[Matterer] execute()");
        console.log("[Matterer] blockNameRaw =", blockNameRaw);
        console.log("[Matterer] paramsJson =", paramsJson);
        console.log("[Matterer] normalized =", blockName);
        
        let rawArgs: Record<string, unknown> = {};
        if (paramsJson?.trim() && paramsJson.trim() !== "{}") {
            try {
                rawArgs = JSON.parse(paramsJson) as Record<string, unknown>;
            } catch {
                console.error("[Matterer] Invalid JSON:", paramsJson);
                return;
            }
        }

        this.scanCustomBlocks();

        console.log(
            "[Matterer] known procedures:",
            [...this.procedureIndex.keys()]
        );

        const meta = this.procedureIndex.get(blockName);
        if (!meta) {
            console.warn(`[Matterer] No definition block found for proccode: "${blockName}"`);
            return;
        }

        let compiled = this.compiled.get(meta.proccode);
        if (!compiled) {
            compiled = this.compile(meta);
            this.compiled.set(meta.proccode, compiled);
        }

        compiled.run(rawArgs, util);
    }

    private compile(meta: ProcedureMeta): CompiledProcedure {
        console.groupCollapsed("[Matterer] COMPILING...");
        console.log("[Matterer] compiling:\t" + meta.proccode);
        const run = (args: Record<string, unknown>, util: BlockUtility) => {
            const runtime: any = this.getRuntime();
            const blocks = meta.target?.blocks?._blocks as Record<string, any>;
            if (!blocks) {
                console.warn("[Matterer] Missing block container");
                return;
            }

            const params = this.buildParamValues(meta, args);

            const ctx: ExecutionContext = {
                runtime,
                target: meta.target,
                blocks,
                params,
                cursor: null,
                trace: [],
                callStack: []
            };

            const startBlockId = this.getFirstBodyBlockId(meta, blocks);

            if (!startBlockId) {
                console.warn("[Matterer] No executable body found");
                return;
            }

            this.runChain(startBlockId, ctx, util);
        };

        return { meta, run };
    }

    private runChain(startBlockId: string, ctx: ExecutionContext, util: BlockUtility): void {
        console.log("[Matterer] starting chain", startBlockId);
        
        let current: string | null = startBlockId;
        
        while (current) {
            const block: any = ctx.blocks[current];
            if (!block) break;

            ctx.cursor = current;
            this.currentCursor = current;
            ctx.trace.push(current);

            if (ctx.trace.length > 1000) {
                throw new Error("[Matterer] Maximum execution depth exceeded");
            }

            const next = this.runBlock(block, ctx, util);
            current = (typeof next === "string" && next.length > 0)
                ? next
                : (block.next ?? null);
        }
    }

    private runBlock(block: any, ctx: ExecutionContext, util: BlockUtility): unknown {
        switch (block.opcode) {
            case "control_repeat": {
                const times = Math.max(
                    0,
                    Math.floor(Number(this.evalInput(block.inputs?.TIMES, ctx, util) ?? 0))
                );

                const body = this.getSubstackId(block, "SUBSTACK", ctx);
                for (let i = 0; i < times; i++) {
                    if (body) this.runChain(body, ctx, util);
                }
                return null;
            }

            case "control_if": {
                const cond = Boolean(this.evalInput(block.inputs?.CONDITION, ctx, util));
                if (cond) {
                    const body = this.getSubstackId(block, "SUBSTACK", ctx);
                    if (body) this.runChain(body, ctx, util);
                }
                return null;
            }

            case "control_if_else": {
                const cond = Boolean(this.evalInput(block.inputs?.CONDITION, ctx, util));
                const body = cond
                    ? this.getSubstackId(block, "SUBSTACK", ctx)
                    : this.getSubstackId(block, "SUBSTACK2", ctx);

                if (body) this.runChain(body, ctx, util);
                return null;
            }

            case "procedures_call": {
                const proccode = block.mutation?.proccode;
                if (!proccode) return null;

                const childMeta = this.procedureIndex.get(proccode);
                if (!childMeta) return null;

                if (ctx.callStack.includes(proccode)) {
                    throw new Error(
                        `[Matterer] Recursive call detected: ${proccode}`
                    );
                }

                const childArgs: Record<string, unknown> = {};
                childMeta.argumentNames.forEach((name, i) => {
                    const id = childMeta.argumentIds[i];
                    const input =
                        (id && block.inputs?.[id]) ??
                        block.inputs?.[name] ??
                        null;

                    childArgs[name] = this.evalInput(input, ctx, util);
                });

                this.execute(proccode, JSON.stringify(childArgs), util);
                return null;
            }

            case "argument_reporter_string_number":
            case "argument_reporter_boolean": {
                const name =
                    block?.fields?.VALUE?.value ??
                    block?.fields?.VALUE?.[0] ??
                    "";

                return ctx.params[name] ?? "";
            }

            case "operator_add":
                return Number(this.evalInput(block.inputs?.NUM1, ctx, util) ?? 0) +
                    Number(this.evalInput(block.inputs?.NUM2, ctx, util) ?? 0);

            case "operator_subtract":
                return Number(this.evalInput(block.inputs?.NUM1, ctx, util) ?? 0) -
                    Number(this.evalInput(block.inputs?.NUM2, ctx, util) ?? 0);

            case "operator_multiply":
                return Number(this.evalInput(block.inputs?.NUM1, ctx, util) ?? 0) *
                    Number(this.evalInput(block.inputs?.NUM2, ctx, util) ?? 0);

            case "operator_divide":
                return Number(this.evalInput(block.inputs?.NUM1, ctx, util) ?? 0) /
                    Number(this.evalInput(block.inputs?.NUM2, ctx, util) ?? 1);

            case "operator_equals":
                return this.evalInput(block.inputs?.OPERAND1, ctx, util) ===
                    this.evalInput(block.inputs?.OPERAND2, ctx, util);

            case "operator_gt":
                return Number(this.evalInput(block.inputs?.OPERAND1, ctx, util) ?? 0) >
                    Number(this.evalInput(block.inputs?.OPERAND2, ctx, util) ?? 0);

            case "operator_lt":
                return Number(this.evalInput(block.inputs?.OPERAND1, ctx, util) ?? 0) <
                    Number(this.evalInput(block.inputs?.OPERAND2, ctx, util) ?? 0);

            case "operator_and":
                return Boolean(this.evalInput(block.inputs?.OPERAND1, ctx, util)) &&
                    Boolean(this.evalInput(block.inputs?.OPERAND2, ctx, util));

            case "operator_or":
                return Boolean(this.evalInput(block.inputs?.OPERAND1, ctx, util)) ||
                    Boolean(this.evalInput(block.inputs?.OPERAND2, ctx, util));

            case "operator_not":
                return !Boolean(this.evalInput(block.inputs?.OPERAND, ctx, util));

            case "operator_join":
                return String(this.evalInput(block.inputs?.STRING1, ctx, util) ?? "") +
                    String(this.evalInput(block.inputs?.STRING2, ctx, util) ?? "");

            case "operator_mod":
                return Number(this.evalInput(block.inputs?.NUM1, ctx, util) ?? 0) %
                    Number(this.evalInput(block.inputs?.NUM2, ctx, util) ?? 1);

            case "operator_round":
                return Math.round(Number(this.evalInput(block.inputs?.NUM, ctx, util) ?? 0));

            case "math_number":
                return Number(block.fields?.NUM?.value ?? 0);

            case "text":
                return String(block.fields?.TEXT?.value ?? "");

            case "looks_say":
                console.log("[Matterer says]", this.evalInput(block.inputs?.MESSAGE, ctx, util));
                return null;

            default:
                return null;
        }
    }

    private evalInput(input: any, ctx: ExecutionContext, util: BlockUtility): unknown {
        if (!input) return "";

        const blockId = input.block ?? input.shadow ?? null;
        if (blockId && ctx.blocks[blockId]) {
            return this.evalReporter(ctx.blocks[blockId], ctx, util);
        }

        if (input.name && ctx.blocks[input.name]) {
            return this.evalReporter(ctx.blocks[input.name], ctx, util);
        }

        if (input.value !== undefined) return input.value;
        return "";
    }

    private evalReporter(block: any, ctx: ExecutionContext, util: BlockUtility): unknown {
        if (!block) return "";

        switch (block.opcode) {
            case "math_number":
                return Number(block.fields?.NUM?.value ?? 0);

            case "text":
                return String(block.fields?.TEXT?.value ?? "");

            case "argument_reporter_string_number":
            case "argument_reporter_boolean": {
                const name = block?.fields?.VALUE?.value ?? "";
                return ctx.params[name] ?? "";
            }

            case "operator_add":
            case "operator_subtract":
            case "operator_multiply":
            case "operator_divide":
            case "operator_equals":
            case "operator_gt":
            case "operator_lt":
            case "operator_and":
            case "operator_or":
            case "operator_not":
            case "operator_join":
            case "operator_mod":
            case "operator_round":
                return this.runBlock(block, ctx, util);

            default:
                return block.fields?.VALUE?.value ?? "";
        }
    }

    private buildParamValues(meta: ProcedureMeta, args: Record<string, unknown>): Record<string, unknown> {
        const positionalValues = Object.values(args);
        const out: Record<string, unknown> = {};

        meta.argumentNames.forEach((name, i) => {
            const raw =
                Object.prototype.hasOwnProperty.call(args, name)
                    ? args[name]
                    : (i < positionalValues.length ? positionalValues[i] : meta.argumentDefaults[i]);

            out[name] = raw === undefined || raw === null ? "" : raw;
            if (meta.argumentIds[i]) out[meta.argumentIds[i]] = out[name];
            out[String(i)] = out[name];
        });

        return out;
    }

    private getSubstackId(block: any, inputName: string, ctx: ExecutionContext): string | null {
        const input = block.inputs?.[inputName];
        const bodyId = input?.block ?? input?.shadow ?? null;
        if (bodyId && ctx.blocks[bodyId]) return bodyId;
        return null;
    }

    private getFirstBodyBlockId(meta: ProcedureMeta, blocks: Record<string, any>): string | null {
        const def = blocks[meta.definitionBlockId];
        return def?.next ?? null;
    }

    private normalizeBlockName(value: unknown): string {
        if (typeof value === "string") return value;
        if (value && typeof value === "object") {
            const obj = value as Record<string, unknown>;
            return String(obj.value ?? obj.text ?? obj.proccode ?? obj.blockName ?? "");
        }
        return String(value ?? "");
    }
}

class Matterer {
    public executor = new MattererBundleExecutor(() => Scratch?.vm?.runtime);
    public scratch: typeof Scratch;
    static ValueTypes = [String, Boolean];
    static waitOneFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
    static MaxTransparency: Readonly<number> = 100;

    constructor() {
        this.scratch = Scratch ?? undefined;
    }

    private getActiveSprite(util?: BlockUtility): VM.RenderedTarget | null {
        return util?.target
            ?? Scratch.vm.runtime.sequencer?.activeThread?.target
            ?? Scratch.vm.runtime._editingTarget
            ?? null;
    }

    public refreshCustomBlockMenu(): void {
        this.executor.refresh();
        Scratch.vm?.refreshWorkspace?.();
    }

    public ExecuteMyBlock(
        { BLOCK_NAME, PARAMS_JSON }: { BLOCK_NAME: string; PARAMS_JSON: string },
        util: BlockUtility
    ): void {

        console.log("[Matterer] ExecuteMyBlock called");

        this.executor.execute(BLOCK_NAME, PARAMS_JSON, util);
    }

    public GetBlockParamTemplate({ BLOCK_NAME }: { BLOCK_NAME: string }): string {
        return this.executor.getTemplate(BLOCK_NAME);
    }

    public getCustomBlockMenuItems(): MenuItem[] {
        return this.executor.getMenuItems();
    }

    public ValidateInputType({ VALUE, TYPE_DEFINITION }: { VALUE: string, TYPE_DEFINITION: string }): boolean {
        const type = TYPE_DEFINITION.toLowerCase();

        if (ValidScratchTypeDefinitions.indexOf(type as any) === -1) {
            return false;
        }

        const forcedString = String(VALUE);
        const valueLower = forcedString.toLowerCase().trim();

        if (type === 'boolean') {
            return valueLower === 'true' || valueLower === 'false';
        }

        if (type === 'number') {
            return !isNaN(parseFloat(forcedString)) && isFinite(Number(forcedString));
        }

        if (type === 'string') {
            return typeof forcedString === 'string';
        }

        if (type === 'object') {
            try {
                const parsed = JSON.parse(forcedString);
                return typeof parsed === 'object' && parsed !== null;
            } catch {
                return false;
            }
        }

        return false;
    }

    public NewBoolean({ BOOL_VALUE }: { BOOL_VALUE: string }): boolean {
        function ConvertRequestedValueToString(): string {
            let Converted = null;
            if (BOOL_VALUE !== undefined && BOOL_VALUE !== null) {
                Converted = String(BOOL_VALUE).toLowerCase().trim();
            }
            return Converted !== null ? Converted : "";
        }

        function BooleanInstancer(): boolean {
            return ConvertRequestedValueToString() === 'true';
        }

        return BooleanInstancer();
    }

    public FetchVisibilityState({ }: {}, util: BlockUtility): boolean {
        const sprite = this.getActiveSprite(util);

        if (sprite === null) {
            console.warn("Sprite visibility defaulting to false!");
            return false;
        }

        return sprite.visible.valueOf();
    }

    private __currentlyAnimating: Set<string> = new Set();

    public async FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE }: { TARGET_TRANSPARENCY: number, ANIMATION_DIRECTION: "IN" | "OUT", ANIMATION_STYLE: AnimationStyles }, util: BlockUtility): Promise<void> {
        const easings = {
            linear: (t: number) => t,
            easeIn: (t: number) => t * t,
            easeOut: (t: number) => t * (2 - t),
            easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            bounce: (t: number) => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
        };

        if (TARGET_TRANSPARENCY !== null && TARGET_TRANSPARENCY >= 0 && TARGET_TRANSPARENCY <= Matterer.MaxTransparency) {
            const CurrentSprite = this.getActiveSprite(util);
            const spriteId = CurrentSprite?.id ?? null;
            if (spriteId === null) return;

            try {
                const ScratchRuntime = (util as any).runtime ?? null;
                if (ScratchRuntime === null) throw new Error("ScratchRuntime is unavailable.");

                const CalculatedGhostValueTarget = TARGET_TRANSPARENCY;
                const InitialTransparency = CurrentSprite?.effects.ghost ?? 0;
                const StartValue = InitialTransparency;
                const EndValue = ANIMATION_DIRECTION === "IN" ? 0 : CalculatedGhostValueTarget;
                const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * ScratchRuntime.frameLoop.framerate);

                this.__currentlyAnimating.add(spriteId);
                ScratchRuntime?.startHats("matterer_TrackAnimationStartTrigger") ?? void null;

                for (let CurrentTransparencyStep = 0; CurrentTransparencyStep < TransparencySteps; CurrentTransparencyStep++) {
                    const t = CurrentTransparencyStep / TransparencySteps;
                    const eased = easings[ANIMATION_STYLE](t);
                    CurrentSprite?.setEffect(VM.Effect.Ghost, StartValue + (EndValue - StartValue) * eased);
                    await Matterer.waitOneFrame();
                }

                CurrentSprite?.setEffect(VM.Effect.Ghost, EndValue);
            } catch (FadeError) {
                if (FadeError != null) console.error(new String(FadeError).trim());
            } finally {
                this.__currentlyAnimating.delete(spriteId);
                (util as any).runtime.startHats("matterer_TrackAnimationEndTrigger");
            }
        }
    }

    public async TrackAnimationStartTrigger({ }: {}, util: BlockUtility): Promise<boolean> {
        await Matterer.waitOneFrame();
        return true;
    }

    public async TrackAnimationEndTrigger({ }: {}, util: BlockUtility): Promise<boolean> {
        await Matterer.waitOneFrame();
        return true;
    }

    public CheckIsAnimatingProperty({ REQUESTED_ANIMATING_STATE_TYPE }: { REQUESTED_ANIMATING_STATE_TYPE: "animating" | "not animating" }, util: BlockUtility): boolean {
        if (REQUESTED_ANIMATING_STATE_TYPE === null) return false;

        const sprite = this.getActiveSprite(util);
        if (sprite === null) return false;

        const isAnimating = this.__currentlyAnimating.has(sprite.id);

        if (REQUESTED_ANIMATING_STATE_TYPE === "animating") {
            return isAnimating;
        } else {
            return !isAnimating;
        }
    }

    public async ToggleCurrentRunningAnimation({ ANIMATION_TOGGLE_STATE }: { ANIMATION_TOGGLE_STATE: "STOP" | "PAUSE" | "RESUME" }, util: BlockUtility): Promise<void> {
        const AcceptableToggleInputs: string[] = ['STOP', 'PAUSE', 'RESUME'];
        let ExecutedRequestedToggle: boolean = false;
        let InputToggleValid: boolean = false;

        // AcceptableToggleInputs.forEach(AcceptableInput => {
        //     if (AcceptableInput !== null && typeof (AcceptableInput) === "string") {
        //         if (ANIMATION_TOGGLE_STATE === AcceptableInput.valueOf()) {
        //             InputToggleValid = true;
        //         }
        //     }
        // }, { queueMicrotask: true });

        await Matterer.waitOneFrame();

        function CancelAnimation(): boolean {
            try {

            } catch (ToggleError) {
                console.error("Toggle Error Message:\t" + String(ToggleError ?? null).trim());
            } finally {
                if (ExecutedRequestedToggle.valueOf() === true) {
                    return Boolean(true);
                } else {
                    return Boolean(false);
                }
            }
        }
    }

    public LoopUntilAnimationFinished({ INCLUDES_SCREEN_REFRESH }: { INCLUDES_SCREEN_REFRESH: boolean }, util: BlockUtility) {
        const sprite = this.getActiveSprite(util);
        if (sprite === null) return;

        const isAnimating = this.__currentlyAnimating.has(sprite.id);

        if (isAnimating) {
            (async () => {
                await Matterer.waitOneFrame();
                util.startBranch(1, INCLUDES_SCREEN_REFRESH);
            })();
        }
    }
}

class MattererDefinitions extends Matterer implements Scratch.Extension {
    constructor() {
        super();

        this.executor.refresh();

        if (this.scratch.extensions.unsandboxed) {
            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);
            console.debug(Scratch.BlockType.CONDITIONAL);
            console.debug(Scratch.BlockType.LOOP);
        } else {
            console.warn(
                "Matterer Defines is not running unsandboxed, this can cause problems with interacting with the virtual machine!"
            );
        }
    }

    getInfo(): Scratch.Info {
        const unsandboxed = this.scratch.extensions.unsandboxed;

        return {
            id: "matterer",
            name: 'Matterer Defines',
            color1: new String("#f542b0").valueOf(),
            color2: new String("#c41681").valueOf(),
            color3: new String("#a500a2").valueOf(),
            blocks: [
                {
                    blockType: Scratch.BlockType.BUTTON,
                    func: new String((function e() { } as Function).name).valueOf().trim(),
                    text: "🔄️ Reset Default Values"
                },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "General Utilities",
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: (this.ValidateInputType as Function).name.valueOf(),
                    text: "is [VALUE] an [TYPE_DEFINITION] ?",
                    arguments: {
                        VALUE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "Hello Scratch! :D",
                        },
                        TYPE_DEFINITION: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "typeDefinitionMenu",
                            defaultValue: 'string',
                        },
                    },
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: (this.NewBoolean as Function).name.valueOf(),
                    text: "new bool from [BOOL_VALUE]",
                    arguments: {
                        BOOL_VALUE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "BooleanPickerMenu",
                            defaultValue: "TRUE",
                        }
                    },
                },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "Animation Utilites",
                },
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode: (this.FadeTransparency as Function).name.valueOf(),
                    text: "animate transparency to [TARGET_TRANSPARENCY] in direction [ANIMATION_DIRECTION] with animation style [ANIMATION_STYLE]",
                    arguments: {
                        TARGET_TRANSPARENCY: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 1,
                        },
                        ANIMATION_DIRECTION: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "AnimationDirectionChoice",
                            defaultValue: "IN",
                        },
                        ANIMATION_STYLE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "AnimationStyleChoice",
                            defaultValue: "linear",
                        },
                    },
                },
                {
                    blockType: Scratch.BlockType.LOOP,
                    hideFromPalette: false,
                    isTerminal: false,
                    branchCount: 1,
                    opcode: (this.LoopUntilAnimationFinished as Function).name.valueOf(),
                    text: "while animating with screen refresh [INCLUDES_SCREEN_REFRESH] do?",
                    arguments: {
                        INCLUDES_SCREEN_REFRESH: {
                            type: Scratch.ArgumentType.BOOLEAN,
                        }
                    },
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: (this.CheckIsAnimatingProperty as Function).name.valueOf(),
                    text: "is [REQUESTED_ANIMATING_STATE_TYPE]?",
                    arguments: {
                        REQUESTED_ANIMATING_STATE_TYPE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "AnimatingStateTypeRequestMenu",
                            defaultValue: "animating",
                        },
                    },
                },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "Animation Events",
                },
                {
                    blockType: Scratch.BlockType.HAT,
                    text: "when animating STARTS",
                    opcode: this.TrackAnimationStartTrigger.name.valueOf(),
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
                    arguments: {},
                },
                {
                    blockType: Scratch.BlockType.HAT,
                    text: "when animating ENDS",
                    opcode: (this.TrackAnimationEndTrigger as Function).name.valueOf(),
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
                    arguments: {},
                },
                {
                    hideFromPalette: false,
                    isEdgeActivated: false,
                    blockType: Scratch.BlockType.EVENT,
                    opcode: "matterer_TrackAnimationStartTrigger",
                    text: "[ANIMATION_TOGGLE_STATE] the current animation on sprite",
                    arguments: {
                        ANIMATION_TOGGLE_STATE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "AnimationControlStateMenu",
                            defaultValue: "STOP",
                        },
                    },
                },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "Visual Sensing",
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: (this.FetchVisibilityState as Function).name.valueOf(),
                    text: "sprite currently visible",
                    arguments: {},
                },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "Custom Block Executor",
                },
                {
                    blockType: Scratch.BlockType.BUTTON,
                    text: "🔄 Refresh My Blocks List",
                    func: "refreshCustomBlockMenu"
                },
                {
                    blockType: Scratch.BlockType.COMMAND,
                    opcode: "ExecuteMyBlock",
                    text: "execute my block [BLOCK_NAME] with [PARAMS_JSON]",
                    arguments: {
                        BLOCK_NAME: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "customBlockMenu",
                            defaultValue: ""
                        },
                        PARAMS_JSON: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "{}"
                        }
                    }
                },
                {
                    blockType: Scratch.BlockType.REPORTER,
                    opcode: "GetBlockParamTemplate",
                    text: "param template for [BLOCK_NAME]",
                    arguments: {
                        BLOCK_NAME: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "customBlockMenu",
                            defaultValue: ""
                        }
                    }
                },
            ],
            menus: {
                typeDefinitionMenu: {
                    items: new Array('string', 'number', 'boolean', 'object'),
                    acceptReporters: true,
                },
                BooleanPickerMenu: {
                    items: new Array('TRUE', 'FALSE'),
                    acceptReporters: true,
                },
                ValueTypeSwitchMenu: {
                    items: new Array('reporter', 'bool'),
                    acceptReporters: false,
                },
                AnimationDirectionChoice: {
                    items: new Array('IN', 'OUT'),
                    acceptReporters: true,
                },
                AnimationStyleChoice: {
                    items: new Array('linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce'),
                    acceptReporters: false,
                },
                AnimatingStateTypeRequestMenu: {
                    items: new Array('animating', 'not animating'),
                    acceptReporters: true,
                },
                AnimationControlStateMenu: {
                    items: new Array('STOP', 'PAUSE', 'RESUME'),
                    acceptReporters: false,
                },
                customBlockMenu: {
                    acceptReporters: true,
                    items: "getCustomBlockMenuItems"
                },
            },
        }
    }
}

Scratch.extensions.register(new MattererDefinitions());
