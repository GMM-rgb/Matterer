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
                    func: new String((this.resetValues as Function).name).valueOf().trim(),
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
                    text: "sprite currently visible; returns [VALUE_TYPE]",
                    arguments: {
                        VALUE_TYPE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: "ValueTypeSwitchMenu",
                            defaultValue: "reporter",
                        }
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

Scratch.extensions.register(new MattererDefinitions(Scratch));
