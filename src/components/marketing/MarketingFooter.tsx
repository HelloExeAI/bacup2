import Link from "next/link";

import { absoluteSignInUrl, absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";

export function MarketingFooter() {
  const appOrigin = getAppOrigin();
  const signInHref = absoluteSignInUrl();
  const signUpHref = absoluteSignUpUrl();
  const useExternal = Boolean(appOrigin);

  return (
    <footer className="border-t border-[#e8e4dc] bg-[#f3f1ec] py-14 dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_14%_8%)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[#1a1814] dark:text-white">Bacup</div>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
              Your AI Executive Assistant OS — organize, automate, and decide from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-10 text-sm">
            <div>
              <div className="font-medium text-[#1a1814] dark:text-white">Product</div>
              <ul className="mt-3 space-y-2 text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
                <li>
                  <Link href="/#features" className="hover:underline">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:underline">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-medium text-[#1a1814] dark:text-white">Account</div>
              <ul className="mt-3 space-y-2 text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
                <li>
                  {useExternal ? (
                    <a href={signInHref} className="hover:underline">
                      Sign in
                    </a>
                  ) : (
                    <Link href="/signin" className="hover:underline">
                      Sign in
                    </Link>
                  )}
                </li>
                <li>
                  {useExternal ? (
                    <a href={signUpHref} className="hover:underline">
                      Sign up
                    </a>
                  ) : (
                    <Link href="/signup" className="hover:underline">
                      Sign up
                    </Link>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-12 text-center text-xs text-[#8a8478] dark:text-[hsl(35_10%_48%)]">
          © {new Date().getFullYear()} Bacup. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
