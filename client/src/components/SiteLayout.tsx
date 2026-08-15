import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/contexts/ThemeContext";
import { LogIn, LogOut, Moon, Radar, Sun } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_2px_12px_oklch(0.75_0.15_70/40%)]">
              <Radar className="h-5 w-5 text-[oklch(0.2_0.05_60)]" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">
              Vyroscope<span className="text-primary"> AI</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/"
              className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                location === "/" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Análise
            </Link>
            {isAuthenticated && (
              <Link
                href="/historico"
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  location === "/historico" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Histórico
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </Button>

            {loading ? (
              <Skeleton className="h-9 w-24 rounded-md" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-32 truncate text-sm text-muted-foreground sm:block">
                  {user?.name ?? user?.email}
                </span>
                <Button variant="outline" size="sm" onClick={() => logout()}>
                  <LogOut className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => startLogin()}>
                <LogIn className="mr-1.5 h-4 w-4" /> Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-4rem)]">{children}</main>

      <footer className="border-t border-border/50 py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            Vyroscope AI — padrões de viralidade prontos para gravar
          </span>
          <span>Dados públicos do YouTube analisados por IA</span>
        </div>
      </footer>
    </div>
  );
}
