import { Matterer } from "./modules/matterer_logistics.js";
class MattererDefinitions extends Matterer {
    getInfo() {
        return {
            id: "matterer",
            name: 'Matterer Defines',
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
            ],
            menus: {
                typeDefinitionMenu: {
                    items: new Array('string', 'number', 'boolean', 'object'),
                    acceptReporters: true,
                }
            }
        };
    }
}
Scratch.extensions.register(new MattererDefinitions());
