import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Cadastro from "@/pages/cadastro";
import Projetos from "@/pages/projetos";
import Projeto from "@/pages/projeto";
import Planos from "@/pages/planos";
import Admin from "@/pages/admin";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/projetos" />} />
      <Route path="/login" component={Login} />
      <Route path="/cadastro" component={Cadastro} />
      <Route path="/projetos" component={() => (
        <ProtectedRoute><Projetos /></ProtectedRoute>
      )} />
      <Route path="/projeto/:id" component={({ params }) => (
        <ProtectedRoute><Projeto /></ProtectedRoute>
      )} />
      <Route path="/planos" component={() => (
        <ProtectedRoute><Planos /></ProtectedRoute>
      )} />
      <Route path="/admin" component={() => (
        <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
