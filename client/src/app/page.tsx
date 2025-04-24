"use client";
import { useAuth } from "@/contexts/AuthContext";
import { Container } from "@/theme/components";
import { Button } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import Image from "next/image";
import {
  Shield,
  Lock,
  Upload,
  Clock,
  Key,
  FileCheck,
  DollarSign,
} from "lucide-react";

export default function Home() {
  const { isConnecting, error, connectWallet } = useAuth();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="w-full border-b border-[#E5E5E5] fixed top-0 bg-white/95 backdrop-blur-sm z-50">
        <Container className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 relative">
                <Image
                  src="/logo.png"
                  alt="Hot Vault Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <Typography
                variant="h1"
                color="black"
                className="font-mono tracking-tight text-2xl relative group cursor-pointer"
              >
                Hot Vault
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300" />
              </Typography>
            </div>
            <div className="flex items-center gap-6">
              {error && (
                <Typography
                  color="black"
                  variant="small"
                  className="text-red-600 animate-fade-in"
                >
                  {error}
                </Typography>
              )}
              <Button
                size="lg"
                onClick={connectWallet}
                disabled={isConnecting}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {isConnecting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Connecting...
                  </span>
                ) : (
                  "Launch App"
                )}
              </Button>
            </div>
          </div>
        </Container>
      </header>

      <main className="flex-grow flex flex-col">
        <section className="min-h-[100vh] flex items-center relative pt-20 pb-32 border-b border-[#E5E5E5] overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#3B82F6_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03]" />
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50" />

          <Container className="relative max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
              <div className="md:col-span-7 space-y-8 animate-fade-in-up">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100">
                    <Key className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-blue-700">
                      Proof of Data Possession (PDP)
                    </span>
                  </div>
                  <div className="space-y-2">
                    <Typography
                      variant="h2"
                      color="black"
                      className="text-5xl md:text-7xl font-mono tracking-tight leading-[1.1] bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600"
                    >
                      Verify Your Data on FWS
                    </Typography>
                  </div>
                  <Typography
                    variant="body"
                    color="black"
                    className="text-lg md:text-2xl leading-relaxed text-gray-600 max-w-3xl"
                  >
                    Store and verify your data with cryptographic proofs. All
                    with real-time on-chain Filecoin backed stablecoin payments.
                  </Typography>

                  <div className="flex items-center gap-4 pt-6">
                    <Button
                      size="lg"
                      onClick={connectWallet}
                      className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      Get Started
                    </Button>
                    <a
                      href=" http://explore-pdp.xyz:5173"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      <FileCheck className="w-5 h-5" />
                      <span className="font-medium">View Proof Explorer</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="hidden md:block md:col-span-5 relative animate-fade-in">
                <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500/10 to-purple-500/10 rounded-2xl blur-3xl animate-pulse" />
                <div className="relative bg-white/[0.7] backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-[0_0_1px_1px_rgba(0,0,0,0.02)] hover:shadow-lg transition-all duration-500">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-blue-50/50 backdrop-blur-sm rounded-xl border border-blue-100/50">
                      <div className="flex items-center gap-3">
                        <Lock className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-blue-900">
                          Smart Contract
                        </span>
                      </div>
                      <span className="text-sm text-blue-600 bg-blue-100/50 px-2.5 py-0.5 rounded-full">
                        Active
                      </span>
                    </div>

                    <div className="space-y-3">
                      {[
                        {
                          icon: Upload,
                          title: "File Upload",
                          description: "Generate unique proof set",
                        },
                        {
                          icon: Shield,
                          title: "Data Verification",
                          description: "Cryptographic integrity checks",
                        },
                        {
                          icon: Clock,
                          title: "Automated System",
                          description: "Continuous proof validation",
                        },
                        {
                          icon: DollarSign,
                          title: "Stablecoin Payments",
                          description: "Real-time on-chain payments",
                        },
                      ].map((feature, i) => (
                        <div
                          key={i}
                          className="p-4 bg-gray-50/50 backdrop-blur-sm rounded-xl border border-gray-100/50 hover:bg-gray-50/70 transition-colors duration-200"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100/50 rounded-lg">
                              <feature.icon className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-gray-900">
                                {feature.title}
                              </h4>
                              <p className="text-xs text-gray-600">
                                {feature.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-gradient-to-r from-blue-50/50 to-purple-50/50 backdrop-blur-sm rounded-xl border border-blue-100/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">
                          Network
                        </span>
                        <span className="font-mono text-blue-600">
                          Filecoin Calibration
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
    </div>
  );
}
