import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useState, useRef } from "react";
import { useSendCode, useSignIn, useSignIn2fa } from "@workspace/api-client-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const phoneSchema = z.object({
  phone: z.string().min(5, "Invalid phone number"),
});

const codeSchema = z.object({
  code: z.string().min(5, "Invalid code"),
});

const passwordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

type Step = "phone" | "code" | "2fa";

export default function AuthPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [, setLocation] = useLocation();

  const phoneRef = useRef("");

  const sendCodeMut = useSendCode();
  const signInMut = useSignIn();
  const signIn2faMut = useSignIn2fa();

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const codeForm = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  function onPhoneSubmit(values: z.infer<typeof phoneSchema>) {
    sendCodeMut.mutate(
      { data: { phone: values.phone } },
      {
        onSuccess: (res) => {
          phoneRef.current = values.phone;
          setPhoneCodeHash(res.phoneCodeHash);
          setStep("code");
          toast({ title: "Code sent", description: "Check your Telegram app for the login code." });
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to send code", description: err.data?.error || err.message || "Unknown error" });
        },
      }
    );
  }

  function onCodeSubmit(values: z.infer<typeof codeSchema>) {
    signInMut.mutate(
      {
        data: {
          phone: phoneRef.current,
          phoneCodeHash,
          code: values.code,
        },
      },
      {
        onSuccess: (res) => {
          if (res.requires2fa) {
            setStep("2fa");
          } else {
            toast({ title: "Authenticated successfully" });
            setLocation("/");
          }
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to sign in", description: err.data?.error || err.message || "Unknown error" });
        },
      }
    );
  }

  function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    signIn2faMut.mutate(
      { data: { password: values.password } },
      {
        onSuccess: () => {
          toast({ title: "Authenticated successfully" });
          setLocation("/");
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to sign in", description: err.data?.error || err.message || "Unknown error" });
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="size-2 bg-primary rounded-full animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">System Auth</span>
          </div>
          <CardTitle className="text-3xl font-mono uppercase tracking-tight">TG_COPIER</CardTitle>
          <CardDescription>
            {step === "phone" && "Enter phone number to initialize connection."}
            {step === "code" && "Input authorization code from secure channel."}
            {step === "2fa" && "2FA required. Provide secondary credentials."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "phone" && (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-6">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} className="font-mono text-lg tracking-wider" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full font-mono uppercase tracking-widest" disabled={sendCodeMut.isPending}>
                  {sendCodeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect
                </Button>
              </form>
            </Form>
          )}

          {step === "code" && (
            <Form {...codeForm}>
              <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <FormField
                  control={codeForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Code</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} autoFocus className="font-mono text-lg tracking-widest text-center" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-4">
                  <Button type="button" variant="outline" className="font-mono uppercase tracking-widest" onClick={() => setStep("phone")}>
                    Back
                  </Button>
                  <Button type="submit" className="w-full font-mono uppercase tracking-widest" disabled={signInMut.isPending}>
                    {signInMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {step === "2fa" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>2FA Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} autoFocus className="font-mono text-lg" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-4">
                  <Button type="button" variant="outline" className="font-mono uppercase tracking-widest" onClick={() => setStep("code")}>
                    Back
                  </Button>
                  <Button type="submit" className="w-full font-mono uppercase tracking-widest" disabled={signIn2faMut.isPending}>
                    {signIn2faMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Authenticate
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
