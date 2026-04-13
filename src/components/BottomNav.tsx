import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'

export function BottomNav() {
  const location = useLocation()

  return (
    <nav className="bottom-nav">
      {[
        ['/home', 'Home'],
        ['/downloads', 'Downloads'],
        ['/player', 'Player'],
        ['/settings', 'Settings'],
      ].map(([href, label]) => (
        <Link key={href} className={clsx('nav-link', { active: location.pathname === href })} to={href}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
