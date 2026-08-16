import { ArrowRight, ArrowUpRight, Github } from "lucide-react";
import dashboardLight from "@/assets/dashboard-light.png";

const Hero = () => (
  <section className="overflow-hidden bg-[#f4f1e8] pb-16 pt-32 text-[#17211d] sm:pb-24 sm:pt-40">
    <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
      <div className="grid items-end gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:gap-16">
        <div>
          <a
            href="https://github.com/boyeesu/Kourti"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-7 inline-flex items-center gap-2 border-b border-[#17211d] pb-1 text-xs font-semibold uppercase tracking-[0.16em]"
          >
            <Github className="h-3.5 w-3.5" /> Now open source <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <h1 className="max-w-4xl font-display text-[clamp(3.5rem,8vw,7.8rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
            Run the firm.<br />Lose the busywork.
          </h1>
        </div>

        <div className="border-l border-[#17211d]/25 pl-6 lg:pb-2 lg:pl-8">
          <p className="max-w-md text-lg leading-8 text-[#4f5854]">
            Matters, clients, documents and deadlines in one focused workspace—with practical AI where it saves real time.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="https://cal.com/kourti-legal/discovery" target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 bg-[#2457ff] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#1946dd]">
              See Kourti in action <ArrowRight className="h-4 w-4" />
            </a>
            <a href="https://github.com/boyeesu/Kourti" target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 border border-[#17211d]/30 px-6 text-sm font-semibold transition-colors hover:border-[#17211d]">
              Explore the code
            </a>
          </div>
        </div>
      </div>

      <div className="mt-14 border border-[#17211d]/25 bg-[#dfe7ff] p-2 shadow-[12px_12px_0_#17211d] sm:mt-20 sm:p-3">
        <div className="flex h-8 items-center gap-1.5 border-b border-[#17211d]/15 px-2">
          <span className="h-2 w-2 rounded-full bg-[#ff715b]" />
          <span className="h-2 w-2 rounded-full bg-[#f2c14e]" />
          <span className="h-2 w-2 rounded-full bg-[#50b879]" />
          <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#57605c]">Kourti workspace / Dashboard</span>
        </div>
        <img src={dashboardLight} alt="Kourti dashboard showing active matters, clients, documents, and activity" className="block w-full" />
      </div>

      <div className="mt-10 grid border-y border-[#17211d]/20 sm:grid-cols-3">
        {[
          ["01", "Matter command centre", "Tasks, files and activity tied to the right matter."],
          ["02", "Built-in document review", "Summaries and risk flags without another tab."],
          ["03", "Deadline visibility", "Hearings, renewals and follow-ups in one calendar."],
        ].map(([number, title, text], index) => (
          <div key={title} className={`py-6 sm:px-6 ${index > 0 ? "border-t border-[#17211d]/20 sm:border-l sm:border-t-0" : ""}`}>
            <span className="font-mono text-xs text-[#2457ff]">{number}</span>
            <h2 className="mt-3 text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#68706d]">{text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Hero;
