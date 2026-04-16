import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNavbar />
      {/* Fixed navbar clears page content; landing hero uses -mt-* to full-bleed nebula under the bar */}
      <main className="pt-14 sm:pt-16">{children}</main>
      <MarketingFooter />
    </div>
  );
}
