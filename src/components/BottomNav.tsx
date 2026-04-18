import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'

import { usePrimaryLibrary } from '../hooks/useLibraries'

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconLibrary() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

type NavItem = {
  key: string
  href: string
  label: string
  icon: () => React.ReactNode
  isActive: (pathname: string) => boolean
}

export function BottomNav() {
  const location = useLocation()
  const { primary } = usePrimaryLibrary()

  const libraryHref = primary ? `/library/${primary.id}` : '/home'

  const items: NavItem[] = [
    {
      key: 'home',
      href: '/home',
      label: 'Home',
      icon: IconHome,
      isActive: (p) => p === '/home',
    },
    {
      key: 'library',
      href: libraryHref,
      label: 'Library',
      icon: IconLibrary,
      isActive: (p) => p.startsWith('/library/') || p.startsWith('/book/') || p.startsWith('/read/'),
    },
    {
      key: 'player',
      href: '/player',
      label: 'Player',
      icon: IconPlay,
      isActive: (p) => p === '/player',
    },
    {
      key: 'settings',
      href: '/settings',
      label: 'Settings',
      icon: IconSettings,
      isActive: (p) => p === '/settings' || p === '/downloads',
    },
  ]

  return (
    <nav className="bottom-nav">
      {items.map(({ key, href, label, icon: Icon, isActive }) => (
        <Link key={key} className={clsx('nav-link', { active: isActive(location.pathname) })} to={href}>
          <Icon />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  )
}
