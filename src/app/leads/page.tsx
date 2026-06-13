import { redirect } from "next/navigation";

// Hot leads were merged into the home dashboard. Keep this route as a permanent redirect so old
// bookmarks / links still land in the right place.
export default function LeadsPage() {
  redirect("/#hot-leads");
}
