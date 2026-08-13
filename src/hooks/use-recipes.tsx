import * as React from "react";

import { fetchRecipes, type Recipe } from "@/lib/recipes";

type RecipesState = {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  /** Re-reads the catalog, so a saved recipe shows up without a reload. */
  refresh: () => void;
};

const RecipesContext = React.createContext<RecipesState>({
  recipes: [],
  loading: true,
  error: null,
  refresh: () => {},
});

export function RecipesProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = React.useState<Omit<RecipesState, "refresh">>({
    recipes: [],
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetchRecipes()
      .then((recipes) => {
        if (!cancelled) setLoaded({ recipes, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled)
          setLoaded({ recipes: [], loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);
  const value = React.useMemo(() => ({ ...loaded, refresh }), [loaded, refresh]);

  return <RecipesContext value={value}>{children}</RecipesContext>;
}

export function useRecipes() {
  return React.use(RecipesContext);
}
