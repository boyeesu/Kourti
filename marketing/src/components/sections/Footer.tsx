import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import kourtiLogo from "@/assets/kourti-logo.png";

const Footer = () => (
  <footer className="border-t border-[#17211d]/20 bg-[#f4f1e8] text-[#17211d]">
    <div className="mx-auto max-w-[1360px] px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
      <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <img src={kourtiLogo} alt="Kourti Legal" className="h-10 w-auto brightness-0" />
          <p className="mt-5 max-w-sm text-sm leading-6 text-[#68706d]">
            An open-source workspace for the matters, documents, clients and deadlines behind a legal practice.
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7d8581]">Explore</p>
          <div className="mt-5 flex flex-col gap-3 text-sm font-medium">
            <a href="/#features" className="hover:text-[#2457ff]">Product</a>
            <Link to="/features" className="hover:text-[#2457ff]">All features</Link>
            <Link to="/security" className="hover:text-[#2457ff]">Security</Link>
            <Link to="/about" className="hover:text-[#2457ff]">About</Link>
            <Link to="/assessment" className="hover:text-[#2457ff]">Tech-readiness assessment</Link>
            <Link to="/contact" className="hover:text-[#2457ff]">Contact</Link>
          </div>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7d8581]">Elsewhere</p>
          <div className="mt-5 flex flex-col gap-3 text-sm font-medium">
            <a href="https://github.com/boyeesu/Kourti" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[#2457ff]">GitHub <ArrowUpRight className="h-3.5 w-3.5" /></a>
            <a href="mailto:support@kourti.com" className="hover:text-[#2457ff]">support@kourti.com</a>
            <span className="text-[#68706d]">Lagos, Nigeria</span>
          </div>
        </div>
      </div>
      <div className="mt-14 flex flex-col gap-5 border-t border-[#17211d]/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <p className="text-xs text-[#68706d]">© {new Date().getFullYear()} Kourti Legal Hub</p>
          <span className="hidden h-3 w-px bg-[#17211d]/25 sm:block" />
          <p className="text-sm font-medium text-[#17211d]">Kourti, a Navigi company.</p>
          <a
            href="https://navigi.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 border-b border-[#17211d] pb-0.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:border-[#2457ff] hover:text-[#2457ff]"
          >
            Visit Navigi <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#68706d]">
          <Link to="/privacy-policy" className="hover:text-[#17211d]">Privacy</Link>
          <Link to="/terms-of-use" className="hover:text-[#17211d]">Terms</Link>
          <Link to="/ai-policy" className="hover:text-[#17211d]">AI policy</Link>
          <Link to="/dpa" className="hover:text-[#17211d]">DPA</Link>
          <Link to="/subprocessors" className="hover:text-[#17211d]">Sub-processors</Link>
          <Link to="/cookie-policy" className="hover:text-[#17211d]">Cookies</Link>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
