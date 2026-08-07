import { useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import JobCard from "./job-card";
import { Loader2 } from "lucide-react";

export default function JobList() {
  const { data: jobs, isLoading, error } = useListJobs({ query: { queryKey: getListJobsQueryKey(), refetchInterval: 5000 } });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 border border-dashed border-border rounded-lg">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-3 font-mono text-sm uppercase tracking-widest text-muted-foreground">Syncing telemetry...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-destructive/50 bg-destructive/10 text-destructive rounded-lg font-mono text-sm">
        Failed to fetch operations telemetry: {error.message || "Unknown error"}
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-lg text-center">
        <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <div className="w-2 h-2 rounded-full bg-muted-foreground"></div>
        </div>
        <h3 className="font-mono uppercase tracking-widest text-sm text-foreground mb-1">No Active Operations</h3>
        <p className="font-mono text-xs text-muted-foreground">Initialize a sequence to begin</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobCard key={job.id} initialJob={job} />
      ))}
    </div>
  );
}
