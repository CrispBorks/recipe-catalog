import * as React from "react";
import { LinkIcon, Loader2Icon, WandIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ParsedPreview } from "@/components/parsed-preview";
import type { ParsedRecipe } from "@/lib/parse-recipe-text";
import type { ImportedRecipe } from "@/lib/recipe-jsonld";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; recipe: ImportedRecipe }
  | { status: "error"; message: string };

export function ImportLink({ onUse }: { onUse: (parsed: ParsedRecipe) => void }) {
  const [url, setUrl] = React.useState("");
  const [state, setState] = React.useState<State>({ status: "idle" });

  const fetchRecipe = async () => {
    const trimmed = url.trim();
    if (trimmed === "") return;

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/import?url=${encodeURIComponent(trimmed)}`);
      const body = await response.json();
      if (!response.ok) {
        setState({
          status: "error",
          message: body?.error ?? "That didn't work. Try pasting the recipe text instead.",
        });
        return;
      }
      setState({ status: "done", recipe: body as ImportedRecipe });
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the importer. Check your connection and try again.",
      });
    }
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
            <Button onClick={() => onUse(state.recipe)}>
              <WandIcon />
              Fill in the form
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
        </>
      )}
    </div>
  );
}
