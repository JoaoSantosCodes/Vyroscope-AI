import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Analysis from "./pages/Analysis";
import Compare from "./pages/Compare";
import History from "./pages/History";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Result from "./pages/Result";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
      <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/analise"} component={Analysis} />
      <Route path={"/resultado/:id"} component={Result} />
      <Route path={"/historico"} component={History} />
      <Route path={"/comparador"} component={Compare} />
      <Route path={"/perfil"} component={Profile} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
