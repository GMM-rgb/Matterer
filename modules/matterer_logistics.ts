const ValidScratchTypeDefinitions: Readonly<string[]> = ['string', 'number', 'boolean', 'object'];

export class Matterer {
    static waitOneFrame = (): Promise<void> => 
    new Promise(resolve => requestAnimationFrame(() => resolve()));
    static MaxTransparency: Readonly<number> = 100;

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

    public async FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION } : { TARGET_TRANSPARENCY: number, ANIMATION_DIRECTION: string }) {
        // const frameRateListener = (newFramerate: number): void => {
        //     throw new Error(`Framerate was changed to ${newFramerate}, could not complete fade transparency cycle.`);
        // };

        if (TARGET_TRANSPARENCY !== null && !(TARGET_TRANSPARENCY < 0) && !(TARGET_TRANSPARENCY > Matterer.MaxTransparency.valueOf())) {
            try {
                const ScratchVM = Scratch?.vm || Scratch.vm || null // Scratch VirtualMachine Enginez

                const CurrentSprite = ScratchVM.runtime.sequencer?.activeThread?.target || null;
                const InitialTransparency = CurrentSprite?.effects.ghost.valueOf() || 0;
                const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * Number(ScratchVM.runtime.frameLoop.framerate.valueOf()));
                const TransparencyStepsSize = Math.abs((TARGET_TRANSPARENCY - InitialTransparency) / TransparencySteps);

                for (let CurrentTransparencyStep = 0; CurrentTransparencyStep < TransparencySteps ; CurrentTransparencyStep++) {
                    const NewTransparencyValue = InitialTransparency + (TransparencyStepsSize * CurrentTransparencyStep);
                    (CurrentSprite?.effects.ghost || 0).valueOf() !== NewTransparencyValue ? CurrentSprite?.setEffect(VM.Effect.Ghost, NewTransparencyValue.valueOf()) : undefined;
                    await Matterer.waitOneFrame();
                }
            } catch (FadeError) {
                if (FadeError !== null || FadeError !== undefined) {
                    console.error(new String(FadeError)
                        .valueOf()
                        .toString()
                        .trim()
                    );
                }
            }
        }
    }
}
