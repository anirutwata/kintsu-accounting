import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import NavBar from '@/components/layout/NavBar'
import BottomNav from '@/components/layout/BottomNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value
  if (!userId) redirect('/login')

  const name = cookieStore.get('kintsu_acc_name')?.value || ''
  const role = cookieStore.get('kintsu_acc_role')?.value || 'cashier'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <NavBar name={name} role={role} />
      <main className="flex-1 pb-20 pt-2 px-4 max-w-2xl mx-auto w-full">
        {children}
      </main>
      <BottomNav role={role} />
    </div>
  )
}
