import * as React from "react";
import { SparklesIcon } from "lucide-react";

import { describeParse, type ParsedRecipe } from "@/lib/parse-recipe-text";

/** What a parse produced, shown before it's dropped into the builder form.
 *  Shared by the "Paste text" and "From a link" tabs so both read the same. */
export function ParsedPreview({
  parsed,
  empty,
  children,
}: {
  parsed: ParsedRecipe;
  /** Shown when nothing at all was recognised. */
  empty: string;
  /** A caveat about how much to trust the result, if there is one. */
  children?: React.ReactNode;
}) {
  const found = describeParse(parsed);

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="label-mono flex items-center gap-2 text-muted-foreground">
        <SparklesIcon className="size-3.5" />
        What it found
      </p>

      {found.length === 0 ? (
        <p className="mt-2 text-[14px] text-muted-foreground">{empty}</p>
      ) : (
        <p className="meta-mono mt-2">{found.join(" · ")}</p>
      )}

      {parsed.title && (
        <dl className="mt-4 flex flex-col gap-3 text-[14px]">
          <Row label="Title">{parsed.title}</Row>
          {parsed.ingredients.length > 0 && (
            <Row label="Ingredients">
              <ul className="flex flex-col gap-0.5">
                {parsed.ingredients.map((ing, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="meta-mono min-w-[72px] text-muted-foreground">
                      {[ing.qty, ing.unit].filter(Boolean).join(" ") || "—"}
                    </span>
                    <span>{ing.name}</span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {parsed.steps.length > 0 && (
            <Row label="Method">
              <ol className="flex list-decimal flex-col gap-1 pl-4">
                {parsed.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </Row>
          )}
          {parsed.notes.length > 0 && (
            <Row label="Notes">
              <ul className="flex flex-col gap-1">
                {parsed.notes.map((note, i) => (
                  <li key={i} className="break-words">
                    {note}
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
      )}

      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <dt className="label-mono text-muted-foreground">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}
