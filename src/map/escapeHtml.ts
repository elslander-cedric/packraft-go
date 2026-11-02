// For text put into a Leaflet marker's HTML: names can hold any character.
export const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, "&quot;");
