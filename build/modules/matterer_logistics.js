var ValidScratchTypeDefinitions = ['string', 'number', 'boolean', 'object'];
export class Matterer {
    ValidateInputType({ VALUE, TYPE_DEFINITION }) {
        const type = TYPE_DEFINITION.toLowerCase();
        if (ValidScratchTypeDefinitions.indexOf(type) === -1) {
            return false;
        }
        const valueLower = VALUE.toLowerCase().trim();
        if (type === 'boolean') {
            return valueLower === 'true' || valueLower === 'false';
        }
        if (type === 'number') {
            return !isNaN(parseFloat(VALUE)) && isFinite(Number(VALUE));
        }
        if (type === 'string') {
            return typeof VALUE === 'string';
        }
        if (type === 'object') {
            try {
                const parsed = JSON.parse(VALUE);
                return typeof parsed === 'object' && parsed !== null;
            }
            catch (_a) {
                return false;
            }
        }
        return false;
    }
}
