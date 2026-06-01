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
class MattererBundleExecutor {
    constructor(getRuntime) {
        this.getRuntime = getRuntime;
        this.procedureIndex = new Map();
        this.compiled = new Map();
        this.cachedMenuItems = [];
        this.menuCacheDirty = true;
        this.currentCursor = null;
    }
    refresh() {
        this.menuCacheDirty = true;
        this.cachedMenuItems = [];
        this.procedureIndex.clear();
        this.compiled.clear();
        this.scanCustomBlocks();
    }
    getCursor() {
        return this.currentCursor;
    }
    scanCustomBlocks() {
        var _a, _b, _c, _d, _e, _f;
        const runtime = this.getRuntime();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return;
        this.procedureIndex.clear();
        for (const target of runtime.targets) {
            const blocks = (_a = target.blocks) === null || _a === void 0 ? void 0 : _a._blocks;
            if (!blocks)
                continue;
            for (const [blockId, block] of Object.entries(blocks)) {
                if ((block === null || block === void 0 ? void 0 : block.opcode) !== "procedures_definition")
                    continue;
                const customBlockInput = (_b = block.inputs) === null || _b === void 0 ? void 0 : _b.custom_block;
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
    getMenuItems() {
        const runtime = this.getRuntime();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return [{ text: "(runtime not ready)", value: "" }];
        if (!this.menuCacheDirty && this.cachedMenuItems.length) {
            return this.cachedMenuItems;
        }
        this.scanCustomBlocks();
        const items = Array.from(this.procedureIndex.values())
            .sort((a, b) => a.proccode.localeCompare(b.proccode))
            .map((meta) => {
            let argIndex = 0;
            const text = meta.proccode.replace(/%[sbn]/g, match => {
                var _a;
                const name = (_a = meta.argumentNames[argIndex++]) !== null && _a !== void 0 ? _a : "?";
                if (match === "%b")
                    return `<${name}>`;
                if (match === "%n")
                    return `(${name})`;
                return `[${name}]`;
            });
            return { text, value: meta.proccode };
        });
        this.cachedMenuItems = items.length ? items : [{ text: "(no custom blocks yet)", value: "" }];
        this.menuCacheDirty = false;
        return this.cachedMenuItems;
    }
    getTemplate(blockName) {
        blockName = this.normalizeBlockName(blockName);
        this.scanCustomBlocks();
        const meta = this.procedureIndex.get(blockName);
        if (!meta || meta.argumentNames.length === 0)
            return "NO PARAMETERS";
        const template = {};
        meta.argumentNames.forEach((name, i) => {
            var _a;
            template[name] = (_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : "";
        });
        return JSON.stringify(template);
    }
    execute(blockNameRaw, paramsJson, util) {
        const blockName = this.normalizeBlockName(blockNameRaw);
        if (!blockName.trim()) {
            console.warn("[Matterer] No block name provided");
            return;
        }
        console.log("[Matterer] execute()");
        console.log("[Matterer] blockNameRaw =", blockNameRaw);
        console.log("[Matterer] paramsJson =", paramsJson);
        console.log("[Matterer] normalized =", blockName);
        let rawArgs = {};
        if ((paramsJson === null || paramsJson === void 0 ? void 0 : paramsJson.trim()) && paramsJson.trim() !== "{}") {
            try {
                rawArgs = JSON.parse(paramsJson);
            }
            catch (_a) {
                console.error("[Matterer] Invalid JSON:", paramsJson);
                return;
            }
        }
        this.scanCustomBlocks();
        console.log("[Matterer] known procedures:", [...this.procedureIndex.keys()]);
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
    compile(meta) {
        console.groupCollapsed("[Matterer] COMPILING...");
        console.log("[Matterer] compiling:\t" + meta.proccode);
        const run = (args, util) => {
            var _a, _b;
            const runtime = this.getRuntime();
            const blocks = (_b = (_a = meta.target) === null || _a === void 0 ? void 0 : _a.blocks) === null || _b === void 0 ? void 0 : _b._blocks;
            if (!blocks) {
                console.warn("[Matterer] Missing block container");
                return;
            }
            const params = this.buildParamValues(meta, args);
            const ctx = {
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
    runChain(startBlockId, ctx, util) {
        var _a;
        console.log("[Matterer] starting chain", startBlockId);
        let current = startBlockId;
        while (current) {
            const block = ctx.blocks[current];
            if (!block)
                break;
            ctx.cursor = current;
            this.currentCursor = current;
            ctx.trace.push(current);
            if (ctx.trace.length > 1000) {
                throw new Error("[Matterer] Maximum execution depth exceeded");
            }
            const next = this.runBlock(block, ctx, util);
            current = (typeof next === "string" && next.length > 0)
                ? next
                : ((_a = block.next) !== null && _a !== void 0 ? _a : null);
        }
    }
    runBlock(block, ctx, util) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35;
        switch (block.opcode) {
            case "control_repeat": {
                const times = Math.max(0, Math.floor(Number((_b = this.evalInput((_a = block.inputs) === null || _a === void 0 ? void 0 : _a.TIMES, ctx, util)) !== null && _b !== void 0 ? _b : 0)));
                const body = this.getSubstackId(block, "SUBSTACK", ctx);
                for (let i = 0; i < times; i++) {
                    if (body)
                        this.runChain(body, ctx, util);
                }
                return null;
            }
            case "control_if": {
                const cond = Boolean(this.evalInput((_c = block.inputs) === null || _c === void 0 ? void 0 : _c.CONDITION, ctx, util));
                if (cond) {
                    const body = this.getSubstackId(block, "SUBSTACK", ctx);
                    if (body)
                        this.runChain(body, ctx, util);
                }
                return null;
            }
            case "control_if_else": {
                const cond = Boolean(this.evalInput((_d = block.inputs) === null || _d === void 0 ? void 0 : _d.CONDITION, ctx, util));
                const body = cond
                    ? this.getSubstackId(block, "SUBSTACK", ctx)
                    : this.getSubstackId(block, "SUBSTACK2", ctx);
                if (body)
                    this.runChain(body, ctx, util);
                return null;
            }
            case "procedures_call": {
                const proccode = (_e = block.mutation) === null || _e === void 0 ? void 0 : _e.proccode;
                if (!proccode)
                    return null;
                const childMeta = this.procedureIndex.get(proccode);
                if (!childMeta)
                    return null;
                if (ctx.callStack.includes(proccode)) {
                    throw new Error(`[Matterer] Recursive call detected: ${proccode}`);
                }
                const childArgs = {};
                childMeta.argumentNames.forEach((name, i) => {
                    var _a, _b, _c, _d;
                    const id = childMeta.argumentIds[i];
                    const input = (_d = (_b = (id && ((_a = block.inputs) === null || _a === void 0 ? void 0 : _a[id]))) !== null && _b !== void 0 ? _b : (_c = block.inputs) === null || _c === void 0 ? void 0 : _c[name]) !== null && _d !== void 0 ? _d : null;
                    childArgs[name] = this.evalInput(input, ctx, util);
                });
                this.execute(proccode, JSON.stringify(childArgs), util);
                return null;
            }
            case "argument_reporter_string_number":
            case "argument_reporter_boolean": {
                const name = (_l = (_h = (_g = (_f = block === null || block === void 0 ? void 0 : block.fields) === null || _f === void 0 ? void 0 : _f.VALUE) === null || _g === void 0 ? void 0 : _g.value) !== null && _h !== void 0 ? _h : (_k = (_j = block === null || block === void 0 ? void 0 : block.fields) === null || _j === void 0 ? void 0 : _j.VALUE) === null || _k === void 0 ? void 0 : _k[0]) !== null && _l !== void 0 ? _l : "";
                return (_m = ctx.params[name]) !== null && _m !== void 0 ? _m : "";
            }
            case "operator_add":
                return Number((_p = this.evalInput((_o = block.inputs) === null || _o === void 0 ? void 0 : _o.NUM1, ctx, util)) !== null && _p !== void 0 ? _p : 0) +
                    Number((_r = this.evalInput((_q = block.inputs) === null || _q === void 0 ? void 0 : _q.NUM2, ctx, util)) !== null && _r !== void 0 ? _r : 0);
            case "operator_subtract":
                return Number((_t = this.evalInput((_s = block.inputs) === null || _s === void 0 ? void 0 : _s.NUM1, ctx, util)) !== null && _t !== void 0 ? _t : 0) -
                    Number((_v = this.evalInput((_u = block.inputs) === null || _u === void 0 ? void 0 : _u.NUM2, ctx, util)) !== null && _v !== void 0 ? _v : 0);
            case "operator_multiply":
                return Number((_x = this.evalInput((_w = block.inputs) === null || _w === void 0 ? void 0 : _w.NUM1, ctx, util)) !== null && _x !== void 0 ? _x : 0) *
                    Number((_z = this.evalInput((_y = block.inputs) === null || _y === void 0 ? void 0 : _y.NUM2, ctx, util)) !== null && _z !== void 0 ? _z : 0);
            case "operator_divide":
                return Number((_1 = this.evalInput((_0 = block.inputs) === null || _0 === void 0 ? void 0 : _0.NUM1, ctx, util)) !== null && _1 !== void 0 ? _1 : 0) /
                    Number((_3 = this.evalInput((_2 = block.inputs) === null || _2 === void 0 ? void 0 : _2.NUM2, ctx, util)) !== null && _3 !== void 0 ? _3 : 1);
            case "operator_equals":
                return this.evalInput((_4 = block.inputs) === null || _4 === void 0 ? void 0 : _4.OPERAND1, ctx, util) ===
                    this.evalInput((_5 = block.inputs) === null || _5 === void 0 ? void 0 : _5.OPERAND2, ctx, util);
            case "operator_gt":
                return Number((_7 = this.evalInput((_6 = block.inputs) === null || _6 === void 0 ? void 0 : _6.OPERAND1, ctx, util)) !== null && _7 !== void 0 ? _7 : 0) >
                    Number((_9 = this.evalInput((_8 = block.inputs) === null || _8 === void 0 ? void 0 : _8.OPERAND2, ctx, util)) !== null && _9 !== void 0 ? _9 : 0);
            case "operator_lt":
                return Number((_11 = this.evalInput((_10 = block.inputs) === null || _10 === void 0 ? void 0 : _10.OPERAND1, ctx, util)) !== null && _11 !== void 0 ? _11 : 0) <
                    Number((_13 = this.evalInput((_12 = block.inputs) === null || _12 === void 0 ? void 0 : _12.OPERAND2, ctx, util)) !== null && _13 !== void 0 ? _13 : 0);
            case "operator_and":
                return Boolean(this.evalInput((_14 = block.inputs) === null || _14 === void 0 ? void 0 : _14.OPERAND1, ctx, util)) &&
                    Boolean(this.evalInput((_15 = block.inputs) === null || _15 === void 0 ? void 0 : _15.OPERAND2, ctx, util));
            case "operator_or":
                return Boolean(this.evalInput((_16 = block.inputs) === null || _16 === void 0 ? void 0 : _16.OPERAND1, ctx, util)) ||
                    Boolean(this.evalInput((_17 = block.inputs) === null || _17 === void 0 ? void 0 : _17.OPERAND2, ctx, util));
            case "operator_not":
                return !Boolean(this.evalInput((_18 = block.inputs) === null || _18 === void 0 ? void 0 : _18.OPERAND, ctx, util));
            case "operator_join":
                return String((_20 = this.evalInput((_19 = block.inputs) === null || _19 === void 0 ? void 0 : _19.STRING1, ctx, util)) !== null && _20 !== void 0 ? _20 : "") +
                    String((_22 = this.evalInput((_21 = block.inputs) === null || _21 === void 0 ? void 0 : _21.STRING2, ctx, util)) !== null && _22 !== void 0 ? _22 : "");
            case "operator_mod":
                return Number((_24 = this.evalInput((_23 = block.inputs) === null || _23 === void 0 ? void 0 : _23.NUM1, ctx, util)) !== null && _24 !== void 0 ? _24 : 0) %
                    Number((_26 = this.evalInput((_25 = block.inputs) === null || _25 === void 0 ? void 0 : _25.NUM2, ctx, util)) !== null && _26 !== void 0 ? _26 : 1);
            case "operator_round":
                return Math.round(Number((_28 = this.evalInput((_27 = block.inputs) === null || _27 === void 0 ? void 0 : _27.NUM, ctx, util)) !== null && _28 !== void 0 ? _28 : 0));
            case "math_number":
                return Number((_31 = (_30 = (_29 = block.fields) === null || _29 === void 0 ? void 0 : _29.NUM) === null || _30 === void 0 ? void 0 : _30.value) !== null && _31 !== void 0 ? _31 : 0);
            case "text":
                return String((_34 = (_33 = (_32 = block.fields) === null || _32 === void 0 ? void 0 : _32.TEXT) === null || _33 === void 0 ? void 0 : _33.value) !== null && _34 !== void 0 ? _34 : "");
            case "looks_say":
                console.log("[Matterer says]", this.evalInput((_35 = block.inputs) === null || _35 === void 0 ? void 0 : _35.MESSAGE, ctx, util));
                return null;
            default:
                return null;
        }
    }
    evalInput(input, ctx, util) {
        var _a, _b;
        if (!input)
            return "";
        const blockId = (_b = (_a = input.block) !== null && _a !== void 0 ? _a : input.shadow) !== null && _b !== void 0 ? _b : null;
        if (blockId && ctx.blocks[blockId]) {
            return this.evalReporter(ctx.blocks[blockId], ctx, util);
        }
        if (input.name && ctx.blocks[input.name]) {
            return this.evalReporter(ctx.blocks[input.name], ctx, util);
        }
        if (input.value !== undefined)
            return input.value;
        return "";
    }
    evalReporter(block, ctx, util) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        if (!block)
            return "";
        switch (block.opcode) {
            case "math_number":
                return Number((_c = (_b = (_a = block.fields) === null || _a === void 0 ? void 0 : _a.NUM) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : 0);
            case "text":
                return String((_f = (_e = (_d = block.fields) === null || _d === void 0 ? void 0 : _d.TEXT) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : "");
            case "argument_reporter_string_number":
            case "argument_reporter_boolean": {
                const name = (_j = (_h = (_g = block === null || block === void 0 ? void 0 : block.fields) === null || _g === void 0 ? void 0 : _g.VALUE) === null || _h === void 0 ? void 0 : _h.value) !== null && _j !== void 0 ? _j : "";
                return (_k = ctx.params[name]) !== null && _k !== void 0 ? _k : "";
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
                return (_o = (_m = (_l = block.fields) === null || _l === void 0 ? void 0 : _l.VALUE) === null || _m === void 0 ? void 0 : _m.value) !== null && _o !== void 0 ? _o : "";
        }
    }
    buildParamValues(meta, args) {
        const positionalValues = Object.values(args);
        const out = {};
        meta.argumentNames.forEach((name, i) => {
            const raw = Object.prototype.hasOwnProperty.call(args, name)
                ? args[name]
                : (i < positionalValues.length ? positionalValues[i] : meta.argumentDefaults[i]);
            out[name] = raw === undefined || raw === null ? "" : raw;
            if (meta.argumentIds[i])
                out[meta.argumentIds[i]] = out[name];
            out[String(i)] = out[name];
        });
        return out;
    }
    getSubstackId(block, inputName, ctx) {
        var _a, _b, _c;
        const input = (_a = block.inputs) === null || _a === void 0 ? void 0 : _a[inputName];
        const bodyId = (_c = (_b = input === null || input === void 0 ? void 0 : input.block) !== null && _b !== void 0 ? _b : input === null || input === void 0 ? void 0 : input.shadow) !== null && _c !== void 0 ? _c : null;
        if (bodyId && ctx.blocks[bodyId])
            return bodyId;
        return null;
    }
    getFirstBodyBlockId(meta, blocks) {
        var _a;
        const def = blocks[meta.definitionBlockId];
        return (_a = def === null || def === void 0 ? void 0 : def.next) !== null && _a !== void 0 ? _a : null;
    }
    normalizeBlockName(value) {
        var _a, _b, _c, _d;
        if (typeof value === "string")
            return value;
        if (value && typeof value === "object") {
            const obj = value;
            return String((_d = (_c = (_b = (_a = obj.value) !== null && _a !== void 0 ? _a : obj.text) !== null && _b !== void 0 ? _b : obj.proccode) !== null && _c !== void 0 ? _c : obj.blockName) !== null && _d !== void 0 ? _d : "");
        }
        return String(value !== null && value !== void 0 ? value : "");
    }
}
class Matterer {
    constructor() {
        this.executor = new MattererBundleExecutor(() => { var _a; return (_a = Scratch === null || Scratch === void 0 ? void 0 : Scratch.vm) === null || _a === void 0 ? void 0 : _a.runtime; });
        this.__currentlyAnimating = new Set();
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
    }
    getActiveSprite(util) {
        var _a, _b, _c, _d, _e;
        return (_e = (_d = (_a = util === null || util === void 0 ? void 0 : util.target) !== null && _a !== void 0 ? _a : (_c = (_b = Scratch.vm.runtime.sequencer) === null || _b === void 0 ? void 0 : _b.activeThread) === null || _c === void 0 ? void 0 : _c.target) !== null && _d !== void 0 ? _d : Scratch.vm.runtime._editingTarget) !== null && _e !== void 0 ? _e : null;
    }
    refreshCustomBlockMenu() {
        var _a, _b;
        this.executor.refresh();
        (_b = (_a = Scratch.vm) === null || _a === void 0 ? void 0 : _a.refreshWorkspace) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
    ExecuteMyBlock({ BLOCK_NAME, PARAMS_JSON }, util) {
        console.log("[Matterer] ExecuteMyBlock called");
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
                    const CalculatedGhostValueTarget = TARGET_TRANSPARENCY;
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
        this.executor.refresh();
        if (this.scratch.extensions.unsandboxed) {
            this.getCustomBlockMenuItems = this.getCustomBlockMenuItems.bind(this);
            console.debug(Scratch.BlockType.CONDITIONAL);
            console.debug(Scratch.BlockType.LOOP);
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
                    items: "getCustomBlockMenuItems"
                },
            },
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
