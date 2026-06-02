var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const ValidScratchTypeDefinitions = [
    "string", "number", "boolean", "object",
];
const MAX_LABEL_LEN = 36;
function truncateLabel(text, max = MAX_LABEL_LEN) {
    return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
function normalizeBlockName(value) {
    var _a, _b, _c, _d;
    if (typeof value === "string")
        return value;
    if (value && typeof value === "object") {
        const o = value;
        return String((_d = (_c = (_b = (_a = o.value) !== null && _a !== void 0 ? _a : o.text) !== null && _b !== void 0 ? _b : o.proccode) !== null && _c !== void 0 ? _c : o.blockName) !== null && _d !== void 0 ? _d : "");
    }
    return String(value !== null && value !== void 0 ? value : "");
}
function debounce(fn, ms) {
    let timer = null;
    return () => {
        if (timer !== null)
            clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(); }, ms);
    };
}
class MattererBundleExecutor {
    constructor(getRuntime) {
        this.getRuntime = getRuntime;
        this.cachedItems = [{ text: "(loading…)", value: "" }];
        this.rebuilding = false;
    }
    installAutoRefresh() {
        var _a, _b, _c, _d, _e;
        const vm = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm;
        const runtime = this.getRuntime();
        if (!vm || !runtime)
            return;
        const scheduleRebuild = debounce(() => this.rebuildCache(), 250);
        (_a = vm.on) === null || _a === void 0 ? void 0 : _a.call(vm, "workspaceUpdate", scheduleRebuild);
        (_b = vm.on) === null || _b === void 0 ? void 0 : _b.call(vm, "targetsUpdate", scheduleRebuild);
        (_c = runtime.on) === null || _c === void 0 ? void 0 : _c.call(runtime, "PROJECT_LOADED", scheduleRebuild);
        (_d = runtime.on) === null || _d === void 0 ? void 0 : _d.call(runtime, "TARGETS_UPDATE", scheduleRebuild);
        const attachBlockListeners = () => {
            var _a, _b;
            for (const target of ((_a = runtime.targets) !== null && _a !== void 0 ? _a : [])) {
                const bc = target.blocks;
                if (!bc || bc.__mattererHooked)
                    continue;
                bc.__mattererHooked = true;
                (_b = bc.on) === null || _b === void 0 ? void 0 : _b.call(bc, "BLOCK_DRAG_END", scheduleRebuild);
            }
        };
        (_e = runtime.on) === null || _e === void 0 ? void 0 : _e.call(runtime, "TARGETS_UPDATE", attachBlockListeners);
        attachBlockListeners();
        this.rebuildCache();
        console.debug("[Matterer] Auto-refresh installed (silent mode)");
    }
    rebuildCache() {
        if (this.rebuilding)
            return;
        this.rebuilding = true;
        try {
            const runtime = this.getRuntime();
            if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
                return;
            const index = this.buildProcedureIndex(runtime);
            const items = Array.from(index.values())
                .sort((a, b) => a.proccode.localeCompare(b.proccode))
                .map((meta) => {
                let i = 0;
                const full = meta.proccode.replace(/%[sbn]/g, m => {
                    var _a;
                    const name = (_a = meta.argumentNames[i++]) !== null && _a !== void 0 ? _a : "?";
                    return m === "%b" ? `<${name}>` : m === "%n" ? `(${name})` : `[${name}]`;
                });
                return { text: truncateLabel(full), value: meta.proccode };
            });
            this.cachedItems = items.length
                ? items
                : [{ text: "(no custom blocks yet)", value: "" }];
            console.debug("[Matterer] Cache rebuilt:", this.cachedItems.length, "items");
        }
        finally {
            this.rebuilding = false;
        }
    }
    getMenuItems() {
        return this.cachedItems;
    }
    forceRebuild() {
        this.rebuildCache();
    }
    getTemplate(blockName) {
        blockName = normalizeBlockName(blockName);
        const runtime = this.getRuntime();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return "NO PARAMETERS";
        const meta = this.buildProcedureIndex(runtime).get(blockName);
        if (!meta || meta.argumentNames.length === 0)
            return "NO PARAMETERS";
        const tpl = {};
        meta.argumentNames.forEach((name, i) => { var _a; tpl[name] = (_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : ""; });
        return JSON.stringify(tpl);
    }
    execute(blockNameRaw, paramsJson, util) {
        var _a;
        const blockName = normalizeBlockName(blockNameRaw);
        if (!blockName.trim()) {
            console.warn("[Matterer] No block name provided");
            return;
        }
        console.log("[Matterer] execute()", { blockName, paramsJson });
        let rawArgs = {};
        const trimmed = paramsJson === null || paramsJson === void 0 ? void 0 : paramsJson.trim();
        if (trimmed && trimmed !== "{}") {
            try {
                rawArgs = JSON.parse(trimmed);
            }
            catch (_b) {
                console.error("[Matterer] Invalid JSON:", paramsJson);
                return;
            }
        }
        const runtime = (_a = util.runtime) !== null && _a !== void 0 ? _a : this.getRuntime();
        const index = this.buildProcedureIndex(runtime);
        const meta = index.get(blockName);
        if (!meta) {
            console.warn(`[Matterer] No definition found for: "${blockName}"`);
            console.log("[Matterer] known:", [...index.keys()]);
            return;
        }
        this.spawnThread(meta, rawArgs, util, runtime);
    }
    buildProcedureIndex(runtime) {
        var _a, _b, _c, _d, _e, _f;
        const index = new Map();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return index;
        for (const target of runtime.targets) {
            const blocks = (_a = target.blocks) === null || _a === void 0 ? void 0 : _a._blocks;
            if (!blocks)
                continue;
            for (const [blockId, block] of Object.entries(blocks)) {
                if ((block === null || block === void 0 ? void 0 : block.opcode) !== "procedures_definition")
                    continue;
                const protoId = this.resolveProtoId((_b = block.inputs) === null || _b === void 0 ? void 0 : _b.custom_block, blocks);
                if (!protoId)
                    continue;
                const proto = blocks[protoId];
                if (!proto || proto.opcode !== "procedures_prototype")
                    continue;
                const proccode = (_c = proto.mutation) === null || _c === void 0 ? void 0 : _c.proccode;
                if (!proccode)
                    continue;
                let argumentNames = [];
                let argumentIds = [];
                let argumentDefaults = [];
                try {
                    argumentNames = JSON.parse((_d = proto.mutation.argumentnames) !== null && _d !== void 0 ? _d : "[]");
                    argumentIds = JSON.parse((_e = proto.mutation.argumentids) !== null && _e !== void 0 ? _e : "[]");
                    argumentDefaults = JSON.parse((_f = proto.mutation.argumentdefaults) !== null && _f !== void 0 ? _f : "[]");
                }
                catch (_g) { }
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
    spawnThread(meta, rawArgs, util, runtime) {
        var _a;
        const argsArray = [];
        for (let i = 0; i < meta.argumentNames.length; i++) {
            const name = meta.argumentNames[i];
            const id = meta.argumentIds[i];
            const def = (_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : "";
            let val = def;
            if (rawArgs[id] !== undefined)
                val = rawArgs[id];
            else if (rawArgs[name] !== undefined)
                val = rawArgs[name];
            else if (rawArgs[String(i)] !== undefined)
                val = rawArgs[String(i)];
            argsArray[i] = val;
        }
        let thread = util.thread;
        if (!thread) {
            thread = runtime.sequencer.createThread(meta.definitionBlockId, meta.target, { stackClick: false, updateMonitor: false });
        }
        if (!thread) {
            console.error("[Matterer] Failed to get/create thread for stepToProcedure");
            return;
        }
        console.log("[Matterer] Calling stepToProcedure with args:", argsArray);
        try {
            runtime.sequencer.stepToProcedure(thread, meta.proccode, argsArray);
            console.log("[Matterer] stepToProcedure executed successfully!");
        }
        catch (err) {
            console.error("[Matterer] stepToProcedure failed:", err);
            console.log("[Matterer] Falling back to manual thread push...");
            this.fallbackManualPush(meta, argsArray, util, runtime);
        }
    }
    fallbackManualPush(meta, argsArray, util, runtime) {
        const thread = runtime._pushThread(meta.definitionBlockId, meta.target, { stackClick: false, updateMonitor: false });
        if (!thread)
            return;
        thread.isCompiled = false;
        thread.triedToCompile = true;
        thread.procedureArguments = argsArray;
        thread.procedureParameterNames = meta.argumentNames.slice();
        thread.procedureParameterIds = meta.argumentIds.slice();
        const frames = [thread.stackFrame, thread.compatibilityStackFrame].filter(Boolean);
        for (const frame of frames) {
            if (!frame)
                continue;
            frame.procedureArguments = argsArray;
            frame.procedureParameterNames = meta.argumentNames.slice();
            frame.procedureParameterIds = meta.argumentIds.slice();
            frame.reported = null;
        }
        console.log("[Matterer] Fallback manual push executed.");
    }
    seedFrames(thread, meta, merged) {
        var _a;
        const seen = new Set();
        const frames = [];
        if (Array.isArray(thread.stackFrames)) {
            for (const f of thread.stackFrames) {
                if (f && !seen.has(f)) {
                    seen.add(f);
                    frames.push(f);
                }
            }
        }
        if (thread.stackFrame && !seen.has(thread.stackFrame)) {
            seen.add(thread.stackFrame);
            frames.push(thread.stackFrame);
        }
        if (thread.compatibilityStackFrame && !seen.has(thread.compatibilityStackFrame)) {
            seen.add(thread.compatibilityStackFrame);
            frames.push(thread.compatibilityStackFrame);
        }
        for (const frame of frames) {
            if (!frame)
                continue;
            frame.parametersCache = (_a = frame.parametersCache) !== null && _a !== void 0 ? _a : {};
            frame.parametersCache[meta.proccode] = merged;
            frame.params = merged;
            frame.parameters = merged;
            frame.procedureParameterNames = meta.argumentNames.slice();
            frame.procedureParameterIds = meta.argumentIds.slice();
            frame.procedureArguments = meta.argumentNames.map(n => { var _a; return (_a = merged[n]) !== null && _a !== void 0 ? _a : ""; });
            frame.reported = null;
            frame.reporting = "";
        }
    }
    buildParams(meta, args) {
        const positional = Object.values(args);
        const out = {};
        meta.argumentNames.forEach((name, i) => {
            var _a;
            const raw = Object.prototype.hasOwnProperty.call(args, name)
                ? args[name]
                : i < positional.length
                    ? positional[i]
                    : ((_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : "");
            const value = raw === undefined || raw === null ? "" : raw;
            out[name] = value;
            out[String(i)] = value;
            if (meta.argumentIds[i])
                out[meta.argumentIds[i]] = value;
        });
        return out;
    }
    resolveProtoId(input, blocks) {
        if (!input)
            return null;
        if (Array.isArray(input)) {
            const a = input[1];
            if (typeof a === "string" && blocks[a])
                return a;
            const b = input[2];
            if (typeof b === "string" && blocks[b])
                return b;
            return null;
        }
        if (input.block && blocks[input.block])
            return input.block;
        if (input.shadow && blocks[input.shadow])
            return input.shadow;
        return null;
    }
}
class Matterer {
    constructor() {
        this.executor = new MattererBundleExecutor(() => { var _a; return (_a = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm) === null || _a === void 0 ? void 0 : _a.runtime; });
        this.__animating = new Set();
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
    }
    getActiveSprite(util) {
        var _a, _b, _c, _d, _e;
        return ((_e = (_d = (_a = util === null || util === void 0 ? void 0 : util.target) !== null && _a !== void 0 ? _a : (_c = (_b = Scratch.vm.runtime.sequencer) === null || _b === void 0 ? void 0 : _b.activeThread) === null || _c === void 0 ? void 0 : _c.target) !== null && _d !== void 0 ? _d : Scratch.vm.runtime._editingTarget) !== null && _e !== void 0 ? _e : null);
    }
    refreshCustomBlockMenu() {
        var _a;
        this.executor.forceRebuild();
        try {
            const vm = Scratch.vm;
            (_a = vm === null || vm === void 0 ? void 0 : vm.refreshWorkspace) === null || _a === void 0 ? void 0 : _a.call(vm);
            if (vm === null || vm === void 0 ? void 0 : vm.emitWorkspaceUpdate)
                vm.emitWorkspaceUpdate();
        }
        catch (e) {
            console.error("[Matterer] Manual workspace refresh failed:", e);
        }
    }
    ExecuteMyBlock({ BLOCK_NAME, PARAMS_JSON }, util) {
        this.executor.execute(BLOCK_NAME, PARAMS_JSON, util);
    }
    GetBlockParamTemplate({ BLOCK_NAME }) {
        return this.executor.getTemplate(BLOCK_NAME);
    }
    getCustomBlockMenuItems() {
        return this.executor.getMenuItems();
    }
    ValidateInputType({ VALUE, TYPE_DEFINITION }) {
        const type = TYPE_DEFINITION.toLowerCase();
        const forced = String(VALUE);
        if (!ValidScratchTypeDefinitions.includes(type))
            return false;
        switch (type) {
            case "boolean": {
                const v = forced.toLowerCase().trim();
                return v === "true" || v === "false";
            }
            case "number": return !isNaN(parseFloat(forced)) && isFinite(Number(forced));
            case "string": return true;
            case "object": try {
                const p = JSON.parse(forced);
                return typeof p === "object" && p !== null;
            }
            catch (_a) {
                return false;
            }
            default: return false;
        }
    }
    NewBoolean({ BOOL_VALUE }) {
        return String(BOOL_VALUE !== null && BOOL_VALUE !== void 0 ? BOOL_VALUE : "").toLowerCase().trim() === "true";
    }
    FetchVisibilityState(_, util) {
        var _a, _b;
        return (_b = (_a = this.getActiveSprite(util)) === null || _a === void 0 ? void 0 : _a.visible) !== null && _b !== void 0 ? _b : false;
    }
    FadeTransparency(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE, }, util) {
            var _b, _c, _d;
            const easings = {
                linear: t => t,
                easeIn: t => t * t,
                easeOut: t => t * (2 - t),
                easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
                bounce: t => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
            };
            if (TARGET_TRANSPARENCY == null ||
                TARGET_TRANSPARENCY < 0 ||
                TARGET_TRANSPARENCY > Matterer.MaxTransparency)
                return;
            const sprite = this.getActiveSprite(util);
            const spriteId = (_b = sprite === null || sprite === void 0 ? void 0 : sprite.id) !== null && _b !== void 0 ? _b : null;
            if (!spriteId || !sprite)
                return;
            const runtime = (_c = util.runtime) !== null && _c !== void 0 ? _c : null;
            if (!runtime)
                throw new Error("[Matterer] Runtime unavailable");
            const start = (_d = sprite.effects.ghost) !== null && _d !== void 0 ? _d : 0;
            const end = ANIMATION_DIRECTION === "IN" ? 0 : TARGET_TRANSPARENCY;
            const steps = Math.ceil(TARGET_TRANSPARENCY * runtime.frameLoop.framerate);
            try {
                this.__animating.add(spriteId);
                runtime.startHats("matterer_TrackAnimationStartTrigger");
                for (let i = 0; i < steps; i++) {
                    const eased = easings[ANIMATION_STYLE](i / steps);
                    sprite.setEffect("ghost", start + (end - start) * eased);
                    yield Matterer.waitOneFrame();
                }
                sprite.setEffect("ghost", end);
            }
            catch (err) {
                if (err != null)
                    console.error("[Matterer] FadeTransparency:", String(err));
            }
            finally {
                this.__animating.delete(spriteId);
                runtime.startHats("matterer_TrackAnimationEndTrigger");
            }
        });
    }
    TrackAnimationStartTrigger(_, _u) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Matterer.waitOneFrame();
            return true;
        });
    }
    TrackAnimationEndTrigger(_, _u) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Matterer.waitOneFrame();
            return true;
        });
    }
    CheckIsAnimatingProperty({ REQUESTED_ANIMATING_STATE_TYPE }, util) {
        const sprite = this.getActiveSprite(util);
        if (!sprite)
            return false;
        const is = this.__animating.has(sprite.id);
        return REQUESTED_ANIMATING_STATE_TYPE === "animating" ? is : !is;
    }
    LoopUntilAnimationFinished({ INCLUDES_SCREEN_REFRESH }, util) {
        const sprite = this.getActiveSprite(util);
        if (!sprite)
            return;
        if (this.__animating.has(sprite.id)) {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield Matterer.waitOneFrame();
                util.startBranch(1, INCLUDES_SCREEN_REFRESH);
            }))();
        }
    }
    ToggleCurrentRunningAnimation(_, _u) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Matterer.waitOneFrame();
        });
    }
}
Matterer.waitOneFrame = () => new Promise(r => requestAnimationFrame(() => r()));
Matterer.MaxTransparency = 100;
class MattererDefinitions extends Matterer {
    constructor() {
        super();
        if (this.scratch.extensions.unsandboxed) {
            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);
            this.executor.installAutoRefresh();
        }
        else {
            console.warn("[Matterer] Not unsandboxed — VM interaction may be limited.");
        }
    }
    getInfo() {
        return {
            id: "matterer",
            name: "Matterer Defines",
            color1: "#f542b0",
            color2: "#c41681",
            color3: "#a500a2",
            blocks: [
                {
                    blockType: Scratch.BlockType.BUTTON,
                    func: "e",
                    text: "🔄️ Reset Default Values",
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
                        TARGET_TRANSPARENCY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                        ANIMATION_DIRECTION: { type: Scratch.ArgumentType.STRING, menu: "AnimationDirectionChoice", defaultValue: "IN" },
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
                    opcode: "CheckIsAnimatingProperty",
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
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
                    arguments: {},
                },
                {
                    blockType: Scratch.BlockType.HAT,
                    opcode: "TrackAnimationEndTrigger",
                    text: "when animating ENDS",
                    shouldRestartExistingThreads: false,
                    isEdgeActivated: false,
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
                    blockType: Scratch.BlockType.BUTTON,
                    text: "🔄 Refresh My Blocks List",
                    func: "refreshCustomBlockMenu",
                },
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
                        BLOCK_NAME: { type: Scratch.ArgumentType.STRING, menu: "customBlockMenu", defaultValue: "" },
                    },
                },
            ],
            menus: {
                typeDefinitionMenu: { items: ["string", "number", "boolean", "object"], acceptReporters: true },
                BooleanPickerMenu: { items: ["TRUE", "FALSE"], acceptReporters: true },
                AnimationDirectionChoice: { items: ["IN", "OUT"], acceptReporters: true },
                AnimationStyleChoice: { items: ["linear", "easeIn", "easeOut", "easeInOut", "bounce"], acceptReporters: false },
                AnimatingStateTypeRequestMenu: { items: ["animating", "not animating"], acceptReporters: true },
                AnimationControlStateMenu: { items: ["STOP", "PAUSE", "RESUME"], acceptReporters: false },
                customBlockMenu: { acceptReporters: true, items: "getCustomBlockMenuItems" },
            },
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
