import { Link } from "react-router";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="pt-16">
      <EmptyState
        title="Nothing at this address"
        action={
          <Link to="/" className="text-sm font-medium text-accent hover:underline">
            Back to home
          </Link>
        }
      >
        This page doesn't exist. Maybe the link was mistyped, or the thing it pointed to was
        deleted.
      </EmptyState>
    </div>
  );
}
