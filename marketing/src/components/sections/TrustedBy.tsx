/**
 * Lightweight social-proof strip. Uses styled wordmarks rather than logo images
 * so it degrades gracefully until real brand assets are supplied.
 */
const companies = ['Interswitch Group', 'Courtland Partners', 'Obidike & Idang LP'];

const TrustedBy = () => {
  return (
    <section className="border-y border-border/50 bg-card/30 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Trusted by law firms and in-house legal teams
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:gap-x-16">
          {companies.map((name) => (
            <span
              key={name}
              className="text-base font-semibold tracking-tight text-muted-foreground/70 transition-colors hover:text-foreground sm:text-lg"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {name}
            </span>
          ))}
          <span className="text-sm text-muted-foreground/70">
            + hundreds of legal professionals
          </span>
        </div>
      </div>
    </section>
  );
};

export default TrustedBy;
