import * as React from "react";
import { WandIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ParsedPreview } from "@/components/parsed-preview";
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
        <ParsedPreview
          parsed={parsed}
          empty="Nothing recognisable yet — it needs at least a title line."
        >
          {!parsed.sectioned && parsed.title !== "" && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No "Ingredients" or "Method" headings were found, so the split
              between them is a guess. Worth a closer look in the form.
            </p>
          )}
        </ParsedPreview>
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
