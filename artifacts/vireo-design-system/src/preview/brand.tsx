export function BrandPage() {
  const logoUrl = `${import.meta.env.BASE_URL}vireo-logo.svg`;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-6 text-card-foreground">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Vireo
        </p>
        <div className="mt-5 flex min-h-40 items-center justify-center rounded-xl bg-background p-8">
          <img
            src={logoUrl}
            alt="Vireo brand mark"
            className="h-28 w-auto max-w-full object-contain"
          />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Keep the supplied Vireo mark intact. Pair it with the warm ivory,
          plum, and muted gold palette from the current website.
        </p>
      </section>

      <section className="rounded-2xl border bg-card p-6 text-card-foreground">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Chime · direction, not a final identity
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          A playful, animated procurement companion
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Chime can feel lively and approachable through short, purposeful
          movement and a clear voice indicator. Keep the visual connected to
          Vireo’s plum-and-gold palette, but distinct from the Vireo logo.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['Idle', 'A calm, gently breathing presence; no urgent pulse.'],
            ['Listening', 'A clear, accessible sound-wave or ring cue.'],
            ['Speaking', 'A distinct pulse that follows speech, with a mute/stop control.'],
          ].map(([name, description]) => (
            <div key={name} className="rounded-xl border bg-background p-4">
              <p className="font-semibold">{name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Motion and voice should explain Chime’s state, never imply a purchase
          approval, supplier award, payment, or workflow transition.
        </p>
      </section>

      <section className="rounded-2xl border bg-card p-6 text-card-foreground">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Voice character
        </p>
        <h2 className="mt-3 text-xl font-semibold">
          Lively, empathetic, and naturally human
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Target a young-adult feminine voice, around 24 in perceived age. Use
          conversational pacing, varied intonation, realistic pauses, and
          subtle natural breathing. Avoid robotic cadence or exaggerated
          breathiness. A voice provider and sample audition will be needed to
          validate the sound; this visual system does not generate speech.
        </p>
      </section>
    </div>
  );
}
