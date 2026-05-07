type AnimationStyles = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";
const ValidScratchTypeDefinitions: Readonly<string[]> = ['string', 'number', 'boolean', 'object'];

class Matterer {
    static ValueTypes = [String, Boolean];
    static waitOneFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
    static MaxTransparency: Readonly<number> = 100;

    scratch: typeof Scratch;

    constructor() {
        this.scratch = Scratch ?? undefined;
    }

    private getActiveSprite(util?: BlockUtility): VM.RenderedTarget | null {
        return util?.target
            ?? Scratch.vm.runtime.sequencer?.activeThread?.target
            ?? Scratch.vm.runtime._editingTarget
            ?? null;
    }

    public refreshCustomBlockMenu() {
        try {
            Scratch.vm?.runtime?.emit("PROJECT_CHANGED");
            console.log("✅ Refreshed custom block menu");
        } catch (e) {
            console.warn(e);
        }
    }

    public ExecuteMyBlock({ BLOCK_NAME, PARAMS_JSON }: { BLOCK_NAME: string; PARAMS_JSON: string }, util: BlockUtility): void {
        if (!BLOCK_NAME?.trim()) {
            console.warn("[Matterer] No block name provided");
            return;
        }

        let args: Record<string, any> = {};
        if (PARAMS_JSON?.trim() && PARAMS_JSON.trim() !== "{}") {
            try {
                args = JSON.parse(PARAMS_JSON);
            } catch (e) {
                console.error("[Matterer] Invalid JSON:", PARAMS_JSON);
                return;
            }
        }

        const runtime: any = (util as any).runtime ?? Scratch?.vm?.runtime;
        if (!runtime) return;

        // Find the procedures_definition block whose prototype child matches BLOCK_NAME.
        // The proccode is stored as "block name %s" with %s/%b/%n placeholders —
        // not the display format "block name [e]". BLOCK_NAME must be the raw proccode.
        let argumentnames: string[] = [];
        let argumentdefaults: string[] = [];
        let definitionBlockId: string | null = null;
        let definitionTarget: any = null;

        outer:
        for (const target of runtime.targets) {
            const blocks = target.blocks?._blocks;
            if (!blocks) continue;

            for (const [blockId, block] of Object.entries(blocks) as [string, any][]) {
                if (block?.opcode !== "procedures_definition") continue;

                const protoId = block.inputs?.custom_block?.block;
                if (!protoId) continue;

                const proto = blocks[protoId];
                if (proto?.mutation?.proccode !== BLOCK_NAME) continue;

                try {
                    argumentnames = JSON.parse(proto.mutation.argumentnames ?? "[]");
                    argumentdefaults = JSON.parse(proto.mutation.argumentdefaults ?? "[]");
                } catch { }

                definitionBlockId = blockId;
                definitionTarget = target;
                break outer;
            }
        }

        if (!definitionBlockId || !definitionTarget) {
            console.warn(`[Matterer] No definition block found for proccode: "${BLOCK_NAME}"`);
            return;
        }

        // Build the parameter value array indexed by position.
        // Prefer name-based lookup (from parsed JSON), then positional, then prototype default.
        const positionalValues = Object.values(args);
        const paramValues: any[] = argumentnames.map((name, i) =>
            Object.prototype.hasOwnProperty.call(args, name)
                ? args[name]
                : (positionalValues[i] ?? argumentdefaults[i] ?? "")
        );

        // Push a brand-new thread starting from the definition block.
        // This is the ONLY safe way to call a custom block from an extension —
        // runtime._primitives["procedures_call"] internally calls util.initParams()
        // which is stripped in the compatibility layer and throws.
        const newThread: any = runtime._pushThread(definitionBlockId, definitionTarget);
        if (!newThread) {
            console.error("[Matterer] Failed to push thread for procedure");
            return;
        }

        // Inject parameters directly onto the new thread so argument reporters resolve correctly.
        newThread.procedureParameterNames = argumentnames;
        newThread.procedureArguments = paramValues;

        console.log(`[Matterer] Executed "${BLOCK_NAME}"`, { argumentnames, paramValues });
    }

    public GetBlockParamTemplate({ BLOCK_NAME }: { BLOCK_NAME: string }): string {
        if (!BLOCK_NAME?.trim()) return "NO PARAMETERS";

        const runtime: any = Scratch?.vm?.runtime;
        if (!runtime?.targets) return "NO PARAMETERS";

        for (const target of runtime.targets) {
            const blocks = target.blocks?._blocks;
            if (!blocks) continue;

            for (const block of Object.values(blocks) as any[]) {
                if (block?.opcode !== "procedures_prototype") continue;
                if (block?.mutation?.proccode !== BLOCK_NAME) continue;

                let argumentnames: string[] = [];
                let argumentdefaults: string[] = [];
                try {
                    argumentnames = JSON.parse(block.mutation.argumentnames ?? "[]");
                    argumentdefaults = JSON.parse(block.mutation.argumentdefaults ?? "[]");
                } catch { }

                if (argumentnames.length === 0) return "NO PARAMETERS";

                const template: Record<string, any> = {};
                argumentnames.forEach((name, i) => {
                    template[name] = argumentdefaults[i] ?? "";
                });
                return JSON.stringify(template);
            }
        }

        return "NO PARAMETERS";
    }

    // Returns {text, value} objects where:
    //   text  = human-readable "block name [e]" (replacing %s/%b/%n with arg names)
    //   value = raw proccode "block name %s"    (what the executor searches for)
    //
    // Returning plain strings caused TurboWarp to iterate them as char arrays → single letters.
    // Returning functions in sandboxed mode causes DataCloneError in postMessage serialization.
    public getCustomBlockMenuItems(): { text: string; value: string }[] {
        try {
            const runtime = Scratch?.vm?.runtime;
            if (!runtime?.targets) return [{ text: "(runtime not ready)", value: "" }];

            const found = new Map<string, string[]>();

            for (const target of runtime.targets) {
                const blocks = target.blocks?._blocks;
                if (!blocks) continue;

                for (const block of Object.values(blocks) as any[]) {
                    if (block?.opcode !== "procedures_prototype") continue;
                    const proccode: string = block.mutation?.proccode;
                    if (!proccode || found.has(proccode)) continue;

                    let names: string[] = [];
                    try { names = JSON.parse(block.mutation.argumentnames ?? "[]"); } catch { }
                    found.set(proccode, names);
                }
            }

            if (found.size === 0) return [{ text: "(no custom blocks yet)", value: "" }];

            return Array.from(found.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([proccode, argnames]) => {
                    let argIndex = 0;
                    const text = proccode.replace(/%[sbn]/g, (match) => {
                        const name = argnames[argIndex++] ?? "?";
                        if (match === "%b") return `<${name}>`;
                        if (match === "%n") return `(${name})`;
                        return `[${name}]`;
                    });
                    return { text, value: proccode };
                });
        } catch (e) {
            console.error("[Menu Error]", e);
            return [{ text: "(error loading blocks)", value: "" }];
        }
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

                const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
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
        AcceptableToggleInputs.forEach(AcceptableInput => {
            if (AcceptableInput !== null && typeof (AcceptableInput) === "string") {
                if (ANIMATION_TOGGLE_STATE === AcceptableInput.valueOf()) {
                    InputToggleValid = true;
                }
            }
        }, { queueMicrotask: true });

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
        if (this.scratch.extensions.unsandboxed) {
            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);
            (() => {
                console.debug(Scratch.BlockType.LOOP);
                console.debug(Scratch.BlockType.CONDITIONAL);
            })();
        } else {
            console.warn("Matterer Defines is not running unsandboxed, this can cause problems with interacting with the virtual machine! This will result in making this extension USELESS.");
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
                    opcode: (this.ToggleCurrentRunningAnimation as Function).name.valueOf(),
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
                    // When sandboxed, getInfo() is postMessage'd across an iframe boundary.
                    // A function reference cannot be serialized → DataCloneError.
                    // Only pass the live bound function when actually unsandboxed.
                    items: unsandboxed
                        ? this.getCustomBlockMenuItems as any
                        : [{ text: "(requires unsandboxed mode)", value: "" }],
                },
            },
        }
    }
}

Scratch.extensions.register(new MattererDefinitions());
