import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";

export default function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter(Boolean);

  const crumbs = [
    <Link key="home" to="/" className="text-muted-foreground hover:underline flex items-center gap-1">
      <Home className="h-4 w-4 inline-block" /> Home
    </Link>
  ];

  pathnames.forEach((part, idx) => {
    const url = '/' + pathnames.slice(0, idx + 1).join('/');
    // Camel case to normal
    const label = part.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    crumbs.push(
      <span key={url+"-sep"} className="mx-2 text-muted-foreground">/</span>
    );
    crumbs.push(
      <Link key={url} to={url} className={"hover:underline text-accent-foreground" + (idx === pathnames.length - 1 ? " font-bold" : "") }>
        {label}
      </Link>
    );
  });

  return <nav aria-label="Breadcrumb" className="mb-4 flex items-center text-sm">{crumbs}</nav>;
}
