import { ArrowDown } from "lucide-react";

const steps = [
  ["01", "Bring in the work", "Create a matter, add the client and bring over the files you already have."],
  ["02", "Work with full context", "Review a contract, assign the next task and keep every decision attached to the matter."],
  ["03", "Stay ahead", "See deadlines and follow-ups before they become urgent, then close the loop with your team."],
];

const HowItWorks = () => (
  <section id="workflow" className="bg-[#15201c] py-20 text-[#f4f1e8] sm:py-28">
    <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
      <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-24">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8facff]">A simpler working day</p>
          <h2 className="mt-4 font-display text-5xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-7xl">Open.<br />Work.<br />Move on.</h2>
          <p className="mt-7 max-w-sm text-base leading-7 text-[#aeb8b3]">No lengthy implementation story. Start with the matter in front of you and build from there.</p>
        </div>

        <ol className="border-t border-white/20">
          {steps.map(([number, title, text]) => (
            <li key={number} className="grid gap-5 border-b border-white/20 py-9 sm:grid-cols-[90px_1fr_auto] sm:items-start sm:py-12">
              <span className="font-mono text-sm text-[#8facff]">{number}</span>
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h3>
                <p className="mt-3 max-w-xl text-base leading-7 text-[#aeb8b3]">{text}</p>
              </div>
              <ArrowDown className="hidden h-5 w-5 text-[#8facff] sm:block" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  </section>
);

export default HowItWorks;
