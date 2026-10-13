import { loadOsmData } from "./osmCache.mts";

const data = await loadOsmData();
for (const [river, result] of Object.entries(data.rivers)) console.log(river, result.elements.length);
console.log("border", data.border.elements.length);
