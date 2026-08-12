import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  Share2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink, PageShell, SiteFooter } from "@/components/page-shell";
import { useRecipes } from "@/hooks/use-recipes";
import {
  extractYouTubeId,
  formatQty,
  scaleIngredient,
  splitOnUrls,
  type Ingredient,
} from "@/lib/recipes";
import { addIngredients } from "@/lib/shopping-list";
import {
  convertIngredient,
  formatAmount,
  useUnitSystem,
  type UnitSystem,
} from "@/lib/units";
import { cn } from "@/lib/utils";

export function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const { recipes, loading, error } = useRecipes();
  const navigate = useNavigate();
  const recipe = recipes.find((r) => r.id === id);

  // Recipes with a serving count step one serving at a time, down to 1.
  // Ones without step by a plain multiplier instead.
  const [servings, setServings] = React.useState<number | null>(null);
  const [multiplier, setMultiplier] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [doneSteps, setDoneSteps] = React.useState<Set<number>>(new Set());
  const [unitSystem, setUnitSystem] = useUnitSystem();

  // Nothing starts ticked: "add all" is one tap away, so pre-selecting
  // everything only creates work for anyone who wants a subset.
  React.useEffect(() => {
    setSelected(new Set());
    setServings(recipe?.servings ?? null);
    setMultiplier(1);
    setDoneSteps(new Set());
  }, [recipe]);

  React.useEffect(() => {
    document.title = recipe ? `${recipe.title} — Card Catalog` : "Card Catalog";
  }, [recipe]);

  if (loading) return <RecipeSkeleton />;

  if (error || !recipe) {
    return (
      <PageShell width="reading">
        <div className="no-print pt-9 pb-5">
          <BackLink />
        </div>
        <p className="rounded-md border border-dashed border-border p-8 text-center font-serif text-lg text-muted-foreground">
          That card isn't in the drawer.{" "}
          <Link to="/" className="underline underline-offset-2">
            Back to the catalog.
          </Link>
        </p>
        <SiteFooter />
      </PageShell>
    );
  }

  const ingredients = recipe.ingredients ?? [];
  const hasIngredients = ingredients.length > 0;

  const baseServings = recipe.servings;
  const shownServings = baseServings ? (servings ?? baseServings) : null;
  const factor =
    baseServings && shownServings ? shownServings / baseServings : multiplier;
  // Scale in the recipe's own units first, then convert — converting first
  // would round twice and compound the error.
  const scaled = ingredients.map((ing) =>
    convertIngredient(scaleIngredient(ing, factor), unitSystem),
  );

  const maxServings = baseServings ? baseServings * 4 : 0;
  const canDecrease = baseServings ? (shownServings ?? 1) > 1 : multiplier > 0.25;
  const canIncrease = baseServings
    ? (shownServings ?? 1) < maxServings
    : multiplier < 4;

  const decrease = () =>
    baseServings
      ? setServings((s) => Math.max(1, (s ?? baseServings) - 1))
      : setMultiplier((m) => Math.max(0.25, m - 0.25));
  const increase = () =>
    baseServings
      ? setServings((s) => Math.min(maxServings, (s ?? baseServings) + 1))
      : setMultiplier((m) => Math.min(4, m + 0.25));

  // Servings live on the stepper below, so repeating them here would just be
  // a second number saying the same thing.
  const meta = [recipe.time ? `${Math.round(recipe.time)} min` : null].filter(
    Boolean,
  );

  const addToList = (which: Ingredient[], label: string) => {
    addIngredients(which, recipe.title);
    toast.success(label, {
      action: { label: "View list", onClick: () => navigate("/shopping-list") },
    });
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: recipe.title, url });
        return;
      } catch {
        return; /* the user dismissed the share sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link — copy it from the address bar");
    }
  };

  return (
    <PageShell width="reading">
      <div className="no-print flex items-center justify-between gap-3 pt-9 pb-5">
        <BackLink />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={share} aria-label="Share recipe">
            <Share2Icon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.print()}
            aria-label="Print recipe"
            className="hidden sm:inline-flex"
          >
            <PrinterIcon />
          </Button>
        </div>
      </div>

      <h1 className="display text-[32px] leading-[1.1] font-semibold text-balance sm:text-[38px]">
        {recipe.title}
      </h1>

      {(meta.length > 0 || recipe.tags?.length) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {meta.length > 0 && (
            <p className="font-mono text-xs text-muted-foreground tabular">
              {meta.join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags?.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {hasIngredients && (
        <section className="mt-9">
          <h2 className="label-mono border-b border-border pb-2 text-muted-foreground">
            Ingredients
          </h2>

          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="label-mono text-muted-foreground">
                {baseServings ? "Servings" : "Scale"}
              </span>
              <div className="flex items-center gap-1 rounded-md border border-border bg-card">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Decrease"
                  disabled={!canDecrease}
                  onClick={decrease}
                >
                  <MinusIcon className="size-3.5" />
                </Button>
                <span className="min-w-9 text-center font-mono text-xs tabular">
                  {baseServings ? shownServings : `×${formatQty(multiplier)}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Increase"
                  disabled={!canIncrease}
                  onClick={increase}
                >
                  <PlusIcon className="size-3.5" />
                </Button>
              </div>
            </div>

            <UnitToggle value={unitSystem} onChange={setUnitSystem} />
          </div>

          <ul className="mt-3">
            {scaled.map((ing, idx) => (
              <li
                key={`${ing.name}-${idx}`}
                className="flex items-center gap-3 border-b border-dotted border-border py-2.5 last:border-b-0"
              >
                <Checkbox
                  id={`ing-${idx}`}
                  checked={selected.has(idx)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(idx);
                      else next.delete(idx);
                      return next;
                    })
                  }
                />
                <span className="min-w-[76px] font-mono text-[13px] text-muted-foreground tabular">
                  {formatAmount(ing.qty, ing.unit)} {ing.unit}
                </span>
                <label htmlFor={`ing-${idx}`} className="flex-1 text-[15px]">
                  {ing.name}
                </label>
              </li>
            ))}
          </ul>

          {/* "Add all" is always available; the selected-only action appears
              once there's actually a selection to act on. */}
          <div className="no-print mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                addToList(scaled, `Added all ingredients from ${recipe.title}`)
              }
            >
              Add all ingredients
            </Button>
            {selected.size > 0 && (
              <Button
                onClick={() =>
                  addToList(
                    scaled.filter((_, i) => selected.has(i)),
                    `Added ${selected.size} ingredient${selected.size === 1 ? "" : "s"} to your list`,
                  )
                }
              >
                Add {selected.size} to list
              </Button>
            )}
          </div>
        </section>
      )}

      {recipe.steps && recipe.steps.length > 0 && (
        <section className="mt-10">
          <h2 className="label-mono border-b border-border pb-2 text-muted-foreground">
            Method
          </h2>

          <ol className="mt-3 flex flex-col gap-1">
            {recipe.steps.map((step, idx) => {
              const done = doneSteps.has(idx);
              return (
                <li key={idx}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() =>
                      setDoneSteps((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      })
                    }
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors",
                      "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                      done && "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-[3px] grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[11px] tabular",
                        done
                          ? "border-status bg-status text-status-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {done ? <CheckIcon className="size-3" /> : idx + 1}
                    </span>
                    <span className={cn("flex-1 text-[15px]", done && "line-through")}>
                      {step}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {recipe.notes && recipe.notes.length > 0 && (
        <section className="mt-10">
          <h2 className="label-mono border-b border-border pb-2 text-muted-foreground">
            Notes
          </h2>
          <ul className="mt-1">
            {recipe.notes.map((note, idx) => {
              const videoId = extractYouTubeId(note);
              return (
                <li
                  key={idx}
                  className="border-b border-dotted border-border py-3 text-[15px] leading-relaxed last:border-b-0"
                >
                  <p className="break-words">
                    {splitOnUrls(note).map((part, i) =>
                      part.href ? (
                        <a
                          key={i}
                          href={part.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-muted-foreground"
                        >
                          {part.text}
                        </a>
                      ) : (
                        <React.Fragment key={i}>{part.text}</React.Fragment>
                      ),
                    )}
                  </p>
                  {videoId && (
                    <div className="no-print mt-3 aspect-video w-full overflow-hidden rounded-md bg-muted">
                      <iframe
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title="YouTube video"
                        allowFullScreen
                        loading="lazy"
                        className="size-full border-0"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SiteFooter />
    </PageShell>
  );
}

function UnitToggle({
  value,
  onChange,
}: {
  value: UnitSystem;
  onChange: (next: UnitSystem) => void;
}) {
  const options: [UnitSystem, string][] = [
    ["imperial", "Imperial"],
    ["metric", "Metric"],
  ];

  return (
    <div
      role="group"
      aria-label="Measurement units"
      className="flex items-center rounded-md border border-border bg-card p-0.5"
    >
      {options.map(([system, label]) => (
        <button
          key={system}
          type="button"
          aria-pressed={value === system}
          onClick={() => onChange(system)}
          className={cn(
            "rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
            "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
            value === system
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RecipeSkeleton() {
  return (
    <PageShell width="reading">
      <div className="pt-9 pb-5">
        <BackLink />
      </div>
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-9 h-3 w-24" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </PageShell>
  );
}
