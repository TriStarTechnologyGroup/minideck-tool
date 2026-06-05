import { redirect } from "next/navigation";

// Root → the app. Unauthenticated visitors get bounced to /login by the proxy.
export default function Home() {
  redirect("/decks");
}
