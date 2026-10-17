import { ASPECT_RATIOS, FRAME_RATES, RESOLUTIONS, DURATION_LIMITS, resolveOutputSize, frameCount, type AspectRatioId, type FrameRateId, type GenerationSettings, type ResolutionId } from "@shared/generationSettings";

type Props = {
  settings: GenerationSettings;
  onChange: (next: GenerationSettings) => void;
  /** Shown next to the live readout, e.g. the estimated memory footprint. */
  footer?: React.ReactNode;
  disabled?: boolean;
};

/**
 * The generation dock: aspect ratio, frame rate, resolution and duration in one
 * glass surface. Everything the user needs before pressing Generate lives here, so
 * the preview above it can stay uncluttered.
 */
export function GenerationSettingsDock({ settings, onChange, footer, disabled = false }: Props) {
  const size = resolveOutputSize(settings.aspectRatio, settings.resolution);
  const frames = frameCount(settings.durationSeconds, settings.fps);

  const set = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="gx-dock p-4 sm:p-5" data-testid="generation-dock">
      {/* ── Aspect ratio ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Aspect ratio</p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">{ASPECT_RATIOS.find((option) => option.id === settings.aspectRatio)?.useCase}</p>
        </div>
        <span className="gx-pill gx-pill--info font-mono">{size.width}×{size.height}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Aspect ratio">
        {ASPECT_RATIOS.map((option) => {
          const active = option.id === settings.aspectRatio;
          return (
            <button
              key={option.id}
              type="button"
              className="gx-ratio-chip gx-press"
              data-active={active}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => set("aspectRatio", option.id as AspectRatioId)}
            >
              <span className="gx-ratio-frame block" style={{ width: option.preview.width, height: option.preview.height }} aria-hidden="true" />
              <span className="text-[0.7rem] font-semibold leading-none">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Frame rate + resolution ── */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Frame rate</p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">{FRAME_RATES.find((option) => option.id === settings.fps)?.bestFor}</p>
          <div className="gx-seg mt-2" role="group" aria-label="Frame rate">
            {FRAME_RATES.map((option) => {
              const active = option.id === settings.fps;
              return (
                <button
                  key={option.id}
                  type="button"
                  className="gx-seg-btn"
                  data-active={active}
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => set("fps", option.id as FrameRateId)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Resolution</p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">{RESOLUTIONS.find((option) => option.id === settings.resolution)?.detail}</p>
          <div className="gx-seg mt-2" role="group" aria-label="Resolution">
            {RESOLUTIONS.map((option) => {
              const active = option.id === settings.resolution;
              return (
                <button
                  key={option.id}
                  type="button"
                  className="gx-seg-btn gx-seg-btn--violet"
                  data-active={active}
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => set("resolution", option.id as ResolutionId)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Duration ── */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Duration</p>
          <span className="font-mono text-xs text-foreground">
            {settings.durationSeconds}s · {frames.toLocaleString()} frames
          </span>
        </div>
        <input
          type="range"
          className="mt-2 w-full accent-[var(--genei-cyan)]"
          min={DURATION_LIMITS.min}
          max={60}
          step={1}
          value={settings.durationSeconds}
          disabled={disabled}
          aria-label="Clip duration in seconds"
          onChange={(event) => set("durationSeconds", Number(event.target.value))}
        />
      </div>

      {footer ? <div className="mt-4 border-t border-white/5 pt-3">{footer}</div> : null}
    </div>
  );
}
