import { loadEnvFile } from "node:process";
import type { AiEnv } from "./ai/index.js";

export function loadAiEnv(envPath: string): AiEnv {
  try {
    loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Unable to load server environment configuration.");
  }
  return {
    nimApiKey: process.env.NIM_API_KEY,
    nimBaseUrl: process.env.NIM_BASE_URL,
    nimModel: process.env.NIM_MODEL,
    nimVisionModel: process.env.NIM_VISION_MODEL || undefined,
    nimTimeoutMs: process.env.NIM_TIMEOUT_MS ? Number(process.env.NIM_TIMEOUT_MS) : undefined,
  };
}
