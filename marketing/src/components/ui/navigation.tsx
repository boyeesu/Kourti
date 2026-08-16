import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Github, Menu, X } from "lucide-react";
import kourtiLogo from "@/assets/kourti-logo.png";

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { label: "Product", href: "/#features" },
    { label: "How it works", href: "/#workflow" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ];

  const closeAndScroll = (href: string) => {
    setIsOpen(false);
    if (!href.startsWith("/#")) return;

    const section = document.getElementById(href.slice(2));
    section?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#17211d]/15 bg-[#f4f1e8]/95 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link to="/" aria-label="Kourti home" className="flex items-center gap-3">
          <img src={kourtiLogo} alt="" className="h-9 w-auto" />
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[#57605c] sm:inline">
            Open-source legal OS
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
          {links.map((link) =>
            link.href.startsWith("/#") ? (
              <a
                key={link.label}
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  closeAndScroll(link.href);
                }}
                className="text-sm font-medium text-[#4f5854] transition-colors hover:text-[#0d1512]"
              >
                {link.label}
              </a>
            ) : (
              <Link key={link.label} to={link.href} className="text-sm font-medium text-[#4f5854] transition-colors hover:text-[#0d1512]">
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="https://github.com/boyeesu/Kourti"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold text-[#17211d] transition-opacity hover:opacity-60"
          >
            <Github className="h-4 w-4" /> Source
          </a>
          <a
            href="https://cal.com/kourti-legal/discovery"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 bg-[#2457ff] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1946dd]"
          >
            Book a demo <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center text-[#17211d] lg:hidden"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-[#17211d]/15 bg-[#f4f1e8] px-5 pb-6 pt-4 lg:hidden">
          <nav className="mx-auto flex max-w-[1360px] flex-col" aria-label="Mobile navigation">
            {links.map((link) =>
              link.href.startsWith("/#") ? (
                <a key={link.label} href={link.href} onClick={(event) => { event.preventDefault(); closeAndScroll(link.href); }} className="border-b border-[#17211d]/10 py-3 text-base font-medium text-[#17211d]">
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} to={link.href} onClick={() => setIsOpen(false)} className="border-b border-[#17211d]/10 py-3 text-base font-medium text-[#17211d]">
                  {link.label}
                </Link>
              ),
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <a href="https://github.com/boyeesu/Kourti" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 border border-[#17211d]/30 text-sm font-semibold text-[#17211d]">
                <Github className="h-4 w-4" /> Source
              </a>
              <a href="https://cal.com/kourti-legal/discovery" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 bg-[#2457ff] text-sm font-semibold text-white">
                Book a demo
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navigation;
