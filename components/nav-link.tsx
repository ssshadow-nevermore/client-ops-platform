"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./ui/icon";

export function NavLink({
  href,
  icon,
  label,
  end = false,
  mobile = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  end?: boolean;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active = end
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link${active ? " nav-link-active" : ""}${mobile ? " nav-link-mobile" : ""}`}
      href={href}
    >
      <span className="nav-link-icon">
        <Icon name={icon} size={17} />
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function Breadcrumbs({ children }: { children: ReactNode }) {
  return <nav aria-label="Breadcrumb" className="breadcrumbs">{children}</nav>;
}

export function BreadcrumbSeparator() {
  return <Icon className="breadcrumb-separator" name="chevron-right" size={14} />;
}
