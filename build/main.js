// @turbo-unsandboxed
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
        this.__currentlyAnimating = new Set();
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
    }
    getActiveSprite(util) {
        var _a, _b, _c, _d, _e;
        return (_e = (_d = (_a = util === null || util === void 0 ? void 0 : util.target) !== null && _a !== void 0 ? _a : (_c = (_b = Scratch.vm.runtime.sequencer) === null || _b === void 0 ? void 0 : _b.activeThread) === null || _c === void 0 ? void 0 : _c.target) !== null && _d !== void 0 ? _d : Scratch.vm.runtime._editingTarget) !== null && _e !== void 0 ? _e : null;
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
    TrackAnimationStartTrigger({}, util) {
        return true;
    }
    TrackAnimationEndTrigger({}, util) {
        return true;
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
        (() => {
            console.debug(Scratch.BlockType.LOOP);
            console.debug(Scratch.BlockType.CONDITIONAL);
        })();
    }
    getInfo() {
        return {
            id: "matterer",
            name: 'Matterer Defines',
            color1: new String("#f542b0").valueOf(),
            color2: new String("#c41681").valueOf(),
            color3: new String("#a500a2").valueOf(),
            blocks: [
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
                    blockType: Scratch.BlockType.EVENT,
                    shouldRestartExistingThreads: true,
                    isEdgeActivated: false,
                    opcode: null,
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
                }
            }
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
