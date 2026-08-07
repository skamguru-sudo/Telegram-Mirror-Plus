import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateJob, useListJobs, useGetAuthStatus, useLogout, getListJobsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Terminal, LogOut, ArrowRight } from "lucide-react";
import JobList from "@/components/dashboard/job-list";

const createJobSchema = z.object({
  sourceChannel: z.string().min(1, "Source channel required"),
  destChannel: z.string().min(1, "Destination channel required"),
});

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: auth } = useGetAuthStatus();
  const createJobMut = useCreateJob();
  const logoutMut = useLogout();

  const form = useForm<z.infer<typeof createJobSchema>>({
    resolver: zodResolver(createJobSchema),
    defaultValues: { sourceChannel: "", destChannel: "" },
  });

  function onSubmit(values: z.infer<typeof createJobSchema>) {
    createJobMut.mutate(
      { data: values },
      {
        onSuccess: () => {
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          toast({ title: "Job initialized", description: "Channel copy sequence started." });
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Job failed to start", description: err.data?.error || err.message || "Unknown error" });
        },
      }
    );
  }

  function handleLogout() {
    logoutMut.mutate(undefined, {
      onSuccess: () => {
        window.location.reload();
      }
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border/50 bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-primary" />
            <h1 className="font-mono text-xl font-bold tracking-tight uppercase">TG_Copier</h1>
            <div className="px-2 py-1 ml-4 rounded bg-secondary text-secondary-foreground font-mono text-xs uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
              Connected
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-muted-foreground">{auth?.phone}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="font-mono uppercase tracking-widest text-xs" disabled={logoutMut.isPending}>
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 grid lg:grid-cols-[350px_1fr] gap-8 items-start">
        <aside className="space-y-6">
          <Card className="border-primary/20 shadow-none bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-mono uppercase tracking-tight text-lg">New Operation</CardTitle>
              <CardDescription>Initialize a new channel replication sequence.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="sourceChannel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source Target</FormLabel>
                        <FormControl>
                          <Input placeholder="@source_channel" {...field} className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-center py-2 text-muted-foreground/50">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <FormField
                    control={form.control}
                    name="destChannel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination Target</FormLabel>
                        <FormControl>
                          <Input placeholder="@dest_channel" {...field} className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full font-mono uppercase tracking-widest mt-4" disabled={createJobMut.isPending}>
                    {createJobMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Execute
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-lg uppercase tracking-widest text-muted-foreground">Active Operations</h2>
          </div>
          <JobList />
        </div>
      </main>
    </div>
  );
}
