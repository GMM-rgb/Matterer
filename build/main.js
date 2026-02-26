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
        this.scratch = Scratch !== null && Scratch !== void 0 ? Scratch : undefined;
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
        var _a, _b, _c;
        const sprite = (_c = (_a = util === null || util === void 0 ? void 0 : util.target) !== null && _a !== void 0 ? _a : (_b = Scratch.vm.runtime.sequencer.activeThread) === null || _b === void 0 ? void 0 : _b.target) !== null && _c !== void 0 ? _c : null;
        if (sprite === null) {
            console.warn("Sprite visibility defaulting to false!");
            return false;
        }
        return sprite.visible.valueOf();
    }
    FadeTransparency(_a) {
        return __awaiter(this, arguments, void 0, function* ({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE }) {
            var _b, _c, _d, _e, _f, _g, _h;
            const easings = {
                linear: (t) => t,
                easeIn: (t) => t * t,
                easeOut: (t) => t * (2 - t),
                easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
                bounce: (t) => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
            };
            if (TARGET_TRANSPARENCY !== null && TARGET_TRANSPARENCY >= 0 && TARGET_TRANSPARENCY <= Matterer.MaxTransparency) {
                try {
                    const ScratchRuntime = (_d = (_c = (_b = this === null || this === void 0 ? void 0 : this.scratch) === null || _b === void 0 ? void 0 : _b.vm) === null || _c === void 0 ? void 0 : _c.runtime) !== null && _d !== void 0 ? _d : null;
                    if (ScratchRuntime === null || ScratchRuntime === undefined) {
                        throw new Error("ScratchRuntime is unavailable.");
                    }
                    const CurrentSprite = (_g = ((_f = (_e = ScratchRuntime.sequencer) === null || _e === void 0 ? void 0 : _e.activeThread) === null || _f === void 0 ? void 0 : _f.target)) !== null && _g !== void 0 ? _g : null;
                    const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
                    const InitialTransparency = (_h = CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.effects.ghost) !== null && _h !== void 0 ? _h : 0;
                    const StartValue = InitialTransparency;
                    const EndValue = ANIMATION_DIRECTION === "OUT" ? 0 : CalculatedGhostValueTarget;
                    const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * ScratchRuntime.frameLoop.framerate);
                    const TransparencyStepSize = (EndValue - StartValue) / TransparencySteps;
                    for (let CurrentTransparencyStep = 0; CurrentTransparencyStep < TransparencySteps; CurrentTransparencyStep++) {
                        const t = CurrentTransparencyStep / TransparencySteps;
                        const eased = easings[ANIMATION_STYLE](t);
                        CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.setEffect("ghost", StartValue + (EndValue - StartValue) * eased);
                        yield Matterer.waitOneFrame();
                    }
                    CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.setEffect("ghost", EndValue);
                }
                catch (FadeError) {
                    if (FadeError != null) {
                        console.error(new String(FadeError).trim());
                    }
                }
                finally {
                    return void null;
                }
            }
        });
    }
    CheckIsAnimatingProperty() {
    }
}
Matterer.ValueTypes = [String, Boolean];
Matterer.waitOneFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
Matterer.MaxTransparency = 100;
class MattererDefinitions extends Matterer {
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
                    text: "Boolean Controls",
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
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "Visual Control",
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
                }
            }
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
