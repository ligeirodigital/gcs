import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AdminLogin from '@/components/AdminLogin'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { CasesAdmin } from '@/components/admin/CasesAdmin'
import { ProjectsAdmin } from '@/components/admin/ProjectsAdmin'
import { AffiliatesAdmin } from '@/components/admin/AffiliatesAdmin'

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setAuthLoading(false)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) return <div className="min-h-screen bg-background" />
  if (!session) return <AdminLogin />

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <a href="/" className="text-muted-foreground hover:text-foreground gentle-animation">
              <ArrowLeft className="w-5 h-5" />
            </a>
            <h1 className="font-display font-bold text-2xl">Painel Administrativo</h1>
          </div>
          <Button variant="outline" size="icon" onClick={() => supabase.auth.signOut()} title="Sair">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-8">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="projects">Projetos</TabsTrigger>
            <TabsTrigger value="affiliates">Afiliados</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard"><AdminDashboard /></TabsContent>
          <TabsContent value="projects"><ProjectsAdmin /></TabsContent>
          <TabsContent value="affiliates"><AffiliatesAdmin /></TabsContent>
          <TabsContent value="cases"><CasesAdmin /></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
