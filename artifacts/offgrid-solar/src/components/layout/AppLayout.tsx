import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  Sun, 
  LayoutDashboard, 
  Settings as SettingsIcon, 
  MessageSquare,
  PlusCircle,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/projects", icon: LayoutDashboard },
    { name: "New Design", href: "/wizard", icon: PlusCircle },
    { name: "AI Assistant", href: "/ai-assistant", icon: MessageSquare },
    { name: "Settings", href: "/settings", icon: SettingsIcon },
  ];

  const NavLinks = () => (
    <>
      {navigation.map((item) => {
        const isActive = location === item.href || location.startsWith(`${item.href}/`);
        return (
          <Link key={item.name} href={item.href}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <Link href="/">
          <div className="flex items-center gap-2 font-semibold text-lg cursor-pointer">
            <Sun className="h-6 w-6 text-primary" />
            <span>OffGrid Builder</span>
          </div>
        </Link>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-6">
              <Link href="/">
                <div className="flex items-center gap-2 font-semibold text-lg cursor-pointer mb-8">
                  <Sun className="h-6 w-6 text-primary" />
                  <span>OffGrid Builder</span>
                </div>
              </Link>
              <nav className="flex flex-col gap-2">
                <NavLinks />
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card h-screen sticky top-0">
        <div className="p-6 border-b">
          <Link href="/">
            <div className="flex items-center gap-2 font-semibold text-lg cursor-pointer">
              <Sun className="h-6 w-6 text-primary" />
              <span>OffGrid Builder</span>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <NavLinks />
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} OffGrid Solar Builder
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
