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
const MATTERER_SWITCH_CONTEXT_KEY = "__mattererSwitchContext";
function mattererValuesEqual(left, right) {
    if (left === right)
        return true;
    const leftText = String(left !== null && left !== void 0 ? left : "");
    const rightText = String(right !== null && right !== void 0 ? right : "");
    const leftNumber = Number(leftText);
    const rightNumber = Number(rightText);
    if (leftText.trim() !== "" &&
        rightText.trim() !== "" &&
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber)) {
        return leftNumber === rightNumber;
    }
    return leftText.toLowerCase() === rightText.toLowerCase();
}
class MattererCompilerCompatibleSwitchBackend {
    constructor() {
        this.contexts = new WeakMap();
    }
    getThread(util) {
        const thread = util === null || util === void 0 ? void 0 : util.thread;
        if ((typeof thread !== "object" && typeof thread !== "function") || thread === null) {
            return null;
        }
        return thread;
    }
    begin(value, util) {
        var _a;
        const thread = this.getThread(util);
        if (!thread) {
            console.warn("[Matterer Compiler Switch] Cannot begin: the VM did not provide an execution thread.");
            return;
        }
        const stack = (_a = this.contexts.get(thread)) !== null && _a !== void 0 ? _a : [];
        stack.push({ value });
        this.contexts.set(thread, stack);
        console.debug("[Matterer Compiler Switch] Began switch context.", {
            value,
            nestingDepth: stack.length,
        });
    }
    matches(caseValue, util) {
        const thread = this.getThread(util);
        if (!thread)
            return false;
        const stack = this.contexts.get(thread);
        const context = stack === null || stack === void 0 ? void 0 : stack[stack.length - 1];
        if (!context) {
            console.warn("[Matterer Compiler Switch] No active context. Add 'begin compiler switch' before the native IF/ELSE chain.");
            return false;
        }
        return mattererValuesEqual(context.value, caseValue);
    }
    end(util) {
        const thread = this.getThread(util);
        if (!thread) {
            console.warn("[Matterer Compiler Switch] Cannot end: the VM did not provide an execution thread.");
            return;
        }
        const stack = this.contexts.get(thread);
        if (!(stack === null || stack === void 0 ? void 0 : stack.length)) {
            console.warn("[Matterer Compiler Switch] end called without a matching begin.");
            return;
        }
        stack.pop();
        if (stack.length === 0)
            this.contexts.delete(thread);
        console.debug("[Matterer Compiler Switch] Ended switch context.", {
            remainingDepth: stack.length,
        });
    }
}
class MattererSwitchCompilerLowerer {
    constructor() {
        this.cache = new WeakMap();
        this.generatedId = 0;
    }
    lower(sourceBlocks) {
        var _a;
        var _b;
        if (!(sourceBlocks === null || sourceBlocks === void 0 ? void 0 : sourceBlocks._blocks) || typeof sourceBlocks.duplicate !== "function") {
            return { blocks: sourceBlocks, changed: false, invalidSwitches: [] };
        }
        const sourceMap = sourceBlocks._blocks;
        const switchIds = Object.keys(sourceMap).filter((id) => { var _a; var _b; return String((_b = (_a = sourceMap[id]) === null || _a === void 0 ? void 0 : _a.opcode) !== null && _b !== void 0 ? _b : "").toLowerCase() === "matterer_switch"; });
        if (switchIds.length === 0) {
            return { blocks: sourceBlocks, changed: false, invalidSwitches: [] };
        }
        const version = (_b = (_a = sourceBlocks._cache) === null || _a === void 0 ? void 0 : _a.compiledScripts) !== null && _b !== void 0 ? _b : sourceBlocks._blocks;
        const cached = this.cache.get(sourceBlocks);
        if (cached && cached.version === version) {
            return {
                blocks: cached.blocks,
                changed: true,
                invalidSwitches: cached.invalidSwitches.slice(),
            };
        }
        const loweredBlocks = sourceBlocks.duplicate();
        const invalidSwitches = [];
        let changed = false;
        for (const switchId of switchIds) {
            const result = this.lowerOne(loweredBlocks, switchId);
            if (result === "lowered")
                changed = true;
            else if (result === "invalid")
                invalidSwitches.push(switchId);
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
    nextId(blocks) {
        let id = "";
        do {
            id = `__matterer_switch_generated_${++this.generatedId}`;
        } while (Object.prototype.hasOwnProperty.call(blocks._blocks, id));
        return id;
    }
    inputRef(name, block, shadow = null) {
        return { name, block, shadow };
    }
    setParent(blocks, childId, parentId) {
        if (!childId)
            return;
        const child = blocks.getBlock(childId);
        if (child)
            child.parent = parentId;
    }
    getBranchRef(block, name) {
        var _a;
        var _b, _c;
        const input = (_a = block === null || block === void 0 ? void 0 : block.inputs) === null || _a === void 0 ? void 0 : _a[name];
        return input ? { name, block: (_b = input.block) !== null && _b !== void 0 ? _b : null, shadow: (_c = input.shadow) !== null && _c !== void 0 ? _c : null } :
            { name, block: null, shadow: null };
    }
    lowerOne(blocks, switchId) {
        var _a, _b;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        const switchBlock = blocks.getBlock(switchId);
        if (!switchBlock || String((_c = switchBlock.opcode) !== null && _c !== void 0 ? _c : "").toLowerCase() !== "matterer_switch") {
            return "missing";
        }
        const originalNextId = (_d = switchBlock.next) !== null && _d !== void 0 ? _d : null;
        const switchValueInput = (_a = switchBlock.inputs) === null || _a === void 0 ? void 0 : _a.VALUE;
        if (!switchValueInput)
            return "invalid";
        const entries = [];
        let childId = (_e = blocks.getBranch(switchId, 1)) !== null && _e !== void 0 ? _e : null;
        const visited = new Set();
        let sawDefault = false;
        while (childId) {
            if (visited.has(childId))
                return "invalid";
            visited.add(childId);
            const child = blocks.getBlock(childId);
            const opcode = String((_f = child === null || child === void 0 ? void 0 : child.opcode) !== null && _f !== void 0 ? _f : "").toLowerCase();
            if (opcode === "matterer_case") {
                if (sawDefault || !((_b = child.inputs) === null || _b === void 0 ? void 0 : _b.CASE_VALUE))
                    return "invalid";
                entries.push({ id: childId, type: "case" });
            }
            else if (opcode === "matterer_defaultcase") {
                if (sawDefault)
                    return "invalid";
                sawDefault = true;
                entries.push({ id: childId, type: "default" });
            }
            else {
                return "invalid";
            }
            childId = (_g = child.next) !== null && _g !== void 0 ? _g : null;
        }
        if (entries.length === 0)
            return "invalid";
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
        switchBlock.opcode = "matterer_BeginSwitchExecution";
        switchBlock.inputs = {
            VALUE: this.inputRef("VALUE", (_h = switchValueInput.block) !== null && _h !== void 0 ? _h : null, (_j = switchValueInput.shadow) !== null && _j !== void 0 ? _j : null),
        };
        const caseEntries = entries.filter(entry => entry.type === "case");
        const defaultEntry = (_k = entries.find(entry => entry.type === "default")) !== null && _k !== void 0 ? _k : null;
        if (caseEntries.length === 0) {
            const defaultBlock = defaultEntry ? blocks.getBlock(defaultEntry.id) : null;
            const defaultRef = defaultBlock ? this.getBranchRef(defaultBlock, "SUBSTACK") : null;
            const defaultBodyId = (_l = defaultRef === null || defaultRef === void 0 ? void 0 : defaultRef.block) !== null && _l !== void 0 ? _l : null;
            switchBlock.next = defaultBodyId !== null && defaultBodyId !== void 0 ? defaultBodyId : endId;
            if (defaultBodyId) {
                this.setParent(blocks, defaultBodyId, switchId);
                const endParent = this.findSequenceTail(blocks, defaultBodyId);
                endBlock.parent = endParent !== null && endParent !== void 0 ? endParent : switchId;
                this.appendAfterSequence(blocks, defaultBodyId, endId);
            }
            if (defaultEntry)
                delete blocks._blocks[defaultEntry.id];
            if (!defaultBodyId)
                endBlock.parent = switchId;
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
            const nextCase = (_m = caseEntries[index + 1]) !== null && _m !== void 0 ? _m : null;
            let elseRef = this.inputRef("SUBSTACK2", null);
            let nestedCaseId = null;
            if (nextCase) {
                nestedCaseId = nextCase.id;
                elseRef = this.inputRef("SUBSTACK2", nestedCaseId);
                blocks._blocks[nestedCaseId].parent = entry.id;
            }
            else if (defaultEntry) {
                const defaultBlock = blocks.getBlock(defaultEntry.id);
                const defaultBody = this.getBranchRef(defaultBlock, "SUBSTACK");
                elseRef = this.inputRef("SUBSTACK2", defaultBody.block, defaultBody.shadow);
                this.setParent(blocks, defaultBody.block, entry.id);
            }
            const reporterBlock = {
                id: reporterId,
                opcode: "matterer_SwitchCaseMatches",
                inputs: {
                    CASE_VALUE: this.inputRef("CASE_VALUE", (_o = originalCaseValue.block) !== null && _o !== void 0 ? _o : null, (_p = originalCaseValue.shadow) !== null && _p !== void 0 ? _p : null),
                },
                fields: {},
                next: null,
                topLevel: false,
                parent: entry.id,
                shadow: false,
            };
            blocks._blocks[reporterId] = reporterBlock;
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
        if (defaultEntry)
            delete blocks._blocks[defaultEntry.id];
        endBlock.parent = firstCaseId;
        if (originalNextId)
            this.setParent(blocks, originalNextId, endId);
        return "lowered";
    }
    findSequenceTail(blocks, startId) {
        let currentId = startId;
        const visited = new Set();
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const currentBlock = blocks.getBlock(currentId);
            if (!currentBlock)
                return null;
            if (!currentBlock.next)
                return currentId;
            currentId = currentBlock.next;
        }
        return null;
    }
    appendAfterSequence(blocks, startId, nextId) {
        const tailId = this.findSequenceTail(blocks, startId);
        if (!tailId)
            return;
        const tail = blocks.getBlock(tailId);
        tail.next = nextId;
        this.setParent(blocks, nextId, tailId);
    }
}
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
        var _c;
        const thread = ((_c = util === null || util === void 0 ? void 0 : util.thread) !== null && _c !== void 0 ? _c : (_a = util === null || util === void 0 ? void 0 : util.sequencer) === null || _a === void 0 ? void 0 : _a.activeThread);
        if (!thread)
            return "NO_THREAD";
        const frames = thread.stackFrames;
        if (!Array.isArray(frames))
            return "NO_PARAMS";
        for (let i = frames.length - 1; i >= 0; i--) {
            const params = (_b = frames[i]) === null || _b === void 0 ? void 0 : _b.params;
            if (params === null || typeof params !== "object")
                continue;
            if (!Object.prototype.hasOwnProperty.call(params, paramName))
                return 0;
            if (newValue !== null) {
                params[paramName] = newValue;
                return newValue;
            }
            return params[paramName];
        }
        return "NO_PARAMS";
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
        var _b, _c;
        const blockName = normalizeBlockName(blockNameRaw);
        console.groupCollapsed(`[Matterer Execution] Invoking Block: "${blockName}"`);
        try {
            console.log("[Raw Payload]:", paramsJson);
            if (!blockName.trim()) {
                console.error("[Matterer Error] Aborting execution: Target block name is blank.");
                return;
            }
            let parsedArgs = {};
            const trimmed = paramsJson === null || paramsJson === void 0 ? void 0 : paramsJson.trim();
            if (trimmed) {
                try {
                    parsedArgs = JSON.parse(trimmed);
                    console.log("[Parsed Data Match]: Successfully resolved JSON payload structure.", parsedArgs);
                    if (parsedArgs === null || typeof parsedArgs !== "object")
                        parsedArgs = [parsedArgs];
                }
                catch (jsonErr) {
                    console.warn("[Matterer JSON Warning] Payload parsing failed. Treating as literal input string.", jsonErr);
                    parsedArgs = [trimmed];
                }
            }
            const runtime = (_b = util.runtime) !== null && _b !== void 0 ? _b : this.getRuntime();
            const preferredTarget = (_c = util.target) !== null && _c !== void 0 ? _c : (_a = util === null || util === void 0 ? void 0 : util.thread) === null || _a === void 0 ? void 0 : _a.target;
            let meta = preferredTarget
                ? this.buildProcedureIndex(runtime, preferredTarget).get(blockName)
                : undefined;
            if (!meta)
                meta = this.buildProcedureIndex(runtime).get(blockName);
            if (!meta) {
                console.error(`[Matterer Fatal Error] No custom block definition found for: "${blockName}".`);
                return;
            }
            this.spawnThread(meta, parsedArgs, runtime);
        }
        finally {
            console.groupEnd();
        }
    }
    buildProcedureIndex(runtime, preferredTarget) {
        var _a, _b, _c;
        const index = new Map();
        if (!(runtime === null || runtime === void 0 ? void 0 : runtime.targets))
            return index;
        const targets = preferredTarget ? [preferredTarget] : runtime.targets;
        for (const target of targets) {
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
                const parseStringArray = (value) => {
                    try {
                        const parsed = JSON.parse(String(value !== null && value !== void 0 ? value : "[]"));
                        return Array.isArray(parsed) ? parsed.map(item => String(item !== null && item !== void 0 ? item : "")) : [];
                    }
                    catch (_a) {
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
    spawnThread(meta, parsedArgs, runtime) {
        const arrayArgs = Array.isArray(parsedArgs) ? parsedArgs : null;
        const objectArgs = !arrayArgs && parsedArgs !== null && typeof parsedArgs === "object"
            ? parsedArgs
            : null;
        const values = meta.argumentNames.map((name, i) => {
            var _a, _b;
            const argumentId = meta.argumentIds[i];
            let value;
            if (arrayArgs) {
                value = i < arrayArgs.length ? arrayArgs[i] : (_a = meta.argumentDefaults[i]) !== null && _a !== void 0 ? _a : "";
            }
            else if (objectArgs && Object.prototype.hasOwnProperty.call(objectArgs, name)) {
                value = objectArgs[name];
            }
            else if (objectArgs && argumentId && Object.prototype.hasOwnProperty.call(objectArgs, argumentId)) {
                value = objectArgs[argumentId];
            }
            else {
                value = (_b = meta.argumentDefaults[i]) !== null && _b !== void 0 ? _b : "";
            }
            console.log(`  -> Bound parameter [${name}] (argument ID: ${argumentId !== null && argumentId !== void 0 ? argumentId : "N/A"}):`, value);
            return { name, value };
        });
        if (typeof (runtime === null || runtime === void 0 ? void 0 : runtime._pushThread) !== "function") {
            console.error("[Matterer Runtime Error] This VM does not expose the required thread creation hook.");
            return;
        }
        const thread = runtime._pushThread(null, meta.target, { stackClick: false, updateMonitor: false });
        if (!thread || typeof thread.initParams !== "function" ||
            typeof thread.pushParam !== "function" || typeof thread.pushStack !== "function") {
            console.error("[Matterer Runtime Error] Scratch returned an incompatible procedure thread.");
            if (thread && typeof runtime._stopThread === "function")
                runtime._stopThread(thread);
            return;
        }
        thread.initParams();
        for (const { name, value } of values)
            thread.pushParam(name, value);
        thread.pushStack(meta.definitionBlockId);
        thread.topBlock = meta.definitionBlockId;
        if (typeof thread.isRecursiveCall === "function") {
            thread.isRecursiveCall = (procedureCode) => {
                var _a, _b, _c, _d;
                let callCount = 5;
                for (let i = thread.stack.length - 2; i >= 0; i--) {
                    const blockId = thread.stack[i];
                    if (!blockId)
                        continue;
                    const block = (_c = (_b = (_a = thread.target) === null || _a === void 0 ? void 0 : _a.blocks) === null || _b === void 0 ? void 0 : _b.getBlock) === null || _c === void 0 ? void 0 : _c.call(_b, blockId);
                    if ((block === null || block === void 0 ? void 0 : block.opcode) === "procedures_call" &&
                        ((_d = block.mutation) === null || _d === void 0 ? void 0 : _d.proccode) === procedureCode) {
                        return true;
                    }
                    if (--callCount < 0)
                        return false;
                }
                return false;
            };
        }
        console.info(`[Thread Dispatch] Procedure thread dispatched with ${values.length} bound parameter(s). Definition: ${meta.definitionBlockId}.`);
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
        this.compilerCompatibleSwitch = new MattererCompilerCompatibleSwitchBackend();
        this.switchCompilerLowerer = new MattererSwitchCompilerLowerer();
        this.__animatingTimers = new Map();
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
    }
    installSwitchCompilerLowering() {
        var _a, _b;
        const runtime = (_b = (_a = this.scratch) === null || _a === void 0 ? void 0 : _a.vm) === null || _b === void 0 ? void 0 : _b.runtime;
        if (!runtime || runtime.__mattererSwitchCompilerLoweringInstalled)
            return;
        if (typeof runtime._pushThread !== "function" || typeof runtime._restartThread !== "function") {
            console.warn("[Matterer Switch] Compiler lowering hooks are unavailable; switch will use interpreter execution.");
            return;
        }
        const extension = this;
        const originalPushThread = runtime._pushThread;
        const originalRestartThread = runtime._restartThread;
        const compileOnLoweredGraph = (thread) => {
            var _a;
            var _b, _c;
            if (!thread || typeof thread.tryCompile !== "function")
                return;
            const sourceBlocks = (_b = (_a = thread.target) === null || _a === void 0 ? void 0 : _a.blocks) !== null && _b !== void 0 ? _b : thread.blockContainer;
            if (!sourceBlocks)
                return;
            const result = extension.switchCompilerLowerer.lower(sourceBlocks);
            const sourceHasSwitch = Object.values((_c = sourceBlocks._blocks) !== null && _c !== void 0 ? _c : {}).some((block) => { var _a; return String((_a = block === null || block === void 0 ? void 0 : block.opcode) !== null && _a !== void 0 ? _a : "").toLowerCase() === "matterer_switch"; });
            if (result.invalidSwitches.length > 0) {
                console.warn("[Matterer Switch] Invalid switch structures were left for interpreter validation.", {
                    switchBlockIds: result.invalidSwitches,
                });
            }
            if (sourceHasSwitch && (!result.changed || result.invalidSwitches.length > 0)) {
                thread.blockContainer = sourceBlocks;
                thread.triedToCompile = true;
                console.info("[Matterer Switch] This script will use the interpreter because its switch graph could not be lowered safely.");
                return;
            }
            if (result.changed) {
                const requiredHelpers = [
                    "matterer_BeginSwitchExecution",
                    "matterer_SwitchCaseMatches",
                    "matterer_EndSwitchExecution",
                ];
                const missingHelpers = requiredHelpers.filter((opcode) => { var _a; return typeof ((_a = runtime.getOpcodeFunction) === null || _a === void 0 ? void 0 : _a.call(runtime, opcode)) !== "function"; });
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
                thread.blockContainer = sourceBlocks;
                thread.triedToCompile = true;
                console.warn("[Matterer Switch] Compiler lowering was rejected; restored the original switch graph for interpreter execution.");
            }
        };
        runtime._pushThread = function (id, target, opts) {
            var _a;
            const shouldCompile = Boolean(((_a = this.compilerOptions) === null || _a === void 0 ? void 0 : _a.enabled) && !(opts && opts.updateMonitor));
            if (!shouldCompile)
                return originalPushThread.call(this, id, target, opts);
            const wasEnabled = this.compilerOptions.enabled;
            this.compilerOptions.enabled = false;
            let thread;
            try {
                thread = originalPushThread.call(this, id, target, opts);
            }
            finally {
                this.compilerOptions.enabled = wasEnabled;
            }
            compileOnLoweredGraph(thread);
            return thread;
        };
        runtime._restartThread = function (thread) {
            var _a;
            const shouldCompile = Boolean(((_a = this.compilerOptions) === null || _a === void 0 ? void 0 : _a.enabled) && (thread === null || thread === void 0 ? void 0 : thread.triedToCompile) && !(thread === null || thread === void 0 ? void 0 : thread.updateMonitor));
            if (!shouldCompile)
                return originalRestartThread.call(this, thread);
            const wasEnabled = this.compilerOptions.enabled;
            this.compilerOptions.enabled = false;
            let restarted;
            try {
                restarted = originalRestartThread.call(this, thread);
            }
            finally {
                this.compilerOptions.enabled = wasEnabled;
            }
            compileOnLoweredGraph(restarted);
            return restarted;
        };
        runtime.__mattererSwitchCompilerLoweringInstalled = true;
        console.info("[Matterer Switch] Installed unified interpreter/compiler lowering bridge.");
    }
    getActiveSprite(util) {
        var _a, _b;
        var _c, _d, _e;
        return ((_e = (_d = (_c = util === null || util === void 0 ? void 0 : util.target) !== null && _c !== void 0 ? _c : (_b = (_a = Scratch.vm.runtime.sequencer) === null || _a === void 0 ? void 0 : _a.activeThread) === null || _b === void 0 ? void 0 : _b.target) !== null && _d !== void 0 ? _d : Scratch.vm.runtime._editingTarget) !== null && _e !== void 0 ? _e : null);
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
    Switch({ VALUE }, util) {
        var _a, _b, _c, _d, _e;
        var _f, _g, _h, _j, _k;
        const thread = util.thread;
        const switchBlockId = (_f = (_a = thread === null || thread === void 0 ? void 0 : thread.peekStack) === null || _a === void 0 ? void 0 : _a.call(thread)) !== null && _f !== void 0 ? _f : null;
        const switchFrame = (_g = (_b = thread === null || thread === void 0 ? void 0 : thread.peekStackFrame) === null || _b === void 0 ? void 0 : _b.call(thread)) !== null && _g !== void 0 ? _g : null;
        if (!thread || !switchBlockId || !switchFrame) {
            console.warn("[Matterer Switch] Unable to identify the executing switch block.", {
                hasThread: Boolean(thread),
                stack: (_h = (_d = (_c = thread === null || thread === void 0 ? void 0 : thread.stack) === null || _c === void 0 ? void 0 : _c.slice) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _h !== void 0 ? _h : null,
                frameCount: (_j = (_e = thread === null || thread === void 0 ? void 0 : thread.stackFrames) === null || _e === void 0 ? void 0 : _e.length) !== null && _j !== void 0 ? _j : 0,
            });
            return;
        }
        if (!this.hasValidSwitchCaseChain(thread))
            return;
        const executionContext = (_k = switchFrame.executionContext) !== null && _k !== void 0 ? _k : (switchFrame.executionContext = {});
        executionContext[MATTERER_SWITCH_CONTEXT_KEY] = {
            value: VALUE,
            matched: false,
            switchBlockId,
            thread,
        };
        console.debug(`[Matterer Switch] Started switch ${switchBlockId} on its own VM thread.`, { value: VALUE, threadStack: thread.stack.slice() });
        util.startBranch(1, false);
    }
    Case({ CASE_VALUE }, util) {
        var _a, _b, _c, _d, _e;
        var _f, _g;
        const active = this.getEnclosingSwitchContext(util, "matterer_case");
        if (!active) {
            console.warn("[Matterer Switch] Could not resolve the owning switch for this case.", {
                stack: (_f = (_c = (_b = (_a = util.thread) === null || _a === void 0 ? void 0 : _a.stack) === null || _b === void 0 ? void 0 : _b.slice) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _f !== void 0 ? _f : null,
                currentBlockId: (_g = (_e = (_d = util.thread) === null || _d === void 0 ? void 0 : _d.peekStack) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _g !== void 0 ? _g : null,
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
        if (context.matched || !matches)
            return;
        context.matched = true;
        util.startBranch(1, false);
    }
    DefaultCase(_, util) {
        var _a, _b, _c, _d, _e;
        var _f, _g;
        const active = this.getEnclosingSwitchContext(util, "matterer_defaultcase");
        if (!active) {
            console.warn("[Matterer Switch] Could not resolve the owning switch for the default block.", {
                stack: (_f = (_c = (_b = (_a = util.thread) === null || _a === void 0 ? void 0 : _a.stack) === null || _b === void 0 ? void 0 : _b.slice) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _f !== void 0 ? _f : null,
                currentBlockId: (_g = (_e = (_d = util.thread) === null || _d === void 0 ? void 0 : _d.peekStack) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _g !== void 0 ? _g : null,
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
        if (context.matched)
            return;
        context.matched = true;
        util.startBranch(1, false);
    }
    BeginSwitchExecution({ VALUE }, util) {
        this.compilerCompatibleSwitch.begin(VALUE, util);
    }
    SwitchCaseMatches({ CASE_VALUE }, util) {
        return this.compilerCompatibleSwitch.matches(CASE_VALUE, util);
    }
    EndSwitchExecution(_, util) {
        this.compilerCompatibleSwitch.end(util);
    }
    hasValidSwitchCaseChain(thread) {
        var _a;
        var _b, _c, _d, _e;
        const switchBlockId = thread.peekStack();
        const blocks = (_b = thread.blockContainer) !== null && _b !== void 0 ? _b : (_a = thread.target) === null || _a === void 0 ? void 0 : _a.blocks;
        if (!switchBlockId || typeof (blocks === null || blocks === void 0 ? void 0 : blocks.getBranch) !== "function" ||
            typeof (blocks === null || blocks === void 0 ? void 0 : blocks.getNextBlock) !== "function" || typeof (blocks === null || blocks === void 0 ? void 0 : blocks.getBlock) !== "function") {
            console.warn("[Matterer Switch] Unable to inspect the switch's case stack.");
            return false;
        }
        let childId = (_c = blocks.getBranch(switchBlockId, 1)) !== null && _c !== void 0 ? _c : null;
        if (!childId) {
            console.warn("[Matterer Switch] Add at least one case or default block inside the switch.");
            return false;
        }
        const visited = new Set();
        let foundEntry = false;
        let sawDefault = false;
        while (childId) {
            if (visited.has(childId)) {
                console.warn("[Matterer Switch] Invalid circular block chain detected.");
                return false;
            }
            visited.add(childId);
            const block = blocks.getBlock(childId);
            const opcode = String((_d = block === null || block === void 0 ? void 0 : block.opcode) !== null && _d !== void 0 ? _d : "").toLowerCase();
            const isCase = opcode === "matterer_case";
            const isDefault = opcode === "matterer_defaultcase";
            if (!isCase && !isDefault) {
                console.warn("[Matterer Switch] Only case/default blocks can be placed directly inside switch. " +
                    "Move executable blocks into a case's substack.");
                return false;
            }
            if (sawDefault) {
                console.warn("[Matterer Switch] The default block must be the final block in the switch.");
                return false;
            }
            foundEntry = true;
            if (isDefault)
                sawDefault = true;
            childId = (_e = blocks.getNextBlock(childId)) !== null && _e !== void 0 ? _e : null;
        }
        return foundEntry;
    }
    findOwningSwitchBlockId(blocks, childBlockId) {
        var _a, _b, _c, _d;
        var _e, _f, _g, _h;
        const allBlocks = blocks === null || blocks === void 0 ? void 0 : blocks._blocks;
        if (!allBlocks || typeof allBlocks !== "object")
            return null;
        let owner = null;
        for (const candidateId of Object.keys(allBlocks)) {
            const candidate = (_a = blocks.getBlock) === null || _a === void 0 ? void 0 : _a.call(blocks, candidateId);
            if (String((_e = candidate === null || candidate === void 0 ? void 0 : candidate.opcode) !== null && _e !== void 0 ? _e : "").toLowerCase() !== "matterer_switch")
                continue;
            let directChildId = (_f = (_b = blocks.getBranch) === null || _b === void 0 ? void 0 : _b.call(blocks, candidateId, 1)) !== null && _f !== void 0 ? _f : null;
            const visited = new Set();
            while (directChildId && !visited.has(directChildId)) {
                visited.add(directChildId);
                if (directChildId === childBlockId) {
                    if (owner && owner !== candidateId)
                        return null;
                    owner = candidateId;
                    break;
                }
                const directChild = (_c = blocks.getBlock) === null || _c === void 0 ? void 0 : _c.call(blocks, directChildId);
                const opcode = String((_g = directChild === null || directChild === void 0 ? void 0 : directChild.opcode) !== null && _g !== void 0 ? _g : "").toLowerCase();
                if (opcode !== "matterer_case" && opcode !== "matterer_defaultcase")
                    break;
                directChildId = (_h = (_d = blocks.getNextBlock) === null || _d === void 0 ? void 0 : _d.call(blocks, directChildId)) !== null && _h !== void 0 ? _h : null;
            }
        }
        return owner;
    }
    getEnclosingSwitchContext(util, expectedCurrentOpcode) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var _j, _k, _l, _m, _o;
        const thread = util.thread;
        if (!thread || !Array.isArray(thread.stack) || !Array.isArray(thread.stackFrames)) {
            return null;
        }
        const blocks = (_j = thread.blockContainer) !== null && _j !== void 0 ? _j : (_a = thread.target) === null || _a === void 0 ? void 0 : _a.blocks;
        const currentFrame = (_k = (_b = thread.peekStackFrame) === null || _b === void 0 ? void 0 : _b.call(thread)) !== null && _k !== void 0 ? _k : null;
        const currentBlockId = (_m = (_l = (_c = thread.peekStack) === null || _c === void 0 ? void 0 : _c.call(thread)) !== null && _l !== void 0 ? _l : (_d = currentFrame === null || currentFrame === void 0 ? void 0 : currentFrame.op) === null || _d === void 0 ? void 0 : _d.id) !== null && _m !== void 0 ? _m : null;
        if (!currentBlockId)
            return null;
        const currentBlock = (_e = blocks === null || blocks === void 0 ? void 0 : blocks.getBlock) === null || _e === void 0 ? void 0 : _e.call(blocks, currentBlockId);
        const currentOpcode = String((_o = currentBlock === null || currentBlock === void 0 ? void 0 : currentBlock.opcode) !== null && _o !== void 0 ? _o : "").toLowerCase();
        if (currentOpcode !== expectedCurrentOpcode)
            return null;
        const switchBlockId = this.findOwningSwitchBlockId(blocks, currentBlockId);
        if (!switchBlockId)
            return null;
        let currentIndex = thread.stack.lastIndexOf(currentBlockId);
        if (currentIndex < 0 && ((_f = currentFrame === null || currentFrame === void 0 ? void 0 : currentFrame.op) === null || _f === void 0 ? void 0 : _f.id) === currentBlockId) {
            currentIndex = thread.stackFrames.lastIndexOf(currentFrame);
        }
        if (currentIndex < 0)
            currentIndex = thread.stack.length;
        const maxIndex = Math.min(currentIndex - 1, thread.stackFrames.length - 1);
        for (let i = maxIndex; i >= 0; i--) {
            const stackBlockId = thread.stack[i];
            const frameBlockId = (_h = (_g = thread.stackFrames[i]) === null || _g === void 0 ? void 0 : _g.op) === null || _h === void 0 ? void 0 : _h.id;
            if (stackBlockId !== switchBlockId && frameBlockId !== switchBlockId)
                continue;
            const switchFrame = thread.stackFrames[i];
            const executionContext = switchFrame === null || switchFrame === void 0 ? void 0 : switchFrame.executionContext;
            const context = executionContext === null || executionContext === void 0 ? void 0 : executionContext[MATTERER_SWITCH_CONTEXT_KEY];
            if (!context || context.thread !== thread || context.switchBlockId !== switchBlockId ||
                typeof context.matched !== "boolean" ||
                !Object.prototype.hasOwnProperty.call(context, "value")) {
                continue;
            }
            return { context, thread, switchBlockId };
        }
        return null;
    }
    FetchVisibilityState(_, util) {
        var _a;
        var _b;
        return (_b = (_a = this.getActiveSprite(util)) === null || _a === void 0 ? void 0 : _a.visible) !== null && _b !== void 0 ? _b : false;
    }
    FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE, }, util) {
        var _a;
        var _b;
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
            this.installSwitchCompilerLowering();
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
