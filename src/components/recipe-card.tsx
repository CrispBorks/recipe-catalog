import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import type { Recipe } from "@/lib/recipes";

export function RecipeCard({ recipe, inList }: { recipe: Recipe; inList?: boolean }) {
  const meta = [
    recipe.time ? `${recipe.time} min` : null,
    recipe.servings ? `Serves ${recipe.servings}` : null,
  ].filter(Boolean);

  return (
    <Link
      to={`/recipe/${encodeURIComponent(recipe.id)}`}
      className="group relative flex flex-col gap-2.5 rounded-md border border-border bg-card py-3.5 pr-4 pl-8 shadow-card transition-colors hover:border-foreground/35 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      {/* Punch hole, like a real catalog card. */}
      <span
        aria-hidden
        className="absolute top-4 left-3 size-2 rounded-full border border-border bg-background"
      />

      <h3 className="display text-[17px] leading-tight font-semibold">
        {recipe.title}
      </h3>

      {(recipe.tags?.length || inList) && (
        <div className="flex flex-wrap gap-1.5">
          {inList && <Badge variant="status">In your list</Badge>}
          {recipe.tags?.slice(0, 3).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}

      {meta.length > 0 && (
        <p className="meta-mono text-muted-foreground">
          {meta.join(" · ")}
        </p>
      )}
    </Link>
  );
}
