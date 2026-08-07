import { useGetJob, useStopJob, getListJobsQueryKey, getGetJobQueryKey, type Job } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Loader2, Square, AlertTriangle, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface JobCardProps {
  initialJob: Job;
}

export default function JobCard({ initialJob }: JobCardProps) {
  const queryClient = useQueryClient();
  const stopJobMut = useStopJob();

  const { data: job } = useGetJob(initialJob.id, {
    query: {
      queryKey: getGetJobQueryKey(initialJob.id),
      initialData: initialJob,
      refetchInterval: (query: any) => {
        const status = query?.state?.data?.status || initialJob.status;
        return status === "running" || status === "scanning" ? 2000 : false;
      },
    },
  });

  const activeJob = job || initialJob;

  const isRunning = activeJob.status === "running";
  const isScanning = activeJob.status === "scanning";
  const isActive = isRunning || isScanning;
  const isPending = activeJob.status === "pending";
  const progress = activeJob.totalPosts > 0 ? (activeJob.copiedPosts / activeJob.totalPosts) * 100 : 0;

  function handleStop() {
    stopJobMut.mutate(
      { id: activeJob.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          toast({ title: "Operation halted", description: "The sequence was manually stopped." });
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to stop", description: err.data?.error || err.message || "Unknown error" });
        },
      }
    );
  }

  const statusConfig = {
    pending:  { label: "PENDING",  variant: "secondary",    icon: Loader2,       color: "text-muted-foreground", bg: "bg-secondary" },
    scanning: { label: "SCANNING", variant: "running",      icon: Loader2,       color: "text-yellow-400",        bg: "bg-yellow-400" },
    running:  { label: "COPYING",  variant: "running",      icon: Activity,      color: "text-primary",           bg: "bg-primary" },
    completed:{ label: "DONE",     variant: "success",      icon: CheckCircle2,  color: "text-success",           bg: "bg-success" },
    stopped:  { label: "STOPPED",  variant: "outline",      icon: Square,        color: "text-muted-foreground",  bg: "bg-muted" },
    failed:   { label: "FAILED",   variant: "destructive",  icon: AlertTriangle, color: "text-destructive",       bg: "bg-destructive" },
  } as const;

  const config = statusConfig[activeJob.status as keyof typeof statusConfig] ?? statusConfig.pending;
  const Icon = config.icon;

  return (
    <Card className={`overflow-hidden transition-colors ${isScanning ? "border-yellow-400/40 shadow-[0_0_15px_rgba(250,204,21,0.08)]" : isRunning ? "border-primary/50 shadow-[0_0_15px_rgba(30,111,217,0.1)]" : activeJob.status === "failed" ? "border-destructive/50 bg-destructive/5 shadow-[0_0_15px_rgba(255,0,0,0.1)]" : "border-border/50"}`}>
      <CardContent className="p-0">
        <div className="p-5 flex items-center justify-between gap-6">
          {/* Status & Identifiers */}
          <div className="flex items-center gap-4 flex-1">
            <div className={`flex items-center justify-center w-10 h-10 rounded-md ${config.bg}/10`}>
              <Icon className={`w-5 h-5 ${config.color} ${isActive ? "animate-spin" : ""}`} />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant={config.variant as any} className="px-2 py-0 h-5 text-[10px]">{config.label}</Badge>
                <span className="font-mono text-xs text-muted-foreground">ID: {activeJob.id.split('-')[0]}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-sm font-medium">
                <span className="truncate max-w-[150px]" title={activeJob.sourceChannel}>{activeJob.sourceChannel}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[150px]" title={activeJob.destChannel}>{activeJob.destChannel}</span>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-end justify-between mb-2">
              <div className="font-mono text-xs text-muted-foreground">
                {isScanning ? (
                  <span className="text-yellow-400 animate-pulse">Scanning posts…</span>
                ) : (
                  <>
                    <span className="text-foreground">{activeJob.copiedPosts}</span> / {activeJob.totalPosts} MSG
                    {activeJob.failedPosts > 0 && (
                      <span className="text-destructive ml-2">[{activeJob.failedPosts} ERR]</span>
                    )}
                  </>
                )}
              </div>
              <span className="font-mono text-xs font-bold">{isScanning ? "—" : `${Math.round(progress)}%`}</span>
            </div>
            <Progress value={isScanning ? undefined : progress} className="h-1.5" indicatorColor={isScanning ? "bg-yellow-400" : isRunning ? "bg-primary" : activeJob.status === "completed" ? "bg-success" : activeJob.status === "failed" ? "bg-destructive" : "bg-muted-foreground"} />
          </div>

          {/* Timestamps & Actions */}
          <div className="flex items-center gap-6 justify-end min-w-[180px]">
            <div className="text-right space-y-1 hidden sm:block">
              <div className="font-mono text-[10px] text-muted-foreground uppercase">Init</div>
              <div className="font-mono text-xs">{formatDate(activeJob.createdAt)}</div>
            </div>
            
            <div className="w-10 flex justify-end">
              {isActive && (
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive" 
                  onClick={handleStop}
                  disabled={stopJobMut.isPending}
                  title="Halt Sequence"
                >
                  {stopJobMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3 w-3" />}
                </Button>
              )}
            </div>
          </div>
        </div>
        {activeJob.error && (
          <div className="px-5 py-2 bg-destructive/10 border-t border-destructive/20 text-destructive font-mono text-xs flex items-center">
            <AlertTriangle className="w-3 h-3 mr-2" />
            <span className="truncate" title={activeJob.error}>{activeJob.error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
