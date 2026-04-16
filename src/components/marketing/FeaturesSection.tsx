import {
  MarketingCard,
  MarketingContainer,
  MarketingH2,
  MarketingKicker,
  MarketingSection,
  Reveal,
} from "@/components/marketing/primitives";

const story = [
  { title: "Too many tools", body: "Tasks, calendar, notes, email, reminders — none of it is connected." },
  { title: "One operating system", body: "Bacup unifies the work so you can execute faster and decide with context." },
];

const layers = [
  { name: "System", subtitle: "Organize", desc: "One structured layer for how your life runs." },
  { name: "Automation", subtitle: "Execute", desc: "Turn recurring work into reliable motion." },
  { name: "Intelligence", subtitle: "Decide", desc: "Context-aware help when tradeoffs matter." },
];

const features = [
  { title: "Scratchpad", desc: "Capture thinking as a living tree — notes that become actions." },
  { title: "Meetings", desc: "Record, live transcript, and auto-extract actions into your OS." },
  { title: "Follow-ups", desc: "Consolidated sends, status links, and reply-based updates." },
  { title: "Calendar", desc: "Google and Outlook, aligned with what you owe yourself." },
];

export function FeaturesSection() {
  return (
    <>
      <MarketingSection className="border-b border-border/70">
        <MarketingContainer>
          <div className="grid gap-8 md:grid-cols-2">
            {story.map((b) => (
              <Reveal key={b.title}>
                <MarketingCard className="p-8">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {b.title}
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {b.body}
                  </div>
                </MarketingCard>
              </Reveal>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection id="layers" className="scroll-mt-20 border-b border-border/70">
        <MarketingContainer>
          <div className="text-center">
            <Reveal>
              <MarketingKicker>Three layers</MarketingKicker>
            </Reveal>
            <Reveal className="mt-3">
              <div className="mx-auto max-w-2xl">
                <MarketingH2>System, automation, and intelligence — in order.</MarketingH2>
              </div>
            </Reveal>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {layers.map((layer) => (
              <Reveal key={layer.name}>
                <MarketingCard className="p-8 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {layer.subtitle}
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">{layer.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{layer.desc}</p>
                </MarketingCard>
              </Reveal>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection id="features" className="scroll-mt-20">
        <MarketingContainer>
          <div className="text-center">
            <Reveal>
              <MarketingKicker>Features</MarketingKicker>
            </Reveal>
            <Reveal className="mt-3">
              <div className="mx-auto max-w-2xl">
                <MarketingH2>Everything you need to operate at a higher level.</MarketingH2>
              </div>
            </Reveal>
          </div>
          <ul className="mt-14 grid gap-6 sm:grid-cols-2">
            {features.map((f) => (
              <Reveal key={f.title}>
                <li className="h-full">
                  <MarketingCard className="flex h-full gap-4 p-6 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground/60" aria-hidden />
                    <div>
                      <h3 className="font-semibold text-foreground">{f.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                    </div>
                  </MarketingCard>
                </li>
              </Reveal>
            ))}
          </ul>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
