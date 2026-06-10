import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  clearCustomerProjectAccess,
  getCustomerContactEmail,
  listCustomerProjectAccess,
  setCustomerContactEmail,
} from "@/services/customerProjects";
import { FileText, Home, Mail, Settings, ShieldCheck, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState(() => getCustomerContactEmail());
  const [savedEmail, setSavedEmail] = useState(() => getCustomerContactEmail());
  const [savedProjectCount, setSavedProjectCount] = useState(() => listCustomerProjectAccess().length);
  const emailIsValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailChanged = email.trim() !== savedEmail;

  const accessSummary = useMemo(() => {
    if (savedProjectCount === 0) return "No project access links are saved in this browser.";
    return `${savedProjectCount} project${savedProjectCount === 1 ? "" : "s"} saved in this browser.`;
  }, [savedProjectCount]);

  function saveEmail() {
    if (!emailIsValid) return;
    const normalized = email.trim();
    setCustomerContactEmail(normalized);
    setSavedEmail(normalized);
    toast({
      title: normalized ? "Contact email saved" : "Contact email removed",
      description: "This preference is stored only in this browser.",
    });
  }

  function clearBrowserAccess() {
    const confirmed = window.confirm(
      "Remove saved project links and contact email from this browser? This does not delete projects from the server.",
    );
    if (!confirmed) return;
    clearCustomerProjectAccess();
    setEmail("");
    setSavedEmail("");
    setSavedProjectCount(0);
    toast({
      title: "Browser access data cleared",
      description: "Projects still exist on the server, but you will need their original secure links to reopen them.",
    });
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Settings className="h-7 w-7" />
            Customer Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage this browser&apos;s contact preference and secure project access.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Contact Email
            </CardTitle>
            <CardDescription>
              Stripe Checkout collects the payment email used for report delivery. This optional browser preference is for your own reference and is not an account login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-md space-y-2">
              <Label htmlFor="contact-email">Email address</Label>
              <Input
                id="contact-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-invalid={!emailIsValid}
              />
              {!emailIsValid && <p className="text-sm text-destructive">Enter a valid email address.</p>}
            </div>
            <Button onClick={saveEmail} disabled={!emailIsValid || !emailChanged}>
              Save Contact Email
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" />
              Saved Project Access
            </CardTitle>
            <CardDescription>{accessSummary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Each project has a private access token. The dashboard keeps a local index of project links, then verifies payment and report status with the server every time it loads.
            </p>
            <p>
              Clearing browser data removes that local index. It does not delete the server project. Keep your post-purchase email because its secure report and PDF links can restore access on another device.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/projects">
                <Button className="w-full sm:w-auto">
                  <FileText className="mr-2 h-4 w-4" />
                  Open Project Dashboard
                </Button>
              </Link>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={clearBrowserAccess} disabled={savedProjectCount === 0 && !savedEmail}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear Browser Access Data
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reports, PDFs, and Support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Paid reports remain stored on the project. Open the dashboard to view the report or download its PDF later. A valid secure project token is always required.
            </p>
            <p>
              Support: <a className="font-medium text-primary underline" href="mailto:support@offgridsolarbuilder.com">support@offgridsolarbuilder.com</a>
            </p>
            <p>
              OffGrid Solar Builder provides preliminary planning estimates. Final electrical, structural, permitting, and installation decisions should be verified by qualified local professionals.
            </p>
            <Link href="/">
              <Button variant="outline">
                <Home className="mr-2 h-4 w-4" />
                Return Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
