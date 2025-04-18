import { SidebarNav } from '@/components/SidebarNav'
import { TopBar } from '@/components/TopBar'
import React from 'react'

export default function Notify() {
  return (
    <div className='flex h-screen bg-slate-100'>
        <SidebarNav />
        <div className='flex-1 flex flex-col overflow-hidden'>
            <TopBar />
        <div className="text-center h-[500px] grid items-center justify-center">
  <h1 className="text-4xl font-bold mb-4">Coming Soon</h1>
  <a href="/" className="text-blue-500 hover:text-blue-700 underline">
    Return to Home
  </a>
        </div>
</div>
    </div>
  )
}
