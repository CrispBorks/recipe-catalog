import * as React from "react";
import { BookmarkIcon, LinkIcon, Loader2Icon, WandIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ParsedPreview } from "@/components/parsed-preview";
import type { ParsedRecipe } from "@/lib/parse-recipe-text";
import type { ImportedRecipe } from "@/lib/recipe-jsonld";

/** Enough of an HTML error page to recognise which one it is, without pasting
 *  a whole document into the UI. */
const firstLine = (text: string) => {
  const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return (title ?? text.replace(/<[^>]*>/g, " ").trim()).slice(0, 120);
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; recipe: ImportedRecipe }
  | { status: "error"; message: string };

export function ImportLink({
  onUse,
  onSave,
  saving,
  saved,
}: {
  onUse: (parsed: ParsedRecipe) => void;
  onSave: (parsed: ParsedRecipe) => void;
  saving: boolean;
  /** Set once a save lands, so the tab can confirm without sending you to the
   *  form to find out whether it worked. */
  saved: { id: string; title: string } | null;
}) {
  const [url, setUrl] = React.useState("");
  const [state, setState] = React.useState<State>({ status: "idle" });

  const fetchRecipe = async () => {
    const trimmed = url.trim();
    if (trimmed === "") return;

    setState({ status: "loading" });

    let response: Response;
    try {
      response = await fetch(`/api/import?url=${encodeURIComponent(trimmed)}`);
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the importer — you may be offline.",
      });
      return;
    }

    // Anything other than the function's own JSON means the request never got
    // there: a 404 page, a platform error page, or the SPA's index.html. Saying
    // so beats a generic "check your connection", which sends you looking in
    // the wrong place entirely.
    const text = await response.text();
    let body: { error?: string } | ImportedRecipe;
    try {
      body = JSON.parse(text);
    } catch {
      setState({
        status: "error",
        message:
          response.status === 404
            ? "The importer isn't deployed on this build (/api/import returned 404)."
            : `The importer returned ${response.status} instead of a recipe. ${firstLine(text)}`,
      });
      return;
    }

    if (!response.ok) {
      setState({
        status: "error",
        message:
          ("error" in body && body.error) ||
          `That didn't work (${response.status}). Try pasting the recipe text instead.`,
      });
      return;
    }

    setState({ status: "done", recipe: body as ImportedRecipe });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-[14px] text-muted-foreground">
        Paste a link to a recipe page. Most recipe sites publish the recipe in a
        form built for search engines — where they do, the ingredients, method
        and times come across exactly as written, no guessing involved.
      </p>

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
        <Button type="submit" disabled={url.trim() === "" || state.status === "loading"}>
          {state.status === "loading" ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <LinkIcon />
          )}
          {state.status === "loading" ? "Fetching…" : "Fetch recipe"}
        </Button>
      </form>

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[14px]"
        >
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <>
          <ParsedPreview
            parsed={state.recipe}
            empty="The page had a recipe but none of the fields were filled in."
          >
            {state.recipe.sourceName && (
              <p className="mt-4 text-[13px] text-muted-foreground">
                By {state.recipe.sourceName}. The source link is kept in the
                notes.
              </p>
            )}
          </ParsedPreview>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={saving || state.recipe.title.trim() === ""}
              onClick={() => onSave(state.recipe)}
            >
              {saving ? <Loader2Icon className="animate-spin" /> : <BookmarkIcon />}
              {saving ? "Saving…" : "Save to catalog"}
            </Button>
            <Button variant="outline" onClick={() => onUse(state.recipe)}>
              <WandIcon />
              Edit first
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setUrl("");
                setState({ status: "idle" });
              }}
            >
              Clear
            </Button>
          </div>

          {saved && (
            <p className="rounded-md border border-status/40 bg-status/5 p-3 text-[14px]">
              "{saved.title}" is in the catalog.{" "}
              <Link to={`/recipe/${saved.id}`} className="underline underline-offset-2">
                Open it
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
