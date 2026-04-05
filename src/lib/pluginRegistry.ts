/**
 * Plugin Registry
 *
 * Fetches Claude Code plugin listings from the npm registry.
 * Claude Code plugins are npm packages tagged with the `claude-code-plugin` keyword.
 * The npm registry search API is public and requires no authentication.
 */

export interface RegistryPlugin {
  /** npm package name */
  name: string;
  description: string;
  version: string;
  author: string;
  /** npm weekly downloads */
  downloads: number;
  /** Last publish date (ISO string) */
  lastPublished: string;
  /** npm package URL */
  npmUrl: string;
  /** Keywords from package.json */
  keywords: string[];
}

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      keywords: string[];
      author?: { name: string };
      date: string;
      links: { npm: string };
    };
    score: { detail: { popularity: number } };
  }>;
  total: number;
}

interface NpmDownloadsResult {
  downloads: number;
  package: string;
}

/**
 * Search the npm registry for Claude Code plugins.
 *
 * @param query  Optional search text appended to the keyword filter
 * @param offset Pagination offset (multiples of 20)
 */
/** Default timeout for npm registry requests (10 seconds). */
const REGISTRY_TIMEOUT_MS = 10_000;

export async function searchPluginRegistry(
  query: string = "",
  offset: number = 0,
): Promise<{ plugins: RegistryPlugin[]; total: number }> {
  const text =
    "keywords:claude-code-plugin" +
    (query ? "+" + encodeURIComponent(query) : "");
  const url = `https://registry.npmjs.org/-/v1/search?text=${text}&size=20&from=${offset}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`npm registry request timed out after ${REGISTRY_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status}`);
  }

  const data = (await res.json()) as NpmSearchResult;

  // Fetch download counts in parallel, limited to 10 concurrent requests
  const names = data.objects.map((o) => o.package.name);
  const downloadCounts = await fetchDownloadCounts(names);

  const plugins: RegistryPlugin[] = data.objects.map((obj) => ({
    name: obj.package.name,
    description: obj.package.description ?? "",
    version: obj.package.version ?? "",
    author: obj.package.author?.name ?? "",
    downloads: downloadCounts[obj.package.name] ?? 0,
    lastPublished: obj.package.date ?? "",
    npmUrl: obj.package.links?.npm ?? `https://www.npmjs.com/package/${obj.package.name}`,
    keywords: obj.package.keywords ?? [],
  }));

  return { plugins, total: data.total };
}

/**
 * Fetch last-week download counts for a list of packages.
 * Batches requests with a concurrency limit of 10.
 */
async function fetchDownloadCounts(
  names: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const CONCURRENCY = 10;

  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const batch = names.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (name) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
        try {
          const res = await fetch(
            `https://api.npmjs.org/downloads/point/last-week/${name}`,
            { signal: controller.signal },
          );
          if (!res.ok) return { name, downloads: 0 };
          const data = (await res.json()) as NpmDownloadsResult;
          return { name, downloads: data.downloads ?? 0 };
        } catch {
          return { name, downloads: 0 };
        } finally {
          clearTimeout(timeoutId);
        }
      }),
    );
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        result[outcome.value.name] = outcome.value.downloads;
      }
    }
  }

  return result;
}

/** Returns the Claude CLI command to install a plugin. */
export function getNpmInstallCommand(packageName: string): string {
  return `claude plugins add ${packageName}`;
}
