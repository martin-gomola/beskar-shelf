import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'

const NAV_ITEMS: [string, string][] = [
  ['/home', 'Home'],
  ['/downloads', 'Downloads'],
  ['/player', 'Player'],
  ['/settings', 'Settings'],
]

export function BottomNav() {
  const location = useLocation()

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(([href, label]) => (
        <Link key={href} className={clsx('nav-link', { active: location.pathname === href })} to={href}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
