import * as React from "react";
import { SparklesIcon, WandIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  describeParse,
  parseRecipeText,
  type ParsedRecipe,
} from "@/lib/parse-recipe-text";

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

export function PasteText({ onUse }: { onUse: (parsed: ParsedRecipe) => void }) {
  const [text, setText] = React.useState("");

  const parsed = React.useMemo(
    () => (text.trim() === "" ? null : parseRecipeText(text)),
    [text],
  );
  const found = parsed ? describeParse(parsed) : [];
  const usable = parsed !== null && (parsed.title !== "" || found.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-[14px] text-muted-foreground">
        Paste a recipe from anywhere — a website, a message, a video
        description. It'll be split into title, ingredients, method and notes,
        and dropped into the form for you to correct before saving.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="label-mono text-muted-foreground">Recipe text</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setText(SAMPLE)}
          disabled={text.trim() !== ""}
        >
          Insert example
        </Button>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Recipe text"
        placeholder={"Paste the whole thing — headings, ingredients, steps and all."}
        className="max-h-72 min-h-48 resize-y overflow-auto text-[14px] leading-relaxed md:text-[14px]"
      />

      {parsed && (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="label-mono flex items-center gap-2 text-muted-foreground">
            <SparklesIcon className="size-3.5" />
            What it found
          </p>

          {found.length === 0 ? (
            <p className="mt-2 text-[14px] text-muted-foreground">
              Nothing recognisable yet — it needs at least a title line.
            </p>
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

          {!parsed.sectioned && parsed.title !== "" && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No "Ingredients" or "Method" headings were found, so the split
              between them is a guess. Worth a closer look in the form.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!usable} onClick={() => parsed && onUse(parsed)}>
          <WandIcon />
          Fill in the form
        </Button>
        {text.trim() !== "" && (
          <Button variant="ghost" onClick={() => setText("")}>
            Clear
          </Button>
        )}
      </div>
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
