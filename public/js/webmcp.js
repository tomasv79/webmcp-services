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
  // Every registration is started before any of them is awaited. With the polyfill one registration can take half
  // a second to settle, and an agent that lists the tools meanwhile must find all of them, not the first one or two.
  const results = await Promise.allSettled(tools.map(async (tool) => modelContext.registerTool(tool, { signal: controller.signal })));
  const registered = [];
  const failed = [];
  for (const [index, { status, reason }] of results.entries()) {
    const { name } = tools[index];
    if (status === "fulfilled") {
      registered.push(name);
    } else {
      failed.push(name);
      log.warn(`WebMCP tool "${name}" was not registered: ${reason?.message ?? reason}`);
    }
  }
  return { registered, failed, abort: () => controller.abort() };
}
