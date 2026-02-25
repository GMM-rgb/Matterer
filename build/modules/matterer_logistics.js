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
export class Matterer {
    constructor(scratch) {
        this.scratch = scratch;
        undefined;
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
    FadeTransparency(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION }, util) {
            var _b, _c, _d, _e;
            console.log("Scratch:", Scratch);
            console.log("Utility", util);
            console.log("Scratch Runtime:", util.runtime);
            if (TARGET_TRANSPARENCY !== null && !(TARGET_TRANSPARENCY < 0) && !(TARGET_TRANSPARENCY > Matterer.MaxTransparency.valueOf())) {
                try {
                    const ScratchRuntime = (_b = util.runtime) !== null && _b !== void 0 ? _b : null;
                    if (ScratchRuntime === null || ScratchRuntime === undefined) {
                        throw new Error("ScratchVM is unavailable.");
                    }
                    const CurrentSprite = (_e = (_d = (_c = ScratchRuntime.sequencer) === null || _c === void 0 ? void 0 : _c.activeThread) === null || _d === void 0 ? void 0 : _d.target) !== null && _e !== void 0 ? _e : null;
                    const InitialTransparency = (CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.effects.ghost.valueOf()) || 0;
                    const TransparencySteps = Math.ceil(TARGET_TRANSPARENCY * Number(ScratchRuntime.frameLoop.framerate.valueOf()));
                    const TransparencyStepsSize = Math.abs((TARGET_TRANSPARENCY - InitialTransparency) / TransparencySteps);
                    for (let CurrentTransparencyStep = 0; CurrentTransparencyStep < TransparencySteps; CurrentTransparencyStep++) {
                        const NewTransparencyValue = InitialTransparency + (TransparencyStepsSize * CurrentTransparencyStep);
                        ((CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.effects.ghost) || 0).valueOf() !== NewTransparencyValue ? CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.setEffect("ghost", NewTransparencyValue.valueOf()) : undefined;
                        yield Matterer.waitOneFrame();
                    }
                }
                catch (FadeError) {
                    if (FadeError != null) {
                        console.error(new String(FadeError).trim());
                    }
                }
                finally {
                    return;
                }
            }
        });
    }
}
Matterer.waitOneFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
Matterer.MaxTransparency = 100;
