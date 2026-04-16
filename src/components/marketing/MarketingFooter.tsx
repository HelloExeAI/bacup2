import Link from "next/link";

import { absoluteSignInUrl, absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import { MarketingContainer, MarketingSection } from "@/components/marketing/primitives";

export function MarketingFooter() {
  const appOrigin = getAppOrigin();
  const signInHref = absoluteSignInUrl();
  const signUpHref = absoluteSignUpUrl();
  const useExternal = Boolean(appOrigin);

  return (
    <footer className="border-t border-border/70 bg-muted/30">
      <MarketingSection className="py-14 sm:py-16" tone="muted">
        <MarketingContainer>
          <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Bacup</div>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Your AI Executive Assistant OS — organize, automate, and decide from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-10 text-sm">
              <div>
                <div className="font-medium text-foreground">Product</div>
                <ul className="mt-3 space-y-2 text-muted-foreground">
                  <li>
                    <Link href="/#features" className="hover:text-foreground">
                      Features
                    </Link>
                  </li>
                  <li>
                    <Link href="/pricing" className="hover:text-foreground">
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-foreground">Account</div>
                <ul className="mt-3 space-y-2 text-muted-foreground">
                  <li>
                    {useExternal ? (
                      <a href={signInHref} className="hover:text-foreground">
                        Sign in
                      </a>
                    ) : (
                      <Link href="/signin" className="hover:text-foreground">
                        Sign in
                      </Link>
                    )}
                  </li>
                  <li>
                    {useExternal ? (
                      <a href={signUpHref} className="hover:text-foreground">
                        Sign up
                      </a>
                    ) : (
                      <Link href="/signup" className="hover:text-foreground">
                        Sign up
                      </Link>
                    )}
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <p className="mt-12 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Bacup. All rights reserved.
          </p>
        </MarketingContainer>
      </MarketingSection>
    </footer>
  );
}
