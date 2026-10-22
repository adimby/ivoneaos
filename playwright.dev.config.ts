// Temporaire (itération locale contre next dev) — supprimé avant la fin.
import base from "./playwright.config";
export default { ...base, webServer: undefined, use: { ...base.use, baseURL: "http://127.0.0.1:3300" } };
