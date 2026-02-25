const ValidScratchTypeDefinitions: Readonly<string[]> = ['string', 'number', 'boolean', 'object'];

export class Matterer {
    static waitOneFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
    static MaxTransparency: Readonly<number> = 100;

    constructor(private scratch: typeof Scratch) { undefined; }

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

    public async FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION } : { TARGET_TRANSPARENCY: number, ANIMATION_DIRECTION: "IN" | "OUT" }, util: BlockUtility ) {
        // console.log("Scratch:", Scratch);
        // console.log("Utility", util);
        // console.log("Scratch Runtime:", util.runtime);

        if (TARGET_TRANSPARENCY !== null && TARGET_TRANSPARENCY >= 0 && TARGET_TRANSPARENCY <= Matterer.MaxTransparency) {
            try {
                const ScratchRuntime = util.runtime ?? null;

                if (ScratchRuntime === null || ScratchRuntime === undefined) {
                    throw new Error("ScratchRuntime is unavailable.");
                }

                const CurrentSprite = (ScratchRuntime.sequencer?.activeThread?.target ?? util.target) ?? null;

                const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
                const InitialTransparency = CurrentSprite?.effects.ghost ?? 0;

                const StartValue = InitialTransparency;
                const EndValue = ANIMATION_DIRECTION === "OUT" ? 0 : CalculatedGhostValueTarget;
                
                const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * ScratchRuntime.frameLoop.framerate);
                const TransparencyStepSize = (EndValue - StartValue) / TransparencySteps;

                for (let step = 0; step < TransparencySteps; step++) {
                    CurrentSprite?.setEffect(VM.Effect.Ghost, StartValue + TransparencyStepSize * step);
                    await Matterer.waitOneFrame();
                }

                // guarantees the sprite always land exactly on the inputted target
                CurrentSprite?.setEffect(VM.Effect.Ghost, EndValue);
            } catch (FadeError) {
                if (FadeError != null) {
                    console.error(new String(FadeError).trim());
                }
            } finally {
                return;
            }
        }
    }
}
