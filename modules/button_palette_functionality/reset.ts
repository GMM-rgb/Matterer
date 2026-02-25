export class ResetDefaultValues {
    public resetValues(): void {
        if (ScratchGUI.ActiveTabIndex.Blocks.valueOf() === 1) {
            
        } else {
            console.warn(`Reseting Values could not be done; since the editor tab not on "Blocks".`);
        }
    }
}
