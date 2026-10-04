/**
 * An in-memory stand-in for the slice of the Notion API this app uses, so the
 * whole stack can run and be tested without a real workspace or token.
 *
 *   node test/fake-notion.mjs [port]        # then run the app with
 *   NOTION_API_BASE=http://localhost:4010/v1 npm run dev
 *
 * It is deliberately strict where Notion is: unknown columns, wrong value
 * types and malformed ids are rejected, so schema mistakes surface here.
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const IDS = {
  healthTracker: "3570c782-4a59-81f9-b42d-f302436bc737",
  workoutLog: "3570c782-4a59-8141-8842-fce74812fd2e",
  routines: "71118190-7086-43f5-80b1-a13fdb3840fd",
  routineExercises: "a5288f02-c641-439f-8bc6-b4a82b504504",
  weightLog: "3570c782-4a59-8139-8000-d8b360d6064a",
};

const strip = (id) => String(id).replace(/-/g, "").toLowerCase();
const isNotionId = (id) => /^[0-9a-f]{32}$/.test(strip(id));

class NotionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createFakeNotion({ seed = true } = {}) {
  const databases = new Map();
  const pages = new Map();
  const children = new Map();
  const failures = [];
  let clock = Date.parse("2026-09-28T07:00:00.000Z");
  const now = () => new Date((clock += 1000)).toISOString();

  /* -------------------------------------------------------------- *
   * Storage helpers
   * -------------------------------------------------------------- */

  function getDatabase(id) {
    const database = databases.get(strip(id));
    if (!database) throw new NotionError(404, "object_not_found", `Could not find database with ID: ${id}.`);
    return database;
  }

  function getPage(id) {
    if (!isNotionId(id)) throw new NotionError(400, "validation_error", `path failed validation: ${id} is not a valid uuid.`);
    const page = pages.get(strip(id));
    if (!page) throw new NotionError(404, "object_not_found", `Could not find page with ID: ${id}.`);
    return page;
  }

  function schemaFrom(definitions) {
    const properties = {};
    for (const [name, definition] of Object.entries(definitions ?? {})) {
      const type = Object.keys(definition).find((key) => key !== "name" && key !== "id");
      if (!type) throw new NotionError(400, "validation_error", `Property ${name} has no type.`);
      const config = definition[type] ?? {};
      if (type === "select" || type === "multi_select") {
        config.options = (config.options ?? []).map((option) => ({ id: randomUUID(), color: "default", ...option }));
      }
      properties[name] = { id: randomUUID().slice(0, 4), name, type, [type]: config };
    }
    return properties;
  }

  function addDatabase({ id = randomUUID(), parentId, title, properties }) {
    const database = {
      object: "database",
      id,
      created_time: now(),
      parent: { type: "page_id", page_id: parentId },
      title: [{ type: "text", text: { content: title }, plain_text: title }],
      properties: schemaFrom(properties),
    };
    const titles = Object.values(database.properties).filter((property) => property.type === "title");
    if (titles.length !== 1) throw new NotionError(400, "validation_error", "A database needs exactly one title property.");
    databases.set(strip(id), database);
    const list = children.get(strip(parentId)) ?? [];
    list.push({ object: "block", id, type: "child_database", child_database: { title } });
    children.set(strip(parentId), list);
    return database;
  }

  function richText(value, name) {
    if (!Array.isArray(value)) throw new NotionError(400, "validation_error", `${name} is expected to be rich_text.`);
    return value.map((part) => {
      const content = part?.text?.content ?? part?.plain_text ?? "";
      if (content.length > 2000) throw new NotionError(400, "validation_error", `${name} text is longer than 2000.`);
      return { type: "text", text: { content }, plain_text: content };
    });
  }

  /** Converts a write-shaped property value to the read shape, enforcing the column type. */
  function toStored(database, name, value) {
    const column = database.properties[name];
    if (!column) throw new NotionError(400, "validation_error", `${name} is not a property that exists.`);
    const { type } = column;
    if (!(type in value)) {
      throw new NotionError(400, "validation_error", `${name} is expected to be ${type}.`);
    }
    const raw = value[type];
    switch (type) {
      case "title":
      case "rich_text":
        return { id: column.id, type, [type]: richText(raw, name) };
      case "number":
        if (raw !== null && typeof raw !== "number") throw new NotionError(400, "validation_error", `${name} is expected to be number.`);
        return { id: column.id, type, number: raw };
      case "checkbox":
        if (typeof raw !== "boolean") throw new NotionError(400, "validation_error", `${name} is expected to be checkbox.`);
        return { id: column.id, type, checkbox: raw };
      case "date":
        if (raw !== null && typeof raw?.start !== "string") throw new NotionError(400, "validation_error", `${name} is expected to be date.`);
        return { id: column.id, type, date: raw ? { start: raw.start, end: raw.end ?? null, time_zone: null } : null };
      case "select": {
        if (raw === null) return { id: column.id, type, select: null };
        if (typeof raw?.name !== "string") throw new NotionError(400, "validation_error", `${name} is expected to be select.`);
        return { id: column.id, type, select: ensureOption(column, raw.name) };
      }
      case "multi_select":
        if (!Array.isArray(raw)) throw new NotionError(400, "validation_error", `${name} is expected to be multi_select.`);
        return { id: column.id, type, multi_select: raw.map((option) => ensureOption(column, option.name)) };
      case "relation":
        if (!Array.isArray(raw)) throw new NotionError(400, "validation_error", `${name} is expected to be relation.`);
        return { id: column.id, type, relation: raw.map((item) => ({ id: item.id })), has_more: false };
      default:
        throw new NotionError(400, "validation_error", `Unsupported property type ${type}.`);
    }
  }

  // Like Notion, writing an unknown select option creates it.
  function ensureOption(column, name) {
    const config = column[column.type];
    let option = config.options.find((candidate) => candidate.name === name);
    if (!option) {
      option = { id: randomUUID(), name, color: "default" };
      config.options.push(option);
    }
    return option;
  }

  function emptyValue(column) {
    const empty = { title: [], rich_text: [], number: null, checkbox: false, date: null, select: null, multi_select: [], relation: [] };
    return { id: column.id, type: column.type, [column.type]: empty[column.type] ?? null };
  }

  function createPage({ parent, properties }) {
    const database = getDatabase(parent?.database_id);
    const stored = {};
    for (const [name, column] of Object.entries(database.properties)) stored[name] = emptyValue(column);
    for (const [name, value] of Object.entries(properties ?? {})) stored[name] = toStored(database, name, value);
    const timestamp = now();
    const page = {
      object: "page",
      id: randomUUID(),
      created_time: timestamp,
      last_edited_time: timestamp,
      archived: false,
      parent: { type: "database_id", database_id: database.id },
      properties: stored,
    };
    pages.set(strip(page.id), page);
    return page;
  }

  function updatePage(id, { properties, archived }) {
    const page = getPage(id);
    const database = getDatabase(page.parent.database_id);
    for (const [name, value] of Object.entries(properties ?? {})) page.properties[name] = toStored(database, name, value);
    if (typeof archived === "boolean") page.archived = archived;
    page.last_edited_time = now();
    return page;
  }

  /* -------------------------------------------------------------- *
   * Queries
   * -------------------------------------------------------------- */

  function plain(property) {
    if (!property) return undefined;
    const value = property[property.type];
    if (property.type === "title" || property.type === "rich_text") return value.map((part) => part.plain_text).join("");
    if (property.type === "select") return value?.name ?? null;
    if (property.type === "date") return value?.start ?? null;
    return value;
  }

  function matches(page, filter) {
    if (!filter) return true;
    if (filter.and) return filter.and.every((inner) => matches(page, inner));
    if (filter.or) return filter.or.some((inner) => matches(page, inner));
    const property = page.properties[filter.property];
    if (!property) throw new NotionError(400, "validation_error", `Could not find property with name or id: ${filter.property}`);
    const value = plain(property);
    if (filter.checkbox) return value === filter.checkbox.equals;
    if (filter.rich_text || filter.title) {
      const condition = filter.rich_text ?? filter.title;
      if ("equals" in condition) return value === condition.equals;
      if ("contains" in condition) return value.includes(condition.contains);
    }
    if (filter.select) return value === filter.select.equals;
    if (filter.date) {
      if (!value) return false;
      const day = value.slice(0, 10);
      if (filter.date.on_or_after) return day >= filter.date.on_or_after;
      if (filter.date.on_or_before) return day <= filter.date.on_or_before;
      if (filter.date.equals) return day === filter.date.equals;
    }
    throw new NotionError(400, "validation_error", `Unsupported filter ${JSON.stringify(filter)}`);
  }

  function compare(a, b, sorts) {
    for (const sort of sorts ?? []) {
      const left = sort.timestamp ? a[sort.timestamp] : plain(a.properties[sort.property]);
      const right = sort.timestamp ? b[sort.timestamp] : plain(b.properties[sort.property]);
      if (left === right) continue;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      const order = left < right ? -1 : 1;
      return sort.direction === "descending" ? -order : order;
    }
    return 0;
  }

  function query(databaseId, body) {
    const database = getDatabase(databaseId);
    const all = [...pages.values()]
      .filter((page) => strip(page.parent.database_id) === strip(database.id) && !page.archived)
      .filter((page) => matches(page, body?.filter))
      .sort((a, b) => compare(a, b, body?.sorts) || a.created_time.localeCompare(b.created_time));
    const size = Math.min(100, body?.page_size ?? 100);
    const start = Number(body?.start_cursor ?? 0);
    const results = all.slice(start, start + size);
    const more = start + size < all.length;
    return { object: "list", results, has_more: more, next_cursor: more ? String(start + size) : null };
  }

  /* -------------------------------------------------------------- *
   * HTTP
   * -------------------------------------------------------------- */

  async function route(method, path, url, body) {
    let match;
    if (method === "GET" && path === "/__state") {
      return { databases: [...databases.values()], pages: [...pages.values()] };
    }
    if ((match = path.match(/^\/v1\/databases\/([^/]+)\/query$/)) && method === "POST") return query(match[1], body);
    if ((match = path.match(/^\/v1\/databases\/([^/]+)$/))) {
      const database = getDatabase(match[1]);
      if (method === "GET") return database;
      if (method === "PATCH") {
        for (const [name, column] of Object.entries(schemaFrom(body?.properties))) {
          database.properties[name] = column;
          for (const page of pages.values()) {
            if (strip(page.parent.database_id) === strip(database.id) && !page.properties[name]) {
              page.properties[name] = emptyValue(column);
            }
          }
        }
        return database;
      }
    }
    if (path === "/v1/databases" && method === "POST") {
      const title = (body?.title ?? []).map((part) => part?.text?.content ?? "").join("");
      if (!body?.parent?.page_id || !pages.has(strip(body.parent.page_id)) && !children.has(strip(body.parent.page_id))) {
        throw new NotionError(404, "object_not_found", "Could not find the parent page.");
      }
      return addDatabase({ parentId: body.parent.page_id, title, properties: body.properties });
    }
    if ((match = path.match(/^\/v1\/blocks\/([^/]+)\/children$/)) && method === "GET") {
      const list = children.get(strip(match[1]));
      if (!list) throw new NotionError(404, "object_not_found", `Could not find block with ID: ${match[1]}.`);
      const size = Number(url.searchParams.get("page_size") ?? 100);
      const start = Number(url.searchParams.get("start_cursor") ?? 0);
      const more = start + size < list.length;
      return { object: "list", results: list.slice(start, start + size), has_more: more, next_cursor: more ? String(start + size) : null };
    }
    if (path === "/v1/pages" && method === "POST") return createPage(body ?? {});
    if ((match = path.match(/^\/v1\/pages\/([^/]+)$/))) {
      if (method === "GET") return getPage(match[1]);
      if (method === "PATCH") return updatePage(match[1], body ?? {});
    }
    throw new NotionError(400, "invalid_request_url", `Unsupported ${method} ${path}`);
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const send = (status, payload) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    try {
      if (url.pathname !== "/__state" && !/^Bearer .+/.test(request.headers.authorization ?? "")) {
        throw new NotionError(401, "unauthorized", "API token is invalid.");
      }
      const body = raw ? JSON.parse(raw) : undefined;
      const failure = failures.findIndex((rule) => rule.test(request.method, url.pathname, body));
      if (failure >= 0) {
        failures.splice(failure, 1);
        throw new NotionError(502, "service_unavailable", "Injected failure");
      }
      send(200, await route(request.method, url.pathname, url, body));
    } catch (error) {
      if (error instanceof NotionError) send(error.status, { object: "error", status: error.status, code: error.code, message: error.message });
      else send(500, { object: "error", status: 500, code: "internal_server_error", message: String(error?.message ?? error) });
    }
  });

  function seedWorkspace() {
    pages.set(strip(IDS.healthTracker), {
      object: "page",
      id: IDS.healthTracker,
      created_time: now(),
      archived: false,
      parent: { type: "workspace", workspace: true },
      properties: {},
    });
    children.set(strip(IDS.healthTracker), []);
    addDatabase({
      id: IDS.workoutLog,
      parentId: IDS.healthTracker,
      title: "Workout Log",
      properties: {
        Name: { title: {} },
        Date: { date: {} },
        Exercise: { rich_text: {} },
        "Duration (s)": { number: {} },
        Level: { rich_text: {} },
        Notes: { rich_text: {} },
        Reps: { number: {} },
      },
    });
    addDatabase({
      id: IDS.weightLog,
      parentId: IDS.healthTracker,
      title: "Weight Log",
      properties: {
        Name: { title: {} },
        Date: { date: {} },
        "Weight (kg)": { number: {} },
        "Body Fat %": { rich_text: {} },
        Note: { rich_text: {} },
      },
    });
    addDatabase({
      id: IDS.routines,
      parentId: IDS.healthTracker,
      title: "Workout Routines",
      properties: { Name: { title: {} }, Default: { checkbox: {} }, "Last Used": { date: {} }, Archived: { checkbox: {} } },
    });
    addDatabase({
      id: IDS.routineExercises,
      parentId: IDS.healthTracker,
      title: "Routine Exercises",
      properties: {
        Name: { title: {} },
        Routine: { relation: {} },
        Order: { number: {} },
        "Duration (s)": { number: {} },
      },
    });
  }

  if (seed) seedWorkspace();

  return {
    server,
    /** Back to the freshly seeded workspace (same port). */
    reset() {
      databases.clear();
      pages.clear();
      children.clear();
      failures.length = 0;
      if (seed) seedWorkspace();
    },
    /** Make the next request matching `test(method, path, body)` fail with a 502. */
    failOnce(test) {
      failures.push({ test });
    },
    pagesIn(databaseId) {
      return [...pages.values()].filter((page) => page.parent.database_id && strip(page.parent.database_id) === strip(databaseId));
    },
    databaseNamed(title) {
      return [...databases.values()].find((database) => database.title[0]?.plain_text === title);
    },
    addDatabase,
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}/v1`));
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const fake = createFakeNotion();
  const base = await fake.listen(Number(process.argv[2] ?? 4010));
  console.log(`Fake Notion listening at ${base}`);
  console.log("Run the app with:");
  console.log(`  NOTION_API_BASE=${base} NOTION_TOKEN=fake NOTION_LOG_DB=${IDS.workoutLog} \\`);
  console.log(`  NOTION_ROUTINES_DB=${IDS.routines} NOTION_EXERCISES_DB=${IDS.routineExercises} npm run dev`);
}
