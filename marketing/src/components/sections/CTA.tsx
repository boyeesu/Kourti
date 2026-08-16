import { ArrowRight, Github } from 'lucide-react';

const CTA = () => (
  <section className="bg-[#2457ff] py-20 text-white sm:py-28">
    <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
      <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/70">
            Open source, from here on
          </p>
          <h2 className="mt-4 max-w-5xl font-display text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.88] tracking-[-0.06em]">
            Take a look.
            <br />
            Then take it further.
          </h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <a
            href="https://github.com/boyeesu/Kourti"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] min-w-52 items-center justify-center gap-2 bg-white px-6 py-4 text-sm font-semibold text-[#17211d] transition-colors hover:bg-[#f4f1e8]"
          >
            <Github className="h-4 w-4" /> Browse the repository
          </a>
          <a
            href="https://cal.com/kourti-legal/discovery"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] min-w-52 items-center justify-center gap-2 border border-white/50 px-6 py-4 text-sm font-semibold transition-colors hover:bg-white hover:text-[#2457ff]"
          >
            Book a guided demo <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  </section>
);

export default CTA;
