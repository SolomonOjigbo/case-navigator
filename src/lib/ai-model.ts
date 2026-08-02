// The model identifier, on its own so the *.functions.ts modules can record it
// in ai_outputs.model_id without pulling the SDK into the client bundle.
// ai-gateway.server.ts is the module that actually calls it.
export const AI_MODEL = "claude-opus-5";
