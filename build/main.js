var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const ValidScratchTypeDefinitions = ['string', 'number', 'boolean', 'object'];
class Matterer {
    constructor() {
        this._procedureIndex = new Map();
        this._compiledBridges = new Map();
        this._menuCacheDirty = true;
        this._cachedMenuItems = [];
        this.__currentlyAnimating = new Set();
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
    }
    scanCustomBlocks() {
        var _a, _b, _c, _d, _e, _f, _g;
        const runtime = (_a = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm) === null || _a === void 0 ? void 0 : _a.runtime;
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return;
        this._procedureIndex.clear();
        for (const target of runtime.targets) {
            const blocks = (_b = target.blocks) === null || _b === void 0 ? void 0 : _b._blocks;
            if (!blocks)
                continue;
            for (const [blockId, block] of Object.entries(blocks)) {
                if ((block === null || block === void 0 ? void 0 : block.opcode) !== "procedures_definition")
                    continue;
                const customBlockInput = (_c = block.inputs) === null || _c === void 0 ? void 0 : _c.custom_block;
                let protoId = null;
                if (customBlockInput === null || customBlockInput === void 0 ? void 0 : customBlockInput.block) {
                    protoId = customBlockInput.block;
                }
                else if (Array.isArray(customBlockInput) && customBlockInput.length > 1) {
                    protoId = customBlockInput[1];
                }
                if (!protoId)
                    continue;
                const proto = blocks[protoId];
                if (!proto || proto.opcode !== "procedures_prototype")
                    continue;
                const proccode = (_d = proto.mutation) === null || _d === void 0 ? void 0 : _d.proccode;
                if (!proccode)
                    continue;
                let argumentNames = [];
                let argumentIds = [];
                let argumentDefaults = [];
                try {
                    argumentNames = JSON.parse((_e = proto.mutation.argumentnames) !== null && _e !== void 0 ? _e : "[]");
                    argumentIds = JSON.parse((_f = proto.mutation.argumentids) !== null && _f !== void 0 ? _f : "[]");
                    argumentDefaults = JSON.parse((_g = proto.mutation.argumentdefaults) !== null && _g !== void 0 ? _g : "[]");
                }
                catch (_h) { }
                this._procedureIndex.set(proccode, {
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
    compileBlockBridge(meta) {
        const bridge = (args, util) => {
            var _a, _b, _c, _d, _e, _f;
            const safeValue = (v) => (v === undefined || v === null) ? "" : v;
            const positionalValues = Object.values(args || {});
            const paramValues = meta.argumentNames.map((name, i) => {
                if (Object.prototype.hasOwnProperty.call(args, name)) {
                    return safeValue(args[name]);
                }
                if (i < positionalValues.length && positionalValues[i] !== undefined) {
                    return safeValue(positionalValues[i]);
                }
                return "";
            });
            const paramsByName = {};
            const paramsById = {};
            const paramsByIndex = {};
            for (let i = 0; i < paramValues.length; i++) {
                const value = safeValue(paramValues[i]);
                if (meta.argumentNames[i] !== undefined) {
                    paramsByName[meta.argumentNames[i]] = value;
                    paramsByIndex[String(i)] = value;
                }
                if (meta.argumentIds[i] !== undefined) {
                    paramsById[meta.argumentIds[i]] = value;
                }
            }
            const mergedParams = Object.assign(Object.assign(Object.assign({}, paramsByIndex), paramsByName), paramsById);
            const runtime = (_a = util.runtime) !== null && _a !== void 0 ? _a : (_b = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm) === null || _b === void 0 ? void 0 : _b.runtime;
            const newThread = runtime === null || runtime === void 0 ? void 0 : runtime._pushThread(meta.definitionBlockId, meta.target);
            if (!newThread) {
                console.error("[Matterer] Failed to push thread");
                return;
            }
            newThread.parametersCache = (_c = newThread.parametersCache) !== null && _c !== void 0 ? _c : {};
            newThread.parametersCache[meta.proccode] = mergedParams;
            newThread.procedureParameterNames = meta.argumentNames.slice();
            newThread.procedureParameterIds = meta.argumentIds.slice();
            newThread.procedureArguments = paramValues.slice();
            const liveFrame = (_f = (_e = (_d = newThread.compatibilityStackFrame) !== null && _d !== void 0 ? _d : (Array.isArray(newThread.stackFrames) && newThread.stackFrames.length > 0
                ? newThread.stackFrames[newThread.stackFrames.length - 1]
                : null)) !== null && _e !== void 0 ? _e : newThread.stackFrame) !== null && _f !== void 0 ? _f : null;
            if (liveFrame) {
                liveFrame.params = mergedParams;
                liveFrame.parameters = mergedParams;
                liveFrame.reporterValues = mergedParams;
                liveFrame.customArgs = mergedParams;
                liveFrame.procedureParameterNames = meta.argumentNames.slice();
                liveFrame.procedureParameterIds = meta.argumentIds.slice();
                liveFrame.procedureArguments = paramValues.slice();
                liveFrame.reported = null;
                liveFrame.reporting = "";
            }
            newThread.compatibilityStackFrame = liveFrame;
            newThread.stackFrame = liveFrame;
            if (Array.isArray(newThread.stackFrames) && newThread.stackFrames.length > 0) {
                newThread.stackFrames[newThread.stackFrames.length - 1] = liveFrame;
            }
            else if (liveFrame) {
                newThread.stackFrames = [liveFrame];
            }
            newThread.isCompiled = false;
            newThread.triedToCompile = false;
            console.log(`[Matterer] Executed "${meta.proccode}"`, {
                argumentNames: meta.argumentNames,
                argumentIds: meta.argumentIds,
                paramValues,
                mergedParams
            });
        };
        return bridge;
    }
    initializeDynamicMenuSystem() {
        var _a, _b;
        const vm = Scratch.vm;
        const runtime = vm.runtime;
        runtime.ext_Matterer = this;
        const refreshMenus = () => {
            this._menuCacheDirty = new Boolean(true).valueOf();
            console.debug("[Matterer] Menu cache invalidated");
        };
        vm.on("workspaceUpdate", refreshMenus);
        (_a = runtime.on) === null || _a === void 0 ? void 0 : _a.call(runtime, "PROJECT_LOADED", refreshMenus);
        (_b = runtime.on) === null || _b === void 0 ? void 0 : _b.call(runtime, "TARGETS_UPDATE", refreshMenus);
    }
    getActiveSprite(util) {
        var _a, _b, _c, _d, _e;
        return (_e = (_d = (_a = util === null || util === void 0 ? void 0 : util.target) !== null && _a !== void 0 ? _a : (_c = (_b = Scratch.vm.runtime.sequencer) === null || _b === void 0 ? void 0 : _b.activeThread) === null || _c === void 0 ? void 0 : _c.target) !== null && _d !== void 0 ? _d : Scratch.vm.runtime._editingTarget) !== null && _e !== void 0 ? _e : null;
    }
    refreshCustomBlockMenu() {
        var _a;
        this._menuCacheDirty = true;
        const vm = Scratch.vm;
        try {
            (_a = vm.refreshWorkspace) === null || _a === void 0 ? void 0 : _a.call(vm);
            if (vm.emitWorkspaceUpdate) {
                vm.emitWorkspaceUpdate();
            }
            console.log("[Matterer] Workspace refresh requested");
        }
        catch (e) {
            console.error(e);
        }
    }
    ExecuteMyBlock({ BLOCK_NAME, PARAMS_JSON }, util) {
        const normalizeBlockName = (value) => {
            var _a, _b, _c, _d;
            if (typeof value === "string")
                return value;
            if (value && typeof value === "object") {
                return String((_d = (_c = (_b = (_a = value.value) !== null && _a !== void 0 ? _a : value.text) !== null && _b !== void 0 ? _b : value.proccode) !== null && _c !== void 0 ? _c : value.blockName) !== null && _d !== void 0 ? _d : "");
            }
            return String(value !== null && value !== void 0 ? value : "");
        };
        BLOCK_NAME = normalizeBlockName(BLOCK_NAME);
        if (!(BLOCK_NAME === null || BLOCK_NAME === void 0 ? void 0 : BLOCK_NAME.trim())) {
            console.warn("[Matterer] No block name provided");
            return;
        }
        let args = {};
        if ((PARAMS_JSON === null || PARAMS_JSON === void 0 ? void 0 : PARAMS_JSON.trim()) && PARAMS_JSON.trim() !== "{}") {
            try {
                args = JSON.parse(PARAMS_JSON);
            }
            catch (e) {
                console.error("[Matterer] Invalid JSON:", PARAMS_JSON);
                return;
            }
        }
        this.scanCustomBlocks();
        const meta = this._procedureIndex.get(BLOCK_NAME);
        if (!meta) {
            console.warn(`[Matterer] No definition block found for proccode: "${BLOCK_NAME}"`);
            return;
        }
        let bridge = this._compiledBridges.get(meta.proccode);
        if (!bridge) {
            bridge = this.compileBlockBridge(meta);
            this._compiledBridges.set(meta.proccode, bridge);
        }
        bridge(args, util);
    }
    GetBlockParamTemplate({ BLOCK_NAME }) {
        var _a, _b, _c, _d, _e;
        if (!(BLOCK_NAME === null || BLOCK_NAME === void 0 ? void 0 : BLOCK_NAME.trim()))
            return "NO PARAMETERS";
        const runtime = (_a = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm) === null || _a === void 0 ? void 0 : _a.runtime;
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return "NO PARAMETERS";
        for (const target of runtime.targets) {
            const blocks = (_b = target.blocks) === null || _b === void 0 ? void 0 : _b._blocks;
            if (!blocks)
                continue;
            for (const block of Object.values(blocks)) {
                if ((block === null || block === void 0 ? void 0 : block.opcode) !== "procedures_prototype")
                    continue;
                if (((_c = block === null || block === void 0 ? void 0 : block.mutation) === null || _c === void 0 ? void 0 : _c.proccode) !== BLOCK_NAME)
                    continue;
                let argumentnames = [];
                let argumentdefaults = [];
                try {
                    argumentnames = JSON.parse((_d = block.mutation.argumentnames) !== null && _d !== void 0 ? _d : "[]");
                    argumentdefaults = JSON.parse((_e = block.mutation.argumentdefaults) !== null && _e !== void 0 ? _e : "[]");
                }
                catch (_f) { }
                if (argumentnames.length === 0)
                    return "NO PARAMETERS";
                const template = {};
                argumentnames.forEach((name, i) => {
                    var _a;
                    template[name] = (_a = argumentdefaults[i]) !== null && _a !== void 0 ? _a : "";
                });
                return JSON.stringify(template);
            }
        }
        return "NO PARAMETERS";
    }
    getCustomBlockMenuItems() {
        var _a, _b, _c, _d;
        try {
            const runtime = (_a = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm) === null || _a === void 0 ? void 0 : _a.runtime;
            if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets)) {
                return [
                    {
                        text: "(runtime not ready)",
                        value: ""
                    }
                ];
            }
            const found = new Map();
            for (const target of runtime.targets) {
                const blocks = (_b = target.blocks) === null || _b === void 0 ? void 0 : _b._blocks;
                if (!blocks)
                    continue;
                for (const block of Object.values(blocks)) {
                    if ((block === null || block === void 0 ? void 0 : block.opcode) !== "procedures_prototype") {
                        continue;
                    }
                    const proccode = (_c = block.mutation) === null || _c === void 0 ? void 0 : _c.proccode;
                    if (!proccode) {
                        continue;
                    }
                    if (found.has(proccode)) {
                        continue;
                    }
                    let names = [];
                    try {
                        names = JSON.parse((_d = block.mutation.argumentnames) !== null && _d !== void 0 ? _d : "[]");
                    }
                    catch (_e) { }
                    console.log("[Matterer] Found custom block:", proccode);
                    found.set(proccode, names);
                }
            }
            if (found.size === 0) {
                return [
                    {
                        text: "(no custom blocks yet)",
                        value: ""
                    }
                ];
            }
            const menuItems = Array.from(found.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([proccode, argnames]) => {
                let argIndex = 0;
                const text = proccode.replace(/%[sbn]/g, match => {
                    var _a;
                    const name = (_a = argnames[argIndex++]) !== null && _a !== void 0 ? _a : "?";
                    if (match === "%b") {
                        return `<${name}>`;
                    }
                    if (match === "%n") {
                        return `(${name})`;
                    }
                    return `[${name}]`;
                });
                return {
                    text,
                    value: proccode
                };
            });
            this._cachedMenuItems = menuItems;
            this._menuCacheDirty = false;
            return menuItems;
        }
        catch (e) {
            console.error("[Matterer] Menu Error", e);
            return [
                {
                    text: "(error loading blocks)",
                    value: ""
                }
            ];
        }
    }
    _getCustomBlockMenuItems() {
        return this.getCustomBlockMenuItems();
    }
    ValidateInputType({ VALUE, TYPE_DEFINITION }) {
        const type = TYPE_DEFINITION.toLowerCase();
        if (ValidScratchTypeDefinitions.indexOf(type) === -1) {
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
            }
            catch (_a) {
                return false;
            }
        }
        return false;
    }
    NewBoolean({ BOOL_VALUE }) {
        function ConvertRequestedValueToString() {
            let Converted = null;
            if (BOOL_VALUE !== undefined && BOOL_VALUE !== null) {
                Converted = String(BOOL_VALUE).toLowerCase().trim();
            }
            return Converted !== null ? Converted : "";
        }
        function BooleanInstancer() {
            return ConvertRequestedValueToString() === 'true';
        }
        return BooleanInstancer();
    }
    FetchVisibilityState({}, util) {
        const sprite = this.getActiveSprite(util);
        if (sprite === null) {
            console.warn("Sprite visibility defaulting to false!");
            return false;
        }
        return sprite.visible.valueOf();
    }
    FadeTransparency(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE }, util) {
            var _b, _c, _d, _e;
            const easings = {
                linear: (t) => t,
                easeIn: (t) => t * t,
                easeOut: (t) => t * (2 - t),
                easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
                bounce: (t) => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
            };
            if (TARGET_TRANSPARENCY !== null && TARGET_TRANSPARENCY >= 0 && TARGET_TRANSPARENCY <= Matterer.MaxTransparency) {
                const CurrentSprite = this.getActiveSprite(util);
                const spriteId = (_b = CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.id) !== null && _b !== void 0 ? _b : null;
                if (spriteId === null)
                    return;
                try {
                    const ScratchRuntime = (_c = util.runtime) !== null && _c !== void 0 ? _c : null;
                    if (ScratchRuntime === null)
                        throw new Error("ScratchRuntime is unavailable.");
                    const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
                    const InitialTransparency = (_d = CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.effects.ghost) !== null && _d !== void 0 ? _d : 0;
                    const StartValue = InitialTransparency;
                    const EndValue = ANIMATION_DIRECTION === "IN" ? 0 : CalculatedGhostValueTarget;
                    const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * ScratchRuntime.frameLoop.framerate);
                    this.__currentlyAnimating.add(spriteId);
                    (_e = ScratchRuntime === null || ScratchRuntime === void 0 ? void 0 : ScratchRuntime.startHats("matterer_TrackAnimationStartTrigger")) !== null && _e !== void 0 ? _e : void null;
                    for (let CurrentTransparencyStep = 0; CurrentTransparencyStep < TransparencySteps; CurrentTransparencyStep++) {
                        const t = CurrentTransparencyStep / TransparencySteps;
                        const eased = easings[ANIMATION_STYLE](t);
                        CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.setEffect("ghost", StartValue + (EndValue - StartValue) * eased);
                        yield Matterer.waitOneFrame();
                    }
                    CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.setEffect("ghost", EndValue);
                }
                catch (FadeError) {
                    if (FadeError != null)
                        console.error(new String(FadeError).trim());
                }
                finally {
                    this.__currentlyAnimating.delete(spriteId);
                    util.runtime.startHats("matterer_TrackAnimationEndTrigger");
                }
            }
        });
    }
    TrackAnimationStartTrigger(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({}, util) {
            yield Matterer.waitOneFrame();
            return true;
        });
    }
    TrackAnimationEndTrigger(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({}, util) {
            yield Matterer.waitOneFrame();
            return true;
        });
    }
    CheckIsAnimatingProperty({ REQUESTED_ANIMATING_STATE_TYPE }, util) {
        if (REQUESTED_ANIMATING_STATE_TYPE === null)
            return false;
        const sprite = this.getActiveSprite(util);
        if (sprite === null)
            return false;
        const isAnimating = this.__currentlyAnimating.has(sprite.id);
        if (REQUESTED_ANIMATING_STATE_TYPE === "animating") {
            return isAnimating;
        }
        else {
            return !isAnimating;
        }
    }
    ToggleCurrentRunningAnimation(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({ ANIMATION_TOGGLE_STATE }, util) {
            const AcceptableToggleInputs = ['STOP', 'PAUSE', 'RESUME'];
            let ExecutedRequestedToggle = false;
            let InputToggleValid = false;
            AcceptableToggleInputs.forEach(AcceptableInput => {
                if (AcceptableInput !== null && typeof (AcceptableInput) === "string") {
                    if (ANIMATION_TOGGLE_STATE === AcceptableInput.valueOf()) {
                        InputToggleValid = true;
                    }
                }
            }, { queueMicrotask: true });
            yield Matterer.waitOneFrame();
            function CancelAnimation() {
                try {
                }
                catch (ToggleError) {
                    console.error("Toggle Error Message:\t" + String(ToggleError !== null && ToggleError !== void 0 ? ToggleError : null).trim());
                }
                finally {
                    if (ExecutedRequestedToggle.valueOf() === true) {
                        return Boolean(true);
                    }
                    else {
                        return Boolean(false);
                    }
                }
            }
        });
    }
    LoopUntilAnimationFinished({ INCLUDES_SCREEN_REFRESH }, util) {
        const sprite = this.getActiveSprite(util);
        if (sprite === null)
            return;
        const isAnimating = this.__currentlyAnimating.has(sprite.id);
        if (isAnimating) {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield Matterer.waitOneFrame();
                util.startBranch(1, INCLUDES_SCREEN_REFRESH);
            }))();
        }
    }
}
Matterer.ValueTypes = [String, Boolean];
Matterer.waitOneFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
Matterer.MaxTransparency = 100;
class MattererDefinitions extends Matterer {
    constructor() {
        super();
        if (this.scratch.extensions.unsandboxed) {
            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);
            this.initializeDynamicMenuSystem();
            (() => {
                console.debug(Scratch.BlockType.LOOP);
                console.debug(Scratch.BlockType.CONDITIONAL);
            })();
        }
        else {
            console.warn("Matterer Defines is not running unsandboxed, this can cause problems with interacting with the virtual machine!");
        }
    }
    getInfo() {
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
                    func: new String(function e() { }.name).valueOf().trim(),
                    text: "🔄️ Reset Default Values"
                },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "General Utilities",
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: this.ValidateInputType.name.valueOf(),
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
                    opcode: this.NewBoolean.name.valueOf(),
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
                    opcode: this.FadeTransparency.name.valueOf(),
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
                    opcode: this.LoopUntilAnimationFinished.name.valueOf(),
                    text: "while animating with screen refresh [INCLUDES_SCREEN_REFRESH] do?",
                    arguments: {
                        INCLUDES_SCREEN_REFRESH: {
                            type: Scratch.ArgumentType.BOOLEAN,
                        }
                    },
                },
                {
                    blockType: Scratch.BlockType.BOOLEAN,
                    opcode: this.CheckIsAnimatingProperty.name.valueOf(),
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
                    opcode: this.TrackAnimationEndTrigger.name.valueOf(),
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
                    arguments: {},
                },
                {
                    hideFromPalette: false,
                    isEdgeActivated: false,
                    blockType: Scratch.BlockType.EVENT,
                    opcode: this.ToggleCurrentRunningAnimation.name.valueOf(),
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
                    opcode: this.FetchVisibilityState.name.valueOf(),
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
                    items: "_getCustomBlockMenuItems"
                },
            },
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
