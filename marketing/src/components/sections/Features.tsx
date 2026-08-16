import { Bell, BriefcaseBusiness, CalendarDays, FileSearch, Mic2, UsersRound } from 'lucide-react';

const features = [
  {
    icon: BriefcaseBusiness,
    number: '01',
    title: 'Matters stay legible',
    text: 'Keep the people, documents, tasks, notes and dates for each matter in one record—not scattered across folders and inboxes.',
  },
  {
    icon: FileSearch,
    number: '02',
    title: 'Read documents faster',
    text: 'Turn long contracts into useful summaries, pull out key clauses and surface areas that deserve a lawyer’s attention.',
  },
  {
    icon: CalendarDays,
    number: '03',
    title: 'Deadlines stay visible',
    text: 'See hearings, renewals and client follow-ups together. Assign an owner and know what needs attention next.',
  },
  {
    icon: UsersRound,
    number: '04',
    title: 'Client context, intact',
    text: 'Move from a client to every related matter, document and conversation without reconstructing the history each time.',
  },
  {
    icon: Mic2,
    number: '05',
    title: 'Calls become records',
    text: 'Capture client conversations, produce a transcript and leave with a clean list of decisions and next actions.',
  },
  {
    icon: Bell,
    number: '06',
    title: 'The right nudge, on time',
    text: 'Use reminders that are tied to real work—filings, renewals and follow-ups—not another noisy notification feed.',
  },
];

const Features = () => (
  <section id="features" className="bg-[#fbfaf6] py-20 text-[#17211d] sm:py-28">
    <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
      <div className="grid gap-8 border-b border-[#17211d]/20 pb-10 lg:grid-cols-2 lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#2457ff]">
            The workbench
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl">
            Legal work has enough moving parts. Your software shouldn’t add more.
          </h2>
        </div>
        <p className="max-w-xl text-lg leading-8 text-[#5e6763] lg:justify-self-end">
          Kourti gives a practice one reliable place to work. The interface stays quiet; the context
          stays close.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, number, title, text }, index) => (
          <article
            key={title}
            className={`min-h-[290px] border-[#17211d]/20 py-8 md:p-8 ${index % 3 !== 0 ? 'lg:border-l' : ''} ${index % 2 !== 0 ? 'md:border-l lg:border-l' : ''} ${index >= 3 ? 'border-t' : 'border-t md:[&:nth-child(-n+2)]:border-t-0 lg:[&:nth-child(-n+3)]:border-t-0'}`}
          >
            <div className="flex items-start justify-between">
              <Icon className="h-6 w-6 stroke-[1.5] text-[#2457ff]" />
              <span className="font-mono text-xs text-[#8a918e]">{number}</span>
            </div>
            <h3 className="mt-16 text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
            <p className="mt-3 max-w-sm text-[15px] leading-7 text-[#68706d]">{text}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default Features;
