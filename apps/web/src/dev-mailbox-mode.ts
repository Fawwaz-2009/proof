export const shouldAutofillDevMailbox = (viteDevelopment: boolean, configured: string | undefined): boolean => viteDevelopment || configured === "true";
