import { isLocalAuthProvider, startLogin } from "@/const";
import { LocalLoginForm } from "@/components/LocalLoginForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageAlertsBanner } from "@/components/UsageAlertsBanner";
import { useTheme } from "@/contexts/ThemeContext";
import { LogIn, LogOut, Moon, Radar, ShieldCheck, Sun, User } from "lucide-react";
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
                href="/comparador"
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  location === "/comparador" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Comparador
              </Link>
            )}
            {isAuthenticated && (
              <Link
                href="/monitorar"
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  location === "/monitorar" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monitorar
              </Link>
            )}
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
            {isAuthenticated && (
              <Link
                href="/ideia-do-dia"
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  location === "/ideia-do-dia" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ideia do dia
              </Link>
            )}
            {isAuthenticated && (
              <Link
                href="/favoritos"
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  location === "/favoritos" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Favoritos
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-md px-1 py-1 outline-none transition-colors hover:bg-accent">
                    <span className="hidden max-w-32 truncate text-sm text-muted-foreground sm:block">
                      {user?.name ?? user?.email}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-[oklch(0.2_0.05_60)] text-xs font-semibold">
                        {(user?.name ?? user?.email ?? "U").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Conectado como</span>
                    <span className="text-sm font-medium">{user?.name ?? user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/perfil" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" /> Meu perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : isLocalAuthProvider() ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <LogIn className="mr-1.5 h-4 w-4" /> Entrar
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Acesso ao Vyroscope AI</DialogTitle>
                  </DialogHeader>
                  <LocalLoginForm />
                </DialogContent>
              </Dialog>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => startLogin()}>
                  <LogIn className="mr-1.5 h-4 w-4" /> Entrar
                </Button>
                {/* Feedback visual do método de autenticação ativo (Rodada 31) */}
                <Badge
                  variant="outline"
                  className="hidden items-center gap-1.5 border-muted-foreground/40 text-muted-foreground sm:inline-flex"
                  title={isLocalAuthProvider() ? "Acesso por código local" : "Login via conta"}
                >
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {isLocalAuthProvider() ? "Acesso local" : "Login via conta"}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* (Rodada 38) Alertas proativos de consumo (80% / 100% dos limites) */}
      <UsageAlertsBanner />

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
