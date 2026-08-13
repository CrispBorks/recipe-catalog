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
      res.status(502).json({
        error: `The site returned ${response.status}. It may be blocking automated requests — paste the recipe text instead.`,
      });
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
