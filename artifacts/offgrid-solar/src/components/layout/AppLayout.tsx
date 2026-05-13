import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Sun,
  LayoutDashboard,
  Settings as SettingsIcon,
  MessageSquare,
  PlusCircle,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface AppLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/projects", icon: LayoutDashboard },
  { name: "Quick Proposal", href: "/proposal", icon: FileText },
  { name: "New Design", href: "/wizard", icon: PlusCircle },
  { name: "AI Assistant", href: "/ai-assistant", icon: MessageSquare },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive =
          location === item.href || location.startsWith(`${item.href}/`);
        return (
          <Link key={item.name} href={item.href} onClick={onNavigate}>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-sm">{item.name}</span>
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden print:hidden flex items-center justify-between px-4 py-3 border-b bg-card sticky top-0 z-40">
        <Link href="/">
          <div className="flex items-center gap-2 font-semibold text-lg cursor-pointer">
            <Sun className="h-5 w-5 text-primary" />
            <span>OffGrid Builder</span>
          </div>
        </Link>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              {sheetOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SheetDescription className="sr-only">App navigation links</SheetDescription>
            <div className="p-5 border-b">
              <div className="flex items-center gap-2 font-semibold text-base">
                <Sun className="h-5 w-5 text-primary" />
                <span>OffGrid Builder</span>
              </div>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              <NavLinks onNavigate={() => setSheetOpen(false)} />
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} OffGrid Solar Builder
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex print:hidden flex-col w-64 border-r bg-card h-screen sticky top-0 shrink-0">
        <div className="p-5 border-b">
          <Link href="/">
            <div className="flex items-center gap-2 font-semibold text-lg cursor-pointer">
              <Sun className="h-6 w-6 text-primary" />
              <span>OffGrid Builder</span>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} OffGrid Solar Builder
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 p-4 md:p-8 print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
