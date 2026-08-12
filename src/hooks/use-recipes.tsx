import * as React from "react";

import { fetchRecipes, type Recipe } from "@/lib/recipes";

type RecipesState = {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
};

const RecipesContext = React.createContext<RecipesState>({
  recipes: [],
  loading: true,
  error: null,
});

export function RecipesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<RecipesState>({
    recipes: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    fetchRecipes()
      .then((recipes) => {
        if (!cancelled) setState({ recipes, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ recipes: [], loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <RecipesContext value={state}>{children}</RecipesContext>;
}

export function useRecipes() {
  return React.use(RecipesContext);
}
