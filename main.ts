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

    private getActiveSprite(util?: BlockUtility) {
        return util?.target
            ?? Scratch.vm.runtime.sequencer?.activeThread?.target
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

    public FetchVisibilityState({}: {}, util: BlockUtility): boolean {
        const sprite = this.getActiveSprite(util);

        if (sprite === null) {
            console.warn("Sprite visibility defaulting to false!");
            return false;
        }

        return sprite.visible.valueOf();
    }

    //
    // Animation Logistics
    //
    private __currentlyAnimating: Set<string> = new Set();
    //
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
                const ScratchRuntime = util.runtime ?? null;
                if (ScratchRuntime === null) throw new Error("ScratchRuntime is unavailable.");

                const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
                const InitialTransparency = CurrentSprite?.effects.ghost ?? 0;
                const StartValue = InitialTransparency;
                const EndValue = ANIMATION_DIRECTION === "IN" ? 0 : CalculatedGhostValueTarget;
                const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * ScratchRuntime.frameLoop.framerate);

                this.__currentlyAnimating.add(spriteId);
                // fire the start hat directly
                ScratchRuntime.startHats("matterer_TrackAnimationStartTrigger");

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
                // fire the end hat directly
                util.runtime.startHats("matterer_TrackAnimationEndTrigger");
            }
        }
    }

    public TrackAnimationStartTrigger({}: {}, util: BlockUtility): boolean {
        return true;
    }

    public TrackAnimationEndTrigger({}: {}, util: BlockUtility): boolean {
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

    private ToggleCurrentRunningAnimation({ ANIMATION_TOGGLE_STATE } : { ANIMATION_TOGGLE_STATE: "STOP" | "PAUSE" | "RESUME"}, util: BlockUtility): void {
        const AcceptableToggleInputs = ['STOP', 'PAUSE', 'RESUME'];
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
//
// Block Class Definitions
//
class MattererDefinitions extends Matterer implements Scratch.Extension {
    constructor() {
        super();
        (() => {
            console.debug(Scratch.BlockType.LOOP);
            console.debug(Scratch.BlockType.CONDITIONAL);
        })();
    }

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
                    // hideFromPalette: true,
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
                },
                // Animating Fetch Menus
                AnimatingStateTypeRequestMenu: {
                    items: new Array('animating', 'not animating'),
                    acceptReporters: true,
                },
                AnimationControlStateMenu: {
                    items: new Array('STOP', 'PAUSE', 'RESUME'),
                    acceptReporters: false,
                }
            }
        }
    }
}

// Initiallize Scratch VM extension
Scratch.extensions.register(new MattererDefinitions());
