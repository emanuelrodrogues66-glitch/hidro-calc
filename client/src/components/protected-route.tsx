import { useAuth } from '@/lib/auth-context'
import { Redirect } from 'wouter'
import { Skeleton } from '@/components/ui/skeleton'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

const ADMIN_EMAILS = ['emanuelrodrogues66@gmail.com', 'admin@bimsafecalc.com']

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-5/6" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Redirect to="/login" />
  }

  if (adminOnly && !ADMIN_EMAILS.includes(user.email || '')) {
    return <Redirect to="/projetos" />
  }

  return <>{children}</>
}
