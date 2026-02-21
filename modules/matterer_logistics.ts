var ValidScratchTypeDefinitions = ['string', 'number', 'boolean', 'object'] as const;

export class Matterer {
    public ValidateInputType({ VALUE, TYPE_DEFINITION } : { VALUE: string, TYPE_DEFINITION: string }): boolean {
        const type = TYPE_DEFINITION.toLowerCase();

        if (ValidScratchTypeDefinitions.indexOf(type as any) === -1) {
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
            } catch {
                return false;
            }
        }

        return false;
    }
}
