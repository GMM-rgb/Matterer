var ValidScratchTypeDefinitions = ['string', 'number', 'boolean', 'object'] as const;

export class Matterer {
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
        function ConvertRequestedValueToString(): string {
            return String(BOOL_VALUE).toLowerCase().trim();
        }

        function BooleanInstancer(): boolean {
            return ConvertRequestedValueToString() === 'true';
        }

        return BooleanInstancer();
    }
}
