/// <reference path="C:/nvm4w/nodejs/node_modules/@turbowarp/types/types/scratch-vm-extension.d.ts" />
/// <reference path="C:/nvm4w/nodejs/node_modules/@turbowarp/types/types/scratch-render.d.ts" />
/// <reference path="C:/nvm4w/nodejs/node_modules/@turbowarp/types/types/scratch-vm.d.ts" />
/// <reference path="C:/nvm4w/nodejs/node_modules/@turbowarp/types/types/events.d.ts" />
/// <reference path="C:/nvm4w/nodejs/node_modules/@turbowarp/types/types/scratch-block-utility.d.ts" />

import { Matterer } from "./modules/matterer_logistics.js";

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
                {
                    blockType: Scratch.BlockType.BUTTON,
                    func: String().trim(),
                    text: "🔄️ Reset Default Values"
                },
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
                // FadeTransparency Block; Parameter Input Menus
                AnimationDirectionChoice: {
                    items: new Array('IN', 'OUT'),
                    acceptReporters: false,
                },
                AnimationStyleChoice: {
                    items: new Array('linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce'),
                    acceptReporters: false,
                }
            }
        }
    }
}

Scratch.extensions.register(new MattererDefinitions(Scratch));
