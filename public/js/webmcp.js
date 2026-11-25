// Registers WebMCP tools on document.modelContext.
// Works with native WebMCP and with the vendored W3C polyfill; does nothing when neither is present.

/**
 * @param {Array<object>} tools  Tool definitions: { name, description, inputSchema, annotations, execute }.
 * @param {{ doc?: object, log?: { info: Function, warn: Function } }} [options]
 * @returns {Promise<{ registered: string[], failed: string[], abort: () => void }>}
 */
export async function registerTools(tools, { doc = globalThis.document, log = console } = {}) {
  const modelContext = doc?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    log.info("WebMCP is not available in this browser, so no tools were registered.");
    return { registered: [], failed: [], abort() {} };
  }

  const controller = new AbortController();
  const registered = [];
  const failed = [];
  for (const tool of tools) {
    try {
      await modelContext.registerTool(tool, { signal: controller.signal });
      registered.push(tool.name);
    } catch (error) {
      failed.push(tool.name);
      log.warn(`WebMCP tool "${tool.name}" was not registered: ${error?.message ?? error}`);
    }
  }
  return { registered, failed, abort: () => controller.abort() };
}
