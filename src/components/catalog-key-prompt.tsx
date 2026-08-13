import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Asked for once per device, then kept in localStorage. Rendered wherever a
 *  change to the catalog can start from, so the place you're working is the
 *  place that asks. */
export function CatalogKeyPrompt({
  value,
  onChange,
  busy,
  onSubmit,
  action = "Save",
}: {
  value: string;
  onChange: (next: string) => void;
  busy: boolean;
  onSubmit: () => void;
  /** What the button does once the key is in — the word differs between
   *  saving a recipe and deleting one, and on a delete it matters. */
  action?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <Label htmlFor="catalog-key" className="label-mono text-muted-foreground">
        Catalog key
      </Label>
      <p className="mt-2 max-w-[56ch] text-[13px] text-muted-foreground">
        Changing the catalog needs the key set in the deployment's{" "}
        <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[12px]">
          CATALOG_WRITE_KEY
        </code>
        . It's asked for once and remembered on this device.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          id="catalog-key"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sm:flex-1"
        />
        <Button type="button" disabled={value.trim() === "" || busy} onClick={onSubmit}>
          {action}
        </Button>
      </div>
    </div>
  );
}
