import * as React from "react";
import {
  AlertTriangleIcon,
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RecipeCard } from "@/components/recipe-card";
import { SegmentedControl } from "@/components/segmented-control";
import type { Recipe } from "@/lib/recipes";
import {
  buildFile,
  countErrors,
  parseAndReview,
  type PasteMode,
} from "@/lib/recipe-schema";
import { cn } from "@/lib/utils";

const SAMPLE = `[
  {
    "id": "example-soup",
    "title": "Example Soup",
    "tags": ["dinner", "quick"],
    "time": 30,
    "servings": 4,
    "ingredients": [
      { "qty": 2, "unit": "cups", "name": "stock" },
      { "qty": 1, "unit": "", "name": "onion" }
    ],
    "steps": ["Soften the onion.", "Add the stock and simmer."],
    "notes": ["https://youtu.be/dQw4w9WgXcQ"]
  }
]`;

export function PasteRecipes({
  existing,
  onSave,
  saving,
}: {
  existing: Recipe[];
  onSave: (recipes: Recipe[]) => void;
  saving: boolean;
}) {
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState<PasteMode>("append");

  const existingIds = React.useMemo(() => existing.map((r) => r.id), [existing]);
  const outcome = React.useMemo(
    () => parseAndReview(text, existingIds, mode),
    [text, existingIds, mode],
  );

  const items = outcome.ok ? outcome.items : [];
  const errorCount = countErrors(items);
  const ready = items.filter((item) => item.recipe !== null);
  const resultFile = outcome.ok ? buildFile(existing, items, mode) : [];
  const canExport = outcome.ok && errorCount === 0 && ready.length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(resultFile, null, 2));
      toast.success("Copied every recipe as JSON");
    } catch {
      toast.error("Couldn't copy — download it instead");
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(resultFile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recipes.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Downloaded a backup of every recipe");
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-[14px] text-muted-foreground">
        Paste a single recipe or a whole list. Everything is checked as you
        type — bad JSON, missing fields and clashing slugs are caught before
        anything reaches the catalog.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="What to do with these recipes"
          value={mode}
          onChange={setMode}
          options={[
            { value: "append", label: "Add new" },
            { value: "update", label: "Update existing" },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setText(SAMPLE)}
          disabled={text.trim() !== ""}
        >
          Insert example
        </Button>
      </div>

      <p className="meta-mono text-muted-foreground">
        {mode === "append"
          ? `Added after the ${existing.length} recipe${existing.length === 1 ? "" : "s"} already in the catalog.`
          : "Replaces the entire file — only what you paste survives."}
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label="Recipe JSON"
        placeholder='[{ "id": "…", "title": "…" }]'
        // Capped rather than growing with the content — a long file would
        // otherwise push the results and preview far below the fold.
        className="max-h-72 min-h-48 resize-y overflow-auto font-mono text-[13px] leading-relaxed md:text-[13px]"
      />

      {text.trim() !== "" && !outcome.ok && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4">
          <p className="label-mono flex items-center gap-2 text-destructive">
            <XCircleIcon className="size-3.5" />
            That isn't valid JSON
          </p>
          <p className="mt-2 font-mono text-[13px] break-words">{outcome.message}</p>
          {outcome.line !== undefined && (
            <p className="meta-mono mt-1 text-muted-foreground">
              Line {outcome.line}, column {outcome.column}
            </p>
          )}
        </div>
      )}

      {outcome.ok && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="meta-mono">
              {items.length} entr{items.length === 1 ? "y" : "ies"} ·{" "}
              <span className={cn(ready.length > 0 && "text-status-foreground")}>
                {ready.length} ready
              </span>
              {errorCount > 0 && (
                <span className="text-destructive"> · {errorCount} to fix</span>
              )}
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const failed = item.recipe === null;
              return (
                <li
                  key={item.index}
                  className={cn(
                    "rounded-md border p-3",
                    failed ? "border-destructive/50 bg-destructive/5" : "border-border",
                  )}
                >
                  <p className="flex items-center gap-2 text-[15px]">
                    {failed ? (
                      <XCircleIcon className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <CheckIcon className="size-4 shrink-0 text-status-foreground" />
                    )}
                    <span className="font-medium">{item.label}</span>
                  </p>
                  {item.issues.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 pl-6">
                      {item.issues.map((issue, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-start gap-1.5 text-[13px]",
                            issue.level === "error"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {issue.level === "warning" && (
                            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                          )}
                          <span>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {ready.length > 0 && (
            <div>
              <h3 className="label-mono border-b border-border pb-2 text-muted-foreground">
                Preview
              </h3>
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {ready.map((item) => (
                  <RecipeCard key={item.index} recipe={item.recipe!} preview />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!canExport || saving}
              onClick={() => onSave(ready.map((item) => item.recipe!))}
            >
              {saving ? <Loader2Icon className="animate-spin" /> : <BookmarkIcon />}
              {saving
                ? "Saving…"
                : `Save ${ready.length} to the catalog`}
            </Button>
            {/* Still worth keeping now that the catalog lives in a database:
                this is the only way to take a copy of it. */}
            <Button variant="outline" onClick={download} disabled={!canExport}>
              <DownloadIcon />
              Download a backup
            </Button>
            <Button variant="ghost" onClick={copy} disabled={!canExport}>
              <CopyIcon />
              Copy all
            </Button>
          </div>

          {errorCount > 0 && (
            <p className="text-[13px] text-muted-foreground">
              Fix the {errorCount} flagged entr{errorCount === 1 ? "y" : "ies"} before
              saving — nothing is written until every entry is valid.
            </p>
          )}
        </>
      )}
    </div>
  );
}
