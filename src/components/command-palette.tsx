import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardListIcon, PlusIcon, UtensilsCrossedIcon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useRecipes } from "@/hooks/use-recipes";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const { recipes } = useRecipes();
  const navigate = useNavigate();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = React.useCallback(
    (to: string) => {
      setOpen(false);
      navigate(to);
    },
    [navigate],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search recipes…" />
      <CommandList>
        <CommandEmpty>Nothing in the drawer matches that.</CommandEmpty>

        <CommandGroup heading="Recipes">
          {recipes.map((recipe) => (
            <CommandItem
              key={recipe.id}
              // cmdk matches against this string, so fold the tags and
              // ingredients in — searching "chickpea" should find the bowl.
              value={[
                recipe.title,
                ...(recipe.tags ?? []),
                ...(recipe.ingredients ?? []).map((i) => i.name),
              ].join(" ")}
              onSelect={() => go(`/recipe/${encodeURIComponent(recipe.id)}`)}
            >
              <UtensilsCrossedIcon className="text-muted-foreground" />
              <span className="flex-1">{recipe.title}</span>
              {recipe.time && (
                <span className="meta-mono text-muted-foreground">
                  {recipe.time} min
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Go to">
          <CommandItem value="shopping list" onSelect={() => go("/shopping-list")}>
            <ClipboardListIcon className="text-muted-foreground" />
            Shopping list
          </CommandItem>
          <CommandItem value="add recipe" onSelect={() => go("/add-recipe")}>
            <PlusIcon className="text-muted-foreground" />
            Add a recipe
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
