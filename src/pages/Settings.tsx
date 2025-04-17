import { SidebarNav } from '@/components/SidebarNav'
import { TopBar } from '@/components/TopBar'
import React from 'react'

export default function Settings() {
  return (
    <div className='flex h-screen bg-slate-100'>
        <SidebarNav />
        <div className='flex-1 flex flex-col overflow-hidden'>
            <TopBar />
            
        </div>
    </div>
  )
}
