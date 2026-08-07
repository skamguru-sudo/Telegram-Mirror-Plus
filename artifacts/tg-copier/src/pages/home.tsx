import { useGetAuthStatus } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";

export default function Home() {
  const { data: auth, isLoading, error } = useGetAuthStatus();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center font-mono uppercase tracking-widest text-muted-foreground space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p>Initializing Control Systems...</p>
      </div>
    );
  }

  if (error || !auth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="p-6 border border-destructive/50 bg-destructive/10 text-destructive rounded-lg font-mono text-sm max-w-md">
          <p className="font-bold mb-2 uppercase tracking-widest">System Error</p>
          <p>{error?.message || "Failed to communicate with authentication servers."}</p>
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <AuthPage />;
  }

  return <DashboardPage />;
}
