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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Matterer = void 0;
const ValidScratchTypeDefinitions = ['string', 'number', 'boolean', 'object'];
const reset_js_1 = require("./button_palette_functionality/reset.js");
class Matterer extends reset_js_1.ResetDefaultValues {
    constructor(scratch) {
        super();
        this.scratch = scratch;
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
    FetchVisibilityState(util) {
        var _a;
        const CurrentSpriteVisibilityFetch = (_a = util.target) !== null && _a !== void 0 ? _a : null;
        return new Boolean(CurrentSpriteVisibilityFetch.visible).valueOf();
    }
    FadeTransparency(_a, util_1) {
        return __awaiter(this, arguments, void 0, function* ({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE }, util) {
            var _b, _c, _d, _e, _f, _g;
            const easings = {
                linear: (t) => t,
                easeIn: (t) => t * t,
                easeOut: (t) => t * (2 - t),
                easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
                bounce: (t) => 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t),
            };
            if (TARGET_TRANSPARENCY !== null && TARGET_TRANSPARENCY >= 0 && TARGET_TRANSPARENCY <= Matterer.MaxTransparency) {
                try {
                    const ScratchRuntime = (_b = util.runtime) !== null && _b !== void 0 ? _b : null;
                    if (ScratchRuntime === null || ScratchRuntime === undefined) {
                        throw new Error("ScratchRuntime is unavailable.");
                    }
                    const CurrentSprite = (_f = ((_e = (_d = (_c = ScratchRuntime.sequencer) === null || _c === void 0 ? void 0 : _c.activeThread) === null || _d === void 0 ? void 0 : _d.target) !== null && _e !== void 0 ? _e : util.target)) !== null && _f !== void 0 ? _f : null;
                    const CalculatedGhostValueTarget = TARGET_TRANSPARENCY * 100;
                    const InitialTransparency = (_g = CurrentSprite === null || CurrentSprite === void 0 ? void 0 : CurrentSprite.effects.ghost) !== null && _g !== void 0 ? _g : 0;
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
}
exports.Matterer = Matterer;
Matterer.waitOneFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
Matterer.MaxTransparency = 100;
