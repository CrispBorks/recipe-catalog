/** GET /api/import?url=… — fetches a recipe page and returns the recipe that
 *  its schema.org JSON-LD describes.
 *
 *  This exists only because a browser can't read another origin's HTML. There
 *  is no API key, no model and no per-request cost behind it: it fetches, finds
 *  the <script type="application/ld+json"> block the site already publishes for
 *  Google, and maps the fields across. */

/** Loaded on demand rather than at module scope. It lives outside api/, and how
 *  a serverless build resolves that boundary varies; a static import that fails
 *  to resolve takes the whole function down with an opaque 500, while this way
 *  the reason comes back as a readable message. */
async function loadMapper() {
  return import("../src/lib/recipe-jsonld.js");
}

/** Enough of Vercel's Node request/response to type this handler without
 *  taking on @vercel/node as a dependency. */
type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const FETCH_TIMEOUT_MS = 12_000;
/** Recipe pages are bloated but not unbounded; this is a sanity limit, and the
 *  JSON-LD is in the <head> anyway. */
const MAX_BYTES = 4_000_000;

/** A public endpoint that fetches arbitrary URLs is a request forwarder, so it
 *  must not be pointable at anything on the private network. */
const BLOCKED_HOST =
  /^(?:localhost|\[?::1\]?|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)|\.(?:local|internal)$/i;

/** What the site's status code means for someone trying to save a recipe. The
 *  paywall cases are worth naming: nothing about this importer can get past
 *  one, and knowing that saves you retrying. */
function describeStatus(status: number): string {
  if (status === 401 || status === 402) {
    return "That recipe is behind a paywall, so the page can't be read without your subscription. Open it in your browser and use the Paste text tab.";
  }
  if (status === 403) {
    return "The site refused the request — some publishers block anything that isn't a person browsing. Copy the recipe text and use the Paste text tab.";
  }
  if (status === 404 || status === 410) {
    return "There's no page at that address. Check the link.";
  }
  if (status === 429) {
    return "The site is rate-limiting requests. Wait a minute and try again.";
  }
  if (status >= 500) {
    return `The site is having problems (${status}). Try again later.`;
  }
  return `The site returned ${status}, so the recipe couldn't be read. Paste the recipe text instead.`;
}

function validate(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "That doesn't look like a link. Paste the full address, including https://." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "Only http and https links can be imported." };
  }
  if (BLOCKED_HOST.test(url.hostname)) {
    return { error: "That address isn't reachable from here." };
  }
  return { url };
}

/** Everything worth knowing about why a page did or didn't yield a recipe. */
function describePage(
  html: string,
  url: string,
  mapper: { findRecipeNode: (html: string) => Record<string, unknown> | null },
) {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  const jsonLd = blocks.map(([, body], i) => {
    try {
      const parsed: unknown = JSON.parse(body.trim());
      const types = new Set<string>();
      const walk = (value: unknown, depth = 0) => {
        if (depth > 6 || !value || typeof value !== "object") return;
        if (Array.isArray(value)) return value.forEach((v) => walk(v, depth + 1));
        const node = value as Record<string, unknown>;
        for (const t of [node["@type"]].flat()) if (t) types.add(String(t));
        for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "hasPart"]) {
          walk(node[key], depth + 1);
        }
      };
      walk(parsed);
      return { block: i + 1, types: [...types] };
    } catch (error) {
      return { block: i + 1, unparseable: error instanceof Error ? error.message : String(error) };
    }
  });

  // If the words aren't in the served HTML at all, the page builds itself in
  // the browser and no amount of parsing here will reach it.
  const mentions = (pattern: RegExp) => pattern.test(html);

  return {
    url,
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null,
    htmlBytes: html.length,
    recipeFound: mapper.findRecipeNode(html) !== null,
    jsonLdBlocks: jsonLd,
    microdata: mentions(/itemtype\s*=\s*["']https?:\/\/schema\.org\/Recipe["']/i),
    rdfa: mentions(/typeof\s*=\s*["'][^"']*Recipe/i),
    clientRenderedPayload: {
      next: mentions(/id\s*=\s*["']__NEXT_DATA__["']/i),
      nuxt: mentions(/window\.__NUXT__/),
      apollo: mentions(/__APOLLO_STATE__/),
    },
    // The tell: server-rendered recipe text is here; a client-rendered page has
    // the shell and nothing else.
    looksServerRendered: {
      saysIngredients: mentions(/ingredients?/i),
      saysMethodOrInstructions: mentions(/instructions?|method|directions?/i),
    },
  };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");

  let mapper: Awaited<ReturnType<typeof loadMapper>>;
  try {
    mapper = await loadMapper();
  } catch (error) {
    res.status(500).json({
      error: `The importer couldn't load its parser: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ error: "Use GET." });
    return;
  }

  const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!raw) {
    res.status(400).json({ error: "No link given." });
    return;
  }

  const checked = validate(raw);
  if ("error" in checked) {
    res.status(400).json({ error: checked.error });
    return;
  }

  let html: string;
  try {
    const response = await fetch(checked.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Plenty of recipe sites serve a bare error page to an unrecognised
        // client. Asking for HTML as a browser would is enough to get the real
        // page, which is also the page the JSON-LD lives on.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
      },
    });

    if (!response.ok) {
      res.status(502).json({ error: describeStatus(response.status) });
      return;
    }

    const body = await response.text();
    html = body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    res.status(504).json({
      error: timedOut
        ? "The site took too long to respond."
        : "Couldn't reach that page.",
    });
    return;
  }

  // ?debug=1 reports what the page actually contains rather than only that it
  // wasn't readable. "The recipe is right there on the page" and "the recipe is
  // in the HTML this fetched" are different claims, and the difference decides
  // whether a parser can ever help.
  if (req.query.debug !== undefined) {
    res.status(200).json(describePage(html, checked.url.toString(), mapper));
    return;
  }

  const node = mapper.findRecipeNode(html);
  if (!node) {
    res.status(422).json({
      error:
        "That page doesn't publish its recipe in a readable format. Copy the recipe text and use the Paste text tab.",
    });
    return;
  }

  const recipe = mapper.recipeFromJsonLd(node, checked.url.toString());
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    res.status(422).json({
      error: "Found a recipe on that page but it had no ingredients or method.",
    });
    return;
  }

  res.status(200).json(recipe);
}
