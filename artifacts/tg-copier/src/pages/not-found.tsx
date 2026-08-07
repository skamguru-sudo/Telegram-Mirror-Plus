import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="max-w-md w-full border border-destructive/20 bg-destructive/5 p-8 rounded-lg text-center">
        <div className="flex justify-center mb-4 text-destructive">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <h1 className="text-xl font-mono uppercase tracking-widest font-bold text-foreground mb-2">
          Sector Not Found
        </h1>
        <p className="text-sm font-mono text-muted-foreground mb-6">
          The routing destination you requested is offline or does not exist in this sector.
        </p>
        <Link href="/" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground font-mono uppercase tracking-widest">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
