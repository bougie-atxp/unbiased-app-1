import { EyeOff } from "lucide-react";
import { palShapeFor, ROBOT_PALS, type PalScale, type PalsSettings } from "../../shared/pals";
import { RobotHead } from "./robot-heads/RobotHead";
import "./pals-gallery.css";

function PalArtwork({ id, large = false }: { id: string; large?: boolean }) {
  return (
    <div className={`pals-artwork${large ? " pals-artwork-large" : ""}`}>
      {id === "none" ? <EyeOff size={large ? 42 : 34} strokeWidth={1.4} aria-hidden="true" />
        : <RobotHead shape={palShapeFor(id)} size={large ? 112 : 90} color="#ed6b5f" trimColor="#a9b8c2" screenColor="#e8f7fb" />}
    </div>
  );
}

export function PalsGallery({
  settings,
  busy,
  onSelect,
  onVisibleChange,
  onScaleChange,
}: {
  settings: PalsSettings | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onVisibleChange: (visible: boolean) => void;
  onScaleChange: (scale: PalScale) => void;
}) {
  const choices = settings?.choices ?? ROBOT_PALS;
  const selected = settings ? (settings.visible ? settings.selected : "none") : "robot";
  const selectedChoice = choices.find((choice) => choice.id === settings?.selected);
  const name = selected === "none" ? "No Pal" : selectedChoice?.name ?? "Robot Head";
  return (
    <div className="pals-settings">
      <div className="pals-heading">
        <h1>Pals</h1>
        <button type="button" className="pals-secondary-button" disabled={!settings || busy} onClick={() => onVisibleChange(!settings?.visible)}>
          {settings?.visible ? "Hide Pal" : "Show Pal"}
        </button>
      </div>

      <div className="pals-feature" aria-label={`Current Pal: ${name}`}>
        <PalArtwork id={selected} large />
        <div className="pals-feature-footer">
          <span className="pals-feature-name">{name}</span>
          <label className="pals-size-control">
            <span>Size</span>
            <select value={settings?.scale ?? 1} disabled={!settings || busy} onChange={(event) => onScaleChange(Number(event.target.value) as PalScale)}>
              {[0.75, 1, 1.25, 1.5, 2].map((scale) => <option key={scale} value={scale}>{Math.round(scale * 100)}%</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="pals-collection-heading">
        <h2>My Pals</h2>
      </div>
      <div className="pals-grid" role="radiogroup" aria-label="Choose a Pal">
        <label className="pals-card" data-selected={selected === "none"}>
          <input type="radio" name="pal-choice" value="none" checked={selected === "none"} disabled={!settings || busy} onChange={() => onVisibleChange(false)} />
          <PalArtwork id="none" />
          <span className="pals-card-name">None</span>
          <span className="pals-card-description">Keep the desktop clear</span>
        </label>
        {choices.map((choice) => (
          <label key={choice.id} className="pals-card" data-selected={selected === choice.id}>
            <input type="radio" name="pal-choice" value={choice.id} checked={selected === choice.id} disabled={!settings || busy} onChange={() => onSelect(choice.id)} />
            <PalArtwork id={choice.id} />
            <span className="pals-card-name">{choice.name}</span>
            <span className="pals-card-description">{choice.description}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
