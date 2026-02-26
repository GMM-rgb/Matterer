type AnimationStyles = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";
import { ResetDefaultValues } from "./button_palette_functionality/reset.js";
export declare class Matterer extends ResetDefaultValues {
    private scratch;
    static ValueTypes: (StringConstructor | BooleanConstructor)[];
    static waitOneFrame: () => Promise<void>;
    static MaxTransparency: Readonly<number>;
    constructor(scratch: typeof Scratch);
    ValidateInputType({ VALUE, TYPE_DEFINITION }: {
        VALUE: string;
        TYPE_DEFINITION: string;
    }): boolean;
    NewBoolean({ BOOL_VALUE }: {
        BOOL_VALUE: string;
    }): boolean;
    FetchVisibilityState(util: BlockUtility): boolean;
    FadeTransparency({ TARGET_TRANSPARENCY, ANIMATION_DIRECTION, ANIMATION_STYLE }: {
        TARGET_TRANSPARENCY: number;
        ANIMATION_DIRECTION: "IN" | "OUT";
        ANIMATION_STYLE: AnimationStyles;
    }, util: BlockUtility): Promise<any>;
}
export {};
