import { pathToFileURL } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { SUPPORTED_PLUGIN_API, type AgentDoctorPlugin } from "../plugin-api.js";

export async function loadPlugins(cwd: string, names: string[] | undefined): Promise<AgentDoctorPlugin[]> {
  if (!names || names.length === 0) return [];
  const plugins: AgentDoctorPlugin[] = [];
  for (const name of names) {
    try {
      const plugin = await loadOne(cwd, name);
      if (plugin) plugins.push(plugin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`agent-doctor: failed to load plugin ${name}: ${msg}\n`);
    }
  }
  return plugins;
}

async function loadOne(cwd: string, name: string): Promise<AgentDoctorPlugin | undefined> {
  const target = name.startsWith(".") || isAbsolute(name)
    ? pathToFileURL(resolve(cwd, name)).href
    : name;
  const mod = (await import(target)) as { default?: unknown };
  const candidate = (mod.default ?? mod) as unknown;
  if (typeof candidate === "function") {
    const built = await (candidate as () => AgentDoctorPlugin | Promise<AgentDoctorPlugin>)();
    return validate(built, name);
  }
  return validate(candidate, name);
}

function validate(value: unknown, source: string): AgentDoctorPlugin | undefined {
  if (!value || typeof value !== "object") {
    process.stderr.write(`agent-doctor: plugin ${source} did not export an object\n`);
    return undefined;
  }
  const plugin = value as Partial<AgentDoctorPlugin>;
  if (typeof plugin.name !== "string") {
    process.stderr.write(`agent-doctor: plugin ${source} is missing a "name"\n`);
    return undefined;
  }
  if (plugin.apiVersion && !plugin.apiVersion.startsWith("1.")) {
    process.stderr.write(
      `agent-doctor: plugin ${plugin.name} declares apiVersion ${plugin.apiVersion}; this host supports ${SUPPORTED_PLUGIN_API}\n`,
    );
  }
  return plugin as AgentDoctorPlugin;
}
