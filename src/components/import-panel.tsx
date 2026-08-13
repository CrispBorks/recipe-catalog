import * as React from "react";
import { BookmarkIcon, LinkIcon, Loader2Icon, PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ParsedPreview } from "@/components/parsed-preview";
import { SegmentedControl } from "@/components/segmented-control";
import { describeParse, parseRecipeText, type ParsedRecipe } from "@/lib/parse-recipe-text";
import type { ImportedRecipe } from "@/lib/recipe-jsonld";

const SAMPLE = `Lemon Garlic Roast Chicken

Prep Time: 15 mins
Cook Time: 1 hr
Serves 4

Ingredients
1 whole chicken (about 4 lb)
2 lemons
6 cloves garlic
3 tbsp olive oil

Instructions
1. Heat oven to 425°F and pat the chicken dry.
2. Stuff the cavity with the lemon and garlic.
3. Roast 60-70 minutes until the thigh reads 165°F.

Notes
Rest 10 minutes before carving.`;

type Source = "text" | "link";

type Fetching =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; recipe: ImportedRecipe }
  | { status: "error"; message: string };

/** Enough of an HTML error page to recognise which one it is, without pasting
 *  a whole document into the UI. */
const firstLine = (text: string) => {
  const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return (title ?? text.replace(/<[^>]*>/g, " ").trim()).slice(0, 120);
};

/** Getting a recipe in from somewhere else — pasted text or a link. Both end
 *  the same way: a preview of what was understood, then either straight into
 *  the catalog or down into the form to be corrected first. */
export function ImportPanel({
  onUse,
  onSave,
  saving,
}: {
  onUse: (parsed: ParsedRecipe) => void;
  onSave: (parsed: ParsedRecipe) => void;
  saving: boolean;
}) {
  const [source, setSource] = React.useState<Source>("text");
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [fetching, setFetching] = React.useState<Fetching>({ status: "idle" });

  const fromText = React.useMemo(
    () => (text.trim() === "" ? null : parseRecipeText(text)),
    [text],
  );
  const parsed: (ParsedRecipe & { sourceName?: string }) | null =
    source === "text" ? fromText : fetching.status === "done" ? fetching.recipe : null;

  const usable = parsed !== null && (parsed.title !== "" || describeParse(parsed).length > 0);

  const clear = () => {
    setText("");
    setUrl("");
    setFetching({ status: "idle" });
  };

  const fetchRecipe = async () => {
    const trimmed = url.trim();
    if (trimmed === "") return;

    setFetching({ status: "loading" });

    let response: Response;
    try {
      response = await fetch(`/api/import?url=${encodeURIComponent(trimmed)}`);
    } catch {
      setFetching({ status: "error", message: "Couldn't reach the importer — you may be offline." });
      return;
    }

    // Anything other than the function's own JSON means the request never got
    // there: a 404 page, a platform error page, or the SPA's index.html. Saying
    // so beats a generic "check your connection", which sends you looking in
    // the wrong place entirely.
    const body = await response.text();
    let parsedBody: { error?: string } | ImportedRecipe;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      setFetching({
        status: "error",
        message:
          response.status === 404
            ? "The importer isn't deployed on this build (/api/import returned 404)."
            : `The importer returned ${response.status} instead of a recipe. ${firstLine(body)}`,
      });
      return;
    }

    if (!response.ok) {
      setFetching({
        status: "error",
        message:
          ("error" in parsedBody && parsedBody.error) ||
          `That didn't work (${response.status}).`,
      });
      return;
    }

    setFetching({ status: "done", recipe: parsedBody as ImportedRecipe });
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-lg font-semibold">Paste a recipe from anywhere</h2>
        <SegmentedControl
          label="Where the recipe is coming from"
          value={source}
          onChange={(next) => {
            setSource(next);
            setFetching({ status: "idle" });
          }}
          options={[
            { value: "text", label: "Text" },
            { value: "link", label: "Link" },
          ]}
        />
      </div>

      <p className="mt-2 max-w-[62ch] text-[14px] text-muted-foreground">
        {source === "text"
          ? "A website, a message, a video description — it'll be split into title, ingredients, method and notes."
          : "Most recipe sites publish their recipe in a form built for search engines. Where they do, everything comes across exactly as written."}
      </p>

      <div className="mt-4">
        {source === "text" ? (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Recipe text"
              placeholder="Paste the whole thing — headings, ingredients, steps and all."
              className="max-h-72 min-h-40 resize-y overflow-auto text-[14px] leading-relaxed md:text-[14px]"
            />
            {text.trim() === "" && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setText(SAMPLE)}>
                Insert example
              </Button>
            )}
          </>
        ) : (
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void fetchRecipe();
            }}
          >
            <Input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Recipe page link"
              placeholder="https://…"
              className="sm:flex-1"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={url.trim() === "" || fetching.status === "loading"}
            >
              {fetching.status === "loading" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <LinkIcon />
              )}
              {fetching.status === "loading" ? "Fetching…" : "Fetch recipe"}
            </Button>
          </form>
        )}
      </div>

      {fetching.status === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[14px]"
        >
          {fetching.message}
        </p>
      )}

      {parsed && (
        <div className="mt-5">
          <ParsedPreview
            parsed={parsed}
            empty={
              source === "text"
                ? "Nothing recognisable yet — it needs at least a title line."
                : "The page had a recipe but none of the fields were filled in."
            }
          >
            {source === "link" && "sourceName" in parsed && parsed.sourceName ? (
              <p className="mt-4 text-[13px] text-muted-foreground">
                By {parsed.sourceName}. The source link is kept in the notes.
              </p>
            ) : null}
            {source === "text" && !parsed.sectioned && parsed.title !== "" && (
              <p className="mt-4 text-[13px] text-muted-foreground">
                No "Ingredients" or "Method" headings were found, so the split
                between them is a guess. Worth a closer look in the form.
              </p>
            )}
          </ParsedPreview>
        </div>
      )}

      {usable && parsed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button disabled={saving} onClick={() => onSave(parsed)}>
            {saving ? <Loader2Icon className="animate-spin" /> : <BookmarkIcon />}
            {saving ? "Saving…" : "Save to catalog"}
          </Button>
          <Button variant="outline" onClick={() => onUse(parsed)}>
            <PencilIcon />
            Review in the form
          </Button>
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
        </div>
      )}
    </section>
  );
}
