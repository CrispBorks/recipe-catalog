import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { CommandPalette } from "@/components/command-palette";
import { RecipesProvider } from "@/hooks/use-recipes";
import { AddRecipePage } from "@/pages/add-recipe-page";
import { CatalogPage } from "@/pages/catalog-page";
import { RecipePage } from "@/pages/recipe-page";
import { ShoppingListPage } from "@/pages/shopping-list-page";

/** Links shared before the rewrite look like /recipe.html?id=slug. */
function LegacyRecipeRedirect() {
  const [params] = useSearchParams();
  const id = params.get("id");
  return <Navigate to={id ? `/recipe/${encodeURIComponent(id)}` : "/"} replace />;
}

export default function App() {
  return (
    <RecipesProvider>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/recipe/:id" element={<RecipePage />} />
        <Route path="/shopping-list" element={<ShoppingListPage />} />
        <Route path="/add-recipe" element={<AddRecipePage />} />

        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/recipe.html" element={<LegacyRecipeRedirect />} />
        <Route
          path="/shopping-list.html"
          element={<Navigate to="/shopping-list" replace />}
        />
        <Route
          path="/add-recipe.html"
          element={<Navigate to="/add-recipe" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </RecipesProvider>
  );
}
