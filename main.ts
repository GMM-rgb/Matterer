// import { Matterer } from "./modules/matterer_logistics.js";






type AnimationStyles = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";
const ValidScratchTypeDefinitions: Readonly<string[]> = ['string', 'number', 'boolean', 'object'];

class Matterer /* extends ResetDefaultValues */ {
    static ValueTypes = [String, Boolean];
    static waitOneFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
    static MaxTransparency: Readonly<number> = 100;

    scratch: typeof Scratch;

    constructor() {
        this.scratch = Scratch ?? undefined;
    }

    private getActiveSprite() {
    return Scratch.vm.runtime.sequencer?.activeThread?.target
        ?? Scratch.vm.runtime._editingTarget
        ?? null;
    }
    
    public ValidateInputType({ VALUE, TYPE_DEFINITION } : { VALUE: string, TYPE_DEFINITION: string }): boolean {
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

    public NewBoolean({ BOOL_VALUE } : { BOOL_VALUE: string }): boolean {
        /**
         * 
         * @returns {string}
         */
        function ConvertRequestedValueToString(): string {
            let Converted = null;

            if (BOOL_VALUE !== undefined && BOOL_VALUE !== null) {
                Converted = String(BOOL_VALUE).toLowerCase().trim();
            }

            return Converted !== null ? Converted : "";
        }

        /**
         * 
         * @returns {boolean}
         */
        function BooleanInstancer(): boolean {
            return ConvertRequestedValueToString() === 'true';
        }

        return BooleanInstancer();
    }

    public FetchVisibilityState({}: {}): boolean {
        const sprite = this.getActiveSprite();

        if (sprite === null) {
            console.warn("Sprite visibility defaulting to false!");
            return false;
        }

        return sprite.visible.valueOf();
    }
    
    public async FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE } : { TARGET_TRANSPARENCY: number, ANIMATION_DIRECTION: "IN" | "OUT", ANIMATION_STYLE: AnimationStyles }, /* util: BlockUtility */ ) {
        // console.log("Scratch:", Scratch);
        // console.log("Utility", util);
        // console.log("Scratch Runtime:", util.runtime);

        const easings = {
            linear: (t: number) => t,
            easeIn: (t: number) => t * t,
            easeOut: (t: number) => t * (2 - t),
            easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            bounce: (t: number) => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
        };

        if (TARGET_TRANSPARENCY !== null && TARGET_TRANSPARENCY >= 0 && TARGET_TRANSPARENCY <= Matterer.MaxTransparency) {
            try {
                const ScratchRuntime = this?.scratch?.vm?.runtime ?? null;

                if (ScratchRuntime === null || ScratchRuntime === undefined) {
                    throw new Error("ScratchRuntime is unavailable.");
                }

                const CurrentSprite = (ScratchRuntime.sequencer?.activeThread?.target) ?? null;

                const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
                const InitialTransparency = CurrentSprite?.effects.ghost ?? 0;

                const StartValue = InitialTransparency;
                const EndValue = ANIMATION_DIRECTION === "OUT" ? 0 : CalculatedGhostValueTarget;

                const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * ScratchRuntime.frameLoop.framerate);
                const TransparencyStepSize = (EndValue - StartValue) / TransparencySteps;

                for (let CurrentTransparencyStep = 0; CurrentTransparencyStep < TransparencySteps; CurrentTransparencyStep++) {
                    const t = CurrentTransparencyStep / TransparencySteps;
                    const eased = easings[ANIMATION_STYLE](t);
                    CurrentSprite?.setEffect(VM.Effect.Ghost, StartValue + (EndValue - StartValue) * eased);
                    // Await the next frame interpretation
                    await Matterer.waitOneFrame();
                }

                // guarantees the sprite always land exactly on the inputted target
                CurrentSprite?.setEffect(VM.Effect.Ghost, EndValue);
            } catch (FadeError) {
                if (FadeError != null) {
                    console.error(new String(FadeError).trim());
                }
            } finally {
                return void null;
            }
        }
    }

    public CheckIsAnimatingProperty() {
        
    }
}











class MattererDefinitions extends Matterer implements Scratch.Extension {
    getInfo(): Scratch.Info {
        return {
            id: "matterer",
            name: 'Matterer Defines',
            color1: new String("#f542b0").valueOf(),
            color2: new String("#c41681").valueOf(),
            color3: new String("#a500a2").valueOf(),
            // menuIconURI: "",
            blocks: [
                // {
                //     blockType: Scratch.BlockType.BUTTON,
                //     // func: new String((this.resetValues as Function).name).valueOf().trim(),
                //     text: "🔄️ Reset Default Values"
                // },
                "---",
                {
                    blockType: Scratch.BlockType.LABEL,
                    text: "Boolean Controls",
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
                    // text: "animate [ANIMATING_PROPERTY] to [TARGET_TRANSPARENCY] in direction [ANIMATION_DIRECTION] with animation style [ANIMATION_STYLE]",
                    text: "animate transparency to [TARGET_TRANSPARENCY] in direction [ANIMATION_DIRECTION] with animation style [ANIMATION_STYLE]",
                    arguments: {
                        // ANIMATING_PROPERTY: {
                        //     type: Scratch.ArgumentType.STRING,
                        //     menu: "AnimatingPropertyChoiceSet",
                        //     defaultValue: "Transparency",
                        // },
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
                    opcode: (this.FetchVisibilityState as Function).name.valueOf(),
                    text: "sprite currently visible",
                    arguments: {},
                },
            ],
            menus: {
                // 
                typeDefinitionMenu: {
                    items: new Array('string', 'number', 'boolean', 'object'),
                    acceptReporters: true,
                },
                // 
                BooleanPickerMenu: {
                    items: new Array('TRUE', 'FALSE'),
                    acceptReporters: true,
                },
                // 
                ValueTypeSwitchMenu: {
                    items: new Array('reporter', 'bool'),
                    acceptReporters: false,
                },
                // FadeTransparency Block; Parameter Input Menus
                // AnimatingPropertyChoiceSet: {
                //     items: new Array('Transparency', 'PositionY', 'PositionX', 'Size'),
                //     acceptReporters: true,
                // },
                AnimationDirectionChoice: {
                    items: new Array('IN', 'OUT'),
                    acceptReporters: true,
                },
                AnimationStyleChoice: {
                    items: new Array('linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce'),
                    acceptReporters: false,
                }
                // 
            }
        }
    }
}

Scratch.extensions.register(new MattererDefinitions());
