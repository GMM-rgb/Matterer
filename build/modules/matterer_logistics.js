var ValidScratchTypeDefinitions = ['string', 'number', 'boolean', 'object'];
export class Matterer {
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
            if (BOOL_VALUE !== undefined || BOOL_VALUE !== null) {
                Converted = String(BOOL_VALUE).toLowerCase().trim();
            }
            return Converted !== null ? Converted : "";
        }
        function BooleanInstancer() {
            return ConvertRequestedValueToString() === 'true';
        }
        return BooleanInstancer();
    }
}
