const blocks = [
  {
    title: "Problem",
    body: "Too many tools. Too many things to track.",
  },
  {
    title: "Solution",
    body: "Bacup replaces notes, tasks, calendar, and thinking.",
  },
];

const layers = [
  { name: "System", subtitle: "Organize", desc: "One structured layer for how your life runs." },
  { name: "Automation", subtitle: "Execute", desc: "Turn recurring work into reliable motion." },
  { name: "Intelligence", subtitle: "Decide", desc: "Context-aware help when tradeoffs matter." },
];

const features = [
  { title: "Scratchpad", desc: "Capture and shape thinking without losing threads." },
  { title: "Tasks", desc: "Priorities, milestones, and recurrence in one flow." },
  { title: "Calendar", desc: "Google and Outlook, aligned with what you owe yourself." },
  { title: "AI Assistant", desc: "Ask Bacup with full context across your workspace." },
];

export function FeaturesSection() {
  return (
    <>
      <section className="border-b border-[#e8e4dc] py-20 dark:border-[hsl(35_10%_22%)] sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 md:grid-cols-2">
            {blocks.map((b) => (
              <div key={b.title}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
                  {b.title}
                </h2>
                <p className="mt-3 text-xl font-medium tracking-tight text-[#1a1814] dark:text-white sm:text-2xl">
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="layers" className="scroll-mt-20 border-b border-[#e8e4dc] py-20 dark:border-[hsl(35_10%_22%)] sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
            Three layers
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-[#1a1814] dark:text-white sm:text-3xl">
            System, automation, and intelligence — in order.
          </p>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {layers.map((layer) => (
              <div
                key={layer.name}
                className="rounded-2xl border border-[#e8e4dc] bg-white/70 p-8 shadow-sm dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_14%_12%)]"
              >
                <div className="text-xs font-medium uppercase tracking-wider text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
                  {layer.subtitle}
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#1a1814] dark:text-white">{layer.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
                  {layer.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
            Features
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-[#1a1814] dark:text-white sm:text-3xl">
            Everything you need to operate at a higher level.
          </p>
          <ul className="mt-14 grid gap-6 sm:grid-cols-2">
            {features.map((f) => (
              <li
                key={f.title}
                className="flex gap-4 rounded-2xl border border-[#e8e4dc] bg-white/60 p-6 dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_14%_12%)]"
              >
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#1a1814] dark:bg-white" aria-hidden />
                <div>
                  <h3 className="font-semibold text-[#1a1814] dark:text-white">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#5c574e] dark:text-[hsl(35_12%_70%)]">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
