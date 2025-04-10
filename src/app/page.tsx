"use client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Text, Container } from "@/theme/components";

export default function Home() {
  const { isConnecting, error, connectWallet } = useAuth();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="w-full border-b border-[#E5E5E5] fixed top-0 bg-white/95 backdrop-blur-sm z-50">
        <Container className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-20">
            <Text
              variant="h1"
              color="black"
              className="font-mono tracking-tight text-2xl relative group cursor-pointer"
            >
              Filecoin Web Services
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300" />
            </Text>
            <div className="flex items-center gap-6">
              {error && (
                <Text
                  color="black"
                  variant="small"
                  className="text-red-600 animate-fade-in"
                >
                  {error}
                </Text>
              )}
              <Button
                variant="blue"
                size="sm"
                onClick={connectWallet}
                disabled={isConnecting}
                className="min-w-[140px] font-medium hover:scale-105 transform transition-all duration-300 shadow-sm hover:shadow-md"
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
                  "Connect Wallet"
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
                  <div className="space-y-2">
                    <Text
                      variant="h2"
                      color="black"
                      className="text-5xl md:text-7xl font-mono tracking-tight leading-[1.1] bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600"
                    >
                      Filecoin Web Services
                    </Text>
                  </div>
                  <Text
                    variant="body"
                    color="black"
                    className="text-lg md:text-2xl leading-relaxed text-gray-600 max-w-3xl"
                  >
                    Decentralized infrastructure for the next generation of web
                    applications.
                  </Text>
                </div>
              </div>
              <div className="hidden md:block md:col-span-5 relative animate-fade-in">
                <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 rounded-lg blur-2xl animate-pulse" />
                <div className="relative bg-white/50 backdrop-blur-sm rounded-lg p-8 border border-[#E5E5E5] shadow-xl hover:shadow-2xl transition-all duration-500">
                  <div className="grid grid-cols-4 gap-4 aspect-square">
                    {Array(16)
                      .fill(0)
                      .map((_, i) => (
                        <div
                          key={i}
                          className={`aspect-square rounded-lg bg-gradient-to-br ${
                            i % 3 === 0
                              ? "from-blue-500/10 to-blue-600/10"
                              : i % 3 === 1
                              ? "from-purple-500/10 to-purple-600/10"
                              : "from-gray-500/10 to-gray-600/10"
                          } hover:scale-110 hover:rotate-3 transition-all duration-300 ease-out cursor-pointer`}
                        />
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className="w-full py-32 bg-gradient-to-b from-white to-[#F9F9F9] relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_50%,#f3f4f6_50%,#f3f4f6_75%,transparent_75%,transparent)] bg-[length:64px_64px] opacity-[0.05]" />

          <Container className="relative max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-24">
              {[
                {
                  title: "Decentralized",
                  description:
                    "Built on Filecoin's distributed network for maximum resilience and censorship resistance.",
                },
                {
                  title: "Scalable",
                  description:
                    "Infrastructure that grows with your needs, from prototype to global deployment.",
                },
                {
                  title: "Sustainable",
                  description:
                    "Energy-efficient operations with transparent carbon footprint metrics.",
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="space-y-6 group hover:translate-y-[-4px] transition-all duration-300"
                >
                  <div className="space-y-4">
                    <Text
                      variant="h3"
                      color="black"
                      className="font-mono text-2xl group-hover:text-blue-600 transition-colors"
                    >
                      {feature.title}
                    </Text>
                    <div className="h-1 w-16 bg-blue-500 group-hover:w-24 transition-all duration-300" />
                  </div>
                  <Text
                    variant="body"
                    color="black"
                    className="text-lg leading-relaxed text-gray-600"
                  >
                    {feature.description}
                  </Text>
                </div>
              ))}
            </div>
          </Container>
        </section>
      </main>

      <footer className="w-full border-t border-[#E5E5E5] bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#3B82F6_0.5px,transparent_0.5px)] [background-size:24px_24px] opacity-[0.03]" />

        <Container className="relative max-w-7xl mx-auto px-6 py-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-24">
            {[
              {
                title: "Product",
                links: ["Features", "Pricing", "Case Studies"],
              },
              {
                title: "Resources",
                links: ["Documentation", "API", "Community"],
              },
              {
                title: "Company",
                links: ["About", "Blog", "Careers"],
              },
              {
                title: "Legal",
                links: ["Privacy", "Terms", "Security"],
              },
            ].map((section, index) => (
              <div key={index} className="space-y-6">
                <Text
                  variant="h4"
                  color="black"
                  className="font-mono text-sm uppercase tracking-wider"
                >
                  {section.title}
                </Text>
                <ul className="space-y-4">
                  {section.links.map((link, linkIndex) => (
                    <li key={linkIndex}>
                      <Text
                        variant="small"
                        color="black"
                        className="hover:text-blue-500 transition-colors cursor-pointer hover:translate-x-1 inline-block transform duration-200"
                      >
                        {link}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Text
            variant="small"
            color="black"
            className="mt-20 pt-8 border-t border-[#E5E5E5] font-mono text-sm text-gray-500"
          >
            © {new Date().getFullYear()} Filecoin Web Services. All rights
            reserved.
          </Text>
        </Container>
      </footer>

      <style jsx global>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
