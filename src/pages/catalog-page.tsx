import * as React from "react";
import { ArrowUpDownIcon, SearchIcon, XIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageShell, SiteFooter } from "@/components/page-shell";
import { RecipeCard } from "@/components/recipe-card";
import { SiteHeader } from "@/components/site-header";
import { useRecipes } from "@/hooks/use-recipes";
import { matchesQuery, type Recipe } from "@/lib/recipes";
import { useShoppingList } from "@/lib/shopping-list";
import { cn } from "@/lib/utils";

type Sort = "catalog" | "time" | "title";

const SORT_LABELS: Record<Sort, string> = {
  catalog: "Default",
  time: "Quickest first",
  title: "A–Z",
};

export function CatalogPage() {
  const { recipes, loading, error } = useRecipes();
  const list = useShoppingList();
  const [query, setQuery] = React.useState("");
  const [activeTags, setActiveTags] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<Sort>("catalog");

  React.useEffect(() => {
    document.title = "Recipe Catalog";
  }, []);

  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    recipes.forEach((r) => r.tags?.forEach((t) => tags.add(t)));
    return [...tags].sort();
  }, [recipes]);

  // Titles already represented in the shopping list, so cards can show it.
  const titlesInList = React.useMemo(
    () => new Set(list.map((item) => item.recipe)),
    [list],
  );

  const results = React.useMemo(() => {
    const filtered = recipes.filter(
      (r) =>
        activeTags.every((tag) => r.tags?.includes(tag)) && matchesQuery(r, query),
    );
    const sorted = [...filtered];
    if (sort === "time") {
      sorted.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
    } else if (sort === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [recipes, activeTags, query, sort]);

  const toggleTag = (tag: string) =>
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const filtersActive = activeTags.length > 0 || query.trim() !== "";

  return (
    <PageShell>
      <SiteHeader />

      {/* Mono is wider than the sans it replaced, so the placeholder is kept
          short enough to survive a 320px screen without clipping mid-word. */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          aria-label="Search recipes, ingredients, or tags"
          className="h-12 pl-10 font-mono placeholder:text-muted-foreground"
        />
      </div>

      {allTags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {allTags.map((tag) => {
            const active = activeTags.includes(tag);
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
      )}

      {/* No wrapping here: when the result line grows (several tags selected)
          the controls used to wrap onto their own line and jump left. The
          count truncates instead so the sort button stays put. */}
      <div className="mt-5 mb-4 flex items-center justify-between gap-3">
        <p className="meta-mono min-w-0 truncate text-muted-foreground">
          {loading
            ? "Opening the drawer…"
            : `${results.length} recipe${results.length === 1 ? "" : "s"}`}
          {activeTags.length > 0 && ` · ${activeTags.join(" + ")}`}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setActiveTags([]);
              }}
            >
              <XIcon />
              Clear
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* A fixed label keeps the button a constant width; the current
                  choice is marked in the menu itself. */}
              <Button variant="outline" size="sm">
                <ArrowUpDownIcon />
                Sort order
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(v) => setSort(v as Sort)}
              >
                {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
                  <DropdownMenuRadioItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-[15px] text-muted-foreground">
          Couldn't load the recipe drawer. Check your connection and reload.
        </p>
      ) : loading ? (
        <CardGridSkeleton />
      ) : recipes.length === 0 ? (
        // An empty catalog is the ordinary starting state now that nothing is
        // shipped with the build, so it gets a way forward rather than the
        // "nothing matches" line, which would read as a failed search.
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="display text-lg font-semibold">The drawer is empty</p>
          <p className="mx-auto mt-2 max-w-[42ch] text-[15px] text-muted-foreground">
            Add a recipe by pasting a link to one, pasting the text, or typing
            it in.
          </p>
          <Button asChild className="mt-5">
            <Link to="/add-recipe">Add the first recipe</Link>
          </Button>
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-[15px] text-muted-foreground">
          Nothing in the drawer matches that search.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {results.map((recipe: Recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              inList={titlesInList.has(recipe.title)}
            />
          ))}
        </div>
      )}

      <p className="meta-mono mt-8 hidden text-muted-foreground sm:block">
        Press{" "}
        <Badge variant="default" className="mx-0.5 align-middle">
          ⌘K
        </Badge>{" "}
        to search from anywhere.
      </p>

      <SiteFooter />
    </PageShell>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2.5 rounded-md border border-border bg-card py-3.5 pr-4 pl-8"
        >
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}
