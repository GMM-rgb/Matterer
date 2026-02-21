import { Matterer } from "./modules/matterer_logistics.js";
class MattererDefinitions extends Matterer {
    getInfo() {
        return {
            id: "matterer",
            name: 'Matterer Defines',
            color1: new String("#f542b0").valueOf(),
            color2: new String("#c41681").valueOf(),
            color3: new String("#a500a2").valueOf(),
            blocks: [
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
            ],
            menus: {
                typeDefinitionMenu: {
                    items: new Array('string', 'number', 'boolean', 'object'),
                    acceptReporters: true,
                },
                BooleanPickerMenu: {
                    items: new Array('TRUE', 'FALSE'),
                    acceptReporters: true,
                }
            }
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
