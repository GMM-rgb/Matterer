"use strict";
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
class MattererBundleExecutor {
    constructor(getRuntime) {
        this.getRuntime = getRuntime;
        this.explicitResetCounter = 0;
    }
    installAutoRefresh() {
        console.log("[Matterer Debug] Auto-refresh subsystem registered.");
    }
    forceRebuild() {
        this.explicitResetCounter++;
        console.warn(`[Matterer Diagnostics] 🔄 Hard rebuild forced manually! (Trigger count: ${this.explicitResetCounter})`);
    }
    getMenuItems() {
        console.debug("[Matterer Diagnostics] Dropdown menu opened. Querying live VM targets...");
        const runtime = this.getRuntime();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets)) {
            console.warn("[Matterer Diagnostics] No VM targets discovered during menu query.");
            return [{ text: "(no custom blocks yet)", value: "" }];
        }
        const index = this.buildProcedureIndex(runtime);
        console.debug(`[Matterer Diagnostics] Found ${index.size} custom definitions in the project.`);
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
        return items.length ? items : [{ text: "(no custom blocks yet)", value: "" }];
    }
    manageLiveParameter(paramName, newValue = null, util) {
        var _a, _b;
        const thread = (_a = util.sequencer) === null || _a === void 0 ? void 0 : _a.activeThread;
        if (!thread)
            return "NO_THREAD";
        const currentFrame = thread.stackFrame;
        if (!currentFrame || !currentFrame.params)
            return "NO_PARAMS";
        const procedureCode = thread.targetProcedure;
        const runtime = thread.runtime || this.getRuntime();
        const procDefinition = (_b = runtime === null || runtime === void 0 ? void 0 : runtime.getProcedureDefinition) === null || _b === void 0 ? void 0 : _b.call(runtime, procedureCode);
        let targetKey = null;
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
                }
                else {
                    currentFrame.params[targetKey] = newValue;
                }
                return newValue;
            }
            else {
                const rawParam = currentFrame.params[targetKey];
                return typeof rawParam === 'function' ? rawParam() : rawParam;
            }
        }
        return 0;
    }
    getTemplate(blockName) {
        blockName = normalizeBlockName(blockName);
        console.log(`[Matterer Debug] Requesting template structure for block: "${blockName}"`);
        const runtime = this.getRuntime();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return "NO PARAMETERS";
        const meta = this.buildProcedureIndex(runtime).get(blockName);
        if (!meta || meta.argumentNames.length === 0) {
            console.info(`[Matterer Debug] Block "${blockName}" contains zero custom arguments.`);
            return "NO PARAMETERS";
        }
        const tpl = {};
        meta.argumentNames.forEach((name, i) => { var _a; tpl[name] = (_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : ""; });
        return JSON.stringify(tpl);
    }
    execute(blockNameRaw, paramsJson, util) {
        var _a;
        const blockName = normalizeBlockName(blockNameRaw);
        console.groupCollapsed(`[Matterer Execution] Invoking Block: "${blockName}"`);
        console.log(`[Raw Payload]:`, paramsJson);
        if (!blockName.trim()) {
            console.error("[Matterer Error] Aborting execution: Target block name is blank.");
            console.groupEnd();
            return;
        }
        let parsedArgs = [];
        const trimmed = paramsJson === null || paramsJson === void 0 ? void 0 : paramsJson.trim();
        if (trimmed && trimmed !== "{}" && trimmed !== "[]") {
            try {
                parsedArgs = JSON.parse(trimmed);
                console.log("[Parsed Data Match]: Successfully resolved JSON payload structure.", parsedArgs);
                if (typeof parsedArgs !== "object" || parsedArgs === null) {
                    parsedArgs = [parsedArgs];
                }
            }
            catch (jsonErr) {
                console.warn(`[Matterer JSON Warning] Payload parsing failed. Treating as literal input string. Error:`, jsonErr);
                parsedArgs = [trimmed];
            }
        }
        else {
            console.log("[Parsed Data Match]: Payload is empty/default object.");
        }
        const runtime = (_a = util.runtime) !== null && _a !== void 0 ? _a : this.getRuntime();
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
    spawnThread(meta, parsedArgs, util, runtime) {
        const mergedParams = {};
        const isArray = Array.isArray(parsedArgs);
        console.log(`[Parameter Binding] Aligning properties to block recipe variables:`, meta.argumentNames);
        meta.argumentNames.forEach((name, i) => {
            var _a, _b, _c;
            let val;
            if (isArray) {
                val = i < parsedArgs.length ? parsedArgs[i] : (_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : "";
            }
            else {
                val = Object.prototype.hasOwnProperty.call(parsedArgs, name)
                    ? parsedArgs[name]
                    : (_b = meta.argumentDefaults[i]) !== null && _b !== void 0 ? _b : "";
            }
            mergedParams[name] = val;
            if (meta.argumentIds[i]) {
                mergedParams[meta.argumentIds[i]] = val;
            }
            console.log(`  -> Property [${name}] (ID: ${(_c = meta.argumentIds[i]) !== null && _c !== void 0 ? _c : "N/A"}) wrapped to value:`, val);
        });
        const thread = runtime._pushThread(meta.definitionBlockId, meta.target, { stackClick: false, updateMonitor: false });
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
        thread.procedureArguments = meta.argumentNames.map(n => { var _a; return (_a = mergedParams[n]) !== null && _a !== void 0 ? _a : ""; });
        if (thread.stackFrame) {
            thread.stackFrame.params = mergedParams;
            thread.stackFrame.parametersCache = thread.stackFrame.parametersCache || {};
            thread.stackFrame.parametersCache[meta.proccode] = mergedParams;
        }
        console.info(`[Thread Dispatch] Thread dispatched successfully. Block definition runtime linked via ${meta.definitionBlockId}.`);
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
        this.__animatingTimers = new Map();
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
    }
    getActiveSprite(util) {
        var _a, _b, _c, _d, _e;
        return ((_e = (_d = (_a = util === null || util === void 0 ? void 0 : util.target) !== null && _a !== void 0 ? _a : (_c = (_b = Scratch.vm.runtime.sequencer) === null || _b === void 0 ? void 0 : _b.activeThread) === null || _c === void 0 ? void 0 : _c.target) !== null && _d !== void 0 ? _d : Scratch.vm.runtime._editingTarget) !== null && _e !== void 0 ? _e : null);
    }
    refreshCustomBlockMenu() {
        console.log("[Manual Reset] User requested an emergency pipeline synchronization...");
        this.executor.forceRebuild();
        try {
            const vm = Scratch.vm;
            if (vm) {
                if (typeof vm.refreshWorkspace === "function")
                    vm.refreshWorkspace();
                if (typeof vm.emitWorkspaceUpdate === "function")
                    vm.emitWorkspaceUpdate();
                console.log("[Manual Reset] GUI engine components successfully signaled.");
            }
            else {
                console.warn("[Manual Reset Warning] Scratch VM instance inaccessible for visual updates.");
            }
        }
        catch (e) {
            console.error("[Manual Reset Error] Emergency workspace synchronization pipeline failed:", e);
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
    getParamValueBlock(args, util) {
        return this.executor.manageLiveParameter(args.NAME, null, util);
    }
    setParamValueBlock(args, util) {
        return this.executor.manageLiveParameter(args.NAME, args.VALUE, util);
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
    FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE, }, util) {
        var _a, _b;
        if (TARGET_TRANSPARENCY == null || TARGET_TRANSPARENCY < 0 || TARGET_TRANSPARENCY > Matterer.MaxTransparency)
            return;
        const sprite = this.getActiveSprite(util);
        if (!sprite)
            return;
        const spriteId = sprite.id;
        const runtime = Scratch.vm.runtime;
        const currentFPS = runtime.currentStepTime ? (1000 / runtime.currentStepTime) : 30;
        const animationDurationMs = (TARGET_TRANSPARENCY / currentFPS) * 1000;
        const startGhost = (_b = (_a = sprite.effects) === null || _a === void 0 ? void 0 : _a.ghost) !== null && _b !== void 0 ? _b : 0;
        const endGhost = ANIMATION_DIRECTION === "IN" ? 0 : TARGET_TRANSPARENCY;
        this.__animatingTimers.set(spriteId, {
            start: Date.now(),
            duration: Math.max(animationDurationMs, 50),
            startGhost,
            endGhost,
            style: ANIMATION_STYLE
        });
        runtime.startHats("matterer_TrackAnimationStartTrigger");
    }
    TrackAnimationStartTrigger(_, _u) {
        return true;
    }
    TrackAnimationEndTrigger(_, _u) {
        return true;
    }
    checkIsAnimatingProperty({ REQUESTED_ANIMATING_STATE_TYPE }, util) {
        const sprite = this.getActiveSprite(util);
        if (!sprite)
            return false;
        this._updateAnimationTickerForSprite(sprite);
        const is = this.__animatingTimers.has(sprite.id);
        return REQUESTED_ANIMATING_STATE_TYPE === "animating" ? is : !is;
    }
    LoopUntilAnimationFinished({ INCLUDES_SCREEN_REFRESH }, util) {
        const sprite = this.getActiveSprite(util);
        if (!sprite)
            return;
        const animating = this._updateAnimationTickerForSprite(sprite);
        if (animating) {
            util.startBranch(1, INCLUDES_SCREEN_REFRESH);
        }
    }
    ToggleCurrentRunningAnimation(args, util) {
        return __awaiter(this, void 0, void 0, function* () {
            const sprite = this.getActiveSprite(util);
            if (!sprite)
                return;
            if (args.ANIMATION_TOGGLE_STATE === "STOP") {
                this.__animatingTimers.delete(sprite.id);
                Scratch.vm.runtime.startHats("matterer_TrackAnimationEndTrigger");
            }
        });
    }
    _updateAnimationTickerForSprite(sprite) {
        if (!sprite || !this.__animatingTimers.has(sprite.id))
            return false;
        const anim = this.__animatingTimers.get(sprite.id);
        const elapsed = Date.now() - anim.start;
        const progress = Math.min(elapsed / anim.duration, 1);
        const easings = {
            linear: t => t,
            easeIn: t => t * t,
            easeOut: t => t * (2 - t),
            easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            bounce: t => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
        };
        const easedProgress = easings[anim.style](progress);
        const nextGhostValue = anim.startGhost + (anim.endGhost - anim.startGhost) * easedProgress;
        if (typeof sprite.setEffect === "function") {
            sprite.setEffect("ghost", nextGhostValue);
        }
        else if (sprite.effects) {
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
            console.warn("[Matterer] Warning: Extension running in sandboxed environment.");
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
                typeDefinitionMenu: { acceptReporters: true, items: ["string", "number", "boolean", "object"] },
                BooleanPickerMenu: { acceptReporters: true, items: ["TRUE", "FALSE"] },
                AnimationDirectionChoice: { acceptReporters: false, items: ["IN", "OUT"] },
                AnimationStyleChoice: { acceptReporters: false, items: ["linear", "easeIn", "easeOut", "easeInOut", "bounce"] },
                AnimatingStateTypeRequestMenu: { acceptReporters: false, items: ["animating", "not animating"] },
                AnimationControlStateMenu: { acceptReporters: true, items: ["STOP", "PAUSE", "RESUME"] },
                customBlockMenu: { acceptReporters: true, items: "getCustomBlockMenuItems" }
            }
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
