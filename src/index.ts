interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * DataCite MCP — DOIs for research datasets (free, no auth)
 *
 * Crossref handles papers and books; DataCite is the DOI registry for
 * **datasets, software, samples, instruments** — anything that isn't a
 * traditional publication but deserves a citation. ~50M DOIs.
 *
 * API: https://support.datacite.org/docs/api
 * Tools:
 * - search_dois:        full-text + faceted search across DataCite-registered DOIs
 * - get_doi:            full record for one DOI
 * - list_repositories:  registered data repositories (clients)
 */


const BASE_URL = 'https://api.datacite.org';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_dois',
    description:
      'Search DataCite-registered DOIs. Filter by free-text query, resource type (dataset, software, etc.), year, publisher, or affiliation. Returns DOI, title, creators, publisher, type, year, citation count.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query (titles, descriptions, creators)' },
        resource_type: {
          type: 'string',
          description: 'Dataset | Software | Text | Image | Sound | Other (case-sensitive)',
        },
        year: { type: 'number', description: 'Publication year' },
        publisher: { type: 'string', description: 'Publisher name filter' },
        affiliation: { type: 'string', description: 'Creator affiliation' },
        page_size: { type: 'number', description: '1-1000 (default 25)' },
        page: { type: 'number', description: '1-based page (default 1)' },
      },
      required: [],
    },
  },
  {
    name: 'get_doi',
    description:
      'Fetch a single DOI record. Returns full metadata: title(s), creators with affiliations and ORCIDs, abstract, publisher, year, dates, related identifiers, subjects, license, sizes/formats.',
    inputSchema: {
      type: 'object',
      properties: {
        doi: { type: 'string', description: 'DOI (e.g., "10.5281/zenodo.1234567")' },
      },
      required: ['doi'],
    },
  },
  {
    name: 'list_repositories',
    description:
      'List DataCite-registered data repositories (e.g., Zenodo, Dryad, Figshare). Filter by query. Useful for "where do I deposit a dataset" lookups.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Repository name / description filter' },
        page_size: { type: 'number', description: '1-1000 (default 25)' },
        page: { type: 'number', description: '1-based page' },
      },
      required: [],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_dois':
      return searchDois(args);
    case 'get_doi':
      return getDoi(reqStr(args, 'doi', '"10.5281/zenodo.1234567"'));
    case 'list_repositories':
      return listRepositories(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

async function dcFetch<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = `${BASE_URL}${path}${params ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
  if (res.status === 404) throw new Error('DataCite: not found (HTTP 404)');
  if (res.status === 429) throw new Error('DataCite: rate-limit (HTTP 429)');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DataCite error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface DoiAttributes {
  doi?: string;
  identifiers?: { identifier?: string; identifierType?: string }[];
  creators?: { name?: string; affiliation?: { name?: string }[]; nameIdentifiers?: { nameIdentifier?: string; nameIdentifierScheme?: string }[] }[];
  titles?: { title?: string; lang?: string }[];
  publisher?: string;
  publicationYear?: number;
  types?: { resourceType?: string; resourceTypeGeneral?: string };
  subjects?: { subject?: string }[];
  dates?: { date?: string; dateType?: string }[];
  descriptions?: { description?: string; descriptionType?: string }[];
  sizes?: string[];
  formats?: string[];
  rightsList?: { rights?: string; rightsUri?: string }[];
  relatedIdentifiers?: { relatedIdentifier?: string; relatedIdentifierType?: string; relationType?: string }[];
  url?: string;
  citationCount?: number;
  downloadCount?: number;
  viewCount?: number;
  registered?: string;
  updated?: string;
}

interface DoiResource {
  id?: string;
  attributes?: DoiAttributes;
}

function normalizeDoiSummary(r: DoiResource) {
  const a = r.attributes ?? {};
  const titles = a.titles ?? [];
  return {
    doi: a.doi ?? r.id ?? null,
    title: titles[0]?.title ?? null,
    creators: (a.creators ?? []).map((c) => c.name).filter(Boolean),
    publisher: a.publisher ?? null,
    year: a.publicationYear ?? null,
    resource_type: a.types?.resourceTypeGeneral ?? a.types?.resourceType ?? null,
    url: a.url ?? null,
    citation_count: a.citationCount ?? null,
    download_count: a.downloadCount ?? null,
    view_count: a.viewCount ?? null,
    datacite_url: a.doi ? `https://commons.datacite.org/doi.org/${a.doi}` : null,
  };
}

function normalizeDoiFull(r: DoiResource) {
  const a = r.attributes ?? {};
  return {
    ...normalizeDoiSummary(r),
    titles: (a.titles ?? []).map((t) => ({ title: t.title ?? null, lang: t.lang ?? null })),
    creators_full: (a.creators ?? []).map((c) => ({
      name: c.name ?? null,
      affiliations: (c.affiliation ?? []).map((af) => af.name).filter(Boolean),
      orcid: c.nameIdentifiers?.find((i) => i.nameIdentifierScheme === 'ORCID')?.nameIdentifier ?? null,
    })),
    subjects: (a.subjects ?? []).map((s) => s.subject).filter(Boolean),
    descriptions: (a.descriptions ?? []).map((d) => ({ text: d.description ?? null, type: d.descriptionType ?? null })),
    dates: (a.dates ?? []).map((d) => ({ date: d.date ?? null, type: d.dateType ?? null })),
    sizes: a.sizes ?? [],
    formats: a.formats ?? [],
    rights: (a.rightsList ?? []).map((r) => ({ name: r.rights ?? null, uri: r.rightsUri ?? null })),
    related: (a.relatedIdentifiers ?? []).map((r) => ({
      id: r.relatedIdentifier ?? null,
      type: r.relatedIdentifierType ?? null,
      relation: r.relationType ?? null,
    })),
    registered: a.registered ?? null,
    updated: a.updated ?? null,
  };
}

async function searchDois(args: Record<string, unknown>) {
  const params = new URLSearchParams({
    'page[size]': String(Math.min(1000, Math.max(1, (args.page_size as number) ?? 25))),
    'page[number]': String(Math.max(1, (args.page as number) ?? 1)),
  });
  if (args.query) params.set('query', String(args.query));
  if (args.resource_type) params.set('resource-type-id', String(args.resource_type).toLowerCase());
  if (args.year) params.set('publication-year', String(args.year));
  if (args.publisher) params.set('publisher', String(args.publisher));
  if (args.affiliation) params.set('affiliation', String(args.affiliation));

  const data = await dcFetch<{
    data?: DoiResource[];
    meta?: { total?: number; totalPages?: number };
  }>('/dois', params);

  return {
    total: data.meta?.total ?? 0,
    total_pages: data.meta?.totalPages ?? 0,
    returned: data.data?.length ?? 0,
    results: (data.data ?? []).map(normalizeDoiSummary),
  };
}

async function getDoi(doi: string) {
  const data = await dcFetch<{ data?: DoiResource }>(`/dois/${encodeURIComponent(doi)}`);
  if (!data.data) throw new Error(`DataCite: no record for DOI ${doi}`);
  return normalizeDoiFull(data.data);
}

interface RepoResource {
  id?: string;
  attributes?: {
    name?: string;
    symbol?: string;
    description?: string;
    url?: string;
    re3data?: string;
    repositoryType?: string[];
    softwareType?: string;
    domain?: string;
    yearCreated?: number;
  };
}

async function listRepositories(args: Record<string, unknown>) {
  const params = new URLSearchParams({
    'page[size]': String(Math.min(1000, Math.max(1, (args.page_size as number) ?? 25))),
    'page[number]': String(Math.max(1, (args.page as number) ?? 1)),
  });
  if (args.query) params.set('query', String(args.query));

  const data = await dcFetch<{
    data?: RepoResource[];
    meta?: { total?: number };
  }>('/clients', params);

  return {
    total: data.meta?.total ?? 0,
    returned: data.data?.length ?? 0,
    repositories: (data.data ?? []).map((r) => ({
      id: r.id ?? null,
      name: r.attributes?.name ?? null,
      symbol: r.attributes?.symbol ?? null,
      description: r.attributes?.description ?? null,
      url: r.attributes?.url ?? null,
      re3data_url: r.attributes?.re3data ?? null,
      repository_types: r.attributes?.repositoryType ?? [],
      domain: r.attributes?.domain ?? null,
      year_created: r.attributes?.yearCreated ?? null,
    })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
