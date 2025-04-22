"use client";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { PaymentProvider } from "@/contexts/PaymentContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { account, isLoading } = useAuth();
  const [shouldRender, setShouldRender] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle mounting state
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoading && mounted) {
      // Handle authentication redirects
      const handleAuth = async () => {
        try {
          if (account && pathname === "/") {
            await router.replace("/dashboard");
          } else if (
            !account &&
            (pathname.startsWith("/dashboard") || pathname === "/upload")
          ) {
            await router.replace("/");
          } else {
            // Only render if we're on the correct page for the auth state
            setShouldRender(
              (account &&
                (pathname.startsWith("/dashboard") ||
                  pathname === "/upload")) ||
                (!account && pathname === "/")
            );
          }
        } catch (error) {
          console.error("Navigation error:", error);
          // Fallback to setting shouldRender even if navigation fails
          setShouldRender(true);
        }
      };

      handleAuth();
    }
  }, [account, isLoading, pathname, router, mounted]);

  // Don't render anything until mounted to prevent hydration issues
  if (!mounted || isLoading || !shouldRender) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 font-light">Loading...</p>
        </div>
      </div>
    );
  }

  // Conditionally wrap authenticated routes with PaymentProvider
  const isAuthenticatedRoute =
    pathname === "/dashboard" || pathname === "/upload";

  if (isAuthenticatedRoute && account) {
    return <PaymentProvider>{children}</PaymentProvider>;
  }

  return children;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AuthWrapper>{children}</AuthWrapper>
    </AuthProvider>
  );
}
