import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { BookmarkIcon, CopyIcon, DownloadIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BackLink, PageShell, SiteFooter } from "@/components/page-shell";
import { CatalogKeyPrompt } from "@/components/catalog-key-prompt";
import { ImportLink } from "@/components/import-link";
import { PasteRecipes } from "@/components/paste-recipes";
import { PasteText } from "@/components/paste-text";
import { SegmentedControl } from "@/components/segmented-control";
import { Link } from "react-router-dom";
import { useRecipes } from "@/hooks/use-recipes";
import {
  forgetCatalogKey,
  isWrongKey,
  readCatalogKey,
  rememberCatalogKey,
} from "@/lib/catalog-key";
import { assembleRecipe, saveRecipe, type Recipe } from "@/lib/recipes";
import type { ParsedRecipe } from "@/lib/parse-recipe-text";
import { cn } from "@/lib/utils";

const KNOWN_TAGS = [
  "breakfast", "lunch", "dinner", "snack", "baking", "beef", "poultry",
  "seafood", "pasta", "vegetarian", "vegan", "gluten-free", "quick",
  "meal-prep", "roast", "kids",
];

type FormValues = {
  title: string;
  id: string;
  time: string;
  servings: string;
  ingredients: { qty: string; unit: string; name: string }[];
  steps: { text: string }[];
  notes: { text: string }[];
};

const EMPTY: FormValues = {
  title: "",
  id: "",
  time: "",
  servings: "",
  ingredients: [
    { qty: "", unit: "", name: "" },
    { qty: "", unit: "", name: "" },
  ],
  steps: [{ text: "" }, { text: "" }],
  notes: [],
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AddRecipePage() {
  const { recipes, refresh } = useRecipes();
  const [catalogKey, setCatalogKey] = React.useState(readCatalogKey);
  const [needsKey, setNeedsKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<Recipe | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [customTags, setCustomTags] = React.useState<string[]>([]);
  const [tab, setTab] = React.useState<"form" | "link" | "text" | "json">("form");
  const [newTag, setNewTag] = React.useState("");
  const [generated, setGenerated] = React.useState<Recipe | null>(null);
  const idTouched = React.useRef(false);
  const outputRef = React.useRef<HTMLDivElement>(null);
  /** What to save again once the key has been typed in.
   *
   *  The recipes, not a closure over them: a closure captures the key state
   *  from the render that created it, which is the render *before* the key was
   *  typed, so retrying would never see it. */
  const pending = React.useRef<Recipe[] | null>(null);

  const form = useForm<FormValues>({ defaultValues: EMPTY, mode: "onSubmit" });
  const { register, handleSubmit, watch, setValue, reset, formState } = form;

  const ingredients = useFieldArray({ control: form.control, name: "ingredients" });
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const notes = useFieldArray({ control: form.control, name: "notes" });

  React.useEffect(() => {
    document.title = "Add a recipe — Card Catalog";
  }, []);

  // The slug follows the title until the moment someone edits it by hand.
  const title = watch("title");
  React.useEffect(() => {
    if (!idTouched.current) setValue("id", slugify(title ?? ""));
  }, [title, setValue]);

  const allTags = React.useMemo(
    () => [...new Set([...KNOWN_TAGS, ...customTags])].sort(),
    [customTags],
  );

  const toggleTag = (tag: string) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const addCustomTag = () => {
    const value = newTag.trim().toLowerCase();
    if (!value) return;
    setCustomTags((prev) => [...new Set([...prev, value])]);
    setTags((prev) => [...new Set([...prev, value])]);
    setNewTag("");
  };

  const buildRecipe = (values: FormValues): Recipe =>
    assembleRecipe({
      id: values.id,
      title: values.title,
      time: values.time,
      servings: values.servings,
      tags,
      ingredients: values.ingredients,
      steps: values.steps.map((s) => s.text),
      notes: values.notes.map((n) => n.text),
    });

  const onGenerate = (values: FormValues) => {
    setGenerated(buildRecipe(values));
    requestAnimationFrame(() =>
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  /** The one write path. Everything that saves goes through here, whether it's
   *  one recipe from the form or a pasted batch.
   *
   *  Sequential rather than parallel: on failure it stops where it stopped, and
   *  reporting "4 of 9 saved" is only honest if the other five were never
   *  attempted. */
  const save = async (list: Recipe | Recipe[]) => {
    const recipes = Array.isArray(list) ? list : [list];
    if (recipes.length === 0) return;

    pending.current = recipes;
    const key = catalogKey.trim() || readCatalogKey();
    if (!key) {
      setNeedsKey(true);
      return;
    }

    setSaving(true);
    let done = 0;
    let failure: string | null = null;
    for (const recipe of recipes) {
      const result = await saveRecipe(recipe, key);
      if (!result.ok) {
        failure = result.error;
        break;
      }
      done += 1;
    }
    setSaving(false);

    if (done > 0) {
      rememberCatalogKey(key);
      setNeedsKey(false);
      setSaved(recipes[done - 1]);
      refresh();
    }

    if (failure) {
      // A wrong key is the one failure worth asking about again; anything else
      // is the server's problem, and retyping won't fix it.
      if (isWrongKey(failure)) {
        forgetCatalogKey();
        setNeedsKey(true);
      }
      toast.error(
        done === 0 ? failure : `Saved ${done} of ${recipes.length}, then stopped: ${failure}`,
      );
      return;
    }

    toast.success(
      recipes.length === 1
        ? `"${recipes[0].title}" is in the catalog.`
        : `${done} recipes in the catalog.`,
    );
  };

  const onSave = (values: FormValues) => save(buildRecipe(values));

  /** Saves a parsed recipe without a trip through the form. The preview above
   *  the button has already shown exactly what will be saved, and anything
   *  wrong can be fixed by re-saving the same id from the form afterwards. */
  const saveParsed = (parsed: ParsedRecipe) =>
    save(
      assembleRecipe({
        id: slugify(parsed.title),
        title: parsed.title,
        time: parsed.time,
        servings: parsed.servings,
        tags: parsed.tags,
        ingredients: parsed.ingredients,
        steps: parsed.steps,
        notes: parsed.notes,
      }),
    );

  /** Drops parsed text into the form fields, then switches to the form so it
   *  can be corrected before anything is generated. */
  const useParsed = (parsed: ParsedRecipe) => {
    reset({
      title: parsed.title,
      id: slugify(parsed.title),
      time: parsed.time,
      servings: parsed.servings,
      ingredients: parsed.ingredients.length
        ? parsed.ingredients
        : EMPTY.ingredients,
      steps: parsed.steps.length
        ? parsed.steps.map((text) => ({ text }))
        : EMPTY.steps,
      notes: parsed.notes.map((text) => ({ text })),
    });
    setCustomTags((prev) => [...new Set([...prev, ...parsed.tags])]);
    setTags(parsed.tags);
    setGenerated(null);
    idTouched.current = false;
    setTab("form");
    toast.success("Form filled in — check it over before generating.");
  };

  const resetAll = () => {
    reset(EMPTY);
    setTags([]);
    setCustomTags([]);
    setGenerated(null);
    idTouched.current = false;
  };

  const copyJson = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(generated, null, 2));
      toast.success("Recipe JSON copied");
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
  };

  const downloadFull = () => {
    if (!generated) return;
    const blob = new Blob([JSON.stringify([...recipes, generated], null, 2)], {
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
    <PageShell>
      <div className="pt-9 pb-5">
        <BackLink />
      </div>

      <h1 className="display text-[30px] leading-none font-semibold">Add a recipe</h1>
      <p className="mt-3 max-w-[60ch] text-[14px] text-muted-foreground">
        Four ways in: type it, paste a link, paste the text, or paste JSON.
        They all land in this form first, and <strong>Save to catalog</strong>{" "}
        puts it in the drawer straight away.
      </p>

      <div className="mt-6">
        <SegmentedControl
          label="How to add recipes"
          value={tab}
          onChange={setTab}
          options={[
            { value: "form", label: "Form" },
            { value: "link", label: "Link" },
            { value: "text", label: "Paste text" },
            { value: "json", label: "Paste JSON" },
          ]}
          className="w-fit"
        />
      </div>

      {tab === "link" ? (
        <div className="mt-6 flex flex-col gap-5">
          <ImportLink
            onUse={useParsed}
            onSave={saveParsed}
            saving={saving}
            saved={saved}
          />
          {needsKey && (
            <CatalogKeyPrompt
              value={catalogKey}
              onChange={setCatalogKey}
              busy={saving}
              onSubmit={() => pending.current && void save(pending.current)}
            />
          )}
        </div>
      ) : tab === "text" ? (
        <div className="mt-6">
          <PasteText onUse={useParsed} />
        </div>
      ) : tab === "json" ? (
        <div className="mt-6 flex flex-col gap-5">
          <PasteRecipes existing={recipes} onSave={save} saving={saving} />
          {needsKey && (
            <CatalogKeyPrompt
              value={catalogKey}
              onChange={setCatalogKey}
              busy={saving}
              onSubmit={() => pending.current && void save(pending.current)}
            />
          )}
        </div>
      ) : (
      <>
      <form onSubmit={handleSubmit(onGenerate)} className="mt-8 flex flex-col gap-8">
        <Section title="Recipe details">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label="Title" error={formState.errors.title?.message}>
              {(id) => (
                <Input
                  id={id}
                  {...register("title", { required: "Give the recipe a title." })}
                  placeholder="Lemon Garlic Roast Chicken"
                  aria-invalid={!!formState.errors.title}
                />
              )}
            </Field>
            <Field label="Time (minutes)" error={formState.errors.time?.message}>
              {(id) => (
                <Input
                  id={id}
                  {...register("time", {
                    validate: (v) =>
                      !v.trim() ||
                      (Number.isFinite(Number(v)) && Number(v) > 0) ||
                      "Use a positive number of minutes, or leave it blank.",
                  })}
                  inputMode="numeric"
                  placeholder="45"
                  aria-invalid={!!formState.errors.time}
                />
              )}
            </Field>
            <Field label="Servings" error={formState.errors.servings?.message}>
              {(id) => (
                <Input
                  id={id}
                  {...register("servings", {
                    validate: (v) =>
                      !v.trim() ||
                      (Number.isFinite(Number(v)) && Number(v) > 0) ||
                      "Use a positive number, or leave it blank.",
                  })}
                  inputMode="numeric"
                  placeholder="4"
                  aria-invalid={!!formState.errors.servings}
                />
              )}
            </Field>
          </div>

          <Field
            label="ID (slug)"
            hint="Auto-filled from the title — used in the recipe's URL."
            error={formState.errors.id?.message}
          >
            {(id) => (
            <Input
              id={id}
              {...register("id", {
                required: "The ID is empty — retype the title or fill it in.",
                validate: (value) => {
                  const clash = recipes.find((r) => r.id === value.trim());
                  return (
                    !clash ||
                    `"${value}" is already used by "${clash.title}". Change the title or edit this field.`
                  );
                },
                onChange: () => {
                  idTouched.current = true;
                },
              })}
              placeholder="lemon-garlic-roast-chicken"
              className="font-mono"
              aria-invalid={!!formState.errors.id}
            />
            )}
          </Field>

          <div className="flex flex-col gap-1.5" role="group" aria-label="Tags">
            <span className="label-mono text-muted-foreground">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "label-mono rounded-full border px-2.5 py-1 transition-colors",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                      active
                        ? "border-foreground bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex max-w-xs gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder="Add a new tag…"
                aria-label="Add a new tag"
              />
              <Button type="button" variant="outline" onClick={addCustomTag}>
                Add
              </Button>
            </div>
            <span className="text-[12px] text-muted-foreground">
              Tap to toggle. Add your own below.
            </span>
          </div>
        </Section>

        <Section
          title="Ingredients"
          hint='Leave this empty if the recipe is just a link or a note. Leave "qty" blank for things like "salt to taste."'
        >
          <div className="flex flex-col gap-2">
            {ingredients.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <Input
                  {...register(`ingredients.${index}.qty`)}
                  placeholder="2"
                  inputMode="decimal"
                  className="w-16 shrink-0 font-mono"
                  aria-label={`Quantity ${index + 1}`}
                />
                <Input
                  {...register(`ingredients.${index}.unit`)}
                  placeholder="tbsp"
                  className="w-20 shrink-0 font-mono"
                  aria-label={`Unit ${index + 1}`}
                />
                <Input
                  {...register(`ingredients.${index}.name`)}
                  placeholder="olive oil"
                  aria-label={`Ingredient ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ingredient ${index + 1}`}
                  disabled={ingredients.fields.length <= 1}
                  onClick={() => ingredients.remove(index)}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            onClick={() => ingredients.append({ qty: "", unit: "", name: "" })}
          >
            <PlusIcon />
            Add ingredient
          </Button>
        </Section>

        <Section title="Steps" hint="One step per box, in order.">
          <div className="flex flex-col gap-2">
            {steps.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <span className="meta-mono mt-2.5 grid size-5 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
                  {index + 1}
                </span>
                <Textarea
                  {...register(`steps.${index}.text`)}
                  placeholder="Heat oven to 425°F…"
                  rows={2}
                  aria-label={`Step ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove step ${index + 1}`}
                  disabled={steps.fields.length <= 1}
                  onClick={() => steps.remove(index)}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            onClick={() => steps.append({ text: "" })}
          >
            <PlusIcon />
            Add step
          </Button>
        </Section>

        <Section
          title="Notes"
          hint="YouTube links get embedded automatically. Tips, substitutions, or where the recipe came from all go here."
        >
          <div className="flex flex-col gap-2">
            {notes.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <Textarea
                  {...register(`notes.${index}.text`)}
                  placeholder="https://youtu.be/… or a tip, substitution, source, etc."
                  rows={2}
                  aria-label={`Note ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove note ${index + 1}`}
                  onClick={() => notes.remove(index)}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            onClick={() => notes.append({ text: "" })}
          >
            <PlusIcon />
            Add note
          </Button>
        </Section>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saving} onClick={handleSubmit(onSave)}>
            {saving ? <Loader2Icon className="animate-spin" /> : <BookmarkIcon />}
            {saving ? "Saving…" : "Save to catalog"}
          </Button>
          <Button type="submit" variant="outline">
            Generate recipe JSON
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline">
                Clear form
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear everything in this form?</AlertDialogTitle>
                <AlertDialogDescription>
                  Anything you've typed will be lost. Recipes already saved to
                  the catalog are unaffected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction onClick={resetAll}>Clear it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {needsKey && (
          <CatalogKeyPrompt
            value={catalogKey}
            onChange={setCatalogKey}
            busy={saving}
            onSubmit={handleSubmit(onSave)}
          />
        )}
      </form>

      {saved && (
        <div className="mt-8 rounded-lg border border-status/40 bg-status/5 p-5">
          <h2 className="display text-xl font-semibold">Saved to the catalog</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">
            "{saved.title}" is in the drawer now.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/recipe/${saved.id}`}>Open the recipe</Link>
            </Button>
            <Button variant="outline" onClick={() => { resetAll(); setSaved(null); }}>
              Add another
            </Button>
          </div>
        </div>
      )}

      {generated && (
        <div ref={outputRef} className="mt-10 rounded-lg border border-border bg-card p-5">
          <h2 className="display text-xl font-semibold">This recipe as JSON</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Saving to the catalog doesn't need any of this — it's here for
            keeping a copy, moving a recipe elsewhere, or pasting into the
            Paste JSON tab on another catalog.
            {recipes.length > 0 &&
              ` The backup below bundles it with all ${recipes.length} saved recipe${recipes.length === 1 ? "" : "s"}.`}
          </p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-md border border-border bg-background p-4 font-mono text-[12px] leading-relaxed">
            {JSON.stringify(generated, null, 2)}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={copyJson}>
              <CopyIcon />
              Copy JSON block
            </Button>
            <Button variant="outline" onClick={downloadFull}>
              <DownloadIcon />
              Download a backup
            </Button>
          </div>
        </div>
      )}
      </>
      )}

      <SiteFooter />
    </PageShell>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <h2 className="label-mono border-b border-border pb-2 text-muted-foreground">
        {title}
      </h2>
      {hint && <p className="mt-3 text-[13px] text-muted-foreground">{hint}</p>}
      <div className="mt-4 flex flex-col">{children}</div>
    </section>
  );
}

/** Takes a render function so the generated id can be wired to both the
 *  <label> and the control it names — otherwise the label is decorative and
 *  screen readers announce an unlabelled field. */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="label-mono text-muted-foreground">
        {label}
      </Label>
      {children(id)}
      {hint && !error && (
        <span className="text-[12px] text-muted-foreground">{hint}</span>
      )}
      {error && <span className="text-[12px] text-destructive">{error}</span>}
    </div>
  );
}

