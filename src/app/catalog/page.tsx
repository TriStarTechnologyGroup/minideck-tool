import { redirect } from "next/navigation";

// Catalog is split into /catalog/tma + /catalog/capabilities (see the Catalog nav dropdown).
export default function CatalogPage() {
  redirect("/catalog/tma");
}
