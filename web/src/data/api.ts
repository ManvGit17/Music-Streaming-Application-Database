import { BrowserApi } from "./browser/api";
import { HttpApi } from "./http";
import type { Api } from "./types";

/**
 * Which backend the app talks to. With VITE_API_URL set (e.g. http://localhost:8000) it uses the
 * FastAPI service; without it, the whole database runs in the browser.
 */
const serverUrl = import.meta.env.VITE_API_URL as string | undefined;

export const api: Api = serverUrl
  ? new HttpApi(serverUrl.replace(/\/$/, ""))
  : new BrowserApi(import.meta.env.BASE_URL);

export const browserApi = api instanceof BrowserApi ? api : null;
