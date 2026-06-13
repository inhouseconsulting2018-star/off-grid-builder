import { Link } from "wouter";

const legalLinks = [
  { name: "Terms of Service", href: "/terms" },
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Refund Policy", href: "/refunds" },
  { name: "Report Disclaimer", href: "/disclaimer" },
];

export function SiteFooter() {
  return (
    <footer className="py-8 text-center text-muted-foreground text-sm border-t">
      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-3 px-4">
        {legalLinks.map((l) => (
          <Link key={l.href} href={l.href}>
            <span className="hover:text-foreground transition-colors cursor-pointer">{l.name}</span>
          </Link>
        ))}
      </nav>
      <p>&copy; {new Date().getFullYear()} OffGrid Solar Builder. All rights reserved.</p>
    </footer>
  );
}
